"""Verify the unchanged Forgetfulness intake, shared printed number and complete comparisons."""
import argparse, hashlib, html, importlib.util, json, re, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1166, 1180))
CONTEXT = ['mwEw', 'mwIw', 'mwKw']
SOURCE_SHA = 'ee449404d2b53adf1480d9e53820376cef4722ce5e289b3a7713829fa2c9e6e9'
VARIANTS_SHA = '9e954ca3e35b10b13c2227a6b0f047070b095ed304b62a7b7d81b89810c26f1f'
ENGLISH_MAP_SHA = '108748b2971bd237d8baae09ddf30d102a5b0c6e685564131511a534d55310b1'
PRINTS = {'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1', 'dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
HISTORICAL_PAGES = {1166: [308, 309], 1167: [309], 1168: [309], 1169: [309], 1170: [309], 1171: [309, 310], 1172: [310], 1173: [310], 1174: [310], 1175: [311], 1176: [311], 1177: [311, 312], 1178: [312], 1179: [312]}
MODERN_PAGES = {1166: [296], 1167: [296], 1168: [296], 1169: [296], 1170: [297], 1171: [297], 1172: [297], 1173: [297], 1174: [298], 1175: [298], 1176: [298, 299], 1177: [299], 1178: [299], 1179: [299]}

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def require(value, message):
    if not value:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def hashjson(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


book=module('forgetfulness_book','import-wikisource-book.py')
english=module('forgetfulness_english','import-english.py')

def printed_references(n):
    return [n+58 if n<=1170 else n+57]

def printed_pages(n):
    return {'brill-1862':HISTORICAL_PAGES[n], 'dar-ibn-kathir-2002':MODERN_PAGES[n]}

def khan_references(n):
    return ['2.22.'+str(n-851)]

def locate_bewley(raw):
    separated = re.sub(r'</?(?:p|h[1-6])\b[^>]*>', '\x00', raw.decode('utf-8'), flags=re.I)
    parts = [' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', p)).split()) for p in separated.split('\x00')]
    starts = [i for i,p in enumerate(parts) if re.match(r'^1166\s*\.',p)]
    require(len(starts)==1,'Missing or ambiguous English subsection start')
    endings = [i for i,p in enumerate(parts) if 'Chapter 28. The Book of Funerals' in p and i>starts[0]]
    require(len(endings)==1,'Missing or ambiguous English terminal chapter heading')
    section=parts[starts[0]:endings[0]]
    labels=[(i,re.match(r'^(\d{4})\s*\.',p)) for i,p in enumerate(section)]
    labels=[(i,m) for i,m in labels if m]
    require([int(m[1]) for _,m in labels]==REFERENCES,'English occurrences missing, duplicated or reordered')
    result={}
    for offset,(index,match) in enumerate(labels):
        end=labels[offset+1][0] if offset+1<len(labels) else len(section)
        chunks=[section[index][match.end():].strip()]
        for paragraph in section[index+1:end]:
            if re.match(r'^[IVX]+:',paragraph):break
            if paragraph:chunks.append(paragraph)
        result[int(match[1])]={'displayedReference':match[1],'occurrence':1,'body':' '.join(chunks).strip()}
    return result


def verify_file(path,expected):
    raw=Path(path).read_bytes()
    require(len(raw)==expected['bytes'] and sha(raw)==expected['sha256'],'Witness file differs from inspected bytes')
    return raw


def verify_bewley_bodies(audit,bodies):
    require(list(bodies)==REFERENCES,'Incomplete English body coverage')
    for row in audit['records']:
        body=bodies[row['reference']];expected=row['englishComparisons']['bewley']
        require(body['displayedReference']==expected['displayedReference'] and body['occurrence']==1 and sha(body['body'])==expected['bodySha256'],'English body differs from its pinned locator')


