"""Verify the full immutable Funerals inventory and its explicitly partial comparison stage."""
import argparse, hashlib, html, importlib.util, json, re, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REFERENCES=[n for n in range(1180,1331)if n!=1201]
COMPARED=[n for n in range(1180,1210)if n!=1201]
SOURCE_SHA='6b970d39f4bfaa88efa0a002bb11a2b9667e2aa3af534cbe1a6f8fb664f244e5'
SEALS={'records':'e730e25f116e62bc159b49039753addb4b1867100545b91824949a8432a37e0d','missingPrintedReports':'fe9bfb6a16d56b001ed400d4cb57e7aea665bf9293f1409e37915bb5be6fa3c2','unresolvedTextualDifferences':'ed480663143d2695b9f03c19c9fb4628405ad285fe676b1530953c48b661d956','additionalPresentationFindings':'df2771a2250694089016abf088956717cfd64d35025b3126d8eae7a670599f28','englishComparisons':'71a22aaf2a46487f05d2e74205bad7474b62401107412ca02808d711ad6a78ed'}
PRINTS={'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1','dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
resolver=module('funerals_resolver','resolve-wikisource-layout.py')
english=module('funerals_english','import-english.py')
def require(value,message):
 if not value:raise ValueError(message)
def read(path):return json.loads((ROOT/path).read_text())
def sha(value):return hashlib.sha256(value if isinstance(value,bytes)else value.encode()).hexdigest()
def hashjson(value):return sha(json.dumps(value,ensure_ascii=False,separators=(',',':')))
def fresh_inventory():
 audit=resolver.audit_tool.build(ROOT/'content/sources/wikisource-funerals')
 require(audit==read('content/staging/bukhari-funerals-wikisource/layout-audit.json'),'Stale original layout audit')
 return resolver.resolve(audit,read('content/review/funerals-layout-review.json'),read('content/staging/bukhari-en-islamhouse/catalog.json'))
def load():return read('research/funerals-first-source-audit.json'),read('content/staging/bukhari-funerals-wikisource/catalog.json'),read('content/staging/bukhari-en-islamhouse/catalog.json')

def validate(a,inv,en):
 require(a['schemaVersion']==1 and a['status']=='partial-source-intake-not-wording-approval' and a['independentReview']=='pending' and a['readerAdmission'] is False,'Source comparison cannot approve wording or reader use')
 require(inv==fresh_inventory(),'Inventory differs from immutable HTML and reviewed structural boundary')
 s=a['source'];bs={b['htmlId']:b for b in inv['blocks']};rs={r['number']:r for r in inv['records']}
 require(s['sha256']==inv['sourceSha256']==SOURCE_SHA and s['inventorySha256']==hashjson(inv) and s['layoutAuditSha256']==inv['layoutAuditSha256'] and s['layoutReviewSha256']==inv['layoutReviewSha256'],'Stale source evidence')
 require(inv['readerEligible'] is False and inv['status']=='candidate-layout-mapped-not-approved' and s['arabicChanged'] is False,'Source must remain quarantined and unchanged')
 require(list(rs)==REFERENCES and s['numberedReports']==150 and s['originalBlocks']==len(inv['originalBlocks'])==272 and s['derivedUnits']==len(bs)==273 and s['codePoints']==sum(len(b['text'])for b in bs.values())==56803,'Full source coverage changed')
 require(s['chapters']==len(inv['chapters'])==96 and len(s['contextIds'])==27 and s['contextIds']==[p for c in inv['chapters']for p in c['contextIds']] and s['blankIds']==inv['blankIds']==[],'Chapter material or blank ownership changed')
 require(s['unobservedNumericLabels']==[1201] and not any('نقضنه ثم غسلنه' in b['text']for b in bs.values()),'Missing original report must not be silently inserted')
 owned=[p for c in inv['chapters']for p in[c['headingId'],*c['contextIds']]]+[p for r in inv['records']for p in r['paragraphIds']]
 require(len(owned)==len(set(owned))==273 and set(owned)==set(bs),'Every exact source unit needs one owner')
 for original in inv['originalBlocks']:
  units=[b for b in inv['blocks']if b['origin']['blockId']==original['htmlId']]
  require(''.join(b['text']for b in units)==original['text'],'A source code point was lost or altered')
 require(rs[1208]['paragraphIds']==['mwYQ@0-256'] and rs[1209]['paragraphIds']==['mwYQ@256-562'] and bs['mwYQ@0-256']['text'].endswith('\n'),'Shared paragraph must retain its exact two reports and newline')
 require(a['comparisonScope']=={'locatedReferences':COMPARED,'pendingReferences':list(range(1210,1331)),'fullBookComparisonComplete':False,'newReaderEntries':0},'Partial comparison must not claim full coverage')
 require([r['reference']for r in a['records']]==COMPARED,'Compared records missing, duplicated or reordered')
 for key,sealed in SEALS.items():require(hashjson(a[key])==sealed,'Reviewed evidence or explicit limitations changed: '+key)
 for row in a['records']:
  r=rs[row['reference']];require(row['sourceRecordId']==r['id'] and row['chapterId']==r['chapterId'] and row['paragraphIds']==r['paragraphIds'] and row['arabicSha256']==sha('\n\n'.join(bs[p]['text']for p in r['paragraphIds'])),'Report ownership or wording changed')
 require({p['id']:p['sha256']for p in a['printedComparisons']}==PRINTS and [p['inspectedPdfPages']for p in a['printedComparisons']]==[list(range(313,321)),list(range(300,308))] and [p['bytes']for p in a['printedComparisons']]==[28290204,45304371],'Inspected print identities or coverage changed')
 accounted=sorted({p for r in a['records']for p in r['printedReferences']}|{r['printedReference']for r in a['missingPrintedReports']})
 require(a['distinctModernPrintedReferencesAccountedFor']==accounted==list(range(1237,1269)),'Printed prefix has a gap or substituted occurrence')
 require(a['proposedCorrections']==[],'No correction has been approved')
 for v in a['unresolvedTextualDifferences']:
  require(v['status']=='unresolved-not-applied' and v['sourceBlockSha256']==bs[v['paragraphId']]['textSha256'] and v['sourceReading']in bs[v['paragraphId']]['text'],'Difference lost its original source binding')
  for w in v['witnesses']:require(w['sourceSha256']==PRINTS[w['sourceId']] and w['readingSha256']==sha(w['reading']),'Printed comparison excerpt changed')
 chapters=[{'chapterId':c['id'],'headingId':c['headingId'],'headingSha256':bs[c['headingId']]['textSha256'],'context':[{'paragraphId':p,'arabicSha256':bs[p]['textSha256']}for p in c['contextIds']],'englishStatus':'pending','readerEligible':False}for c in inv['chapters']]
 require(a['chapterMaterial']==chapters,'Separate chapter material lost or promoted')
 return True

BEWLEY_HEADING_EXCEPTIONS = ('XLI. CHAPTER: The time for fortitude is the first shock', 'XLIII Weeping in the presence of someone who is ill')

def is_bewley_heading(text):
 return bool(re.match(r'^[IVXLCDM]+:',text)) or text in BEWLEY_HEADING_EXCEPTIONS

def locate_bewley(raw):
 parts=[' '.join(html.unescape(re.sub(r'<[^>]+>',' ',p)).split())for p in re.split(r'</?(?:p|h[1-6])\b[^>]*>',raw.decode('utf-8'),flags=re.I)]
 starts=[i for i,p in enumerate(parts)if p=='Chapter 28. The Book of Funerals'];require(len(starts)==1,'Missing or ambiguous English book start')
 ends=[i for i,p in enumerate(parts)if i>starts[0] and p=='Return to Contents'];require(len(ends)==1,'Missing or ambiguous English book end')
 section=parts[starts[0]:ends[0]];labels=[]
 for i,p in enumerate(section):
  match=re.match(r'^(\d{4})(?:\s*\.|(?= It is related))\s*',p)
  if match:
   n=int(match[1]);require('.' in match[0] or n==1319,'Unexpected unpunctuated English label');labels.append((i,match))
 require([int(m[1])for _,m in labels]==list(range(1180,1331)),'English occurrences missing, duplicated or reordered')
 result={}
 for j,(index,match)in enumerate(labels):
  end=labels[j+1][0]if j+1<len(labels)else len(section);chunks=[section[index][match.end():]]
  for p in section[index+1:end]:
   if is_bewley_heading(p):break
   if p:chunks.append(p)
  result[int(match[1])]={'reference':int(match[1]),'displayedReference':match[0].strip(),'bodySha256':sha(' '.join(chunks).strip())}
 return list(result.values())

def verify_bewley(a,raw):
 witness=a['englishComparisons']['bewley'];require(len(raw)==witness['bytes'] and sha(raw)==witness['sha256'],'English web witness bytes changed')
 require(locate_bewley(raw)==witness['bodyLocators'],'Exact English body locations changed')
 return 151

def verify_epub(a,en):
 w=a['englishComparisons']['khan'];raw=(ROOT/w['sourcePath']).read_bytes();require(sha(raw)==w['sourceSha256']==en['sourceSha256']=='94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c','Wrong pinned English EPUB')
 with zipfile.ZipFile(ROOT/w['sourcePath'])as z:ps=english.parse_section(z.read(w['section']))['paragraphs']
 records={r['id'].split(':')[-1]:r for r in en['records']if r['section']==w['section']};require(len(records)==155,'Wrong English section coverage')
 for r in records.values():require(hashjson([ps[i]for i in r['bodyParagraphs']])==r['textSha256'],'Changed English body inventory')
 seen=set()
 for row in a['records']+a['missingPrintedReports']:
  for part in row['englishComparisons']['khan']['parts']:
   r=records[part['reference']];body=[ps[i]for i in r['bodyParagraphs']];require(part['recordSha256']==hashjson(r) and part['bodySha256']==hashjson(body)==r['textSha256'],'English body or record binding changed');seen.add(part['reference'])
 require(seen=={'2.23.'+str(n)for n in range(329,359)},'First compared English records differ')
 return len(seen)

STYLE = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:52px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
def render(a,inv):
 e=html.escape;bs={b['htmlId']:b['text']for b in inv['blocks']};mapped={r['reference']:r for r in a['records']};prints={p['id']:p for p in a['printedComparisons']}
 def links(pages):return ' · '.join(f'<a href="{e(prints[k]["url"])}#page={p}">{e(k)} · PDF p. {p}</a>'for k,ps in pages.items()for p in ps)
 def source(r):return e('\n\n'.join(bs[p]for p in r['paragraphIds']))
 cards=[];pending=[]
 for r in inv['records']:
  n=r['number'];text=f'<p class="arabic" lang="ar" dir="rtl" data-source="{n}">{source(r)}</p>'
  if n not in mapped:pending.append(f'<details id="report-{n}"><summary>{n} · Comparison pending</summary>{text}</details>');continue
  row=mapped[n];limits=''.join(f'<li><strong>{e(k.title())}:</strong> {e(note)}</li>'for k,c in row['englishComparisons'].items()for note in c['limitations'])
  cards.append(f'<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {e(" / ".join(map(str,row["printedReferences"])))}</p><h2>Reference {n}</h2><p>{e(row["finding"])}</p><details><summary>Complete Arabic and comparison locations</summary>{text}<p>{links(row["printedPages"])}</p><p><a href="https://aishabewley.org/bukhari11">Bewley label {n}</a> · Khan {e(" / ".join(row["englishComparisons"]["khan"]["references"]))}</p><ul>{limits}</ul></details></article>')
 missing=a['missingPrintedReports'][0]
 differences=[]
 for v in a['unresolvedTextualDifferences']:
  body=''.join(f'<p>{links({w["sourceId"]:[w["pdfPage"]]})}</p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>'for w in v['witnesses'])
  differences.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-"," "))}</summary><p>{e(v["finding"])}</p><p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v["sourceReading"])}</p>{body}<p>{e(v["transcriptionPolicy"])}</p></details>')
 for v in a['additionalPresentationFindings']:differences.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-"," "))}</summary><p>{e(v["finding"])}</p><p>{links(v["printedPages"])}</p></details>')
 chapters=[]
 for i,c in enumerate(inv['chapters']):
  texts=''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(bs[p])}</p>'for p in[c['headingId'],*c['contextIds']]);chapters.append(f'<details><summary>Chapter {i+1} · Arabic · English pending</summary>{texts}</details>')
 return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Funerals · First source comparison</title><style>{STYLE}</style></head><body><main>
