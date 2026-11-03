"""Validate Eclipses intake evidence; never grant wording approval or reader admission."""
import argparse
import hashlib
import html
import importlib.util
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


book = module('eclipses_book', 'import-wikisource-book.py')
english = module('eclipses_english', 'import-english.py')
PRINTS = {
    'brill-1862': 'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1',
    'dar-ibn-kathir-2002': '9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098',
}
CONTEXT = ['mwGQ', 'mwIA', 'mwJg', 'mwNw', 'mwTQ', 'mwVA', 'mwWA']
COMBINED = {1002: [1049, 1050], 1007: [1055, 1056], 1016: [1065, 1066]}
BEWLEY_LIMITED = {999, 1001, 1002, 1007, 1008, 1011}
KHAN_LIMITED = {997, 999, 1002, 1005, 1016}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text())


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def hashjson(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def comparison_status(reference, limited):
    return 'damaged-or-incomplete-comparison' if reference in limited else 'located-body-not-wording-approval'


def validate(audit, inventory, english_inventory):
    require(audit['schemaVersion'] == 1 and audit['status'] == 'source-intake-compared-wording-review-pending'
            and audit['readerAdmission'] is False and audit['reviewerKind'] == 'ai'
            and audit['independentReview'] == 'pending', 'Intake cannot grant approval or admission')
    source = audit['source']
    require(source['id'] == inventory['sourceId'] == 'wikisource-bukhari-eclipses-r484860'
            and source['revision'] == inventory['revision'] == 484860
            and source['sha256'] == inventory['sourceSha256'] == 'cb5869b492bd86bdd6850ce77e9475c078cc0c9be3ea9e74750d030639fc557e'
            and source['inventorySha256'] == hashjson(inventory), 'Stale Arabic source binding')
    require(source['arabicChanged'] is False and inventory['readerEligible'] is False
            and inventory['status'] == 'candidate-not-approved', 'Source must remain unchanged and quarantined')
    blocks = {b['htmlId']: b for b in inventory['blocks']}
    records = {r['number']: r for r in inventory['records']}
    require(list(records) == list(range(993, 1017)) and len(blocks) == source['blocks'] == 51
            and sum(len(b['text']) for b in blocks.values()) == source['codePoints'] == 11213
            and source['numberedReports'] == 24 and source['chapters'] == len(inventory['chapters']) == 19,
            'Unexpected source coverage')
    require(source['separateContextIds'] == [p for c in inventory['chapters'] for p in c['contextIds']] == CONTEXT
            and source['blankIds'] == inventory['blankIds'] == ['mwbA'], 'Separate chapter or blank material lost')
    ownership = inventory['blankIds'] + [p for c in inventory['chapters'] for p in [c['headingId'], *c['contextIds']]] + [p for r in inventory['records'] for p in r['paragraphIds']]
    require(len(ownership) == len(set(ownership)) == len(blocks) and set(ownership) == set(blocks), 'Every source block needs exactly one owner')
    require({p['id']: p['sha256'] for p in audit['printedComparisons']} == PRINTS, 'Wrong printed witness identity')
    prints = {p['id']: p for p in audit['printedComparisons']}
    require(prints['brill-1862']['inspectedPdfPages'] == list(range(264, 273))
            and prints['dar-ibn-kathir-2002']['inspectedPdfPages'] == list(range(253, 261)), 'Wrong inspected page coverage')
    require(audit['combinedDigitalReferences'] == list(COMBINED) and audit['missingPrintedReports'] == [],
            'Combined passages are already present; no missing report was identified')
    require([r['reference'] for r in audit['records']] == list(records), 'Audit must retain every occurrence in order')
    khan = {r['id'].split(':')[-1]: r for r in english_inventory['records']}
    seen_print, seen_english, next_print = [], [], 1040
    for row in audit['records']:
        n = row['reference']
        record = records[n]
        require(row['sourceRecordId'] == record['id'] and row['chapterId'] == record['chapterId']
                and row['paragraphIds'] == record['paragraphIds'], 'Report ownership changed')
        text = '\n\n'.join(blocks[p]['text'] for p in record['paragraphIds'])
        require(row['arabicSha256'] == sha(text), 'Report Arabic changed')
        expected = COMBINED.get(n, [next_print])
        require(row['printedReferences'] == expected, 'Printed occurrence assigned to the wrong report')
        seen_print += expected
        next_print = expected[-1] + 1
        require(set(row['printedPages']) == set(PRINTS), 'Both printed witnesses required')
        for key, pages in row['printedPages'].items():
            require(pages and pages == sorted(set(pages)) and all(p in prints[key]['inspectedPdfPages'] for p in pages), 'Uninspected or duplicate print page')
        if n in COMBINED:
            anchor = 'وقال الأوزاعي وغيره' if n == 1016 else 'ثم ركب رسول الله ﷺ ذات غداة مركبا'
            boundary = text.index(anchor)
            require(row.get('printedParts') == [
                {'printedReference': expected[0], 'start': 0, 'end': boundary, 'arabicSha256': sha(text[:boundary])},
                {'printedReference': expected[1], 'start': boundary, 'end': len(text), 'arabicSha256': sha(text[boundary:]), 'continuesWithinDigitalEntry': True},
            ], 'Combined passage boundaries must cover the complete digital entry once')
        else:
            require('printedParts' not in row, 'Unexpected printed split')
        bc, kc = row['englishComparisons']['bewley'], row['englishComparisons']['khan']
        require(bc['displayedReference'] == str(n) and bc['occurrence'] == 1
                and re.fullmatch('[0-9a-f]{64}', bc['bodySha256'])
                and bc['status'] == comparison_status(n, BEWLEY_LIMITED), 'Wrong Bewley occurrence or comparison limit')
        if n == 1012:
            require(kc == {'status': 'not-present-in-checked-sequence', 'checkedReferences': ['2.18.168', '2.18.169']}, 'Missing English occurrence cannot claim a matching body')
        else:
            ref = f'2.18.{n - 843 if n < 1012 else n - 844}'
            record = khan[ref]
            require(kc == {'status': comparison_status(n, KHAN_LIMITED), 'reference': ref,
                           'recordSha256': hashjson(record), 'bodySha256': record['textSha256']}, 'Wrong pinned English body or comparison limit')
            seen_english.append(ref)
        require(bool(row['finding']), 'A comparison needs its limits and findings')
    require(seen_print == list(range(1040, 1067)) and seen_english == [f'2.18.{n}' for n in range(150, 173)], 'An occurrence was dropped, duplicated or relabelled')
    correction = audit['proposedCorrections']
    require(len(correction) == 1, 'Unexpected correction scope')
    correction = correction[0]
    require(correction['reference'] == 1011 and correction['paragraphId'] == 'mwWg'
            and correction['originalArabicSha256'] == audit['records'][18]['arabicSha256']
            and correction['status'] == 'proposed-not-applied' and correction['independentReview'] == 'pending'
            and correction['before'] == 'زيادة بن علاقة' and correction['after'] == 'زياد بن علاقة'
            and blocks['mwWg']['text'].count(correction['before']) == 1, 'Correction must remain bound to original spelling and unapplied')
    require(correction['witnesses'] == [
        {'sourceId': key, 'sourceSha256': PRINTS[key], 'pdfPage': page, 'reading': correction['after'], 'readingSha256': sha(correction['after'])}
        for key, page in [('brill-1862', 271), ('dar-ibn-kathir-2002', 259)]
    ], 'Correction needs both exact printed readings and locations')
    expected_context = [{'chapterId': c['id'], 'headingId': c['headingId'], 'headingSha256': blocks[c['headingId']]['textSha256'],
                         'context': [{'paragraphId': p, 'arabicSha256': blocks[p]['textSha256']} for p in c['contextIds']],
                         'englishStatus': 'pending', 'readerEligible': False} for c in inventory['chapters']]
    require(audit['chapterMaterial'] == expected_context, 'Chapter material cannot become approved narration')
    return True


def locate_bewley(raw):
    text = ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', raw.decode('utf-8'))).split())
    start = re.search(r'(?<!\d)993\s*\.', text)
    require(start is not None, 'Missing Eclipses start label')
    end = text.find('Chapter 23.', start.end())
    require(end >= 0, 'Missing next-book boundary')
    section = text[start.start():end]
    labels = list(re.finditer(r'(?<!\d)(99[3-9]|100\d|101[0-6])\s*\.', section))
    require([int(m[1]) for m in labels] == list(range(993, 1017)), 'English labels missing, repeated or reordered')
    return {int(m[1]): section[m.end():labels[n+1].start() if n+1 < len(labels) else len(section)].strip() for n, m in enumerate(labels)}


def verify_bewley_bodies(audit, bodies):
    require(list(bodies) == list(range(993, 1017)), 'Incomplete English body coverage')
    for row in audit['records']:
        require(sha(bodies[row['reference']]) == row['englishComparisons']['bewley']['bodySha256'], 'Bewley body differs from its recorded locator')


def verify_file(path, expected):
    raw = Path(path).read_bytes()
    require(len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'], 'Witness bytes differ from the inspected source')
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
            if 'reference' not in comparison:
                continue
            record = records[comparison['reference']]
            section = record['section']
            if section not in sections:
                sections[section] = english.parse_section(epub.read(section))['paragraphs']
            body = [sections[section][index] for index in record['bodyParagraphs']]
            require(hashjson(body) == comparison['bodySha256'], 'Recorded English paragraphs differ from pinned EPUB')
    return 23


def render(audit, inventory):
    e = html.escape
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    prints = {p['id']: p for p in audit['printedComparisons']}
    cards = []
    for row in audit['records']:
        n = row['reference']
        links = ' · '.join(f'<a href="{e(prints[key]["url"])}#page={page}">{e(key)} · p. {page}</a>' for key, pages in row['printedPages'].items() for page in pages)
        kc = row['englishComparisons']['khan']
        khan = kc.get('reference', 'No separate match between 2.18.168 and 2.18.169')
        parts = '<p class="notice">Both separately numbered printed passages are already contained in this digital entry. Keep the complete entry and its continuation; do not add a suffix or drop a passage.</p>' if n in COMBINED else ''
        arabic = '\n\n'.join(blocks[p] for p in row['paragraphIds'])
        cards.append(f'<article id="report-{n}"><p class="eyebrow">Digital {n} · Printed {", ".join(map(str,row["printedReferences"]))}</p><h2>Reference {n}</h2><p>{e(row["finding"])}</p>{parts}<details><summary>Complete selected Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{e(arabic)}</p><p>{links}</p><p><a href="https://aishabewley.org/bukhari10">Bewley {n}</a> · Khan {e(khan)}. English comparisons locate passages; none is wording approval.</p></details></article>')
    chapter_cards = []
    for index, chapter in enumerate(inventory['chapters']):
        context = ''.join(f'<p class="arabic" dir="rtl" lang="ar">{e(blocks[p])}</p>' for p in chapter['contextIds'])
        chapter_cards.append(f'<details><summary>Chapter {index+1} · Arabic source material · English pending</summary><p class="arabic" dir="rtl" lang="ar">{e(blocks[chapter["headingId"]])}</p>{context}</details>')
    chapters = ''.join(chapter_cards)
    style = ':root{color-scheme:light dark;--paper:#f5f0e6;--ink:#382d28;--muted:#6c5850;--line:#d7c8ba;--accent:#a94728;--card:#fffbf4}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif}main{width:min(850px,100%);margin:auto;padding:40px 22px 70px}a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:3px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.15}h1{font-size:clamp(36px,7vw,58px)}h2{font-size:29px}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--card)}article{margin:25px 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card)}.arabic{font:24px/2.1 "Geeza Pro",serif;overflow-wrap:anywhere;white-space:pre-wrap}summary{cursor:pointer;padding:15px 0;font-weight:600}details{border-top:1px solid var(--line);margin-top:18px}li{margin:10px 0}ul{padding-left:22px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{min-width:48px;min-height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px}footer{border-top:1px solid var(--line);margin-top:35px;padding-top:20px;color:var(--muted)}@media(max-width:400px){main{padding:28px 16px}article{padding:18px}}@media(prefers-color-scheme:dark){:root{--paper:#241d27;--card:#302632;--ink:#f2e7d9;--muted:#cbb7ad;--line:#5c4856;--accent:#f6b773}}'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Eclipses · Source review</title>
<style>{style}</style>
</head>
<body>
<main>
<p class="eyebrow">MindfulMod · Source intake</p>
<h1>Eclipses.<br>Every passage accounted for.</h1>
<p>24 digital entries · 19 chapters · 27 printed references.</p>
<div class="notice">
<strong>Candidate evidence only.</strong> This historical intake does not grant reader admission. The Arabic input is unchanged. <a href="../reader/eclipses-review.html">Current local prototype reviews</a> record later wording work and separate admissions. Independent qualified review remains pending. This page certifies neither accuracy nor reuse rights.</div>
<article>
<h2>What the comparison found</h2>
<ul>
<li>Entries 1002, 1007 and 1016 each contain two separately numbered printed passages. Their contents are already present; no new suffix reference is needed.</li>
<li>Both prints support a proposed narrator-name correction in 1011. The original digital spelling remains untouched.</li>
<li>The retained English comparisons include errors and shortened passages. Their exact locations and limits are recorded below.</li>
<li>1012 has no separate match in the checked Khan sequence. It remains a distinct source occurrence.</li>
<li>Seven chapter-context blocks stay separate from numbered reports and narration.</li>
</ul>
<p>
<a href="eclipses-source-audit.json">Complete evidence map and source hashes</a> · <a href="{e('https://ar.wikisource.org/w/index.php?title=صحيح_البخاري/كتاب_الكسوف&oldid=484860')}">Pinned Arabic revision</a>
</p>
</article>
<nav aria-label="Source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in range(993,1017))}</nav>{''.join(cards)}<article id="correction">
<h2>One proposed correction</h2>
<p>Reference 1011 · digital spelling, then the reading in both inspected prints:</p>
<p class="arabic" lang="ar" dir="rtl">زيادة بن علاقة</p>
<p class="arabic" lang="ar" dir="rtl">زياد بن علاقة</p>
<p>The evidence points to Brill PDF page 271 and Dar Ibn Kathir PDF page 259. It remains a proposal, separate from the raw text and any future reader admission.</p>
</article>
<article id="chapters">
<h2>Separate chapter material</h2>
<p>These headings and context blocks belong to browsing and source review. English remains pending; no chapter material has been assigned a hadith number.</p>{chapters}</article>
<footer>
<p>{e(audit['inspectionMethod'])}</p>
<p>Printed references refer to the Dar Ibn Kathir witness. Brill is matched by its page and contents. Source inspection does not imply that the two prints agree in every word.</p>
<p>
<a href="../reader/">Local reader</a> · <a href="rain-prayer-source-review.html">Previous section review</a>
</p>
</footer>
</main>
</body>
</html>\n'''


def load():
    return (read('research/eclipses-source-audit.json'),
            book.build(ROOT / 'content/sources/wikisource-eclipses'),
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
        raw = verify_file(args.bewley_html, audit['englishComparisons']['bewley'])
        verify_bewley_bodies(audit, locate_bewley(raw))
    for path, witness in zip([args.brill_pdf, args.modern_pdf], audit['printedComparisons']):
        if path:
            verify_file(path, witness)
    page = ROOT / 'research/eclipses-source-review.html'
    rendered = render(audit, inventory)
    if args.write:
        page.write_text(rendered)
    else:
        require(page.read_text() == rendered, 'Generated source review is stale')
    print('Eclipses intake checked: 24 digital entries; 27 printed occurrences; 23 pinned EPUB bodies; no reader admission.')