def verify_epub(audit,inventory):
    source=audit['englishComparisons']['khan'];path=ROOT/source['sourcePath'];raw=path.read_bytes()
    require(sha(raw)==source['sourceSha256']==inventory['sourceSha256']=='94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c','Wrong English EPUB')
    records={r['id'].split(':')[-1]:r for r in inventory['records']}
    with zipfile.ZipFile(path) as epub:
        paragraphs=english.parse_section(epub.read('OPS/section-0024.html'))['paragraphs'];seen=set()
        for row in audit['records']:
            comparison=row['englishComparisons']['khan'];parts=comparison.get('parts',[comparison]);refs=khan_references(row['reference'])
            require([p['reference']for p in parts]==refs and comparison['reference']==refs[0],'Wrong English occurrence')
            if 'parts' in comparison:
                require(all(comparison[k]==parts[0][k]for k in ['reference','recordSha256','bodySha256']),'Conflicting primary English body')
            for part in parts:
                ref=part['reference'];record=records[ref]
                require(record['section']=='OPS/section-0024.html','Wrong English section')
                body=[paragraphs[i]for i in record['bodyParagraphs']]
                require(part['recordSha256']==hashjson(record) and part['bodySha256']==hashjson(body)==record['textSha256'],'English body or inventory binding changed')
                require(ref not in seen,'English body assigned more than once');seen.add(ref)
    require(seen=={'2.22.'+str(i)for i in range(315,329)},'English record coverage changed')
    return len(seen)


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion']==1 and audit['status']=='source-intake-compared-wording-review-pending' and audit['readerAdmission'] is False and audit['reviewerKind']=='ai' and audit['independentReview']=='pending','Intake cannot approve wording or reader admission')
    s=audit['source'];blocks={b['htmlId']:b for b in inventory['blocks']};records={r['number']:r for r in inventory['records']}
    require(s['id']==inventory['sourceId']=='wikisource-bukhari-forgetfulness-r39528' and s['revision']==inventory['revision']==39528 and s['sha256']==inventory['sourceSha256']==SOURCE_SHA and s['inventorySha256']==hashjson(inventory) and s['bytes']==106812 and s['path']=='content/sources/wikisource-forgetfulness/source.html','Stale Arabic source binding')
    # Rebuild from the immutable HTML, so coordinated rehashes cannot hide a deletion.
    require(inventory==book.build(ROOT/'content/sources/wikisource-forgetfulness'),'Inventory differs from exact pinned HTML')
    require(s['arabicChanged'] is False and inventory['status']=='candidate-not-approved' and inventory['readerEligible'] is False,'Arabic must remain unchanged and quarantined')
    require(list(records)==REFERENCES and s['numberedReports']==14 and s['blocks']==len(blocks)==27 and s['chapters']==len(inventory['chapters'])==9 and s['codePoints']==sum(len(b['text'])for b in blocks.values())==5956,'Source coverage changed')
    require(s['separateContextIds']==[p for c in inventory['chapters']for p in c['contextIds']]==CONTEXT and s['blankIds']==inventory['blankIds']==['mwOw'] and blocks['mwOw']['text']=='\n','Context or trailing newline changed')
    owners=inventory['blankIds']+[p for c in inventory['chapters']for p in [c['headingId'],*c['contextIds']]]+[p for r in inventory['records']for p in r['paragraphIds']]
    require(len(owners)==len(set(owners))==len(blocks) and set(owners)==set(blocks),'Each exact source block needs one owner')
    require({p['id']:p['sha256']for p in audit['printedComparisons']}==PRINTS and [p['inspectedPdfPages']for p in audit['printedComparisons']]==[list(range(308,314)),list(range(296,301))],'Printed witness identity or coverage changed')
    require([p['bytes']for p in audit['printedComparisons']]==[28290204,45304371],'Printed witness byte count changed')
    require(all(audit[k]==[]for k in ['missingPrintedReports','proposedCorrections','printedHeadingProposals','combinedDigitalReferences','englishBoundaryDifferences','classicalComparisonNotes']) and audit['chapterWithoutNumberedReport'] is None,'No omitted report or proposed correction has been established')
    require(audit['modernPrintedOccurrencesAccountedFor']==14 and audit['distinctModernPrintedNumbers']==13,'Printed occurrence/count distinction changed')
    require([r['reference']for r in audit['records']]==REFERENCES,'Missing, duplicated or reordered source occurrence')
    for row in audit['records']:
        n=row['reference'];r=records[n]
        require(row['sourceRecordId']==r['id'] and row['chapterId']==r['chapterId'] and row['paragraphIds']==r['paragraphIds'] and row['arabicSha256']==sha('\n\n'.join(blocks[p]['text']for p in r['paragraphIds'])),'Report text or ownership changed')
        require(row['printedReferences']==printed_references(n) and row['printedPages']==printed_pages(n) and bool(row['finding']),'Wrong printed location or missing finding')
        if n in [1170,1171]:
            part=row.get('printedOccurrence',{});require(part.get('reference')==1228 and part.get('part')==n-1169 and part.get('parts')==2 and bool(part.get('scope')),'Shared printed number needs distinct ordered parts')
        else:require('printedOccurrence' not in row,'Unexpected shared printed occurrence')
    shared=audit['sharedPrintedReferences'];require(len(shared)==1 and shared[0]['printedReference']==1228 and shared[0]['digitalReferences']==[1170,1171] and shared[0]['parts']==2 and shared[0]['printedPage']==297 and bool(shared[0]['finding']),'Shared-number explanation changed')
    require(hashjson([[r['reference'],r['englishComparisons']]for r in audit['records']])==ENGLISH_MAP_SHA,'Exact English locator evidence or limits changed')
    require(sorted(set(p for r in audit['records']for p in r['printedReferences']))==list(range(1224,1237)),'Printed sequence gap or substitution')
    vs=audit['unresolvedTextualDifferences'];require(len(vs)==14 and hashjson(vs)==VARIANTS_SHA,'Recorded differences changed')
    for v in vs:
        require(v['kind']=='unresolved-textual-difference' and v['status']=='unresolved-not-applied' and v['independentReview']=='pending' and v['sourceBlockSha256']==blocks[v['paragraphId']]['textSha256'] and v['sourceReading'] in blocks[v['paragraphId']]['text'],'Variant source binding changed')
        for w in v['witnesses']:require(w['sourceSha256']==PRINTS[w['sourceId']] and w['readingSha256']==sha(w['reading']),'Printed excerpt identity changed')
    chapters=[{'chapterId':c['id'],'headingId':c['headingId'],'headingSha256':blocks[c['headingId']]['textSha256'],'context':[{'paragraphId':p,'arabicSha256':blocks[p]['textSha256']}for p in c['contextIds']],'englishStatus':'pending','readerEligible':False}for c in inventory['chapters']]
    require(audit['chapterMaterial']==chapters,'Separate chapter material lost or promoted')
    b=audit['sectionBoundary'];require(b['selectedLastReference']==1179 and b['nextSelectedReference']==1180 and b['nextHeadingArabic']=='باب في الجنائز ومن كان آخر كلامه لا إله إلا الله' and b['printedNextReferences']==[1237] and b['printedPages']=={'brill-1862':[313],'dar-ibn-kathir-2002':[300]},'Section boundary changed')
    en=audit['englishComparisons'];require(en['bewley']['locatedBodies']==14 and en['bewley']['terminalBoundary']=='chapter-28-funerals-heading' and en['bewley']['sha256']=='bd5142c2c3a08e92aa24be4b438ea628ab95c3065b8819e8651a3cf6d65df657' and en['bewley']['bytes']==118517 and en['bewley']['boundaryDifferenceIds']==[],'English page coverage changed')
    require(en['khan']['locatedRecords']==14 and en['khan']['mappedArabicReports']==14 and en['khan']['absentReferences']==[] and en['khan']['range']=='2.22.315–328' and en['khan']['irregularReferenceMap']=={},'English EPUB scope changed')
    return True


