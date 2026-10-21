"""Inventory a pinned Wikisource book, preserving headings, context and all paragraph text."""
import argparse, hashlib, importlib.util, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('opening',ROOT/'scripts/import-opening.py')
opening=importlib.util.module_from_spec(spec);spec.loader.exec_module(opening)
sha=opening.digest
encoded=opening.encoded

def extract(raw,manifest):
    if len(raw)!=manifest['file']['bytes'] or sha(raw)!=manifest['file']['sha256']:
        raise ValueError('Pinned HTML integrity failed')
    html=raw.decode('utf-8',errors='strict')
    if not re.search(r'"wgRevisionId"\s*:\s*'+str(manifest['revision'])+r'\b',html):
        raise ValueError('Unexpected Wikisource revision')
    parser=opening.SourceParser();parser.feed(html);parser.close()
    if parser.stack or parser.capture is not None:raise ValueError('Unclosed source markup')
    blocks=parser.blocks
    if len(blocks)!=manifest['expected']['blocks'] or len({b['htmlId'] for b in blocks})!=len(blocks) or any(not b['htmlId'] for b in blocks):
        raise ValueError('Unexpected or ambiguous source blocks')
    chapters=[];records=[];blanks=[];current=None;chapter=None
    for index,b in enumerate(blocks):
        b['ordinal']=index;b['textSha256']=sha(b['text'])
        if b['tag']=='h3':
            current=None
            chapter={'id':f'chapter-{len(chapters)+1:02}', 'headingId':b['htmlId'],'contextIds':[],'entryNumbers':[]}
            chapters.append(chapter)
        elif not b['text'].strip():blanks.append(b['htmlId'])
        else:
            if chapter is None:raise ValueError('Paragraph before the first chapter needs explicit classification')
            match=re.match(r'^\[(\d+)\] ',b['text'])
            if match:
                current={'id':manifest['id']+':'+match[1],'number':int(match[1]),'chapterId':chapter['id'],'paragraphIds':[],'status':'unreviewed'}
                records.append(current);chapter['entryNumbers'].append(current['number'])
            if current is None:chapter['contextIds'].append(b['htmlId'])
            else:current['paragraphIds'].append(b['htmlId'])
    if [r['number'] for r in records]!=manifest['expected']['entryNumbers']:raise ValueError('Numbered source coverage changed')
    if len(chapters)!=manifest['expected']['chapters']:raise ValueError('Chapter count changed')
    assigned=blanks+[id for c in chapters for id in [c['headingId'],*c['contextIds']]]+[id for r in records for id in r['paragraphIds']]
    if len(assigned)!=len(set(assigned)) or set(assigned)!={b['htmlId']for b in blocks}:raise ValueError('Source block lost or multiply assigned')
    return {'schemaVersion':1,'sourceId':manifest['id'],'revision':manifest['revision'],'sourceSha256':sha(raw),'status':'candidate-not-approved','readerEligible':False,'textPolicy':'All p/h3 source blocks retained exactly after HTML entity decoding. No trimming, normalization, spelling changes or inferred heading translation. Website navigation/templates remain in the raw HTML and are not narration. Numbered spans require separate role/translation review.','chapters':chapters,'records':records,'blankIds':blanks,'blocks':blocks}

def build(directory):
    manifest=json.loads((directory/'manifest.json').read_text())
    return extract((directory/manifest['file']['path']).read_bytes(),manifest)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
    result=build(ROOT/'content/sources/wikisource-faith');output=ROOT/'content/staging/bukhari-faith-wikisource/catalog.json';text=encoded(result)
    if args.check:
        if output.read_text()!=text:raise ValueError('Stale book inventory')
    else:output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text)
    print(f"{len(result['records'])} numbered spans, {len(result['chapters'])} source headings, {len(result['blocks'])} exact blocks; candidate only")
