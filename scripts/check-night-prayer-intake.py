"""Validate Night Prayer occurrence evidence without translating or admitting it."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1069, 1119))
CONTEXT = ['mwBg', 'mwHQ', 'mwKw', 'mwTA', 'mwWA', 'mwXA', 'mwkw']
POETRY = ['mweg', 'mwew', 'mwfA', 'mwfQ', 'mwfg', 'mwfw']
PRINTS = {'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
          'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'}
LIMITED = {'bewley': {1069,1070,1074,1082,1090,1097,1101,1103,1104,1105,1108,1114,1118},
           'khan': {1069,1073,1074,1077,1078,1090,1091,1093,1098,1100,1101,1104,1105,1106,1108,1112,1115,1118}}
# These hashes bind the reviewed non-exhaustive findings, not approval of a reading.
SOURCE_SHA = '7de702821576c9be6749b4af7cc676cc6a1b67185c622c52b2473e66930c6306'
VARIANTS_SHA = 'b1e841710accba05f56a0a615dd7747920d333eb5c1afd651e2c01a24a9bd807'
LIMITS_SHA = 'eb75dbf78d6b8ad0067bdbbf6ea0fb6c22deddb041bc476ad0e29db4faf427c2'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


book = module('night_prayer_book', 'import-wikisource-book.py')
english = module('night_prayer_english', 'import-english.py')


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
    if n == 1070:
        return [1121, 1122]
    if n == 1105:
        return [1156, 1157, 1158]
    return [n + (51 if n == 1069 or 1081 <= n <= 1104 else 52 if n <= 1080 else 53)]


def printed_pages(n):
    historical = [(1070,[284]),(1075,[285]),(1076,[285,286]),(1081,[286]),(1082,[286,287]),
                  (1087,[287]),(1088,[287,288]),(1090,[288]),(1091,[288,289]),(1095,[289]),
                  (1096,[289,290]),(1099,[290]),(1100,[290,291]),(1103,[291]),(1104,[291,292]),
                  (1106,[292]),(1107,[292,293]),(1111,[293]),(1116,[294]),(1118,[295])]
    modern = [(1069,[272]),(1070,[272,273]),(1074,[273]),(1075,[273,274]),(1079,[274]),
              (1086,[275]),(1090,[276]),(1091,[276,277]),(1095,[277]),(1100,[278]),(1103,[279]),
              (1104,[279,280]),(1108,[280]),(1113,[281]),(1114,[281,282]),(1118,[282])]
    return {key: next(pages for end, pages in ranges if n <= end)
            for key, ranges in zip(PRINTS, [historical, modern])}


def khan_reference(n):
    if n == 1102:
        return None
    if n in [1099,1100]:
        return '2.21.251' + ('r' if n == 1099 else 'n')
    number = n - (848 if n <= 1098 else 849 if n == 1101 else 850 if n <= 1108 else 846 if n <= 1114 else 856)
    return '2.21.' + str(number)


def locate_bewley(raw):
    separated = re.sub(r'</?(?:p|h[1-6])\b[^>]*>', '\x00', raw.decode('utf-8'), flags=re.I)
    parts = [' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', p)).split()) for p in separated.split('\x00')]
    starts = [i for i,p in enumerate(parts) if p.startswith('Chapter 25.')]
    require(len(starts) == 1, 'Ambiguous English book start')
    section = parts[starts[0]+1:]
    endings = [i for i,p in enumerate(section) if re.match(r'^1119\s*\.', p)]
    require(len(endings) == 1, 'Missing or ambiguous next-subsection boundary')
    section = section[:endings[0]]
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
        body = bodies[row['reference']]
        expected = row['englishComparisons']['bewley']
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
            selected = comparison['checkedReferences'] if row['reference'] == 1102 else [comparison]
            for part in selected:
                ref = part['reference'];record = records[ref]
                require(record['section'] == 'OPS/section-0023.html', 'Wrong English section')
                body = [paragraphs[i] for i in record['bodyParagraphs']]
                require(part['recordSha256'] == hashjson(record) and part['bodySha256'] == hashjson(body) == record['textSha256'], 'English body or inventory binding changed')
                seen.add(ref)
        left, right = records['2.21.252'], records['2.21.253']
        ordered = [r['id'].split(':')[-1] for r in inventory['records'] if r['section'] == 'OPS/section-0023.html']
        require(ordered.index('2.21.253') == ordered.index('2.21.252') + 1
                and max(left['bodyParagraphs']) < min(right['bodyParagraphs']), 'Bounded absence interval is not adjacent')
    require(len(seen) == 49, 'English record coverage changed')
    return len(seen)


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion'] == 1 and audit['status'] == 'source-intake-compared-wording-review-pending'
            and audit['readerAdmission'] is False and audit['reviewerKind'] == 'ai'
            and audit['independentReview'] == 'pending', 'Intake cannot approve wording or reader admission')
    s = audit['source']
    require(s['id'] == inventory['sourceId'] == 'wikisource-bukhari-night-prayer-r39522'
            and s['revision'] == inventory['revision'] == 39522 and s['sha256'] == inventory['sourceSha256'] == SOURCE_SHA
            and s['inventorySha256'] == hashjson(inventory) and s['bytes'] == 157391
            and s['path'] == 'content/sources/wikisource-night-prayer/source.html', 'Stale Arabic source binding')
    require(s['arabicChanged'] is False and inventory['status'] == 'candidate-not-approved'
            and inventory['readerEligible'] is False, 'Arabic must remain unchanged and quarantined')
    blocks = {b['htmlId']:b for b in inventory['blocks']};records = {r['number']:r for r in inventory['records']}
    require(list(records) == REFERENCES and s['numberedReports'] == 50 and s['blocks'] == len(blocks) == 92
            and s['chapters'] == len(inventory['chapters']) == 27
            and s['codePoints'] == sum(len(b['text']) for b in blocks.values()) == 16329, 'Source coverage changed')
    require(s['separateContextIds'] == [p for c in inventory['chapters'] for p in c['contextIds']] == CONTEXT
            and s['blankIds'] == inventory['blankIds'] == ['mwkA'], 'Chapter context or blank source block lost')
    owners = inventory['blankIds'] + [p for c in inventory['chapters'] for p in [c['headingId'],*c['contextIds']]] + [p for r in inventory['records'] for p in r['paragraphIds']]
    require(len(owners) == len(set(owners)) == len(blocks) and set(owners) == set(blocks), 'Source blocks need exactly one owner')
    require({p['id']:p['sha256'] for p in audit['printedComparisons']} == PRINTS
            and [p['inspectedPdfPages'] for p in audit['printedComparisons']] == [list(range(283,296)),list(range(272,284))], 'Printed witness identity or coverage changed')
    require(audit['missingPrintedReports'] == [] and audit['proposedCorrections'] == []
            and audit['modernPrintedOccurrencesAccountedFor'] == 52, 'An edition difference must not become an omission or applied correction')
    require([r['reference'] for r in audit['records']] == REFERENCES, 'Reports missing, repeated or reordered')
    for row in audit['records']:
        n = row['reference'];record = records[n]
        require(row['sourceRecordId'] == record['id'] and row['chapterId'] == record['chapterId']
                and row['paragraphIds'] == record['paragraphIds'] and row['arabicSha256'] == sha('\n\n'.join(blocks[p]['text'] for p in record['paragraphIds'])), 'Report Arabic or ownership changed')
        require(row['printedReferences'] == printed_references(n) and row['printedPages'] == printed_pages(n), 'Wrong printed occurrence or page')
        require(bool(row['finding']), 'Missing comparison findings')
        for provider in LIMITED:
            c = row['englishComparisons'][provider]
            if provider == 'khan' and n == 1102:
                require(c['status'] == 'absent-from-checked-interval' and c['reference'] is None
                        and [r['reference'] for r in c['checkedReferences']] == ['2.21.252','2.21.253'] and c['limitations'], 'Absence must remain bounded and evidenced')
                continue
            expected = 'limited-comparison-not-wording-approval' if n in LIMITED[provider] else 'located-body-not-wording-approval'
            require(c['status'] == expected and bool(c['limitations']) == (n in LIMITED[provider])
                    and all(isinstance(v,str) and v.strip() for v in c['limitations']), 'Comparison limitation erased or promoted')
            if provider == 'bewley':
                require(c['displayedReference'] == str(n) and c['occurrence'] == 1
                        and re.fullmatch('[a-f0-9]{64}',c['bodySha256']), 'Wrong English page locator')
            else:
                require(c['reference'] == khan_reference(n), 'Wrong reordered English occurrence')
    require(hashjson([[r['reference'],{p:c['limitations'] for p,c in r['englishComparisons'].items()}] for r in audit['records']]) == LIMITS_SHA, 'Exact comparison findings changed')
    require(sorted(set(p for r in audit['records'] for p in r['printedReferences'])) == list(range(1120,1172)), 'Printed coverage gap or duplicate substitution')
    combined = audit['combinedDigitalReferences']
    require([c['reference'] for c in combined] == [1070,1105], 'Combined printed passages lost')
    for c, words in zip(combined,[['فقصصتها على حفصة'],['فقصت حفصة','وكانوا لا يزالون']]):
        pid = records[c['reference']]['paragraphIds'][0];text = blocks[pid]['text']
        require(c['paragraphId'] == pid and c['sourceBlockSha256'] == blocks[pid]['textSha256']
                and c['printedReferences'] == printed_references(c['reference'])
                and c['boundaries'] == [{'text':w,'start':text.index(w)} for w in words], 'Combined passage boundaries changed')
    shared = audit['sharedPrintedReferences']
    require(len(shared) == 1 and shared[0]['printedReference'] == 1132 and shared[0]['digitalReferences'] == [1080,1081]
            and shared[0]['sourceRecordIds'] == [records[n]['id'] for n in [1080,1081]], 'Separate digital identities with one printed number must remain distinct')
    headings = audit['printedHeadingProposals']
    require(len(headings) == 1 and headings[0]['beforeReference'] == 1102 and headings[0]['selectedChapterId'] == 'chapter-19'
            and headings[0]['headingArabic'] == 'باب' and headings[0]['headingSha256'] == sha('باب')
            and headings[0]['status'] == 'proposed-not-applied' and headings[0]['readerEligible'] is False
            and headings[0]['witnesses'] == [{'sourceId':'brill-1862','pdfPage':291,'printedChapter':20},{'sourceId':'dar-ibn-kathir-2002','pdfPage':279,'printedChapter':20}], 'Untitled chapter evidence cannot invent a heading or admit material')
    variants = audit['unresolvedTextualDifferences']
    require(len(variants) == 11 and hashjson(variants) == VARIANTS_SHA, 'Recorded textual differences changed')
    for v in variants:
        require(v['kind'] == 'unresolved-textual-difference' and v['status'] == 'unresolved-not-applied'
                and v['independentReview'] == 'pending' and v['sourceBlockSha256'] == blocks[v['paragraphId']]['textSha256']
                and v['sourceReading'] in blocks[v['paragraphId']]['text'], 'Variant source evidence changed')
        for w in v['witnesses']:
            require(w['sourceSha256'] == PRINTS[w['sourceId']] and w['readingSha256'] == (sha(w['reading']) if w['reading'] is not None else None), 'Printed excerpt identity changed')
    expected_chapters = [{'chapterId':c['id'],'headingId':c['headingId'],'headingSha256':blocks[c['headingId']]['textSha256'],
                          'context':[{'paragraphId':p,'arabicSha256':blocks[p]['textSha256']} for p in c['contextIds']],
                          'englishStatus':'pending','readerEligible':False} for c in inventory['chapters']]
    require(audit['chapterMaterial'] == expected_chapters, 'Chapter material cannot become numbered narration')
    poem = audit['poetryReport']
    require(poem == {'reference':1104,'paragraphIds':records[1104]['paragraphIds'],'poetryParagraphIds':POETRY,
                     'closingRouteParagraphId':'mwgA','status':'part-of-numbered-report-not-chapter-material'}
            and records[1104]['paragraphIds'] == ['mweA',*POETRY,'mwgA'], 'Poetry or closing route lost or misclassified')
    boundary = audit['sectionBoundary']
    require(boundary['selectedLastReference'] == 1118 and boundary['nextSelectedReference'] == 1119
            and boundary['nextSourceRevision'] == 434953 and boundary['printedNextReferences'] == [1172,1173]
            and boundary['nextHeadingArabic'] == 'باب التطوع بعد المكتوبة'
            and boundary['printedPages'] == {'brill-1862':[295],'dar-ibn-kathir-2002':[283]}, 'Digital subsection must not claim the whole differently grouped printed book')
    bmeta, kmeta = audit['englishComparisons']['bewley'], audit['englishComparisons']['khan']
    require(bmeta['sha256'] == '60cdcd2ea43481ac7a321375b6207cc0a37c11a0f0d8fa3fc279246bacc7a74c'
            and bmeta['bytes'] == 102307 and bmeta['locatedBodies'] == 50 and bmeta['followingBoundaryLabel'] == '1119', 'Wrong English web source')
    require(kmeta['locatedRecords'] == kmeta['mappedArabicReports'] == 49 and kmeta['absentReferences'] == [1102]
            and kmeta['sourcePath'] == 'content/sources/islamhouse-bukhari/source.epub'
            and kmeta['allRecordedBodyHashesCheckedAgainstPinnedEpub'] is True
            and kmeta['reorderedReferences'] == {str(n):khan_reference(n) for n in list(range(1115,1119))+list(range(1109,1115))}, 'Wrong English coverage or reordered references')
    return True


def load():
    inventory = book.build(ROOT / 'content/sources/wikisource-night-prayer')
    require(inventory == read('content/staging/bukhari-night-prayer-wikisource/catalog.json'), 'Stale source inventory')
    return read('research/night-prayer-source-audit.json'), inventory, read('content/staging/bukhari-en-islamhouse/catalog.json')


def render(audit, inventory):
    e = html.escape
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    prints = {p['id']: p for p in audit['printedComparisons']}

    def page_links(pages):
        return ' · '.join(f'<a href="{e(prints[key]["url"])}#page={page}">{e(key)} · p. {page}</a>'
                          for key, numbers in pages.items() for page in numbers)

    cards = []
    for row in audit['records']:
        n = row['reference']
        refs = ' / '.join(map(str, row['printedReferences']))
        # Preserve source end-of-line spaces through HTML entities, without patch whitespace errors.
        arabic = e('\n\n'.join(blocks[p] for p in row['paragraphIds'])).replace(' \n', '&#32;\n')
        bc, kc = row['englishComparisons']['bewley'], row['englishComparisons']['khan']
        location = (f'Khan {e(kc["reference"])}.' if kc['reference'] else
                    'Khan: absent from the checked interval between 2.21.252 and 2.21.253; no neighbouring passage is substituted.')
        limitations = ''.join(f'<li><strong>{e(provider.title())}:</strong> {e(note)}</li>'
                              for provider, comparison in row['englishComparisons'].items() for note in comparison['limitations'])
        limits = f'<ul>{limitations}</ul>' if limitations else '<p>No specific English defect recorded here; this does not approve wording.</p>'
        cards.append(f'''<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {refs}</p><h2>Reference {n}</h2><p>{e(row['finding'])}</p>
<details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{arabic}</p><p>{page_links(row['printedPages'])}</p>
<p><a href="https://aishabewley.org/bukhari10">Bewley label {e(bc['displayedReference'])}</a> · {location}</p>{limits}</details></article>''')

    def difference(v):
        witnesses = ''
        for w in v['witnesses']:
            excerpt = (f'<p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' if w['reading'] is not None
                       else '<p>Absent from this inspected main-text location.</p>')
            witnesses += f'<p>{page_links({w["sourceId"]:[w["pdfPage"]]})}</p>{excerpt}'
        return f'''<details id="{e(v['id'])}"><summary>{e(v['id'].replace('-', ' '))}</summary><p>{e(v['finding'])}</p>
<p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v['sourceReading'])}</p>{witnesses}<p>{e(v['transcriptionPolicy'])}</p></details>'''

    chapters = []
    for i, c in enumerate(inventory['chapters']):
        paragraphs = ''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(blocks[p])}</p>'
                             for p in [c['headingId'], *c['contextIds']])
        chapters.append(f'<details><summary>Chapter {i+1} · Arabic source material · English pending</summary>{paragraphs}</details>')
    heading = audit['printedHeadingProposals'][0]
    boundary = audit['sectionBoundary']
    style = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:52px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Night Prayer · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Night Prayer.</h1><p>50 digital reports · 27 chapters · 52 mapped printed references.</p>
<div class="notice"><strong>Candidate evidence only.</strong> No new reader entries or English translations are approved by this intake. The Arabic input is unchanged. Independent qualified review remains pending; comparison is not certification of accuracy or reuse rights.</div>
<article><h2>What needs careful review</h2><ul>
<li>Digital 1070 contains printed 1121 / 1122; digital 1105 contains printed 1156 / 1157 / 1158. The full passages are already present. No missing complete report is established here.</li>
<li>Digital 1080 and 1081 share printed 1132. Keep both digital identities and their complete wording.</li>
<li><a href="#differences">Eleven recorded textual differences</a> remain unresolved. In 1115, the historical print agrees with the selected narrator phrase while the modern print differs. This is not a correction supported by both prints.</li>
<li><a href="#report-1104">Report 1104</a> includes six lines of poetry and its closing narration route. All eight source paragraphs belong to this numbered report.</li>
<li><a href="#report-1102">1102 has no body in the checked EPUB interval</a>. Later EPUB reports change order; 1115–1118 precede 1109–1114. Match passages by evidence, never by an assumed number offset.</li>
<li><a href="#boundary">This digital subsection ends at 1118</a>. The printed Night Prayer book continues on a separate digital source page.</li></ul>
<p><a href="night-prayer-source-audit.json">Complete evidence map and source hashes</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_التهجد&amp;oldid=39522">Pinned Arabic revision</a></p>
{''.join(f'<p>{e(note)}</p>' for note in audit['englishComparisons']['commonLimitations'])}
<p>English web body hashes bind paragraph ranges, which can include a following chapter heading. They locate comparison material; they do not make that heading part of a numbered Arabic report.</p></article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>{''.join(cards)}
<article id="differences"><h2>Unresolved textual differences</h2><p>These readings remain separate. None is an applied correction or an inferred religious ruling. This is not an exhaustive textual apparatus.</p>{''.join(difference(v) for v in audit['unresolvedTextualDifferences'])}</article>
<article id="printed-heading"><h2>Untitled printed chapter · not applied</h2><p>{e(heading['finding'])}</p><p class="arabic" lang="ar" dir="rtl">{e(heading['headingArabic'])}</p><p>{page_links({w['sourceId']:[w['pdfPage']] for w in heading['witnesses']})}</p><p>This is chapter material before 1102, not a missing numbered report or an approved English title.</p></article>
<article id="chapters"><h2>Separate chapter material</h2><p>English remains pending. These 27 headings and seven context paragraphs have not been assigned hadith numbers.</p>{''.join(chapters)}</article>
<article id="boundary"><h2>Where this subsection ends</h2><p>{e(boundary['finding'])}</p><p class="arabic" lang="ar" dir="rtl">{e(boundary['nextHeadingArabic'])}</p><p>Next digital report: 1119 · Printed 1172 / 1173.</p><p>{page_links(boundary['printedPages'])}</p><p><a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/أبواب_التطوع&amp;oldid=434953">Next source page · revision 434953</a></p></article>
<footer><p>{e(audit['scope'])}</p><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; digital transcription by Arabic Wikisource contributors, revision 39522, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; source wording remains unchanged.</p><p>Printed numbers use the Dar Ibn Kathir witness. Brill is matched by page and contents. Page matching does not establish agreement in every word.</p><p><a href="../reader/">Local reader</a> · <a href="shortening-source-review.html">Previous section review</a></p></footer></main></body></html>
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
    for path, witness in zip([args.brill_pdf, args.modern_pdf], audit['printedComparisons']):
        if path:
            verify_file(path, witness)
    page = ROOT / 'research/night-prayer-source-review.html'
    rendered = render(audit, inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Generated source review is stale')
    print('Night Prayer intake checked: 50 digital reports, 52 printed references, 49 pinned EPUB bodies and one bounded absence; no reader admission.')
