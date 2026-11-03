"""Check Prostration source evidence without approving wording or admitting reader text."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = list(range(1017, 1030))
PRINTS = {
    'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
    'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098',
}
CONTEXT = ['mwDw', 'mwFA', 'mwIA', 'mwJw']
LIMITED = {'bewley': {1017, 1018, 1025, 1027}, 'khan': {1017, 1021, 1026, 1027}}
VARIANTS = [
    ('chapter-05-ablution', 'mwFA', 'على غير وضوء', [(273, 'على غير وضوء'), (262, 'على وضوء')]),
    ('1018-surah-word', 'mwCQ', 'تنزيل', [(273, 'تنزيل السجدة'), (261, 'تنزيل السجدة')]),
    ('1027-narrator-name', 'mwKA', 'عثمان بن عبد الرحمن', [(275, 'عثمان بن عبيد الرحمن'), (263, 'عثمان بن عبد الرحمن')]),
]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


book = module('prostration_book', 'import-wikisource-book.py')
english = module('prostration_english', 'import-english.py')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def hashjson(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def printed_pages(n):
    return {
        'brill-1862': [273] if n <= 1020 else [273, 274] if n == 1021 else [274] if n <= 1026 else [275],
        'dar-ibn-kathir-2002': [261] if n <= 1020 else [262] if n <= 1025 else [262, 263] if n == 1026 else [263],
    }


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion'] == 1 and audit['status'] == 'source-intake-compared-wording-review-pending'
            and audit['readerAdmission'] is False and audit['reviewerKind'] == 'ai'
            and audit['independentReview'] == 'pending', 'Intake cannot grant wording approval or reader admission')
    source = audit['source']
    require(source['id'] == inventory['sourceId'] == 'wikisource-bukhari-prostration-r484859'
            and source['revision'] == inventory['revision'] == 484859
            and source['sha256'] == inventory['sourceSha256'] == '1d3c14836d7c320caa9295c4a6eccd7ed0f052a289ac19c9ed5ed8e65bbc8b59'
            and source['inventorySha256'] == hashjson(inventory), 'Stale Arabic source binding')
    require(source['arabicChanged'] is False and inventory['readerEligible'] is False
            and inventory['status'] == 'candidate-not-approved', 'Arabic must remain unchanged and quarantined')
    blocks = {b['htmlId']: b for b in inventory['blocks']}
    records = {r['number']: r for r in inventory['records']}
    require(list(records) == REFERENCES and source['numberedReports'] == 13
            and source['blocks'] == len(blocks) == 30 and source['chapters'] == len(inventory['chapters']) == 12
            and source['codePoints'] == sum(len(b['text']) for b in blocks.values()) == 3815, 'Unexpected source coverage')
    require(source['separateContextIds'] == [p for c in inventory['chapters'] for p in c['contextIds']] == CONTEXT
            and source['blankIds'] == inventory['blankIds'] == ['mwLw'], 'Chapter context or blank source block lost')
    ownership = inventory['blankIds'] + [p for c in inventory['chapters'] for p in [c['headingId'], *c['contextIds']]] + [p for r in inventory['records'] for p in r['paragraphIds']]
    require(len(ownership) == len(set(ownership)) == len(blocks) and set(ownership) == set(blocks), 'Every source block needs exactly one owner')
    require({p['id']: p['sha256'] for p in audit['printedComparisons']} == PRINTS, 'Wrong printed witness identity')
    require([p['inspectedPdfPages'] for p in audit['printedComparisons']] == [[273, 274, 275, 276], [261, 262, 263, 264]], 'Wrong inspected page coverage')
    require(audit['missingPrintedReports'] == audit['combinedDigitalReferences'] == audit['proposedCorrections'] == [], 'No missing report, split or applied correction established at intake')
    require([r['reference'] for r in audit['records']] == REFERENCES, 'Every report occurrence must remain in order')
    khan = {r['id'].split(':')[-1]: r for r in english_inventory['records']}
    for row in audit['records']:
        n = row['reference']
        record = records[n]
        require(row['sourceRecordId'] == record['id'] and row['chapterId'] == record['chapterId']
                and row['paragraphIds'] == record['paragraphIds'], 'Report ownership changed')
        require(row['arabicSha256'] == sha('\n\n'.join(blocks[p]['text'] for p in record['paragraphIds'])), 'Report Arabic changed')
        require(row['printedReferences'] == [n + 50] and row['printedPages'] == printed_pages(n), 'Wrong printed occurrence or page')
        for provider, limited in LIMITED.items():
            status = 'damaged-or-incomplete-comparison' if n in limited else 'located-body-not-wording-approval'
            require(row['englishComparisons'][provider]['status'] == status, 'Comparison limitation cannot become wording approval')
        bc, kc = row['englishComparisons']['bewley'], row['englishComparisons']['khan']
        require(bc['displayedReference'] == str(n) and bc['occurrence'] == 1 and re.fullmatch('[0-9a-f]{64}', bc['bodySha256']), 'Wrong Bewley locator')
        ref = f'2.19.{n - 844}'
        require(kc['reference'] == ref and kc['recordSha256'] == hashjson(khan[ref])
                and kc['bodySha256'] == khan[ref]['textSha256'], 'Wrong pinned English occurrence')
        require(bool(row['finding']), 'Missing comparison findings')
    require(len(audit['unresolvedTextualDifferences']) == len(VARIANTS), 'Unresolved textual differences must be retained')
    for actual, (identity, paragraph, selected, witnesses) in zip(audit['unresolvedTextualDifferences'], VARIANTS):
        require(actual['id'] == identity and actual['paragraphId'] == paragraph
                and actual['sourceBlockSha256'] == blocks[paragraph]['textSha256']
                and actual['sourceReading'] == selected and selected in blocks[paragraph]['text']
                and actual['status'] == 'unresolved-not-applied' and actual['independentReview'] == 'pending', 'Textual difference cannot silently change or approve Arabic')
        require(actual['witnesses'] == [
            {'sourceId': key, 'sourceSha256': PRINTS[key], 'pdfPage': page, 'reading': reading, 'readingSha256': sha(reading)}
            for key, (page, reading) in zip(PRINTS, witnesses)
        ], 'Textual difference needs exact witness readings and locations')
    expected_chapters = [{'chapterId': c['id'], 'headingId': c['headingId'], 'headingSha256': blocks[c['headingId']]['textSha256'],
                          'context': [{'paragraphId': p, 'arabicSha256': blocks[p]['textSha256']} for p in c['contextIds']],
                          'englishStatus': 'pending', 'readerEligible': False} for c in inventory['chapters']]
    require(audit['chapterMaterial'] == expected_chapters, 'Chapter material cannot become numbered narration')
    require(len(audit['chapterComparisonLimits']) == 1, 'Chapter comparison limit missing')
    limit = audit['chapterComparisonLimits'][0]
    require(limit['paragraphId'] == 'mwJw' and limit['sourceBlockSha256'] == blocks['mwJw']['textSha256']
            and limit['provider'] == 'bewley' and limit['locatedWithinReportBody'] == 1026
            and limit['status'] == 'not-reliable-for-context-wording' and limit['finding'], 'Chapter context comparison misassigned or promoted')
    return True


def locate_bewley(raw):
    text = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', raw.decode('utf-8'))).split())
    start = text.find('Chapter 23.')
    require(start >= 0, 'Missing Prostration book boundary')
    end = text.find('Chapter 24.', start)
    require(end > start, 'Missing next-book boundary')
    section = text[start:end]
    labels = list(re.finditer(r'(?<!\d)(101[7-9]|102\d)\s*\.', section))
    require([int(m[1]) for m in labels] == REFERENCES, 'English labels missing, repeated or reordered')
    return {int(m[1]): section[m.end():labels[i+1].start() if i+1 < len(labels) else len(section)].strip() for i, m in enumerate(labels)}


def verify_bewley_bodies(audit, bodies):
    require(list(bodies) == REFERENCES, 'Incomplete English body coverage')
    for row in audit['records']:
        require(sha(bodies[row['reference']]) == row['englishComparisons']['bewley']['bodySha256'], 'Bewley body differs from its recorded locator')


def verify_file(path, expected):
    raw = Path(path).read_bytes()
    require(len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'], 'Witness bytes differ from inspected source')
    return raw


def verify_epub(audit, inventory):
    source = audit['englishComparisons']['khan']
    raw = (ROOT / source['sourcePath']).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == source['sourceSha256'] == '94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c', 'Wrong English EPUB')
    records = {r['id'].split(':')[-1]: r for r in inventory['records']}
    with zipfile.ZipFile(ROOT / source['sourcePath']) as epub:
        sections = {}
        for row in audit['records']:
            comparison = row['englishComparisons']['khan']
            record = records[comparison['reference']]
            section = record['section']
            if section not in sections:
                sections[section] = english.parse_section(epub.read(section))['paragraphs']
            body = [sections[section][i] for i in record['bodyParagraphs']]
            require(hashjson(body) == comparison['bodySha256'], 'Recorded English paragraphs differ from pinned EPUB')
    return len(audit['records'])


def render(audit, inventory):
    e = html.escape
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    prints = {p['id']: p for p in audit['printedComparisons']}
    cards = []
    for row in audit['records']:
        n = row['reference']
        links = ' · '.join(f'<a href="{e(prints[key]["url"])}#page={page}">{e(key)} · p. {page}</a>' for key, pages in row['printedPages'].items() for page in pages)
        arabic = '\n\n'.join(blocks[p] for p in row['paragraphIds'])
        cards.append(f'<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {n+50}</p><h2>Reference {n}</h2><p>{e(row["finding"])}</p><details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{e(arabic)}</p><p>{links}</p><p><a href="https://aishabewley.org/bukhari10">Bewley {n}</a> · Khan {e(row["englishComparisons"]["khan"]["reference"])}. Comparisons locate passages; none is wording approval.</p></details></article>')
    variants = []
    for v in audit['unresolvedTextualDifferences']:
        witnesses = ''.join(f'<p><a href="{e(prints[w["sourceId"]]["url"])}#page={w["pdfPage"]}">{e(w["sourceId"])} · p. {w["pdfPage"]}</a></p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' for w in v['witnesses'])
        variants.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-", " "))}</summary><p>{e(v["finding"])}</p><p>Selected source:</p><p class="arabic" lang="ar" dir="rtl">{e(v["sourceReading"])}</p>{witnesses}<p>{e(v["transcriptionPolicy"])}</p></details>')
    chapters = []
    for i, c in enumerate(inventory['chapters']):
        paragraphs = ''.join(f'<p class="arabic" lang="ar" dir="rtl" data-block="{e(p)}">{e(blocks[p])}</p>' for p in [c['headingId'], *c['contextIds']])
        chapters.append(f'<details><summary>Chapter {i+1} · Arabic source material · English pending</summary>{paragraphs}</details>')
    style = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:48px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Prostration · Source review</title><style>{style}</style></head>
<body><main><p class="eyebrow">MindfulMod · Source intake</p><h1>Prostration of<br>Quran recitation.</h1><p>13 digital reports · 12 chapters · 13 mapped printed occurrences.</p>
<div class="notice"><strong>Candidate evidence only.</strong> No new reader entries or English translations are approved by this intake. The Arabic input is unchanged. Independent qualified review remains pending; comparison is not certification of accuracy or reuse rights.</div>
<article><h2>What needs careful review</h2><ul><li>All 13 printed reports have a digital match. Repeated accounts keep their separate chains and references; no suffix is needed in this section.</li><li>Chapter 5 has materially different wording about ablution in the two prints. Chapter English remains pending.</li><li>The printed wording at 1018 and narrator name at 1027 also differ from one or more selected readings. These are recorded below, without changing the Arabic.</li><li>English comparisons contain omissions, added explanations and transcription errors. They are comparison evidence, not app wording.</li></ul><p><a href="prostration-source-audit.json">Complete evidence map and source hashes</a> · <a href="https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_سجود_القرآن&amp;oldid=484859">Pinned Arabic revision</a></p></article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>{''.join(cards)}
<article id="differences"><h2>Unresolved textual differences</h2><p>These readings remain separate. None is an applied correction or an inferred religious ruling.</p>{''.join(variants)}</article>
<article id="chapters"><h2>Separate chapter material</h2><p>English remains pending. These headings and context blocks have not been assigned hadith numbers.</p><p>{e(audit['chapterComparisonLimits'][0]['finding'])}</p>{''.join(chapters)}</article>
<footer><p>{e(audit['inspectionMethod'])}</p><p>Printed references use the Dar Ibn Kathir witness. Brill is matched by page and contents. Page matching does not establish agreement in every word.</p><p><a href="../reader/">Local reader</a> · <a href="eclipses-source-review.html">Previous section review</a></p></footer></main></body></html>
'''


def load():
    return (read('research/prostration-source-audit.json'), book.build(ROOT / 'content/sources/wikisource-prostration'),
            read('content/staging/bukhari-en-islamhouse/catalog.json'))


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
    page = ROOT / 'research/prostration-source-review.html'
    rendered = render(audit, inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Generated source review is stale')
    print('Prostration intake checked: 13 digital reports, 13 printed occurrences, 13 pinned EPUB bodies; no reader admission.')