<p class="eyebrow">MindfulMod · Source intake</p><h1>The Book of Funerals.</h1><p>150 selected entries inventoried · 96 chapters · 29 entries compared so far.</p>
<div class="notice"><strong>Partial comparison. No new reader entries.</strong> The complete digital source is retained unchanged. The first 29 selected entries have been matched to printed occurrences and English comparison bodies. The remaining 121 entries still need that work. All wording and independent review remain pending.</div>
<div class="notice"><strong>Subsequent wording review and correction.</strong> The original intake below is a historical record. A full-page and enlarged recheck of modern printed reference 1254 confirms that it omits the conditional phrase attributed to it in the earlier 1196-conditional finding. Both prints agree with the selected Arabic on that omission. The <a href="funerals-second-wording-addendum.json">later evidence addendum</a> records the correction explicitly. The first 29 digital reports and separately transcribed printed 1260, app reference 1200b, are now in the <a href="../reader/funerals-review.html">local personal-prototype review</a>. Independent review remains pending.</div>
<article><h2>Three distinctions to preserve</h2><ul><li><a href="#missing-1201">A complete printed report is absent from the digital source.</a> Printed 1260 and English label 1201 identify it; transcription and reader admission are pending.</li><li><a href="#layout">1208 and 1209 share one source paragraph.</a> The exact existing marker separates their complete chains without changing a character.</li><li><a href="#report-1184">1184 and 1185 share one English EPUB record.</a> A fixed numeric offset would attach the wrong body to 1185.</li></ul><p><a href="funerals-first-source-audit.json">Complete evidence map</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_الجنائز&amp;oldid=393137">Pinned Arabic revision</a></p>{''.join(f'<p>{e(t)}</p>'for t in a['englishComparisons']['commonLimitations'])}</article>
<article id="missing-1201"><p class="eyebrow">Missing from selected digital source · Printed 1260</p><h2>A separately printed report</h2><p>{e(missing['finding'])}</p><p>{links(missing['printedPages'])}</p><p><a href="https://aishabewley.org/bukhari11">English label 1201</a> · Khan 2.23.350</p><p>No replacement Arabic or English wording has been inserted. Proposed app reference 1200b follows the previously approved suffix convention.</p></article>
<article id="layout"><h2>Two complete reports in one paragraph</h2><p>Source paragraph mwYQ is separated at code-point offset 256, where the existing [1209] marker begins. The first report retains its original trailing newline. Both chains and the named narrator alternatives remain complete.</p><p>{links({'brill-1862':[319,320],'dar-ibn-kathir-2002':[307]})}</p><p><a href="#report-1208">1208</a> · <a href="#report-1209">1209</a></p></article>
<nav aria-label="Compared source references">{''.join(f'<a href="#report-{n}">{n}</a>'for n in COMPARED)}</nav>{''.join(cards)}
<article id="differences"><h2>Recorded differences and presentation limits</h2><p>Thirteen selected-text differences and four further presentation findings are recorded here. None is an applied correction or a religious ruling. Detailed wording review remains required.</p>{''.join(differences)}</article>
<article id="pending"><h2>121 entries still awaiting comparison</h2><p>The following original Arabic is inventoried, not approved. No printed location or English match is claimed here. English label 1319 lacks a full stop; the comparison index preserves it separately so it cannot be swallowed by the preceding body.</p><details><summary>Open the remaining source entries, 1210–1330</summary>{''.join(pending)}</details></article>
<article id="chapters"><h2>Separate chapter material</h2><p>All 96 headings and 27 separate context paragraphs are preserved. Chapter English remains pending; context is not inserted into numbered reports.</p>{''.join(chapters)}</article>
<footer><p>{e(a['scope'])}</p><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic Wikisource contributors, revision 393137, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; original source wording unchanged.</p><p><a href="../reader/">Local reader</a> · <a href="forgetfulness-source-review.html">Previous section review</a></p></footer></main></body></html>
'''

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--write',action='store_true');p.add_argument('--bewley-html',type=Path);p.add_argument('--brill-pdf',type=Path);p.add_argument('--modern-pdf',type=Path);args=p.parse_args()
 a,i,en=load();validate(a,i,en);count=verify_epub(a,en)
 if args.bewley_html:verify_bewley(a,args.bewley_html.read_bytes())
 for path,w in zip([args.brill_pdf,args.modern_pdf],a['printedComparisons']):
  if path:
   raw=path.read_bytes();require(len(raw)==w['bytes'] and sha(raw)==w['sha256'],'Printed witness bytes changed')
 target=ROOT/'research/funerals-source-review.html';page=render(a,i)
 if args.write:target.write_text(page)
 else:require(target.read_text()==page,'Source review page stale')
 print('Funerals: 150 unchanged source entries; 29 compared, 121 pending; one missing printed report; 30 distinct EPUB records checked; no reader admission.')
