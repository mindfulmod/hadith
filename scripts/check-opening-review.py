"""Verify candidate review coverage. Integrity checks do not approve translations."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def load_intake():
    spec=importlib.util.spec_from_file_location('opening_intake',ROOT/'scripts/import-opening.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def object_hash(value):
    return sha(json.dumps(value,ensure_ascii=False,separators=(',',':')))


def validate(catalog,draft):
    if draft.get('schemaVersion')!=1 or draft.get('status')!='ai-working-drafts-not-published' or draft.get('readerEligible') is not False:
        raise ValueError('Draft must remain explicitly unpublished')
    if draft['sourceSha256']!=catalog['sourceSha256'] or draft['sourceId']!=catalog['sourceId']:
        raise ValueError('Draft source binding is stale')
    if [e['number'] for e in draft['entries']]!=[3,4,5,6,7]:
        raise ValueError('Unexpected draft scope')
    blocks={b['htmlId']:b for b in catalog['blocks']}
    known_sources={s['id'] for s in draft['sources']}
    for e in draft['entries']:
        saved=e['reviewRecordSha256'];copy_e=copy.deepcopy(e);del copy_e['reviewRecordSha256']
        if object_hash(copy_e)!=saved:raise ValueError('Review record changed without rebinding')
        if e['status']!='ai-working-draft' or e['readerEligible'] is not False or e['independentReview']!='pending':
            raise ValueError('Candidate must not acquire approval')
        source=next(r for r in catalog['records'] if r['number']==e['number'])
        if e['arabicParagraphIds']!=source['paragraphIds']:raise ValueError('Wrong source paragraphs')
        expected=[s for id in e['arabicParagraphIds'] for s in e['segments'] if s['paragraphId']==id]
        if e['segments']!=expected:raise ValueError('Paragraph order changed')
        if len({s['id'] for s in e['segments']})!=len(e['segments']):raise ValueError('Duplicate segment ID')
        for id in e['arabicParagraphIds']:
            text=blocks[id]['text'];position=0
            for s in [s for s in e['segments'] if s['paragraphId']==id]:
                if type(s['start']) is not int or type(s['end']) is not int or s['start']!=position or not position<s['end']<=len(text):
                    raise ValueError('Omitted, overlapping or invalid source span')
                if s['arabic']!=text[s['start']:s['end']] or sha(s['arabic'])!=s['arabicSha256']:
                    raise ValueError('Arabic was altered')
                if not isinstance(s['english'],str) or not s['english'].strip() or sha(s['english'])!=s['englishSha256']:
                    raise ValueError('English hash or content mismatch')
                if s['kind'] not in {'chain','report','letter','transmission-note'}:
                    raise ValueError('Unknown segment role')
                position=s['end']
            if position!=len(text):raise ValueError('Uncovered source tail')
        if sha('\n\n'.join(blocks[id]['text'] for id in e['arabicParagraphIds']))!=e['arabicSha256']:
            raise ValueError('Arabic entry hash mismatch')
        if sha('\n\n'.join(s['english'] for s in e['segments']))!=e['englishSha256']:
            raise ValueError('English entry hash mismatch')
        for proposal in e.get('proposedCorrections',[]):
            if proposal.get('status')!='proposed-not-applied' or proposal.get('reviewerKind')!='ai':
                raise ValueError('A correction proposal cannot claim approval or application')
            if proposal['paragraphId'] not in e['arabicParagraphIds']:
                raise ValueError('Correction targets a different source paragraph')
            original=blocks[proposal['paragraphId']]['text'];start=proposal['start'];end=proposal['end']
            if type(start) is not int or type(end) is not int or not 0<=start<end<=len(original) or original[start:end]!=proposal['original']:
                raise ValueError('Correction proposal does not match the exact source')
            if not proposal['replacement'].strip() or proposal['replacement']==proposal['original'] or not proposal['reason'].strip():
                raise ValueError('Invalid correction proposal')
            segment=next((s for s in e['segments'] if s['id']==proposal['englishSegmentId']),None)
            if segment is None or not proposal['englishOriginal'] or segment['english'].count(proposal['englishOriginal'])!=1 or not proposal['englishReplacement'].strip():
                raise ValueError('Correction proposal does not match its English draft')
            if not proposal['sources'] or not set(proposal['sources'])<=known_sources:
                raise ValueError('Correction proposal needs recorded evidence')
        ids={s['id'] for s in e['segments']}
        if e['comparisonCoverage']['segmentIds']!=[s['id'] for s in e['segments']] or e['comparisonCoverage']['reviewerKind']!='ai':
            raise ValueError('Comparison coverage or attribution is wrong')
        covered=set()
        for check in e['checks']:
            if check['status']!='comparison-recorded-not-approval' or check['reviewerKind']!='ai':raise ValueError('Comparison cannot impersonate approval')
            if not set(check['segments'])<=ids or not set(check['sources'])<=known_sources:raise ValueError('Unknown comparison target')
            covered.update(check['segments'])
        if covered!=ids or not e['unresolved']:raise ValueError('Missing comparison coverage or review status')
    return True


def build():
    catalog=load_intake().build()
    draft=json.loads((ROOT/'content/review/opening-next-drafts.json').read_text())
    validate(catalog,draft)
    return catalog,draft


if __name__=='__main__':
    catalog,draft=build()
    print(f"{len(draft['entries'])} drafts; {sum(len(e['segments']) for e in draft['entries'])} fully covered source segments; independent review pending")
