"""Verify Funerals 1290–1330 against pinned source spans and actual English bodies."""
import argparse
import html
import importlib.util
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('funerals_base', ROOT / 'scripts/check-funerals-intake.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
previous_spec = importlib.util.spec_from_file_location('funerals_previous', ROOT / 'scripts/check-funerals-third.py')
previous = importlib.util.module_from_spec(previous_spec)
previous_spec.loader.exec_module(previous)
require, sha, hashjson = base.require, base.sha, base.hashjson
REFERENCES = list(range(1290, 1331))
SEALS = {'records': '1c450c2b67b5f5b079aa9dd8f376c2c4bb0e74dd94f17f511e388d8af58e907d', 'unresolvedTextualDifferences': '99c85e6758c1156ca13266484f29fba177cfc979db390f2961973cb68d2a2a1d', 'presentationFindings': 'fc0f9d1b6d5c3cbd6f1a6aebffca66f3e05ba1c23154bb86b91f757b531742b5', 'englishComparisons': '0314eb3eb1f9dfb01240fbbc156a6e4872cb26790e2bbe0467ea92b97e30b1f9', 'ownershipFindings': 'd383dfc409c87a07169db4cca5c4596186e48add4f8fab0bdea82808a2d503df', 'cumulativeCoverage': 'd046b34de8042e02495558fdd6347c217d7766d32d0e996d3fd5b05b94b686c1', 'quranReferenceChecks': '2d2e19f7cc2b8106e683a85134dddb1c65bf79385c0d93b55bcff4e576b3a097'}

def load():
    first, inventory, english = base.load()
    return base.read('research/funerals-final-source-audit.json'), *previous.load()

def validate(a, third, second, first, inventory, english):
    previous.validate(third, second, first, inventory, english)
    require(a['schemaVersion'] == 1 and a['status'] == 'selected-occurrence-comparison-complete-wording-review-pending'
            and a['independentReview'] == 'pending' and a['readerAdmission'] is False,
            'A source comparison cannot approve wording or reader admission')
    require(a['previousStage'] == 'research/funerals-third-source-audit.json' and a['source'] == first['source'],
            'Final stage must bind the same immutable source inventory')
    require(a['comparisonScope'] == {
        'newlyLocatedReferences': REFERENCES,
        'cumulativeLocatedReferences': [n for n in range(1180, 1331) if n != 1201],
        'pendingReferences': [], 'fullSelectedOccurrenceComparisonComplete': True,
        'fullBookComparisonComplete': False, 'newReaderEntries': 0,
    }, 'Comparison scope missing, duplicated or overclaimed')
    require([r['reference'] for r in a['records']] == REFERENCES, 'Compared occurrences changed')
    blocks = {b['htmlId']: b for b in inventory['blocks']}
    source_records = {r['number']: r for r in inventory['records']}
    locators = {r['reference']: r for r in first['englishComparisons']['bewley']['bodyLocators']}
    for key, expected in SEALS.items():
        require(hashjson(a[key]) == expected, 'Reviewed evidence or explicit limitations changed: ' + key)
    for row in a['records']:
        source = source_records[row['reference']]
        require(row['sourceRecordId'] == source['id'] and row['chapterId'] == source['chapterId']
                and row['paragraphIds'] == source['paragraphIds']
                and row['arabicSha256'] == sha('\n\n'.join(blocks[p]['text'] for p in source['paragraphIds'])),
                'Arabic ownership or text changed')
        web = row['englishComparisons']['bewley']
        require(web['bodySha256'] == locators[row['reference']]['bodySha256']
                and web['displayedReference'] == locators[row['reference']]['displayedReference'],
                'Web body locator changed')
    require({p['id']: p['sha256'] for p in a['printedComparisons']} == base.PRINTS
            and [p['inspectedPdfPages'] for p in a['printedComparisons']] == [list(range(340, 355)), list(range(327, 340))]
            and [p['bytes'] for p in a['printedComparisons']] == [28290204, 45304371],
            'Inspected PDF identity or page scope changed')
    require(sorted({p for r in a['records'] for p in r['printedReferences']})
            == a['distinctModernPrintedReferencesAccountedFor'] == list(range(1356, 1395)),
            'Printed occurrences have a gap or replacement')
    for v in a['unresolvedTextualDifferences']:
        require(v['status'] == 'unresolved-not-applied' and v['independentReview'] == 'pending'
                and v['sourceBlockSha256'] == blocks[v['paragraphId']]['textSha256']
                and v['sourceReading'] in blocks[v['paragraphId']]['text'], 'Unbound or approved variant')
        for w in v['witnesses']:
            require(w['sourceSha256'] == base.PRINTS[w['sourceId']] and w['readingSha256'] == sha(w['reading']),
                    'Printed excerpt identity changed')
            require(bool(w['pdfPages']) and set(w['pdfPages']) <= set(next(r for r in a['records'] if r['reference'] == v['reference'])['printedPages'][w['sourceId']]), 'Excerpt outside inspected occurrence pages')
    require(a['proposedCorrections'] == [] and a['missingPrintedReport'] == {
        'fromPreviousStage': 'funerals-missing-1201', 'printedReference': 1260,
        'proposedAppReference': '1200b', 'status': 'transcription-and-wording-review-pending', 'readerEligible': False,
    }, 'A missing report or correction cannot be silently admitted')
    require(a['englishComparisons']['bewley']['boundaryCorrections']
            == first['englishComparisons']['bewley']['boundaryCorrections'], 'Boundary correction provenance lost')
    validate_ownership(a, inventory)
    coverage = a['cumulativeCoverage']
    stages = [first, second, third]
    expected_paths = ['research/funerals-' + stage + '-source-audit.json' for stage in ['first', 'second', 'third']]
    require([stage['path'] for stage in coverage['stages']] == expected_paths, 'Previous stage omitted')
    for stage in coverage['stages']:
        require(sha((ROOT / stage['path']).read_bytes()) == stage['sha256'], 'Earlier audit changed')
    all_rows = [row for stage in stages for row in stage['records']] + a['records']
    missing = first['missingPrintedReports'][0]
    require([r['reference'] for r in all_rows] == coverage['selectedReferences']
            == [n for n in range(1180, 1331) if n != 1201], 'Selected coverage incomplete or duplicated')
    require(sorted({n for r in all_rows for n in r['printedReferences']} | {missing['printedReference']})
            == coverage['modernPrintedReferencesIncludingMissingReport'] == list(range(1237, 1395)),
            'Cumulative printed coverage lost')
    english_refs = {p['reference'] for r in [*all_rows, missing] for p in r['englishComparisons']['khan']['parts']}
    require(english_refs == set(coverage['matchedEnglishReferencesIncludingMissingReport'])
            == {'2.23.' + str(n) for n in range(329, 478)}, 'Cumulative English coverage crossed a book boundary')
    require([r['reference'] for r in all_rows if not r['englishComparisons']['khan']['parts']]
            == coverage['selectedReferencesWithoutPinnedEpubCounterpart'] == [1234], 'Absent counterpart hidden')
    require(coverage['missingPrintedReportStillPending'] is True and coverage['wordingApproved'] is False
            and coverage['chapterAndContextWordingReview'] == 'pending', 'Location checks cannot approve wording')
    return True

def validate_ownership(a, inventory):
    rows = {r['reference']: r for r in a['records']}
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    require(len(a['ownershipFindings']) == 1, 'Ghundar ownership evidence missing')
    finding = a['ownershipFindings'][0]
    phrase = 'زاد غندر عذاب القبر حق'
    require(finding['references'] == [1306, 1307] and finding['sourceOwner'] == 1307
            and finding['printedOwner'] == {'selectedReference': 1306, 'modernReference': 1372}
            and finding['followingPrintedReference'] == 1373 and finding['sourceReading'] == phrase
            and finding['status'] == 'unresolved-not-applied' and finding['readerAdmission'] is False,
            'Closing ownership cannot be silently resolved')
    expected_bindings = []
    for n in [1306, 1307]:
        text = '\n\n'.join(blocks[p] for p in rows[n]['paragraphIds'])
        require((phrase in text) == (n == 1307), 'Closing note moved between original paragraphs')
        expected_bindings.append({'reference': n, 'paragraphIds': rows[n]['paragraphIds'], 'arabicSha256': sha(text)})
    require(finding['sourceBindings'] == expected_bindings, 'Ownership evidence detached from original paragraphs')
    for witness, sid, page in zip(finding['witnesses'], ['brill-1862', 'dar-ibn-kathir-2002'], [345, 331]):
        require(witness == {'sourceId': sid, 'sourceSha256': base.PRINTS[sid], 'pdfPages': [page],
                            'reading': phrase, 'readingSha256': sha(phrase)}, 'Closing printed witness changed')
    require(len(finding['witnesses']) == 2, 'Both closing printed witnesses required')
    return True

def verify_epub(a, english):
    witness = a['englishComparisons']['khan']
    raw = (ROOT / witness['sourcePath']).read_bytes()
    require(sha(raw) == witness['sourceSha256'] == english['sourceSha256'], 'English EPUB changed')
    with zipfile.ZipFile(ROOT / witness['sourcePath']) as archive:
        paragraphs = base.english.parse_section(archive.read(witness['section']))['paragraphs']
        next_paragraphs = base.english.parse_section(archive.read('OPS/section-0026.html'))['paragraphs']
    records = {r['id'].split(':')[-1]: r for r in english['records'] if r['section'] == witness['section']}
    require(len(records) == 155, 'English section coverage changed')
    for r in records.values():
        require(hashjson([paragraphs[i] for i in r['bodyParagraphs']]) == r['textSha256'], 'English section body changed')
    expected = {**{n: [n - 852] for n in range(1290, 1298)}, 1298: [445],
                **{n: [n - 853] for n in range(1299, 1303)}, 1303: [450, 451],
                **{n: [n - 852] for n in range(1304, 1327)}, 1327: [474],
                **{n: [n - 853] for n in range(1328, 1331)}}
    require([r['reference'] for r in a['records']] == REFERENCES, 'English comparison scope changed')
    def check_part(part, ref):
        r = records[ref]
        body = [paragraphs[i] for i in r['bodyParagraphs']]
        require(part['reference'] == ref and part['recordSha256'] == hashjson(r)
                and part['bodySha256'] == hashjson(body) == r['textSha256'], 'Actual English body binding changed')
    seen = {}
    for row in a['records']:
        n = row['reference']; match = row['englishComparisons']['khan']
        refs = ['2.23.' + str(k) for k in expected[n]]
        require(match['references'] == refs and [p['reference'] for p in match['parts']] == refs,
                'English occurrence matched to the wrong body')
        for part, ref in zip(match['parts'], refs):
            scope = 'shared-body-first-occurrence' if n in [1297, 1326] else 'shared-body-continuation' if n in [1298, 1327] else 'main-account' if n == 1303 and ref.endswith('.450') else 'as-above-pointer-and-closing-statement' if n == 1303 else 'located-body'
            require(part['scope'] == scope, 'Shared or split English scope lost')
            check_part(part, ref)
            seen.setdefault(ref, []).append(n)
    require(set(seen) == {'2.23.' + str(n) for n in range(438, 478)}, 'Compared English bodies missing')
    require({k: v for k, v in seen.items() if len(v) > 1}
            == {'2.23.445': [1297, 1298], '2.23.474': [1326, 1327]}, 'Unreviewed English body sharing')
    boundary = witness['bookBoundary']; trailing = boundary['excludedTrailingRecords']
    require([p['reference'] for p in trailing] == ['2.23.' + str(n) for n in range(478, 484)],
            'English trailing exclusion coverage changed')
    for part in trailing:
        ref = part['reference']; record = records[ref]
        check_part(part, ref)
        require(part['retainedEnglishBook'] == record['reference']['book'] == 23
                and paragraphs[record['headingParagraph']].strip() == 'Volume 2, Book 23, Number ' + record['reference']['number'] + ':'
                and part['scope'] == 'beyond-selected-arabic-book-boundary' and part['readerAdmission'] is False,
                'Raw English book label changed or trailing material admitted')
    following = [r for r in english['records'] if r['section'] == boundary['followingSection']][0]
    require(following['id'].endswith(':' + boundary['followingSectionFirstReference'])
            and boundary['followingSectionFirstReference'] == '2.24.484'
            and next_paragraphs[following['headingParagraph']].strip() == 'Volume 2, Book 24, Number 484:'
            and hashjson([next_paragraphs[i] for i in following['bodyParagraphs']]) == following['textSha256'],
            'Next English section boundary changed')
    return len(seen)

def render(a, inventory):
    e = html.escape
    blocks = {b['htmlId']: b['text'] for b in inventory['blocks']}
    prints = {p['id']: p for p in a['printedComparisons']}
    def links(pages):
        return ' · '.join(f'<a href="{e(prints[k]["url"])}#page={p}">{e(k)} · PDF p. {p}</a>'
                          for k, ps in pages.items() for p in ps)
    cards = []
    for row in a['records']:
        n = row['reference']
        text = '\n\n'.join(blocks[p] for p in row['paragraphIds'])
        notes = ''.join(f'<li><strong>{e(k.title())}:</strong> {e(note)}</li>'
                        for k, match in row['englishComparisons'].items() for note in match['limitations'])
        english = ' / '.join(row['englishComparisons']['khan']['references']) or 'No counterpart found in this pinned section'
        cards.append(f'<article id="report-{n}"><p class="eyebrow">Selected {n} · Printed {e(" / ".join(map(str, row["printedReferences"])))}</p><h2>Reference {n}</h2><p>{e(row["finding"])}</p><details><summary>Complete Arabic and comparison locations</summary><p class="arabic" lang="ar" dir="rtl" data-source="{n}">{e(text)}</p><p>{links(row["printedPages"])}</p><p><a href="https://aishabewley.org/bukhari11">Bewley {n}</a> · Khan: {e(english)}</p><ul>{notes}</ul></details></article>')
    differences = []
    for v in a['unresolvedTextualDifferences']:
        witnesses = ''.join(f'<p>{links({w["sourceId"]: w["pdfPages"]})}</p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' for w in v['witnesses'])
        differences.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-", " "))}</summary><p>{e(v["finding"])}</p><p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v["sourceReading"])}</p>{witnesses}<p>{e(v["transcriptionPolicy"])}</p></details>')
    findings = ''.join(f'<li id="{e(f["id"])}">{e(f["finding"])}</li>' for f in a['presentationFindings'])
    limits = ''.join(f'<li>{e(x)}</li>' for x in [*a['englishComparisons']['commonLimitations'], *a['limitations']])
    ownership = a['ownershipFindings'][0]
    ownership_html = f'<article id="ownership"><h2>A note whose ownership needs review</h2><p>{e(ownership["finding"])}</p><p class="arabic" lang="ar" dir="rtl">{e(ownership["sourceReading"])}</p><p>{links({w["sourceId"]:w["pdfPages"] for w in ownership["witnesses"]})}</p><p><a href="#report-1306">Complete selected 1306</a> · <a href="#report-1307">Complete selected 1307</a></p></article>'
    boundary = a['englishComparisons']['khan']['bookBoundary']
    excluded = ''.join(f'<li><strong>{e(r["reference"])}</strong> · Printed {e(" / ".join(map(str,r["modernPrintedReferences"])))} · {e(r["locator"])}<br>{links(r["printedPages"])}</li>' for r in boundary['excludedTrailingRecords'])
    boundary_html = f'<article id="book-boundary"><h2>Where this book ends</h2><p>{e(boundary["finding"])}</p><p>Funerals ends at selected 1330 · modern printed 1394 · English 2.23.477. The following English section starts at 2.24.484.</p><details><summary>Six records beyond the Arabic book boundary</summary><ul>{excluded}</ul></details></article>'
    q = a['quranReferenceChecks'][0]
    qlinks = ' · '.join(f'<a href="{e(q[k]["url"])}">Quran {e(q[k]["reference"])}</a>' for k in ['selectedPhraseLocation','historicalPhraseLocation','mismatchedCitationLocation'])
    quran_html = f'<article id="quran-reference"><h2>A citation to check separately</h2><p>Selected 1305: {e(q["finding"])}</p><p>{qlinks}</p></article>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Funerals · Final occurrence comparison</title><style>{base.STYLE}</style></head><body><main>
<p class="eyebrow">MindfulMod · Source comparison · 1290–1330</p><h1>Every account has a place.</h1><p>41 further entries compared · All 150 selected occurrences now located.</p>
<div class="notice"><strong>Occurrence mapping complete. Wording review remains pending.</strong> These are source findings for the personal prototype. No new report, translation or recording has entered the reader. Complete wording, chapter-context and missing-report review remain unfinished. Location checks alone do not establish accuracy.</div>
<article><h2>What needs care</h2><ul><li><a href="#ownership">A closing note has different owners.</a> Both complete digital paragraphs remain unchanged.</li><li><a href="#book-boundary">Six English records cross the Arabic book boundary.</a> Their original Book 23 labels remain intact.</li><li><a href="#shared-print-1390">One printed number covers three source entries.</a> Separate chains remain separate accounts.</li><li><a href="#dream-narrator-insertions">A long account contains narrator insertions.</a> Its complete wording and speaker changes need review.</li></ul><p><a href="funerals-final-source-audit.json">Complete evidence map</a> · <a href="funerals-third-source-review.html">Previous comparison stage</a></p></article>
{ownership_html}
{boundary_html}
{quran_html}
<nav aria-label="Compared source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>
{''.join(cards)}
<article id="differences"><h2>Printed wording differences</h2><p>Twenty-eight known differences are recorded here, with no correction applied. This is not an exhaustive collation or independent approval.</p>{''.join(differences)}</article>
<article id="structure"><h2>Ordering and source boundaries</h2><ul>{findings}</ul></article>
<article id="pending"><h2>What remains</h2><p>All 150 selected occurrences have comparison locations, accounting for 158 modern printed references including the separate missing report and 149 distinct English EPUB bodies. Selected 1234 still has no counterpart in this pinned EPUB section. All Funerals entries require wording and role review before admission. The missing printed report 1260, proposed app reference 1200b, still needs transcription and review.</p><ul>{limits}</ul></article>
<footer><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic Wikisource contributors, revision 393137, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; original wording unchanged.</p><p><a href="../reader/">Local reader</a> · <a href="funerals-source-review.html">Complete unchanged Arabic inventory</a></p></footer></main></body></html>
'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--bewley-html', type=Path)
    parser.add_argument('--brill-pdf', type=Path)
    parser.add_argument('--modern-pdf', type=Path)
    args = parser.parse_args()
    a, third, second, first, inventory, english = load()
    validate(a, third, second, first, inventory, english)
    count = verify_epub(a, english)
    if args.bewley_html:
        base.verify_bewley(first, args.bewley_html.read_bytes())
    for path, witness in zip([args.brill_pdf, args.modern_pdf], a['printedComparisons']):
        if path:
            data = path.read_bytes()
            require(len(data) == witness['bytes'] and sha(data) == witness['sha256'], 'Printed witness bytes changed')
    target = ROOT / 'research/funerals-final-source-review.html'
    page = render(a, inventory)
    if args.write:
        target.write_text(page)
    else:
        require(target.read_text() == page, 'Final review page stale')
    print(f'Funerals: 41 further selected entries, {count} exact EPUB bodies; all 150 selected occurrences located; wording review pending; no admission.')
