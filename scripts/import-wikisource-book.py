"""Inventory a pinned Wikisource book, preserving headings, context and all paragraph text."""
import argparse, hashlib, importlib.util, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('opening',ROOT/'scripts/import-opening.py')
opening=importlib.util.module_from_spec(spec);spec.loader.exec_module(opening)
sha=opening.digest
encoded=opening.encoded
layout_spec=importlib.util.spec_from_file_location('wikisource_layout',ROOT/'scripts/wikisource_layout.py');layout=importlib.util.module_from_spec(layout_spec);layout_spec.loader.exec_module(layout)

def book_introduction(blocks,manifest):
    # Introductory quotations belong to the book, never to an invented chapter/report.
    first_heading=next((i for i,b in enumerate(blocks)if b['tag']=='h3'),len(blocks))
    prefix=[b for b in blocks[:first_heading]if b['text'].strip()]
    if 'bookIntroduction' not in manifest:
        if prefix:raise ValueError('Paragraph before the first chapter needs explicit classification')
        return None
    declaration=manifest['bookIntroduction']
    if not isinstance(declaration,dict) or declaration.get('schemaVersion')!=1 or declaration.get('role')!='book-introduction' or declaration.get('status')!='layout-only-not-wording-approval' or not isinstance(declaration.get('note'),str) or not declaration['note'].strip():
        raise ValueError('Invalid book introduction declaration')
    if not prefix or first_heading==len(blocks) or any(b['tag']!='p' or layout.MARKER.search(b['text'])for b in prefix):
        raise ValueError('Book introduction must contain only unnumbered paragraphs before the first chapter')
    pins=[{'htmlId':b['htmlId'],'textSha256':sha(b['text'])}for b in prefix]
    if declaration.get('blocks')!=pins:raise ValueError('Book introduction blocks or exact text changed')
    return declaration

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
    # Every number marker must be a supported boundary before any ownership is inferred.
    layout.require_simple_layout(blocks)
    introduction=book_introduction(blocks,manifest)
    introduction_ids=[p['htmlId']for p in introduction['blocks']]if introduction else []
    chapters=[];records=[];blanks=[];current=None;chapter=None
    for index,b in enumerate(blocks):
        b['ordinal']=index;b['textSha256']=sha(b['text'])
        if b['tag']=='h3':
            current=None
            chapter={'id':f'chapter-{len(chapters)+1:02}', 'headingId':b['htmlId'],'contextIds':[],'entryNumbers':[]}
            chapters.append(chapter)
        elif b['htmlId'] in introduction_ids:continue
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
    assigned=introduction_ids+blanks+[id for c in chapters for id in [c['headingId'],*c['contextIds']]]+[id for r in records for id in r['paragraphIds']]
    if len(assigned)!=len(set(assigned)) or set(assigned)!={b['htmlId']for b in blocks}:raise ValueError('Source block lost or multiply assigned')
    return {'schemaVersion':1,'sourceId':manifest['id'],'revision':manifest['revision'],'sourceSha256':sha(raw),'status':'candidate-not-approved','readerEligible':False,'textPolicy':'All p/h3 source blocks retained exactly after HTML entity decoding. No trimming, normalization, spelling changes or inferred heading translation. Website navigation/templates remain in the raw HTML and are not narration. Numbered spans require separate role/translation review.','chapters':chapters,'records':records,'blankIds':blanks,'blocks':blocks,**({'bookIntroduction':introduction}if introduction else {})}

def build(directory):
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest.get('file',{}).get('path')!='source.html':raise ValueError('Unexpected source file path')
    return extract((directory/'source.html').read_bytes(),manifest)

def inventory_paths(registry,root=ROOT):
    if registry.get('schemaVersion')!=1 or not isinstance(registry.get('books'),list) or not registry['books']:
        raise ValueError('Invalid Wikisource book registry')
    seen=set();paths=[]
    for row in registry['books']:
        id=row.get('id')
        if not isinstance(id,str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',id) or id in seen:
            raise ValueError('Invalid or duplicate source book identity')
        seen.add(id)
        if row.get('sourceDirectory')!=f'content/sources/wikisource-{id}' or row.get('inventory')!=f'content/staging/bukhari-{id}-wikisource/catalog.json':
            raise ValueError('Unexpected source or inventory path')
        source=root/row['sourceDirectory'];output=root/row['inventory']
        for path in [source,source/'manifest.json',source/'source.html',output]:
            if not path.resolve().is_relative_to(root.resolve()):raise ValueError('Source registry escapes repository')
        paths.append((id,source,output))
    return paths

def build_registered(registry,check=False):
    results=[]
    # Validate every source and existing output before writing any inventory.
    for id,directory,output in inventory_paths(registry):
        result=build(directory);text=encoded(result)
        if check and output.read_text()!=text:raise ValueError('Stale book inventory: '+id)
        results.append((id,output,result,text))
    if not check:
        for _,output,_,text in results:output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text)
    return [(id,result)for id,_,result,_ in results]

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
    registry=json.loads((ROOT/'content/sources/wikisource-books.json').read_text())
    for id,result in build_registered(registry,check=args.check):
        print(f"{id}: {len(result['records'])} numbered spans, {len(result['chapters'])} source headings, {len(result['blocks'])} exact blocks; candidate only")