def load():
    inventory=book.build(ROOT/'content/sources/wikisource-forgetfulness')
    require(inventory==read('content/staging/bukhari-forgetfulness-wikisource/catalog.json'),'Stale source inventory')
    return read('research/forgetfulness-source-audit.json'),inventory,read('content/staging/bukhari-en-islamhouse/catalog.json')


def render(audit, inventory):
    e=html.escape;blocks={b['htmlId']:b['text']for b in inventory['blocks']};prints={p['id']:p for p in audit['printedComparisons']}
    def links(pages):
        return ' · '.join(f'<a href="{e(prints[k]["url"])}#page={p}">{e(k)} · PDF p. {p}</a>'for k,ps in pages.items()for p in ps)
    cards=[]
    for r in audit['records']:
        n=r['reference'];pr=' / '.join(map(str,r['printedReferences']));part=r.get('printedOccurrence');label=f' · part {part["part"]} of {part["parts"]}'if part else''
        text=e('\n\n'.join(blocks[p]for p in r['paragraphIds'])).replace(' \n','&#32;\n')
        limits=''.join(f'<li><strong>{e(k.title())}:</strong> {e(note)}</li>'for k,c in r['englishComparisons'].items()for note in c['limitations'])
        cards.append(f'<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {pr}{label}</p><h2>Reference {n}</h2><p>{e(r["finding"])}</p><details><summary>Complete Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{text}</p><p>{links(r["printedPages"])}</p><p><a href="https://aishabewley.org/bukhari11">Bewley label {n}</a> · Khan {e(r["englishComparisons"]["khan"]["reference"])}</p><ul>{limits}</ul></details></article>')
    differences=[]
    for v in audit['unresolvedTextualDifferences']:
        ws=''.join(f'<p>{links({w["sourceId"]:[w["pdfPage"]]})}</p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>'for w in v['witnesses'])
        differences.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-"," "))}</summary><p>{e(v["finding"])}</p><p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v["sourceReading"])}</p>{ws}<p>{e(v["transcriptionPolicy"])}</p></details>')
    chapters=[]
    for i,c in enumerate(inventory['chapters']):
        ps=''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(blocks[p])}</p>'for p in [c['headingId'],*c['contextIds']])
        chapters.append(f'<details><summary>Chapter {i+1} · Arabic context · English pending</summary>{ps}</details>')
    style=':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:52px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Forgetfulness in Prayer · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Forgetfulness in prayer.</h1><p>14 digital entries · 9 chapters · 13 distinct printed numbers.</p>
