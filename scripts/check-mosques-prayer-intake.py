"""Validate complete Mosques of Mecca and Medina source evidence without admitting wording."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1132, 1140))
CONTEXT = []
PRINTS = {'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
          'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
LIMITED = {'bewley': {1132,1133,1136,1138}, 'khan': {1132,1134,1136,1138}}
SOURCE_SHA = '2afa649f50244ec8d0b0d425d5b098db0d12e9f346fcf09367fb24a3a849ed6d'
VARIANTS_SHA = 'f428e2ba36a50c958f70a67cd5b30fcaa337f4ead447c65dae74a1161b899d4d'
LIMITS_SHA = 'b18cf4c1db76e6eafb81722163789be196bdd88352feb0a8cd68dd6070da2e9a'
BOUNDARY_SHA = '7a2a13431569c71248f51b7bae44aca2d7acb91d99004e7ebd68a8255f62cc20'



def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


book = module('mosques_prayer_book', 'import-wikisource-book.py')
english = module('mosques_prayer_english', 'import-english.py')


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
    return {1132:[1188,1189],1133:[1190],1134:[1191,1192]}.get(n,[n+58])


def printed_pages(n):
    historical = [299] if n <= 1133 else [299,300] if n == 1134 else [300,301] if n == 1139 else [300]
    return dict(zip(PRINTS, [historical, [287 if n <= 1134 else 288]]))


def khan_reference(n):
    return '2.21.' + str(n - 851)


def locate_bewley(raw):
    separated = re.sub(r'<hr\b[^>]*>', '\x00END-OF-SOURCE\x00', raw.decode('utf-8'), flags=re.I)
    separated = re.sub(r'</?(?:p|h[1-6])\b[^>]*>', '\x00', separated, flags=re.I)
    parts = [' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', p)).split()) for p in separated.split('\x00')]
    starts = [i for i,p in enumerate(parts) if re.match(r'^1132\s*\.', p)]
    require(len(starts) == 1, 'Missing or ambiguous English subsection start')
    endings = [i for i,p in enumerate(parts) if p == 'END-OF-SOURCE' and i > starts[0]]
    require(bool(endings), 'Missing English terminal HR boundary')
    section = parts[starts[0]:endings[0]]
    labels = [(i,re.match(r'^(\d{4})\s*\.',p)) for i,p in enumerate(section)]
    labels = [(i,m) for i,m in labels if m]
    require([int(m[1]) for _,m in labels] == REFERENCES, 'English occurrences missing, duplicated or reordered')
    result = {}
    for offset,(index,match) in enumerate(labels):
        end = labels[offset+1][0] if offset+1 < len(labels) else len(section)
        body = ' '.join([section[index][match.end():].strip(), *filter(None,section[index+1:end])]).strip()
        result[int(match[1])] = {'displayedReference':match[1], 'occurrence':1, 'body':body}
    return result


def verify_bewley_bodies(audit, bodies):
    require(list(bodies) == REFERENCES, 'Incomplete English body coverage')
    for row in audit['records']:
        body = bodies[row['reference']];expected = row['englishComparisons']['bewley']
        require(body['displayedReference'] == expected['displayedReference'] and body['occurrence'] == 1
                and sha(body['body']) == expected['bodySha256'], 'English body differs from its pinned locator')


def verify_file(path, expected):
    raw = Path(path).read_bytes()
    require(len(raw) == expected['bytes'] and sha(raw) == expected['sha256'], 'Witness file differs from inspected bytes')
    return raw


def verify_epub(audit, inventory):
    source = audit['englishComparisons']['khan']
    raw = (ROOT / source['sourcePath']).read_bytes()
    require(sha(raw) == source['sourceSha256'] == inventory['sourceSha256'] ==
            '94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c', 'Wrong English EPUB')
    records = {r['id'].split(':')[-1]:r for r in inventory['records']}
    with zipfile.ZipFile(ROOT / source['sourcePath']) as epub:
        paragraphs = english.parse_section(epub.read('OPS/section-0023.html'))['paragraphs']
        seen = set()
        for row in audit['records']:
            comparison = row['englishComparisons']['khan']
            require(comparison['reference'] == khan_reference(row['reference']), 'Wrong English occurrence')
            for part in [comparison]:
                ref = part['reference'];record = records[ref]
                require(record['section'] == 'OPS/section-0023.html', 'Wrong English section')
                body = [paragraphs[i] for i in record['bodyParagraphs']]
                require(part['recordSha256'] == hashjson(record) and part['bodySha256'] == hashjson(body) == record['textSha256'], 'English body or inventory binding changed')
                seen.add(ref)
    require(seen == {'2.21.'+str(i) for i in range(281,289)}, 'English record coverage changed')
    return len(seen)


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion'] == 1 and audit['status'] == 'source-intake-compared-wording-review-pending'
            and audit['readerAdmission'] is False and audit['reviewerKind'] == 'ai'
            and audit['independentReview'] == 'pending', 'Intake cannot approve wording or reader admission')
    s = audit['source']
    require(s['id'] == inventory['sourceId'] == 'wikisource-bukhari-mosques-prayer-r142212'
            and s['revision'] == inventory['revision'] == 142212 and s['sha256'] == inventory['sourceSha256'] == SOURCE_SHA
            and s['inventorySha256'] == hashjson(inventory) and s['bytes'] == 93984
            and s['path'] == 'content/sources/wikisource-mosques-prayer/source.html', 'Stale Arabic source binding')
    require(s['arabicChanged'] is False and inventory['status'] == 'candidate-not-approved'
            and inventory['readerEligible'] is False, 'Arabic must remain unchanged and quarantined')
    blocks = {b['htmlId']:b for b in inventory['blocks']};records = {r['number']:r for r in inventory['records']}
    require(list(records) == REFERENCES and s['numberedReports'] == 8 and s['blocks'] == len(blocks) == 14
            and s['chapters'] == len(inventory['chapters']) == 6
            and s['codePoints'] == sum(len(b['text']) for b in blocks.values()) == 2317, 'Source coverage changed')
    require(s['separateContextIds'] == [p for c in inventory['chapters'] for p in c['contextIds']] == CONTEXT
            and s['blankIds'] == inventory['blankIds'] == [], 'Chapter context ownership changed')
    owners = [p for c in inventory['chapters'] for p in [c['headingId'],*c['contextIds']]] + [p for r in inventory['records'] for p in r['paragraphIds']]
    require(len(owners) == len(set(owners)) == len(blocks) and set(owners) == set(blocks), 'Source blocks need exactly one owner')
    require({p['id']:p['sha256'] for p in audit['printedComparisons']} == PRINTS
            and [p['inspectedPdfPages'] for p in audit['printedComparisons']] == [list(range(299,303)),list(range(287,290))], 'Printed witness identity or coverage changed')
    require(audit['missingPrintedReports'] == audit['proposedCorrections'] == audit['sharedPrintedReferences'] == audit['printedHeadingProposals'] == []
            and audit['modernPrintedOccurrencesAccountedFor'] == 10, 'A print division must not become an omission or applied correction')
    require([r['reference'] for r in audit['records']] == REFERENCES, 'Reports missing, repeated or reordered')
    for row in audit['records']:
        n = row['reference'];record = records[n]
        require(row['sourceRecordId'] == record['id'] and row['chapterId'] == record['chapterId']
                and row['paragraphIds'] == record['paragraphIds'] and row['arabicSha256'] == sha('\n\n'.join(blocks[p]['text'] for p in record['paragraphIds'])), 'Report Arabic or ownership changed')
        require(row['printedReferences'] == printed_references(n) and row['printedPages'] == printed_pages(n), 'Wrong printed occurrence or page')
        require(bool(row['finding']), 'Missing comparison finding')
        for provider in LIMITED:
            c = row['englishComparisons'][provider]
            expected = 'limited-comparison-not-wording-approval' if n in LIMITED[provider] else 'located-body-not-wording-approval'
            require(c['status'] == expected and bool(c['limitations']) == (n in LIMITED[provider])
                    and all(isinstance(v,str) and v.strip() for v in c['limitations']), 'Comparison limitation erased or promoted')
            if provider == 'bewley':
                require(c['displayedReference'] == str(n) and c['occurrence'] == 1
                        and re.fullmatch('[a-f0-9]{64}',c['bodySha256']), 'Wrong English page locator')
            else:
                require(c['reference'] == khan_reference(n), 'Wrong English occurrence')
    require(hashjson([[r['reference'],{p:c['limitations'] for p,c in r['englishComparisons'].items()}] for r in audit['records']]) == LIMITS_SHA, 'Exact comparison findings changed')
    require(sorted(p for r in audit['records'] for p in r['printedReferences']) == list(range(1188,1198)), 'Printed coverage gap or duplicate substitution')
    combined = audit['combinedDigitalReferences']
    require([c['reference'] for c in combined] == [1132,1134], 'Combined printed passages lost')
    for c, word in zip(combined,['ح حدثنا علي','قال: وكان يقول']):
        pid = records[c['reference']]['paragraphIds'][0];text = blocks[pid]['text']
        require(c['paragraphId'] == pid and c['sourceBlockSha256'] == blocks[pid]['textSha256']
                and c['printedReferences'] == printed_references(c['reference'])
                and c['boundaries'] == [{'text':word,'start':text.index(word)}], 'Combined passage boundaries changed')
    variants = audit['unresolvedTextualDifferences']
    require(len(variants) == 9 and hashjson(variants) == VARIANTS_SHA, 'Recorded textual differences changed')
    for v in variants:
        require(v['kind'] == 'unresolved-textual-difference' and v['status'] == 'unresolved-not-applied'
                and v['independentReview'] == 'pending' and v['sourceBlockSha256'] == blocks[v['paragraphId']]['textSha256']
                and v['sourceReading'] in blocks[v['paragraphId']]['text'], 'Variant source evidence changed')
        for w in v['witnesses']:
            require(w['sourceSha256'] == PRINTS[w['sourceId']] and w['readingSha256'] == sha(w['reading']), 'Printed excerpt identity changed')
    expected_chapters = [{'chapterId':c['id'],'headingId':c['headingId'],'headingSha256':blocks[c['headingId']]['textSha256'],
                          'context':[{'paragraphId':p,'arabicSha256':blocks[p]['textSha256']} for p in c['contextIds']],
                          'englishStatus':'pending','readerEligible':False} for c in inventory['chapters']]
    require(audit['chapterMaterial'] == expected_chapters, 'Separate chapter material changed or promoted')
    boundary = audit['sectionBoundary']
    require(boundary['selectedLastReference'] == 1139 and boundary['nextSelectedReference'] == 1140
            and boundary['nextHeadingArabic'] == 'باب استعانة اليد في الصلاة إذا كان من أمر الصلاة'
            and boundary['printedNextReferences'] == [1198]
            and boundary['printedPages'] == {'brill-1862':[301,302],'dar-ibn-kathir-2002':[289]}, 'Section boundary changed')
    en = audit['englishComparisons']
    require(en['bewley']['locatedBodies'] == 8 and en['bewley']['terminalBoundary'] == 'first-hr-after-1132'
            and en['bewley']['sha256'] == '60cdcd2ea43481ac7a321375b6207cc0a37c11a0f0d8fa3fc279246bacc7a74c'
            and en['bewley']['bytes'] == 102307 and en['khan']['locatedRecords'] == en['khan']['mappedArabicReports'] == 8
            and en['khan']['absentReferences'] == [] and en['khan']['irregularReferenceMap'] == {}, 'English scope changed')
    shifts = audit['englishBoundaryDifferences']
    require(hashjson(shifts) == BOUNDARY_SHA and en['bewley']['boundaryDifferenceIds'] == ['bewley-1132-1133-boundary'], 'English boundary evidence changed')
    for body,row in zip(shifts[0]['displayedBodies'],audit['records'][:2]):
        require(body['label'] == row['englishComparisons']['bewley']['displayedReference']
                and body['bodySha256'] == row['englishComparisons']['bewley']['bodySha256'], 'Shifted English body binding changed')
    notes = audit['classicalComparisonNotes']
    require(len(notes) == 1 and notes[0]['references'] == [1137,1138]
            and notes[0]['role'] == 'comparison-note-not-hadith-wording' and notes[0]['independentReview'] == 'pending'
            and notes[0]['url'] == 'https://www.islamweb.net/ar/library/content/52/2202/باب-فضل-ما-بين-القبر-والمنبر', 'Commentary must stay separate from hadith wording')
    return True


def load():
    inventory = book.build(ROOT / 'content/sources/wikisource-mosques-prayer')
    require(inventory == read('content/staging/bukhari-mosques-prayer-wikisource/catalog.json'), 'Stale source inventory')
    return read('research/mosques-prayer-source-audit.json'), inventory, read('content/staging/bukhari-en-islamhouse/catalog.json')


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
        location = f'Khan {e(kc["reference"])}.'
        limits = ''.join(f'<li><strong>{e(provider.title())}:</strong> {e(note)}</li>' for provider,c in row['englishComparisons'].items() for note in c['limitations'])
        cards.append(f'''<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {refs}</p><h2>Reference {n}</h2><p>{e(row['finding'])}</p>
<details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{arabic}</p><p>{page_links(row['printedPages'])}</p>
<p><a href="https://aishabewley.org/bukhari10">Bewley label {e(bc['displayedReference'])}</a> · {location}</p><ul>{limits}</ul></details></article>''')

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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Mosques of Mecca and Medina · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Mosques of Mecca and Medina.</h1><p>8 digital reports · 6 chapters · 10 mapped printed references.</p>
<div class="notice"><strong>Candidate evidence only.</strong> This intake adds no reader entry or approved English translation. The Arabic remains unchanged. Independent qualified review is pending; source comparison does not certify wording or reuse rights.</div>
<article><h2>What needs careful review</h2><ul>
<li>Two selected paragraphs contain separately numbered printed passages: <a href="#report-1132">1132 maps to 1188 / 1189</a>, and <a href="#report-1134">1134 maps to 1191 / 1192</a>. No complete printed report is missing from this section.</li>
<li><a href="#english-boundary">The web comparison misplaces part of 1132 under 1133.</a> Numeric labels alone cannot identify the complete report.</li>
<li><a href="#differences">Nine recorded textual differences</a> remain separate and unapplied, including the duplicated reporting word and the house/grave reading. This is not an exhaustive apparatus.</li>
<li>The first Abu Said introduction, explicit route switch, complete paired narrator routes and closing Ibn Numayr addition must remain intact.</li>
<li>All six chapter headings remain separate from the numbered reports. The grave-based heading does not replace the selected house wording inside 1137/1138.</li></ul>
<p><a href="mosques-prayer-source-audit.json">Complete evidence map and source hashes</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_الصلاة_في_مسجد_مكة_والمدينة&amp;oldid=142212">Pinned Arabic revision</a></p>
{''.join(f'<p>{e(note)}</p>' for note in audit['englishComparisons']['commonLimitations'])}
<p>Web comparison hashes bind paragraph ranges that can include the next heading. Such headings do not become part of a numbered Arabic report.</p></article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>{''.join(cards)}
<article id="english-boundary"><h2>English label and body mismatch</h2><p>{e(audit['englishBoundaryDifferences'][0]['finding'])}</p>{''.join(f"<p>Selected {row['selectedReference']}: {e(row['finding'])}</p>" for row in audit['englishBoundaryDifferences'][0]['mapping'])}<p>The exact displayed ranges remain bound to their original hashes. Neither comparison range is silently repaired.</p></article>
<article id="classical-note"><h2>Heading and report wording</h2>{''.join(f"<p>{e(note['finding'])}</p><p><a href='{e(note['url'])}'>Fath al-Bari · source discussion</a></p>" for note in audit['classicalComparisonNotes'])}</article>
<article id="differences"><h2>Recorded textual differences</h2><p>None is an applied correction or an inferred religious ruling.</p>{''.join(differences)}</article>
<article id="chapters"><h2>Separate chapter material</h2><p>Six headings and no separate introductory paragraphs, with English pending.</p>{''.join(chapters)}</article>
<article id="boundary"><h2>Where this subsection ends</h2><p>{e(audit['sectionBoundary']['finding'])}</p><p class="arabic" lang="ar" dir="rtl">{e(audit['sectionBoundary']['nextHeadingArabic'])}</p><p>Next digital reference: 1140 · Printed 1198.</p><p>{page_links(audit['sectionBoundary']['printedPages'])}</p></article>
<footer><p>{e(audit['scope'])}</p><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; digital transcription by Arabic Wikisource contributors, revision 142212, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; source wording unchanged.</p><p>Printed numbers use the Dar Ibn Kathir witness; historical pages are matched by contents. Page matching does not establish agreement in every word.</p><p><a href="../reader/">Local reader</a> · <a href="voluntary-prayer-source-review.html">Previous section review</a></p></footer></main></body></html>
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
    page = ROOT / 'research/mosques-prayer-source-review.html'
    rendered = render(audit,inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Stale source review page')
    print('Mosques of Mecca and Medina: 8 complete selected reports, 10 mapped printed occurrences, 8 pinned English records; no reader admission.')
