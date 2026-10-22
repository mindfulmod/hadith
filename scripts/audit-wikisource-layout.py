"""Inventory exact text and suspicious boundaries before ordinary book classification."""
import argparse,importlib.util,json,re
from pathlib import Path
layout_spec=importlib.util.spec_from_file_location('wikisource_layout',Path(__file__).with_name('wikisource_layout.py'));layout=importlib.util.module_from_spec(layout_spec);layout_spec.loader.exec_module(layout)
inspect_blocks=layout.inspect_blocks
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('opening',ROOT/'scripts/import-opening.py');opening=importlib.util.module_from_spec(spec);spec.loader.exec_module(opening)

def build(directory):
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest.get('file',{}).get('path')!='source.html':raise ValueError('Unexpected source file path')
    raw=(directory/'source.html').read_bytes()
    if len(raw)!=manifest['file']['bytes']or opening.digest(raw)!=manifest['file']['sha256']:raise ValueError('Pinned HTML integrity failed')
    html=raw.decode('utf-8',errors='strict')
    if not re.search(r'"wgRevisionId"\s*:\s*'+str(manifest['revision'])+r'\b',html):raise ValueError('Unexpected Wikisource revision')
    parser=opening.SourceParser();parser.feed(html);parser.close()
    if parser.stack or parser.capture is not None:raise ValueError('Unclosed source markup')
    blocks=parser.blocks
    if len(blocks)!=manifest['expected']['blocks']or len({b['htmlId']for b in blocks})!=len(blocks)or any(not b['htmlId']for b in blocks):raise ValueError('Unexpected or ambiguous source blocks')
    for i,b in enumerate(blocks):b.update(ordinal=i,textSha256=opening.digest(b['text']))
    layout=inspect_blocks(blocks)
    if layout['summary']!=manifest['expected']['layoutSummary']:raise ValueError('Source layout changed')
    return {'schemaVersion':1,'sourceId':manifest['id'],'revision':manifest['revision'],'sourceSha256':manifest['file']['sha256'],'status':'candidate-layout-review-required','readerEligible':False,'textPolicy':'All p/h3 blocks retained exactly after HTML entity decoding. Number markers are observations, not approved report identities. Segments partition every code point without editing whitespace, glyphs, headings or wording. Missing labels are not evidence of missing narrations.','blocks':blocks,**layout}

def audit_paths(registry,root=ROOT):
    if registry.get('schemaVersion')!=1 or not isinstance(registry.get('pendingLayoutAudits',[]),list):raise ValueError('Invalid layout audit registry')
    seen={r['id']for r in registry.get('books',[])};paths=[]
    for row in registry.get('pendingLayoutAudits',[]):
        id=row.get('id')
        if not isinstance(id,str)or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',id)or id in seen:raise ValueError('Invalid or duplicate layout identity')
        seen.add(id)
        if row.get('sourceDirectory')!=f'content/sources/wikisource-{id}'or row.get('audit')!=f'content/staging/bukhari-{id}-wikisource/layout-audit.json':raise ValueError('Unexpected layout audit path')
        source=root/row['sourceDirectory'];output=root/row['audit']
        for path in [source,source/'manifest.json',source/'source.html',output]:
            if not path.resolve().is_relative_to(root.resolve()):raise ValueError('Layout registry escapes repository')
        paths.append((id,source,output))
    return paths

def build_registered(registry,check=False):
    results=[]
    for id,source,output in audit_paths(registry):
        result=build(source);text=opening.encoded(result)
        if check and output.read_text()!=text:raise ValueError('Stale layout audit: '+id)
        results.append((id,output,result,text))
    if not check:
        for _,output,_,text in results:output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text)
    return [(id,result)for id,_,result,_ in results]

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args()
    for id,result in build_registered(json.loads((ROOT/'content/sources/wikisource-books.json').read_text()),args.check):print(id+': '+json.dumps(result['summary'])+'; unresolved layout; not published')
