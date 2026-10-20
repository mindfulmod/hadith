import copy
import hashlib
import importlib.util
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
intake=module('opening_intake_test','scripts/import-opening.py')
review=module('opening_review_test','scripts/check-opening-review.py')
page=module('opening_page_test','scripts/build-opening-review.py')
CAT=intake.build()
DRAFT=json.loads((ROOT/'content/review/opening-next-drafts.json').read_text())

def rebind(entry):
    entry.pop('reviewRecordSha256',None)
    entry['reviewRecordSha256']=review.object_hash(entry)


class RenderedBlocks(HTMLParser):
    def __init__(self):super().__init__();self.current=None;self.values={'english':{},'arabic':{}}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        for language in self.values:
            key='data-'+language+'-segment'
            if key in attrs:
                if self.current:raise ValueError('Nested segment')
                self.current=(tag,language,attrs[key]);self.values[language].setdefault(attrs[key],[]).append('')
    def handle_data(self,data):
        if self.current:
            tag,language,id=self.current;self.values[language][id][-1]+=data
    def handle_endtag(self,tag):
        if self.current and tag==self.current[0]:self.current=None


class OpeningReviewTests(unittest.TestCase):
    def test_exact_source_coverage_and_existing_entries(self):
        self.assertEqual(len(CAT['blocks']),17)
        self.assertEqual([len(r['paragraphIds']) for r in CAT['records']],[2,2,2,2,2,2,3])
        assigned=CAT['contextIds']+[id for r in CAT['records'] for id in r['paragraphIds']]
        self.assertEqual(assigned,[b['htmlId'] for b in CAT['blocks']])
        old=json.loads((ROOT/'research/bukhari-opening-review.json').read_text())
        by_id={b['htmlId']:b['text'] for b in CAT['blocks']}
        for e in old['entries']:
            self.assertEqual(e['arabic_blocks'],[by_id[id] for id in CAT['records'][e['number']-1]['paragraphIds']])
        self.assertTrue(by_id['mwHQ'].endswith(' '),'Do not trim source whitespace')
        self.assertEqual(by_id['mwJw'],'رواه صالح بن كيسان ويونس ومعمر عن الزهري.')
        self.assertFalse(CAT['readerEligible'])

    def test_source_hash_and_revision_must_match(self):
        raw=(intake.SOURCE/'source.html').read_bytes();manifest=json.loads((intake.SOURCE/'manifest.json').read_text())
        with self.assertRaisesRegex(ValueError,'integrity'):intake.extract(raw+b' ',manifest)
        bad=raw.replace(b'"wgRevisionId":484874',b'"wgRevisionId":484875')
        manifest['file']['sha256']=hashlib.sha256(bad).hexdigest()
        with self.assertRaisesRegex(ValueError,'revision'):intake.extract(bad,manifest)

    def test_gaps_overlaps_omissions_and_changed_text_are_refused(self):
        self.assertTrue(review.validate(CAT,DRAFT))
        for mutation in [lambda e:e['segments'].pop(),lambda e:e['segments'][1].update(start=1),lambda e:e['segments'][0].update(arabic='changed'),lambda e:e['segments'][0].update(english='changed')]:
            draft=copy.deepcopy(DRAFT);e=draft['entries'][0];mutation(e);rebind(e)
            with self.assertRaises(ValueError):review.validate(CAT,draft)
        draft=copy.deepcopy(DRAFT);draft['entries'][0]['checks'][0]['finding']='changed'
        with self.assertRaisesRegex(ValueError,'rebinding'):review.validate(CAT,draft)

    def test_review_cannot_claim_independence_or_lose_comparisons(self):
        for mutation in [lambda e:e.update(independentReview='approved'),lambda e:e.update(readerEligible=True),lambda e:e['checks'][0].update(reviewerKind='human'),lambda e:e['checks'][0].update(sources=['missing']),lambda e:e['checks'].clear()]:
            draft=copy.deepcopy(DRAFT);e=draft['entries'][0];mutation(e);rebind(e)
            with self.assertRaises(ValueError):review.validate(CAT,draft)

    def test_complex_boundaries_and_numbering_are_explicit(self):
        es={e['number']:e for e in DRAFT['entries']}
        self.assertEqual(es[3]['comparators'][1]['reference'],es[4]['comparators'][1]['reference'])
        self.assertEqual(es[5]['comparators'][1]['reference'],'1.1.4')
        self.assertEqual([s['kind'] for s in es[7]['segments'][:2]],['chain','chain'])
        self.assertNotEqual(es[7]['segments'][0]['paragraphId'],es[7]['segments'][1]['paragraphId'])
        self.assertEqual(es[7]['segments'][-1]['kind'],'transmission-note')
        self.assertEqual(es[4]['segments'][-1]['kind'],'transmission-note')
        self.assertIn('ح ',es[6]['segments'][1]['arabic'])
        self.assertIn('5-lahu-laka',[i['id'] for i in es[5]['unresolved'] if isinstance(i,dict)])

    def test_rendered_artifact_preserves_each_segment_once_and_escapes_text(self):
        actual=page.render(CAT,DRAFT)
        self.assertEqual((ROOT/'research/opening-next.html').read_text(),actual)
        parser=RenderedBlocks();parser.feed(actual)
        for e in DRAFT['entries']:
            for s in e['segments']:
                for language in ('english','arabic'):
                    self.assertEqual(parser.values[language][s['id']],[s[language]])
        injected=copy.deepcopy(DRAFT);injected['entries'][0]['segments'][0]['english']='<script>alert("x")</script>&'
        output=page.render(CAT,injected)
        self.assertNotIn('<script>',output);self.assertIn('&lt;script&gt;',output)
        self.assertIn('These drafts are not in the reader.',actual)


if __name__=='__main__':unittest.main()
