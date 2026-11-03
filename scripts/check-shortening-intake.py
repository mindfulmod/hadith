"""Bind Shortening source evidence; never approve or admit wording at intake."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1030, 1069))
PRINTS = {
    'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
    'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098',
}
CONTEXT = ['mwFg', 'mwIA', 'mwRQ', 'mwXA', 'mwbw', 'mwcw']
LIMITED = {
    'bewley': {1035, 1037, 1038, 1039, 1041, 1049, 1053, 1054, 1055, 1057, 1063, 1064, 1065},
    'khan': {1033, 1035, 1036, 1037, 1038, 1039, 1041, 1049, 1057, 1063, 1064, 1065, 1066, 1068},
}
VARIANTS = [
    ('1030-residence-phrase', 'mwBg', 'تسعة عشر يقصر فنحن إذا سافرنا تسعة عشر',
     [(276, 'تسعة عشر يوما يقصر فنحن إذا سافرنا فأقمنا تسعة عشر'), (264, 'تسعة عشر يقصر فنحن إذا سافرنا تسعة عشر')]),
    ('1039-asr-name', 'mwIQ', 'والعصر بذي الحليفة ركعتين',
     [(277, 'والعصر بذى الحليفة ركعتين'), (265, 'وبذي الحليفة ركعتين')]),
    ('1041-closing-maghrib-verb', 'mwJQ', 'يؤخر المغرب فيصليها ثلاثا',
     [(278, 'يقيم المغرب فيصليها ثلاثا'), (266, 'يؤخر المغرب فيصليها ثلاثا')]),
    ('1065-closing-comment', 'mwbA', 'قال أبو عبد الله نائما عندي مضطجعا ها هنا',
     [(282, None), (270, 'قال أبو عبد الله نائما عندي مضطجعا هاهنا')]),
    ('chapter-20-position-order', 'mwcw', 'ركعتين قائما وركعتين قاعدا',
     [(283, 'ركعتين قاعدا وركعتين قائما'), (271, 'ركعتين قائما وركعتين قاعدا')]),
]
PROPOSAL = ('1064-second-route-name', 'mwaA', 'عن أبي بريدة',
            [(282, 'عن ابن بريدة'), (270, 'عن ابن بريدة')])


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


book = module('shortening_book', 'import-wikisource-book.py')
english = module('shortening_english', 'import-english.py')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def hashjson(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def printed_references(n):
    return [1091, 1092] if n == 1041 else [n + 50 if n < 1041 else n + 51]


def printed_pages(n):
    historical = [(1033, [276]), (1034, [276, 277]), (1039, [277]), (1040, [277, 278]),
                  (1044, [278]), (1045, [278, 279]), (1049, [279]), (1050, [279, 280]),
                  (1056, [280]), (1057, [280, 281]), (1060, [281]), (1061, [281, 282]),
                  (1065, [282]), (1068, [283])]
    modern = [(1034, [264]), (1039, [265]), (1044, [266]), (1049, [267]), (1050, [267, 268]),
              (1056, [268]), (1057, [268, 269]), (1061, [269]), (1065, [270]),
              (1066, [270, 271]), (1068, [271])]
    return {key: next(pages for end, pages in ranges if n <= end)
            for key, ranges in zip(PRINTS, [historical, modern])}


def khan_reference(n):
    suffix = (n - 844 if n <= 1046 else 202 if n == 1047 else n - 845 if n <= 1052
              else 207 if n == 1053 else 208 if n == 1054 else 209 if n <= 1057 else n - 848)
    return '2.20.' + str(suffix)


def khan_span(n, text):
    start, end = 0, len(text)
    if n in [1046, 1047]:
        boundary = text.index('Narrated Salim:')
        start, end = (0, boundary) if n == 1046 else (boundary, len(text))
    elif n in [1052, 1053]:
        boundary = text.index("Narrated 'Abdullah bin amir")
        start, end = (0, boundary) if n == 1052 else (boundary, len(text))
    elif n in [1055, 1056, 1057]:
        first, second = text.index('Narrated Ibn Abbas:'), text.index('Narrated Anas bin Malik:')
        require(first < second, 'English narrator boundaries reordered')
        start, end = {1055: (0, first), 1056: (first, second), 1057: (second, len(text))}[n]
    return {'unit': 'unicode-code-points', 'join': 'two-newlines', 'start': start, 'end': end,
            'sha256': sha(text[start:end])}


def locate_bewley(raw):
    # The historical page uses unclosed <P> elements. A number is a label
    # only at a paragraph start; “See 1036.” inside prose is not a new report.
    # Literal source line breaks are not paragraph breaks.
    separated=re.sub(r'</?(?:p|h[1-6])\b[^>]*>', '\x00', raw.decode('utf-8'), flags=re.I)
    parts=[' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', part)).split()) for part in separated.split('\x00')]
    starts=[i for i,p in enumerate(parts) if p.startswith('Chapter 24.')]
    ends=[i for i,p in enumerate(parts) if p.startswith('Chapter 25.')]
    if len(starts)!=1 or len(ends)!=1 or ends[0]<=starts[0]:raise ValueError('Missing or ambiguous English book boundaries')
    section=parts[starts[0]+1:ends[0]]
    labels=[(i,re.match(r'^(\d{4})\s*\.',p)) for i,p in enumerate(section)]
    labels=[(i,m) for i,m in labels if m]
    expected=list(range(1030,1053))+[1054,1055,1055]+list(range(1056,1069))
    if [int(m[1]) for _,m in labels]!=expected:raise ValueError('English paragraph labels missing, repeated unexpectedly or reordered')
    bodies={};occurrences={}
    for offset,(index,match) in enumerate(labels):
        displayed=match[1];occurrences[displayed]=occurrences.get(displayed,0)+1
        end=labels[offset+1][0] if offset+1<len(labels) else len(section)
        body=' '.join([section[index][match.end():].strip(), *filter(None,section[index+1:end])]).strip()
        bodies[1030+offset]={'displayedReference':displayed,'occurrence':occurrences[displayed],'body':body}
    return bodies


def verify_bewley_bodies(audit, bodies):
    require(list(bodies) == REFERENCES, 'Incomplete English body coverage')
    for row in audit['records']:
        body = bodies[row['reference']]
        expected = row['englishComparisons']['bewley']
        require(body['displayedReference'] == expected['displayedReference']
                and body['occurrence'] == expected['occurrence']
                and sha(body['body']) == expected['bodySha256'], 'Bewley body differs from its recorded locator')


def verify_file(path, expected):
    raw = Path(path).read_bytes()
    require(len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'],
            'Witness bytes differ from inspected source')
    return raw


def verify_epub(audit, inventory):
    source = audit['englishComparisons']['khan']
    raw = (ROOT / source['sourcePath']).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == source['sourceSha256'] ==
            inventory['sourceSha256'] == '94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c', 'Wrong English EPUB')
    records = {r['id'].split(':')[-1]: r for r in inventory['records']}
    with zipfile.ZipFile(ROOT / source['sourcePath']) as epub:
        paragraphs = english.parse_section(epub.read('OPS/section-0022.html'))['paragraphs']
        seen = set()
        for row in audit['records']:
            n = row['reference']
            comparison = row['englishComparisons']['khan']
            require(comparison['reference'] == khan_reference(n), 'Wrong pinned English occurrence')
            record = records[comparison['reference']]
            require(record['section'] == 'OPS/section-0022.html', 'Wrong English book section')
            body = [paragraphs[i] for i in record['bodyParagraphs']]
            require(hashjson(body) == comparison['bodySha256'] == record['textSha256'],
                    'Recorded English paragraphs differ from pinned EPUB')
            require(comparison['span'] == khan_span(n, '\n\n'.join(body)),
                    'Wrong English report span or narrator boundary')
            seen.add(comparison['reference'])
    require(len(seen) == 35, 'English record coverage changed')
    return len(audit['records'])


def check_variant(actual, expected, blocks, proposal=False):
    identity, paragraph, selected, witnesses = expected
    kind = 'correction-proposal' if proposal else 'unresolved-textual-difference'
    status = 'proposed-not-applied' if proposal else 'unresolved-not-applied'
    require(actual['id'] == identity and actual['kind'] == kind and actual['paragraphId'] == paragraph
            and actual['sourceBlockSha256'] == blocks[paragraph]['textSha256']
            and actual['sourceReading'] == selected and selected in blocks[paragraph]['text']
            and actual['status'] == status and actual['independentReview'] == 'pending',
            'Textual difference or correction proposal cannot silently change or approve Arabic')
    require(actual['witnesses'] == [
        {'sourceId': key, 'sourceSha256': PRINTS[key], 'pdfPage': page, 'reading': reading,
         'readingSha256': sha(reading) if reading is not None else None,
         'scope': 'Main text; unvocalized excerpt, preserving the relevant words and their order.'}
        for key, (page, reading) in zip(PRINTS, witnesses)
    ], 'Textual difference needs exact witness readings and locations')
    require(actual['finding'] and actual['transcriptionPolicy'], 'Missing review explanation')


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion'] == 1 and audit['status'] == 'source-intake-compared-wording-review-pending'
            and audit['readerAdmission'] is False and audit['reviewerKind'] == 'ai'
            and audit['independentReview'] == 'pending', 'Intake cannot grant wording approval or reader admission')
    source = audit['source']
    require(source['id'] == inventory['sourceId'] == 'wikisource-bukhari-shortening-r278144'
            and source['revision'] == inventory['revision'] == 278144
            and source['path'] == 'content/sources/wikisource-shortening/source.html'
            and source['sha256'] == inventory['sourceSha256'] == '5ee33b82a4a314200c610937328731858a390684a9e1a14cc7cf764b4e5857f5'
            and source['inventorySha256'] == hashjson(inventory) and source['bytes'] == 131840,
            'Stale Arabic source binding')
    require(source['arabicChanged'] is False and inventory['readerEligible'] is False
            and inventory['status'] == 'candidate-not-approved', 'Arabic must remain unchanged and quarantined')
    blocks = {b['htmlId']: b for b in inventory['blocks']}
    records = {r['number']: r for r in inventory['records']}
    require(list(records) == REFERENCES and source['numberedReports'] == 39
            and source['blocks'] == len(blocks) == 66 and source['chapters'] == len(inventory['chapters']) == 20
            and source['codePoints'] == sum(len(b['text']) for b in blocks.values()) == 10544, 'Unexpected source coverage')
    require(source['separateContextIds'] == [p for c in inventory['chapters'] for p in c['contextIds']] == CONTEXT
            and source['blankIds'] == inventory['blankIds'] == ['mweA'], 'Chapter context or blank source block lost')
    ownership = (inventory['blankIds'] + [p for c in inventory['chapters'] for p in [c['headingId'], *c['contextIds']]]
                 + [p for r in inventory['records'] for p in r['paragraphIds']])
    require(len(ownership) == len(set(ownership)) == len(blocks) and set(ownership) == set(blocks),
            'Every source block needs exactly one owner')
    require({p['id']: p['sha256'] for p in audit['printedComparisons']} == PRINTS, 'Wrong printed witness identity')
    require([p['inspectedPdfPages'] for p in audit['printedComparisons']] ==
            [list(range(276, 285)), list(range(264, 273))], 'Wrong inspected page coverage')
    require(audit['missingPrintedReports'] == [] and audit['modernPrintedOccurrencesAccountedFor'] == 40,
            'Combined printed material must not become a missing report')
    combined = audit['combinedDigitalReferences']
    require(len(combined) == 1 and combined[0]['reference'] == 1041 and combined[0]['paragraphId'] == 'mwJQ'
            and combined[0]['sourceBlockSha256'] == blocks['mwJQ']['textSha256']
            and combined[0]['printedReferences'] == [1091, 1092] and combined[0]['boundaryText'] == 'وزاد الليث'
            and combined[0]['boundaryStart'] == blocks['mwJQ']['text'].index('وزاد الليث'),
            'Combined report must retain both printed occurrences and its addition boundary')
    require([r['reference'] for r in audit['records']] == REFERENCES, 'Every report occurrence must remain in order')
    require([p for row in audit['records'] for p in row['printedReferences']] == list(range(1080, 1120)),
            'Printed coverage cannot contain missing or duplicate occurrences')
    bmeta, kmeta = audit['englishComparisons']['bewley'], audit['englishComparisons']['khan']
    require(bmeta['url'] == 'https://aishabewley.org/bukhari10' and bmeta['bytes'] == 102307
            and bmeta['sha256'] == '60cdcd2ea43481ac7a321375b6207cc0a37c11a0f0d8fa3fc279246bacc7a74c'
            and bmeta['locatedBodies'] == 39, 'Wrong Bewley witness')
    require(kmeta['locatedRecords'] == 35 and kmeta['mappedArabicReports'] == 39
            and kmeta['sourcePath'] == 'content/sources/islamhouse-bukhari/source.epub'
            and kmeta['allRecordedBodyHashesCheckedAgainstPinnedEpub'] is True, 'Wrong English coverage')
    khan = {r['id'].split(':')[-1]: r for r in english_inventory['records']}
    for row in audit['records']:
        n, record = row['reference'], records[row['reference']]
        require(row['sourceRecordId'] == record['id'] and row['chapterId'] == record['chapterId']
                and row['paragraphIds'] == record['paragraphIds'], 'Report ownership changed')
        require(row['arabicSha256'] == sha('\n\n'.join(blocks[p]['text'] for p in record['paragraphIds'])), 'Report Arabic changed')
        require(row['printedReferences'] == printed_references(n) and row['printedPages'] == printed_pages(n),
                'Wrong printed occurrence or page')
        for provider, limited in LIMITED.items():
            comparison = row['englishComparisons'][provider]
            status = 'limited-comparison-not-wording-approval' if n in limited else 'located-body-not-wording-approval'
            require(comparison['status'] == status and bool(comparison['limitations']) == (n in limited)
                    and all(isinstance(s, str) and s.strip() for s in comparison['limitations']),
                    'Comparison limitation cannot become wording approval')
        bc, kc = row['englishComparisons']['bewley'], row['englishComparisons']['khan']
        require(bc['displayedReference'] == str(n + 1 if n in [1053, 1054] else n)
                and bc['occurrence'] == (2 if n == 1055 else 1) and re.fullmatch('[0-9a-f]{64}', bc['bodySha256']),
                'Wrong Bewley locator or repeated-label occurrence')
        ref = khan_reference(n)
        require(kc['reference'] == ref and kc['recordSha256'] == hashjson(khan[ref])
                and kc['bodySha256'] == khan[ref]['textSha256'], 'Wrong pinned English occurrence')
        require(bool(row['finding']), 'Missing comparison findings')
    require(len(audit['unresolvedTextualDifferences']) == 5 and len(audit['proposedCorrections']) == 1,
            'Unresolved textual differences and correction proposal must be retained')
    for actual, expected in zip(audit['unresolvedTextualDifferences'], VARIANTS):
        check_variant(actual, expected, blocks)
    check_variant(audit['proposedCorrections'][0], PROPOSAL, blocks, proposal=True)
    expected_chapters = [{'chapterId': c['id'], 'headingId': c['headingId'], 'headingSha256': blocks[c['headingId']]['textSha256'],
                          'context': [{'paragraphId': p, 'arabicSha256': blocks[p]['textSha256']} for p in c['contextIds']],
                          'englishStatus': 'pending', 'readerEligible': False} for c in inventory['chapters']]
    require(audit['chapterMaterial'] == expected_chapters, 'Chapter material cannot become numbered narration')
    limits = audit['chapterComparisonLimits']
    require([(c['paragraphId'], c['provider']) for c in limits] == [('mwFg', 'bewley'), ('mwcw', 'printed-witnesses')]
            and all(c['sourceBlockSha256'] == blocks[c['paragraphId']]['textSha256'] and c['finding'] for c in limits),
            'Chapter comparison limitations missing or misassigned')
    return True


def render(audit, inventory):
    e = html.escape
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    prints = {p['id']: p for p in audit['printedComparisons']}
    cards = []
    for row in audit['records']:
        n = row['reference']
        refs = ' / '.join(map(str, row['printedReferences']))
        links = ' · '.join(f'<a href="{e(prints[key]["url"])}#page={page}">{e(key)} · p. {page}</a>'
                           for key, pages in row['printedPages'].items() for page in pages)
        arabic = '\n\n'.join(blocks[p] for p in row['paragraphIds'])
        bc, kc = row['englishComparisons']['bewley'], row['englishComparisons']['khan']
        limitations = ''.join(f'<li><strong>{e(provider.title())}:</strong> {e(note)}</li>'
                              for provider, comparison in row['englishComparisons'].items() for note in comparison['limitations'])
        limits = f'<ul>{limitations}</ul>' if limitations else '<p>No specific English defect recorded here; this does not approve wording.</p>'
        cards.append(f'''<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {refs}</p><h2>Reference {n}</h2><p>{e(row['finding'])}</p>
<details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{e(arabic)}</p><p>{links}</p>
<p><a href="https://aishabewley.org/bukhari10">Bewley label {e(bc['displayedReference'])}, occurrence {bc['occurrence']}</a> · Khan {e(kc['reference'])}. Each shared English passage has a separately checked report span.</p>{limits}</details></article>''')
    def difference(v):
        witnesses = ''
        for w in v['witnesses']:
            excerpt = (f'<p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' if w['reading'] is not None
                       else '<p>Absent from this inspected main-text location.</p>')
            witnesses += f'<p><a href="{e(prints[w["sourceId"]]["url"])}#page={w["pdfPage"]}">{e(w["sourceId"])} · p. {w["pdfPage"]}</a></p>{excerpt}'
        return f'''<details id="{e(v['id'])}"><summary>{e(v['id'].replace('-', ' '))}</summary><p>{e(v['finding'])}</p>
<p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v['sourceReading'])}</p>{witnesses}<p>{e(v['transcriptionPolicy'])}</p></details>'''
    chapters = []
    for i, c in enumerate(inventory['chapters']):
        paragraphs = ''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(blocks[p])}</p>'
                             for p in [c['headingId'], *c['contextIds']])
        chapters.append(f'<details><summary>Chapter {i+1} · Arabic source material · English pending</summary>{paragraphs}</details>')
    style = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:52px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Shortening the Prayer · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Shortening<br>the Prayer.</h1><p>39 digital reports · 20 chapters · 40 mapped printed occurrences.</p>
<div class="notice"><strong>Candidate evidence only.</strong> No new reader entries or English translations are approved by this intake. The Arabic input is unchanged. Independent qualified review remains pending; comparison is not certification of accuracy or reuse rights.</div>
<article><h2>What needs careful review</h2><ul><li>Digital 1041 already contains both printed 1091 and 1092. Preserve one complete app entry with both printed references. No missing complete report is established here.</li>
<li><a href="#1064-second-route-name">1064 has a narrator-name correction proposal</a>. Both inspected prints differ from the second digital route. The proposal has not changed the source.</li>
<li><a href="#differences">Five textual differences</a> remain separate, including the chapter 20 quotation. Matching occurrences does not establish identical wording.</li>
<li>The English witnesses repeat labels, combine reports and omit material. In 1063, the checked EPUB says standing where the selected Arabic and both prints say seated. English comparison is never automatic wording approval.</li></ul>
<p><a href="shortening-source-audit.json">Complete evidence map and source hashes</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_تقصير_الصلاة&amp;oldid=278144">Pinned Arabic revision</a></p></article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>{''.join(cards)}
<article id="corrections"><h2>Proposed correction · not applied</h2><p>Numbering approval does not approve wording. This proposal needs its own correction record before any reader admission.</p>{''.join(difference(v) for v in audit['proposedCorrections'])}</article>
<article id="differences"><h2>Unresolved textual differences</h2><p>These readings remain separate. None is an applied correction or an inferred religious ruling. The list is not an exhaustive textual apparatus.</p>{''.join(difference(v) for v in audit['unresolvedTextualDifferences'])}</article>
<article id="chapters"><h2>Separate chapter material</h2><p>English remains pending. These headings and context blocks have not been assigned hadith numbers.</p>{''.join(f'<p>{e(c["finding"])}</p>' for c in audit['chapterComparisonLimits'])}{''.join(chapters)}</article>
<footer><p>{e(audit['scope'])}</p><p>Printed references use the Dar Ibn Kathir witness. Brill is matched by page and contents. Page matching does not establish agreement in every word.</p><p><a href="../reader/">Local reader</a> · <a href="prostration-source-review.html">Previous section review</a></p></footer></main></body></html>
'''


def load():
    inventory = book.build(ROOT / 'content/sources/wikisource-shortening')
    require(inventory == read('content/staging/bukhari-shortening-wikisource/catalog.json'), 'Committed source inventory is stale')
    return read('research/shortening-source-audit.json'), inventory, read('content/staging/bukhari-en-islamhouse/catalog.json')


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
    page = ROOT / 'research/shortening-source-review.html'
    rendered = render(audit, inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Generated source review is stale')
    print('Shortening intake checked: 39 digital reports, 40 printed occurrences, 39 exact spans in 35 pinned EPUB records; no reader admission.')
