"""Validate complete Actions during Prayer source evidence without admitting wording."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1140, 1166))
CONTEXT = ['mwBg','mwIg','mwNw','mwPQ','mwRA','mwXg']
PRINTS = {'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
          'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
LIMITED = {'bewley': {1140,1141,1144,1147,1148,1152,1153,1155,1156,1158,1161,1164}, 'khan': {1140,1141,1143,1144,1145,1148,1152,1153,1154,1158,1160,1161,1163,1164}}
SOURCE_SHA = 'b59d026c3bd9179bd527dc83fefc7cf5bb33ed5784f4fb70162a2d8f7d591b5d'
VARIANTS_SHA = 'c4dcf987af366ff626d8339cdf40c0176d7af48db509c72e7609e08efe809324'
LIMITS_SHA = '8d85a366a024e06cc8e36ac263380443d549363156b06c298c9209676c099b34'
ENGLISH_MAP_SHA = 'a97511a65bb483cf350aaa7d5e2c43bbf71011e8da4071fd8328cb414e038d87'



def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


book = module('actions_prayer_book', 'import-wikisource-book.py')
english = module('actions_prayer_english', 'import-english.py')


def require(value, message):
    if not value:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def hashjson(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def printed_references(n):
    return [n+58]


def printed_pages(n):
    historical = {1140:[301,302],1141:[302],1142:[302],1143:[302],1144:[303],1145:[303],1146:[303],1147:[303],1148:[303,304],1149:[304],1150:[304],1151:[304],1152:[304],1153:[305],1154:[305],1155:[305],1156:[305,306],1157:[306],1158:[306],1159:[306],1160:[306,307],1161:[307],1162:[307],1163:[307,308],1164:[308],1165:[308]}
    modern = {1140:[289],1141:[289,290],1142:[290],1143:[290],1144:[290],1145:[290],1146:[291],1147:[291],1148:[291],1149:[291],1150:[291],1151:[292],1152:[292],1153:[292],1154:[292,293],1155:[293],1156:[293],1157:[293],1158:[293],1159:[294],1160:[294],1161:[294],1162:[295],1163:[295],1164:[295],1165:[295]}
    return dict(zip(PRINTS,[historical[n],modern[n]]))


def khan_references(n):
    if n == 1140: return ['2.22.289']
    if n == 1141: return ['2.22.290','2.22.291']
    if n <= 1147: return ['2.22.'+str(n-850)]
    if n == 1148: return ['2.22.297m']
    return ['2.22.'+str(n-851)]


def locate_bewley(raw):
    separated = re.sub(r'</?(?:p|h[1-6])\b[^>]*>', '\x00', raw.decode('utf-8'), flags=re.I)
    parts = [' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', p)).split()) for p in separated.split('\x00')]
    starts = [i for i,p in enumerate(parts) if re.match(r'^1140\s*\.',p)]
    require(len(starts)==1,'Missing or ambiguous English subsection start')
    endings = [i for i,p in enumerate(parts) if 'Chapter 27. Chapters on Forgetfulness' in p and i>starts[0]]
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


def verify_bewley_bodies(audit,bodies):
    require(list(bodies)==REFERENCES,'Incomplete English body coverage')
    for row in audit['records']:
        body=bodies[row['reference']];expected=row['englishComparisons']['bewley']
        require(body['displayedReference']==expected['displayedReference'] and body['occurrence']==1 and sha(body['body'])==expected['bodySha256'],'English body differs from its pinned locator')


def verify_file(path,expected):
    raw=Path(path).read_bytes()
    require(len(raw)==expected['bytes'] and sha(raw)==expected['sha256'],'Witness file differs from inspected bytes')
    return raw


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
    require(seen=={'2.22.'+str(i)for i in range(289,315)}|{'2.22.297m'},'English record coverage changed')
    return len(seen)


def validate(audit,inventory,english_inventory):
    require(audit['schemaVersion']==1 and audit['status']=='source-intake-compared-wording-review-pending' and audit['readerAdmission'] is False and audit['reviewerKind']=='ai' and audit['independentReview']=='pending','Intake cannot approve wording or reader admission')
    s=audit['source']
    require(s['id']==inventory['sourceId']=='wikisource-bukhari-actions-prayer-r39529' and s['revision']==inventory['revision']==39529 and s['sha256']==inventory['sourceSha256']==SOURCE_SHA and s['inventorySha256']==hashjson(inventory) and s['bytes']==129420 and s['path']=='content/sources/wikisource-actions-prayer/source.html','Stale Arabic source binding')
    require(s['arabicChanged'] is False and inventory['status']=='candidate-not-approved' and inventory['readerEligible'] is False,'Arabic must remain unchanged and quarantined')
    blocks={b['htmlId']:b for b in inventory['blocks']};records={r['number']:r for r in inventory['records']}
    require(list(records)==REFERENCES and s['numberedReports']==26 and s['blocks']==len(blocks)==50 and s['chapters']==len(inventory['chapters'])==18 and s['codePoints']==sum(len(b['text'])for b in blocks.values())==10182,'Source coverage changed')
    require(s['separateContextIds']==[p for c in inventory['chapters']for p in c['contextIds']]==CONTEXT and s['blankIds']==inventory['blankIds']==[],'Chapter context ownership changed')
    owners=[p for c in inventory['chapters']for p in [c['headingId'],*c['contextIds']]]+[p for r in inventory['records']for p in r['paragraphIds']]
    require(len(owners)==len(set(owners))==len(blocks) and set(owners)==set(blocks),'Source blocks need exactly one owner')
    require({p['id']:p['sha256']for p in audit['printedComparisons']}==PRINTS and [p['inspectedPdfPages']for p in audit['printedComparisons']]==[list(range(301,310)),list(range(289,297))],'Printed witness identity or coverage changed')
    require(audit['missingPrintedReports']==audit['proposedCorrections']==audit['sharedPrintedReferences']==audit['printedHeadingProposals']==audit['combinedDigitalReferences']==audit['englishBoundaryDifferences']==audit['classicalComparisonNotes']==[] and audit['modernPrintedOccurrencesAccountedFor']==26,'No missing or extra report has been established')
    require([r['reference']for r in audit['records']]==REFERENCES,'Reports missing, repeated or reordered')
    for row in audit['records']:
        n=row['reference'];record=records[n]
        require(row['sourceRecordId']==record['id'] and row['chapterId']==record['chapterId'] and row['paragraphIds']==record['paragraphIds'] and row['arabicSha256']==sha('\n\n'.join(blocks[p]['text']for p in record['paragraphIds'])),'Report Arabic or ownership changed')
        require(row['printedReferences']==printed_references(n) and row['printedPages']==printed_pages(n),'Wrong printed occurrence or page');require(bool(row['finding']),'Missing comparison finding')
        for provider in LIMITED:
            c=row['englishComparisons'][provider];expected='limited-comparison-not-wording-approval' if n in LIMITED[provider] else 'located-body-not-wording-approval'
            require(c['status']==expected and bool(c['limitations'])==(n in LIMITED[provider]) and all(isinstance(v,str) and v.strip()for v in c['limitations']),'Comparison limitation erased or promoted')
            if provider=='bewley':require(c['displayedReference']==str(n) and c['occurrence']==1 and re.fullmatch('[a-f0-9]{64}',c['bodySha256']),'Wrong English page locator')
            else:require(c['reference']==khan_references(n)[0] and [p['reference']for p in c.get('parts',[c])]==khan_references(n),'Wrong English occurrence')
    require(hashjson([[r['reference'],{p:c['limitations']for p,c in r['englishComparisons'].items()}]for r in audit['records']])==LIMITS_SHA,'Exact comparison findings changed')
    require(hashjson([[r['reference'],r['englishComparisons']]for r in audit['records']])==ENGLISH_MAP_SHA,'Pinned English locator evidence changed')
    require([p for r in audit['records']for p in r['printedReferences']]==list(range(1198,1224)),'Printed coverage gap or duplicate substitution')
    variants=audit['unresolvedTextualDifferences']
    require(len(variants)==24 and hashjson(variants)==VARIANTS_SHA,'Recorded textual differences changed')
    for v in variants:
        require(v['kind']=='unresolved-textual-difference' and v['status']=='unresolved-not-applied' and v['independentReview']=='pending' and v['sourceBlockSha256']==blocks[v['paragraphId']]['textSha256'] and v['sourceReading'] in blocks[v['paragraphId']]['text'],'Variant source evidence changed')
        for w in v['witnesses']:require(w['sourceSha256']==PRINTS[w['sourceId']] and w['readingSha256']==sha(w['reading']),'Printed excerpt identity changed')
    expected_chapters=[{'chapterId':c['id'],'headingId':c['headingId'],'headingSha256':blocks[c['headingId']]['textSha256'],'context':[{'paragraphId':p,'arabicSha256':blocks[p]['textSha256']}for p in c['contextIds']],'englishStatus':'pending','readerEligible':False}for c in inventory['chapters']]
    require(audit['chapterMaterial']==expected_chapters,'Separate chapter material changed or promoted')
    empty=audit['chapterWithoutNumberedReport'];require(empty['chapterId']=='chapter-13' and empty['headingId']==inventory['chapters'][12]['headingId'] and empty['contextIds']==['mwRA'] and inventory['chapters'][12]['entryNumbers']==[] and empty['printedPages']=={'brill-1862':[306],'dar-ibn-kathir-2002':[293]},'Context-only chapter cannot become a numbered report')
    boundary=audit['sectionBoundary'];require(boundary['selectedLastReference']==1165 and boundary['nextSelectedReference']==1166 and boundary['nextHeadingArabic']=='باب ما جاء في السهو إذا قام من ركعتي الفريضة' and boundary['printedNextReferences']==[1224] and boundary['printedPages']=={'brill-1862':[308,309],'dar-ibn-kathir-2002':[296]},'Section boundary changed')
    en=audit['englishComparisons'];require(en['bewley']['locatedBodies']==26 and en['bewley']['terminalBoundary']=='chapter-27-forgetfulness-heading' and en['bewley']['sha256']=='bd5142c2c3a08e92aa24be4b438ea628ab95c3065b8819e8651a3cf6d65df657' and en['bewley']['bytes']==118517 and en['bewley']['boundaryDifferenceIds']==[] and en['khan']['locatedRecords']==27 and en['khan']['mappedArabicReports']==26 and en['khan']['absentReferences']==[] and en['khan']['irregularReferenceMap']=={'1141':['2.22.290','2.22.291'],'1148':['2.22.297m']},'English scope changed')
    return True


def load():
    inventory=book.build(ROOT/'content/sources/wikisource-actions-prayer')
    require(inventory==read('content/staging/bukhari-actions-prayer-wikisource/catalog.json'),'Stale source inventory')
    return read('research/actions-prayer-source-audit.json'),inventory,read('content/staging/bukhari-en-islamhouse/catalog.json')


def render(audit, inventory):
    e = html.escape
    blocks = {b['htmlId']:b['text'] for b in inventory['blocks']}
    prints = {p['id']:p for p in audit['printedComparisons']}

    def page_links(pages):
        return ' · '.join(f'<a href="{e(prints[key]["url"])}#page={page}">{e(key)} · p. {page}</a>' for key,numbers in pages.items() for page in numbers)

    cards = []
    for row in audit['records']:
        n = row['reference'];refs = ' / '.join(map(str,row['printedReferences']))
        arabic = e('\n\n'.join(blocks[p] for p in row['paragraphIds'])).replace(' \n','&#32;\n')
        bc,kc = row['englishComparisons']['bewley'],row['englishComparisons']['khan']
        location = 'Khan ' + ' / '.join(e(p['reference']) for p in kc.get('parts',[kc])) + '.'
        limits = ''.join(f'<li><strong>{e(provider.title())}:</strong> {e(note)}</li>' for provider,c in row['englishComparisons'].items() for note in c['limitations'])
        cards.append(f'''<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {refs}</p><h2>Reference {n}</h2><p>{e(row['finding'])}</p>
<details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{arabic}</p><p>{page_links(row['printedPages'])}</p>
<p><a href="https://aishabewley.org/bukhari11">Bewley label {e(bc['displayedReference'])}</a> · {location}</p><ul>{limits}</ul></details></article>''')

    differences = []
    for v in audit['unresolvedTextualDifferences']:
        witnesses = ''.join(f'<p>{page_links({w["sourceId"]:[w["pdfPage"]]})}</p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' for w in v['witnesses'])
        differences.append(f'''<details id="{e(v['id'])}"><summary>{e(v['id'].replace('-',' '))}</summary><p>{e(v['finding'])}</p>
<p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v['sourceReading'])}</p>{witnesses}<p>{e(v['transcriptionPolicy'])}</p></details>''')
    chapters = []
    for i,c in enumerate(inventory['chapters']):
        paragraphs = ''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(blocks[p])}</p>' for p in [c['headingId'],*c['contextIds']])
        chapters.append(f'<details><summary>Chapter {i+1} · Arabic source material · English pending</summary>{paragraphs}</details>')
    style = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:52px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Actions during Prayer · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Actions during Prayer.</h1><p>26 digital reports · 18 chapters · 26 mapped printed references.</p>
<div class="notice"><strong>Candidate evidence only.</strong> This intake adds no reader entry or approved English translation. The Arabic remains unchanged. Independent qualified review is pending; source comparison does not certify wording or reuse rights.</div>
<article><h2>What needs careful review</h2><ul>
<li>All 26 printed occurrences are accounted for. No missing complete report or new suffix is established.</li>
<li><a href="#report-1141">1141 contains two complete chains</a>, compared with EPUB labels 290 / 291; the latter is a backward pointer. <a href="#report-1148">1148 maps to the exact label 297m</a>.</li>
<li><a href="#differences">Twenty-four recorded textual differences</a> remain unapplied. The expedition count and opening reporting verb need explicit wording review.</li>
<li>The selected al-Nadr lexical note, clapping explanations, full corroborating routes and two-prostration count must not be lost through shortened English comparisons.</li>
<li><a href="#chapters">Six separate chapter comments and a context-only chapter</a> stay outside numbered sessions. Their English remains pending.</li></ul>
<p><a href="actions-prayer-source-audit.json">Complete evidence map and source hashes</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_العمل_في_الصلاة&amp;oldid=39529">Pinned Arabic revision</a></p>
{''.join(f'<p>{e(note)}</p>' for note in audit['englishComparisons']['commonLimitations'])}
<p>Web comparison ranges stop at the next chapter heading. Chapter context is excluded from the numbered report comparison; later English labels remain outside this subsection.</p></article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>{''.join(cards)}
<article id="differences"><h2>Recorded textual differences</h2><p>None is an applied correction or an inferred religious ruling.</p>{''.join(differences)}</article>
<article id="chapters"><h2>Separate chapter material</h2><p>Eighteen headings and six separate paragraphs, with English pending. Chapter 13 has context but no numbered report.</p>{''.join(chapters)}</article>
<article id="boundary"><h2>Where this subsection ends</h2><p>{e(audit['sectionBoundary']['finding'])}</p><p class="arabic" lang="ar" dir="rtl">{e(audit['sectionBoundary']['nextHeadingArabic'])}</p><p>Next digital reference: 1166 · Printed 1224.</p><p>{page_links(audit['sectionBoundary']['printedPages'])}</p></article>
<footer><p>{e(audit['scope'])}</p><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; digital transcription by Arabic Wikisource contributors, revision 39529, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; source wording unchanged.</p><p>Printed numbers use the Dar Ibn Kathir witness; historical pages are matched by contents. Page matching does not establish agreement in every word.</p><p><a href="../reader/">Local reader</a> · <a href="mosques-prayer-source-review.html">Previous section review</a></p></footer></main></body></html>
'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--bewley-html', type=Path)
    parser.add_argument('--brill-pdf', type=Path)
    parser.add_argument('--modern-pdf', type=Path)
    args = parser.parse_args()
    audit, inventory, english_inventory = load()
    validate(audit, inventory, english_inventory)
    verify_epub(audit, english_inventory)
    if args.bewley_html:
        verify_bewley_bodies(audit, locate_bewley(verify_file(args.bewley_html, audit['englishComparisons']['bewley'])))
    for path,witness in zip([args.brill_pdf,args.modern_pdf],audit['printedComparisons']):
        if path:
            verify_file(path,witness)
    page = ROOT / 'research/actions-prayer-source-review.html'
    rendered = render(audit,inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Stale source review page')
    print('Actions during Prayer: 26 complete selected reports, 26 mapped printed occurrences, 27 pinned English records; no reader admission.')