<div class="notice"><strong>Candidate evidence only.</strong> This intake adds no reader entry or approved English translation. Arabic remains unchanged; independent qualified review is pending. Source comparisons do not certify wording or reuse rights.</div>
<article><h2>What this section needs</h2><ul><li><a href="#shared">1170 and 1171 share printed number 1228.</a> Each keeps its own chain, text and occurrence identity. 1171 is an attributed narrator discussion.</li><li><a href="#1169-sad-urwah-closing">The complete Sad / Urwah closing account in 1169</a> and <a href="#report-1173">Ibn Jurayj corroboration in 1173</a> must remain.</li><li><a href="#report-1170">1170 ends after a singular prostration episode.</a> Its text must not be completed using another version.</li><li><a href="#differences">Fourteen recorded differences</a> remain unapplied. Some English comparisons lose speech, a takbir or a closing transmission note.</li><li><a href="#chapters">Three separate chapter comments</a> stay outside numbered sessions, with English pending.</li></ul><p><a href="forgetfulness-source-audit.json">Complete evidence map</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_سجود_السهو&amp;oldid=39528">Pinned Arabic revision</a></p>{''.join(f'<p>{e(x)}</p>'for x in audit['englishComparisons']['commonLimitations'])}</article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>'for n in REFERENCES)}</nav>{''.join(cards)}
<article id="shared"><h2>One printed number, two source entries</h2><p>{e(audit['sharedPrintedReferences'][0]['finding'])}</p><p>{links({'dar-ibn-kathir-2002':[297]})}</p></article>
<article id="differences"><h2>Recorded textual differences</h2><p>These are comparison findings, with no applied correction or religious ruling.</p>{''.join(differences)}</article>
<article id="chapters"><h2>Separate chapter material</h2><p>Nine complete headings and three separate paragraphs. All chapter English remains pending.</p>{''.join(chapters)}</article>
<article id="boundary"><h2>Where this section ends</h2><p>{e(audit['sectionBoundary']['finding'])}</p><p class="arabic" lang="ar" dir="rtl">{e(audit['sectionBoundary']['nextHeadingArabic'])}</p><p>{links(audit['sectionBoundary']['printedPages'])}</p></article>
<footer><p>{e(audit['scope'])}</p><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic Wikisource contributors, revision 39528, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; source wording unchanged. Historical print excerpts use unvocalized modern letter forms for comparison; they do not replace the source.</p><p><a href="../reader/">Local reader</a> · <a href="actions-prayer-source-review.html">Previous section review</a></p></footer></main></body></html>
'''


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--write',action='store_true');p.add_argument('--bewley-html',type=Path);p.add_argument('--brill-pdf',type=Path);p.add_argument('--modern-pdf',type=Path);args=p.parse_args()
    a,i,en=load();validate(a,i,en);count=verify_epub(a,en)
    if args.bewley_html:verify_bewley_bodies(a,locate_bewley(verify_file(args.bewley_html,a['englishComparisons']['bewley'])))
    for path,w in zip([args.brill_pdf,args.modern_pdf],a['printedComparisons']):
        if path:verify_file(path,w)
    target=ROOT/'research/forgetfulness-source-review.html';page=render(a,i)
    if args.write:target.write_text(page)
    else:require(target.read_text()==page,'Source review page stale')
    print(f'Forgetfulness: 14 unchanged entries, 27 exact blocks, 14 English EPUB records, 13 printed numbers with 1228 shared; candidate only.')
