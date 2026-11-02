"""Check the Rain Prayer intake's source bindings; this never admits reader content."""
import argparse,hashlib,importlib.util,json
from html import escape
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('rain_book',ROOT/'scripts/import-wikisource-book.py');book=importlib.util.module_from_spec(spec);spec.loader.exec_module(book)
def read(path):return json.loads((ROOT/path).read_text())
def sha(value):return hashlib.sha256(value.encode()).hexdigest()
def hashjson(value):return sha(json.dumps(value,ensure_ascii=False,separators=(',',':')))
PRINTS={'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1','dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
def require(condition,message):
 if not condition:raise ValueError(message)
def validate(audit,report,chapter,inventory,english):
 require(audit['status']=='source-intake-compared-wording-review-pending' and audit['readerAdmission']is False,'Intake is not wording approval or reader admission')
 source=audit['source'];blocks={b['htmlId']:b for b in inventory['blocks']};records={r['number']:r for r in inventory['records']}
 require(source['id']==inventory['sourceId'] and source['sha256']==inventory['sourceSha256'] and source['inventorySha256']==hashjson(inventory),'Stale pinned Arabic input')
 require(source['arabicChanged']is False and not inventory['readerEligible'],'Source intake must remain unchanged and quarantined')
 require([r['number']for r in inventory['records']]==list(range(960,993)) and len(blocks)==70 and sum(len(b['text'])for b in blocks.values())==12369,'Unexpected source coverage')
 require(source['separateContextIds']==[p for c in inventory['chapters']for p in c['contextIds']]==['mwbA','mwgQ','mwhg'],'Chapter quotations cannot disappear')
 require(len(inventory['chapters'])==28 and inventory['blankIds']==[],'Unexpected chapter or blank-block coverage')
 require([r['reference']for r in audit['records']]==list(range(960,993)),'Audit must cover every source report in order')
 require({s['id']:s['sha256']for s in audit['printedComparisons']}==PRINTS,'Unexpected print identity')
 printed={s['id']:s for s in audit['printedComparisons']}
 khan={r['id'].split(':')[-1]:r for r in english['records']}
 seen_khan=[];seen_bewley=[];seen_print=[]
 for row in audit['records']:
  n=row['reference'];r=records[n]
  require(row['sourceRecordId']==r['id'] and row['chapterId']==r['chapterId'] and row['paragraphIds']==r['paragraphIds'],'Report ownership changed')
  require(row['arabicSha256']==sha('\n\n'.join(blocks[p]['text']for p in r['paragraphIds'])),'Report wording changed')
  require(row['printedReferences']==([1008,1009]if n==963 else [n+45 if n<963 else n+46 if n<984 else n+47]),'Printed occurrence assigned to the wrong source report')
  require(set(row['printedPages'])==set(PRINTS),'Two printed page locations required')
  for id,pages in row['printedPages'].items():require(pages and all(p in printed[id]['inspectedPdfPages']for p in pages),'Uninspected print page')
  seen_print+=row['printedReferences'];bc=row['englishComparisons']['bewley'];kc=row['englishComparisons']['khan']
  require(bc['displayedReference']==str({966:967,967:968}.get(n,n)) and bc['occurrence']==(2 if n==968 else 1),'Duplicate English labels must keep their actual occurrences')
  seen_bewley.append((bc['displayedReference'],bc['occurrence']))
  if n in [976,983]:
   require(kc=={'status':'not-present-in-checked-sequence','checkedReferences':['2.17.134','2.17.135']if n==976 else ['2.17.140','2.17.141']},'A missing English occurrence cannot claim a matching body')
  else:
   expected=n-841 if n<=975 else n-842 if n<=982 else n-843
   ref=f'2.17.{expected}';k=khan[ref];require(kc['reference']==ref and kc['recordSha256']==hashjson(k) and kc['bodySha256']==k['textSha256'],'English reference is not the content-matched pinned record')
   require(kc['status']==('damaged-comparison'if n==972 else 'located-body-not-wording-approval'),'Comparison limit changed')
   seen_khan.append(ref)
 require(len(seen_bewley)==len(set(seen_bewley))==33 and len(seen_khan)==len(set(seen_khan))==31,'Comparison occurrence collapsed or duplicated')
 for key,item in [('missingPrintedReport',report),('missingPrintedChapter',chapter)]:
  require(audit[key]['sha256']==hashjson(item),'Candidate changed without updating its evidence binding')
  require(item['status']=='source-candidate-only-not-admitted' and item['readerEligible']is False and item['reviewerKind']=='ai' and item['independentReview']=='pending','Candidate cannot impersonate approval')
  require(item['digitalSourceId']==source['id'] and item['digitalSourceSha256']==source['sha256'] and item['digitalInventorySha256']==source['inventorySha256'],'Candidate belongs to a different digital source')
  require(item['arabicSha256']==sha(item['arabic']),'Candidate Arabic changed')
  require([w['sourceId']for w in item['witnesses']]==['brill-1862','dar-ibn-kathir-2002'],'Candidate needs both distinct prints')
  for w in item['witnesses']:
   require(w['sourceSha256']==PRINTS[w['sourceId']] and w['pdfPage']in printed[w['sourceId']]['inspectedPdfPages'] and w['readingSha256']==sha(w['reading']),'Invalid candidate print evidence')
   require(w['reading']==item['arabic']or bool(w.get('differenceNote')),'Printed wording difference needs explanation')
  chosen=next(w for w in item['witnesses']if w['sourceId']==item['selectedWitnessId']);require(chosen['reading']==item['arabic'],'Selected wording does not match its witness')
 require(report['proposedAppReference']=='983b' and report['printedReference']=='1030' and report['afterReference']==983 and report['beforeReference']==984,'Wrong missing-report position')
 require(report['chapterId']=='chapter-20' and report['printedChapterNumber']==21,'Missing report moved across chapter boundary')
 require(report['previousArabicSha256']==audit['records'][23]['arabicSha256'] and report['nextArabicSha256']==audit['records'][24]['arabicSha256'],'Missing-report anchors changed')
 require(report['referenceDecision']['status']in ['pending','user-confirmed'],'Unknown reference decision')
 if report['referenceDecision']['status']=='user-confirmed':require(bool(report['referenceDecision'].get('userReply')),'A confirmed decision needs the actual reply')
 require(chapter['kind']=='empty-chapter-heading' and chapter['entryNumbers']==[] and chapter['contextParagraphs']==[],'Empty printed chapter cannot acquire a report or invented introduction')
 require(chapter['afterChapterId']=='chapter-04' and chapter['beforeChapterId']=='chapter-05' and chapter['afterReference']==966 and chapter['beforeReference']==967 and chapter['printedChapterNumber']==5,'Wrong empty-chapter position')
 require(chapter['englishStatus']=='pending','No English chapter translation has been reviewed')
 require(sorted(seen_print+[int(report['printedReference'])])==list(range(1005,1040)),'Printed occurrences lost, duplicated or semantically deduplicated')
 require([x['reference']for x in audit['proposedCorrections']]==[968,986],'Unexpected correction proposals')
 for c in audit['proposedCorrections']:
  original=next(r for r in audit['records']if r['reference']==c['reference']);text=blocks[c['paragraphId']]['text']
  require(c['status']=='proposed-not-applied' and c['originalArabicSha256']==original['arabicSha256'] and c['paragraphId']in original['paragraphIds'] and text.count(c['before'])==1,'Correction is not bound to the original digital text')
  require([w['sourceId']for w in c['witnesses']]==list(PRINTS),'Correction requires two distinct print witnesses')
  for w in c['witnesses']:require(w['sourceSha256']==PRINTS[w['sourceId']] and w['pdfPage']in original['printedPages'][w['sourceId']] and w['reading']==c['after'] and w['readingSha256']==sha(c['after']),'Correction lacks its stated printed reading')
 return True

def render(audit,report,chapter):
 e=escape;sources={s['id']:s for s in audit['printedComparisons']}
 def witnesses(item):
  return ''.join(f'<section><p><a href="{e(sources[w["sourceId"]]["url"])}#page={w["pdfPage"]}" target="_blank" rel="noopener">{e(w["sourceId"])} · PDF page {w["pdfPage"]} ↗</a></p><p class="arabic" lang="ar" dir="rtl" data-witness>{e(w["reading"])}</p><p>{e(w.get("differenceNote",w.get("chapterPlacement","")))}</p></section>'for w in item['witnesses'])
 style=':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:30px}.eyebrow,.label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:30px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.english{font:21px/1.8 Georgia,serif}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}section{margin:24px 0}li{margin:10px 0}ul{padding-left:22px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
 return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Rain Prayer · Source review</title><style>{style}</style></head><body><main><p class="eyebrow">MindfulMod · Local source review</p><h1>A missing report.<br>A separate chapter.</h1><p>The next section has 33 numbered digital entries, 960–992. Comparing their contents against two Arabic prints revealed one further report and one empty chapter heading. They have separate source records; the additional report’s app reference is still a proposal.</p><div class="notice"><strong>Missing report candidate — not added to the reader.</strong> Rain Prayer reports 960–975 and the separate empty printed chapter are now included in the local personal prototype. The chapter’s English heading remains pending. All transcription and working English here are AI-assisted; independent review remains pending. Nothing on this page certifies the wording or approves publication.</div><article id="report-1030"><p class="eyebrow">Proposed app reference 983b</p><h2>Printed reference 1030</h2><p>{e(report['reason'])}</p><p><strong>Proposed order:</strong> 983 → 983b → 984. The printed reference 1030 would remain prominent. Existing references, links and bookmarks would stay stable.</p><p class="label">Complete chain · working English</p><p class="english" data-english>{e(report['workingEnglish']['chain'])}</p><p class="label">Report · working English</p><p class="english" data-english>{e(report['workingEnglish']['report'])}</p><details open><summary>Selected Arabic transcription</summary><p class="arabic" lang="ar" dir="rtl" data-arabic>{e(report['arabic'])}</p><p>{e(report['transcriptionPolicy'])}</p></details><details><summary>Both printed readings and exact pages</summary>{witnesses(report)}</details><details><summary>Why an English reference number is not enough</summary><ul>{''.join('<li>'+e(c['note'])+'</li>'for c in report['comparisonLimits'])}</ul><p><a href="https://sunnah.com/bukhari:1030" target="_blank" rel="noopener">Individually inspected comparison · 1030 ↗</a> · <a href="https://aishabewley.org/bukhari10" target="_blank" rel="noopener">Bewley · Rain Prayer ↗</a></p></details></article><article id="empty-chapter"><p class="eyebrow">Printed chapter 5 · no numbered hadith</p><h2>A heading between chapters.</h2><p>{e(chapter['reason'])}</p><p class="arabic" lang="ar" dir="rtl" data-empty-heading>{e(chapter['arabic'])}</p><p>English translation remains pending. The two prints order the divine epithet differently; both readings remain accessible below. This heading belongs in browsing and source notes, separately from daily narration.</p><details><summary>Both printed headings and exact pages</summary>{witnesses(chapter)}</details></article><article id="wording"><h2>Original correction proposals.</h2><p>The raw digital text is unchanged. These are the intake-stage proposals. The local prototype now applies the documented narrator-name correction in 968; <a href="../reader/rain-prayer-review.html#hadith-968">its exact original and derived wording are retained</a>. The proposal for 986 is still unapplied.</p>{''.join('<section><p><strong>Reference '+str(c['reference'])+'</strong> · '+e('intake-stage '+c['status'])+'</p><p class="label">Digital wording</p><p class="arabic" lang="ar" dir="rtl">'+e(c['before'])+'</p><p class="label">Both inspected prints</p><p class="arabic" lang="ar" dir="rtl">'+e(c['after'])+'</p></section>'for c in audit['proposedCorrections'])}</article><footer><p>Saved sessions will retain their original contents when previously pending reports become available; new material appears separately. These candidates do not change any session or resolve an existing source hold.</p><p><a href="rain-prayer-source-audit.json">Complete source audit and comparison locations</a> · <a href="../reader/">Local reader</a></p></footer></main></body></html>\n'''
def load():
 a=read('research/rain-prayer-source-audit.json');r=read(a['missingPrintedReport']['path']);c=read(a['missingPrintedChapter']['path']);i=book.build(ROOT/'content/sources/wikisource-rain-prayer');en=read('content/staging/bukhari-en-islamhouse/catalog.json');return a,r,c,i,en
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--write',action='store_true');args=p.parse_args();a,r,c,i,en=load();validate(a,r,c,i,en);out=ROOT/'research/rain-prayer-source-review.html';html=render(a,r,c)
 if args.write:out.write_text(html)
 else:require(out.read_text()==html,'Source review page is stale')
 print('Rain Prayer intake checked: 33 digital reports; 35 printed occurrences accounted for; separate empty chapter; no reader admission.')
