"""Apply reviewed structural boundaries to exact source spans; never publish reader content."""
import argparse,copy,hashlib,importlib.util,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load_module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
audit_tool=load_module('layout_audit',ROOT/'scripts/audit-wikisource-layout.py')
layout=audit_tool.layout
PRINTS={'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1','dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
PRINT_URLS={'brill-1862':'https://upload.wikimedia.org/wikipedia/commons/8/8a/صحيح_البخاري_ر1.pdf','dar-ibn-kathir-2002':'https://archive.org/download/waq79565/79565.pdf'}
def read(path):return json.loads(path.read_text())
def hashobj(o):return hashlib.sha256(json.dumps(o,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def need(condition,message):
 if not condition:raise ValueError(message)
def positive(value):return type(value)is int and value>0

def validate_mapping(mapping,label,number,english):
 need(set(mapping)=={'status','sourceLabel','sourceNumber','number','bewley','modernPrintReference','khan','note'},'Unexpected reference mapping fields')
 need(mapping['status']=='ai-matched-not-approved','Invalid mapping status')
 need(mapping['sourceLabel']==label and mapping['sourceNumber']==int(label)and mapping['number']==number,'Mapping differs from exact source label or chosen reference')
 need(mapping['bewley']=={'url':'https://aishabewley.org/bukhari3','reference':str(number)},'Missing matched Bewley reference')
 need(isinstance(mapping['modernPrintReference'],str)and mapping['modernPrintReference'].isascii()and mapping['modernPrintReference'].isdigit(),'Invalid printed reference')
 need(isinstance(mapping['note'],str)and mapping['note'].strip(),'Missing reference-mapping explanation')
 k=mapping['khan'];need(isinstance(k,dict)and re.fullmatch(r'1\.4\.[1-9]\d*',k.get('reference','')),'Invalid English comparison reference')
 record=next((r for r in english['records']if r['id']==english['namespace']+':'+k['reference']),None)
 need(record is not None,'Missing English comparison record')
 need(k=={'reference':k['reference'],'sourceSha256':english['sourceSha256'],'sourceRecordId':record['id'],'recordSha256':hashobj(record)},'Stale English reference evidence')

def resolve(audit,review,english):
 need(review.get('schemaVersion')==1 and review.get('status')=='ai-reviewed-layout-only'and review.get('reviewerKind')=='ai'and review.get('independentReview')=='pending','Invalid layout-review status')
 need(review.get('sourceId')==audit['sourceId']and review.get('sourceSha256')==audit['sourceSha256']and review.get('auditSha256')==hashobj(audit),'Layout review has stale source evidence')
 need({s['id']:s['sha256']for s in review['sources']}==PRINTS and len(review['sources'])==2 and {s['id']:s['url']for s in review['sources']}==PRINT_URLS,'Unexpected printed sources')
 need(review.get('pageNumbering')=='One-based PDF page numbers, not printed page labels.','Ambiguous printed witness page numbering')
 need(len({b['htmlId']for b in audit['blocks']})==len(audit['blocks'])and all(b['textSha256']==layout.sha(b['text'])for b in audit['blocks']),'Changed or ambiguous original blocks')
 fresh=layout.inspect_blocks(audit['blocks']);need(all(audit[k]==v for k,v in fresh.items()),'Changed lexical audit evidence')
 expected=review['expected']['numbers'];need(isinstance(expected,list)and expected and all(positive(n)for n in expected)and expected==sorted(set(expected))and positive(review['expected']['chapters']),'Invalid reviewed coverage')
 decisions=review['decisions'];needed={i['blockId']for i in audit['issues']}
 need(len({d['blockId']for d in decisions})==len(decisions)and {d['blockId']for d in decisions}==needed,'Missing, duplicated or unrelated layout decisions')
 need([d['blockId']for d in decisions]==[b['htmlId']for b in audit['blocks']if b['htmlId']in needed],'Layout decisions must follow source order')
 need(len({d['id']for d in decisions})==len(decisions),'Duplicate layout decision identity')
 units=[]
 for original in audit['blocks']:
  bid=original['htmlId'];text=original['text'];d=next((d for d in decisions if d['blockId']==bid),None)
  if d:
   need(d['id']=='layout-'+bid,'Changed layout decision identity')
   need(d['blockSha256']==original['textSha256']==layout.sha(text),'Changed original block')
   need(d['issueIndexes']==[i for i,x in enumerate(audit['issues'])if x['blockId']==bid],'Unaccounted source layout issue')
   need(isinstance(d['note'],str)and d['note'].strip(),'Missing boundary explanation')
   need([w['id']for w in d['printedWitnesses']]==list(PRINTS),'Each boundary needs two distinct printed witnesses')
   for w in d['printedWitnesses']:
    need(w['sha256']==PRINTS[w['id']]and isinstance(w['pdfPages'],list)and w['pdfPages']and all(positive(p)for p in w['pdfPages'])and w['pdfPages']==sorted(set(w['pdfPages'])),'Invalid printed witness evidence')
   spans=d['units'];need(isinstance(spans,list)and spans,'Missing reviewed spans')
  else:
   kind='heading'if original['tag']=='h3'else 'blank'if not text.strip()else 'report-start'if re.match(r'^\[[0-9]+\] ',text)else 'text'
   spans=[{'start':0,'end':len(text),'kind':kind}]
   if kind=='report-start':spans[0]['number']=int(re.match(r'^\[([0-9]+)\]',text)[1])
  position=0
  for span in spans:
   need(set(span)<= {'start','end','kind','number','referenceMapping'},'Unexpected span field')
   start,end,kind=span['start'],span['end'],span['kind']
   need(type(start)is int and type(end)is int and start==position and start<end<=len(text),'Missing, overlapping or reordered source span');position=end
   value=text[start:end];need(kind in ['heading','blank','formatting','report-start','text'],'Unknown source role')
   markers=list(layout.MARKER.finditer(value));source_reference=None
   if kind=='report-start':
    match=re.match(r'^\[(\d+)\] ',value);need(match is not None and len(markers)==1,'Report span needs one exact initial marker')
    number=span.get('number');need(positive(number),'Invalid selected report reference');label=match[1]
    source_reference={'label':label,'number':int(label),'markerId':f'{bid}:{start}','occurrence':next(m['occurrence']for m in audit['markers']if m['blockId']==bid and m['start']==start)}
    if number!=int(label):validate_mapping(span.get('referenceMapping',{}),label,number,english)
    else:need('referenceMapping'not in span,'Unnecessary reference mapping')
   else:need(not markers and 'number'not in span and 'referenceMapping'not in span,'A source marker cannot be hidden in another role')
   if kind=='blank':need(not value.strip(),'Nonblank content cannot be discarded as spacing')
   if kind=='formatting':need(value=='==='and any((start,end)in [(m.start(),m.start()+3),(m.end()-3,m.end())]for m in layout.HEADING.finditer(text)),'Only exact reviewed heading delimiters are formatting')
   if kind=='heading'and original['tag']!='h3':need(any(start==m.start()+3 and end==m.end()-3 for m in layout.HEADING.finditer(text)),'Derived heading must preserve the exact words inside its original delimiters')
   if original['tag']=='h3':need(kind=='heading'and start==0 and end==len(text),'Rendered headings cannot be reclassified')
   uid=bid if start==0 and end==len(text)else f'{bid}@{start}-{end}'
   unit={'htmlId':uid,'tag':'h3'if kind=='heading'else 'formatting'if kind=='formatting'else 'p','text':value,'ordinal':len(units),'textSha256':layout.sha(value),'role':kind,'origin':{'blockId':bid,'blockSha256':original['textSha256'],'start':start,'end':end}}
   if d:unit['layoutDecisionId']=d['id']
   if source_reference:unit.update(number=span['number'],sourceReference=source_reference)
   if 'referenceMapping'in span:unit['referenceMapping']=copy.deepcopy(span['referenceMapping'])
   units.append(unit)
  need(position==len(text),'Uncovered source tail')
 need(len({u['htmlId']for u in units})==len(units),'Colliding derived unit identities')
 chapters=[];records=[];blanks=[];formatting=[];chapter=None;current=None
 for u in units:
  uid=u['htmlId'];kind=u['role']
  if kind=='heading':
   current=None;chapter={'id':f'chapter-{len(chapters)+1:02}','headingId':uid,'contextIds':[],'entryNumbers':[]};chapters.append(chapter)
  elif kind=='blank':blanks.append(uid)
  elif kind=='formatting':formatting.append(uid)
  else:
   need(chapter is not None,'Text before first chapter needs a separate front-matter decision')
   if kind=='report-start':
    current={'id':audit['sourceId']+':'+u['sourceReference']['markerId'],'number':u['number'],'sourceReference':u['sourceReference'],'chapterId':chapter['id'],'paragraphIds':[],'status':'unreviewed'}
    if 'referenceMapping'in u:current['referenceMapping']=copy.deepcopy(u['referenceMapping'])
    records.append(current);chapter['entryNumbers'].append(current['number'])
   if current is None:chapter['contextIds'].append(uid)
   else:current['paragraphIds'].append(uid)
 need([r['number']for r in records]==review['expected']['numbers'],'Resolved report references differ from reviewed coverage')
 need(len(chapters)==review['expected']['chapters'],'Resolved chapter coverage changed')
 owned=blanks+formatting+[i for c in chapters for i in [c['headingId'],*c['contextIds']]]+[i for r in records for i in r['paragraphIds']]
 need(len(owned)==len(set(owned))and set(owned)=={u['htmlId']for u in units},'Source units lost or assigned more than once')
 need(len(records)==len(audit['markers']),'Observed source marker lost during classification')
 return {'schemaVersion':2,'sourceId':audit['sourceId'],'revision':audit['revision'],'sourceSha256':audit['sourceSha256'],'layoutAuditSha256':hashobj(audit),'layoutReviewSha256':hashobj(review),'status':'candidate-layout-mapped-not-approved','readerEligible':False,'textPolicy':'Exact source spans only. Every original code point is preserved in a heading, report/context, blank or formatting unit. Source labels and marker identities remain separate from the reviewed reference mapping. This structural map does not approve report wording, translation or publication.','chapters':chapters,'records':records,'blankIds':blanks,'formattingIds':formatting,'blocks':units,'originalBlocks':copy.deepcopy(audit['blocks']),'layoutReview':copy.deepcopy(review)}

def resolution_paths(registry,root=ROOT):
 paths=[]
 for id,source,audit_output in audit_tool.audit_paths(registry,root):
  row=next(x for x in registry['pendingLayoutAudits']if x['id']==id)
  if 'resolution'not in row and 'inventory'not in row:continue
  need(row.get('resolution')==f'content/review/{id}-layout-review.json'and row.get('inventory')==f'content/staging/bukhari-{id}-wikisource/catalog.json','Unexpected layout resolution paths')
  review=root/row['resolution'];output=root/row['inventory']
  for p in [review,output]:need(p.resolve().is_relative_to(root.resolve()),'Layout resolution escapes repository')
  paths.append((id,source,audit_output,review,output))
 return paths

def build_registered(registry,check=False):
 results=[];english=read(ROOT/'content/staging/bukhari-en-islamhouse/catalog.json')
 for id,source,audit_output,review_path,output in resolution_paths(registry):
  audit=audit_tool.build(source);need(read(audit_output)==audit,'Stale original layout audit');result=resolve(audit,read(review_path),english);text=audit_tool.opening.encoded(result)
  if check:need(output.read_text()==text,'Stale resolved layout inventory: '+id)
  results.append((id,output,result,text))
 if not check:
  for _,output,_,text in results:output.parent.mkdir(parents=True,exist_ok=True);output.write_text(text)
 return [(id,result)for id,_,result,_ in results]

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');p.add_argument('--json',metavar='BOOK',help='Return one resolved inventory as JSON for the reader build');args=p.parse_args()
 results=build_registered(read(ROOT/'content/sources/wikisource-books.json'),args.check)
 if args.json:
  matches=[result for id,result in results if id==args.json];need(len(matches)==1,'Unknown mapped source book');print(json.dumps(matches[0],ensure_ascii=False,separators=(',',':')))
 else:
  for id,result in results:print(f"{id}: {len(result['records'])} candidate reports; {len(result['chapters'])} mapped chapters; all source spans retained; not published")
