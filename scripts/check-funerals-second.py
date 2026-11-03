"""Verify Funerals 1210–1249 against pinned source spans and actual English bodies."""
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
require, sha, hashjson = base.require, base.sha, base.hashjson
REFERENCES = list(range(1210, 1250))
SEALS = {
    'records': '25330519f13eb49503aa13811f8fd14c3e9118a3e66a7e29f29621552f53f2b1',
    'unresolvedTextualDifferences': '5dfa4aa010345c9179cac06b729677359639257567123a6b7fcd30d78438c2cd',
    'presentationFindings': '79e570b6b3faa37858a4fbec0f1b4bde94513da75b5424969581c561c9ccd9c9',
    'englishComparisons': 'b8934f2384ae915fc2145ede2f2a3b779bc005b606a5db0347d71109ab64fbab',
}

def load():
    first, inventory, english = base.load()
    return base.read('research/funerals-second-source-audit.json'), first, inventory, english

def validate(a, first, inventory, english):
    base.validate(first, inventory, english)
    require(a['schemaVersion'] == 1 and a['status'] == 'partial-source-comparison-not-wording-approval'
            and a['independentReview'] == 'pending' and a['readerAdmission'] is False,
            'A source comparison cannot approve wording or reader admission')
    require(a['previousStage'] == 'research/funerals-first-source-audit.json' and a['source'] == first['source'],
            'Second stage must bind the same immutable source inventory')
    require(a['comparisonScope'] == {
        'newlyLocatedReferences': REFERENCES,
        'cumulativeLocatedReferences': [n for n in range(1180, 1250) if n != 1201],
        'pendingReferences': list(range(1250, 1331)),
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
            and [p['inspectedPdfPages'] for p in a['printedComparisons']] == [list(range(320, 331)), list(range(307, 318))]
            and [p['bytes'] for p in a['printedComparisons']] == [28290204, 45304371],
            'Inspected PDF identity or page scope changed')
    require(sorted({p for r in a['records'] for p in r['printedReferences']})
            == a['distinctModernPrintedReferencesAccountedFor'] == list(range(1269, 1312)),
            'Printed occurrences have a gap or replacement')
    for v in a['unresolvedTextualDifferences']:
        require(v['status'] == 'unresolved-not-applied' and v['independentReview'] == 'pending'
                and v['sourceBlockSha256'] == blocks[v['paragraphId']]['textSha256']
                and v['sourceReading'] in blocks[v['paragraphId']]['text'], 'Unbound or approved variant')
        for w in v['witnesses']:
            require(w['sourceSha256'] == base.PRINTS[w['sourceId']] and w['readingSha256'] == sha(w['reading']),
                    'Printed excerpt identity changed')
    require(a['proposedCorrections'] == [] and a['missingPrintedReport'] == {
        'fromPreviousStage': 'funerals-missing-1201', 'printedReference': 1260,
        'proposedAppReference': '1200b', 'status': 'transcription-and-wording-review-pending', 'readerEligible': False,
    }, 'A missing report or correction cannot be silently admitted')
    require(a['englishComparisons']['bewley']['boundaryCorrections']
            == first['englishComparisons']['bewley']['boundaryCorrections'], 'Boundary correction provenance lost')
    return True

def verify_epub(a, english):
    witness = a['englishComparisons']['khan']
    raw = (ROOT / witness['sourcePath']).read_bytes()
    require(sha(raw) == witness['sourceSha256'] == english['sourceSha256'], 'English EPUB changed')
    with zipfile.ZipFile(ROOT / witness['sourcePath']) as archive:
        paragraphs = base.english.parse_section(archive.read(witness['section']))['paragraphs']
    records = {r['id'].split(':')[-1]: r for r in english['records'] if r['section'] == witness['section']}
    require(len(records) == 155, 'English section coverage changed')
    for r in records.values():
        require(hashjson([paragraphs[i] for i in r['bodyParagraphs']]) == r['textSha256'], 'English section body changed')
    seen = set()
    for row in a['records']:
        match = row['englishComparisons']['khan']
        require(match['references'] == [p['reference'] for p in match['parts']], 'English reference/body mapping disagrees')
        if row['reference'] == 1234:
            require(match['status'] == 'not-found-in-pinned-section' and not match['parts'],
                    'An absent comparison cannot use a neighboring report')
            continue
        require(bool(match['parts']), 'Matched English occurrence has no body')
        for part in match['parts']:
            r = records[part['reference']]
            body = [paragraphs[i] for i in r['bodyParagraphs']]
            require(part['recordSha256'] == hashjson(r) and part['bodySha256'] == hashjson(body) == r['textSha256'],
                    'Actual English body or inventory binding changed')
            seen.add(part['reference'])
    require(seen == {'2.23.' + str(n) for n in range(359, 399)}, 'Compared English bodies missing or duplicated')
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
        witnesses = ''.join(f'<p>{links({w["sourceId"]: [w["pdfPage"]]})}</p><p class="arabic" lang="ar" dir="rtl">{e(w["reading"])}</p>' for w in v['witnesses'])
        differences.append(f'<details id="{e(v["id"])}"><summary>{e(v["id"].replace("-", " "))}</summary><p>{e(v["finding"])}</p><p>Selected source, unchanged:</p><p class="arabic" lang="ar" dir="rtl">{e(v["sourceReading"])}</p>{witnesses}<p>{e(v["transcriptionPolicy"])}</p></details>')
    findings = ''.join(f'<li id="{e(f["id"])}">{e(f["finding"])}</li>' for f in a['presentationFindings'])
    limits = ''.join(f'<li>{e(x)}</li>' for x in [*a['englishComparisons']['commonLimitations'], *a['limitations']])
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Funerals · Second source comparison</title><style>{base.STYLE}</style></head><body><main>
<p class="eyebrow">MindfulMod · Source comparison · 1210–1249</p><h1>Keeping each account complete.</h1><p>40 further entries compared · 69 of 150 selected entries located so far.</p>
<div class="notice"><strong>Partial comparison. Wording review remains pending.</strong> These are source findings for the personal prototype. No new report, translation or recording has entered the reader. The remaining 81 entries, 1250–1330, still need print and English-body comparison.</div>
<div class="notice" id="later-lexical-clarification"><strong>Later qualification for reference 1234.</strong> The original evidence map below is preserved as an intake record. Its description of the face-slapping translation was too categorical: classical commentary records that meaning alongside wailing. The working translation uses wailing and discloses the alternative. See the <a href="funerals-fourth-wording-addendum.json">later evidence and lexical clarification</a> and <a href="../reader/funerals-review.html#hadith-1234">current reader source notes</a>. Independent review remains pending.</div>
<div class="notice" id="later-standing-clarification"><strong>Later correction for reference 1249 and supplement for 1242.</strong> The original intake below remains unchanged. Enlarged inspection of historical PDF page 330 reads فقمنا, correcting the earlier excerpt وقمنا. The standing pronoun is discussed separately. The closing note at 1242 is now supplied as an explicitly labelled printed supplement with both witness readings. See the <a href="funerals-fifth-wording-addendum.json">later evidence</a> and <a href="../reader/funerals-review.html#hadith-1242">current reader source notes</a>. Independent review remains pending.</div>
<article><h2>What needs care</h2><ul><li><a href="#1214-chain-link">A narrator-chain difference in 1214</a> appears in both prints.</li><li><a href="#report-1230">Two English records belong to one Arabic entry.</a> A later report, <a href="#report-1234">1234</a>, has no counterpart in this pinned EPUB section.</li><li><a href="#1242-umar-closing">A closing statement is absent from the selected Arabic.</a> It remains a disclosed difference.</li><li><a href="#english-boundary-corrections">Two web chapter headings were included in report locators.</a> Their boundaries are now corrected without changing the source snapshot.</li></ul><p><a href="funerals-second-source-audit.json">Complete evidence map</a> · <a href="funerals-source-review.html">First comparison stage</a></p></article>
<nav aria-label="Compared source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>
{''.join(cards)}
<article id="differences"><h2>Printed wording differences</h2><p>Sixteen known differences are recorded here, with no correction applied. This is not an exhaustive collation or independent approval.</p>{''.join(differences)}</article>
<article id="structure"><h2>Ordering and source boundaries</h2><ul>{findings}</ul></article>
<article id="pending"><h2>What remains</h2><p>81 selected entries still need occurrence comparison. All Funerals entries require wording and role review before admission. The missing printed report 1260, proposed app reference 1200b, still needs transcription and review.</p><ul>{limits}</ul></article>
<footer><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic Wikisource contributors, revision 393137, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; original wording unchanged.</p><p><a href="../reader/">Local reader</a> · <a href="funerals-source-review.html">Complete unchanged Arabic inventory</a></p></footer></main></body></html>
'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--bewley-html', type=Path)
    parser.add_argument('--brill-pdf', type=Path)
    parser.add_argument('--modern-pdf', type=Path)
    args = parser.parse_args()
    a, first, inventory, english = load()
    validate(a, first, inventory, english)
    count = verify_epub(a, english)
    if args.bewley_html:
        base.verify_bewley(first, args.bewley_html.read_bytes())
    for path, witness in zip([args.brill_pdf, args.modern_pdf], a['printedComparisons']):
        if path:
            data = path.read_bytes()
            require(len(data) == witness['bytes'] and sha(data) == witness['sha256'], 'Printed witness bytes changed')
    target = ROOT / 'research/funerals-second-source-review.html'
    page = render(a, inventory)
    if args.write:
        target.write_text(page)
    else:
        require(target.read_text() == page, 'Second review page stale')
    print(f'Funerals: 40 further selected entries, {count} exact EPUB bodies; 69 cumulative entries located, 81 pending; no admission.')
