"""Verify Funerals 1250–1289 against pinned source spans and actual English bodies."""
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
previous_spec = importlib.util.spec_from_file_location('funerals_previous', ROOT / 'scripts/check-funerals-second.py')
previous = importlib.util.module_from_spec(previous_spec)
previous_spec.loader.exec_module(previous)
require, sha, hashjson = base.require, base.sha, base.hashjson
REFERENCES = list(range(1250, 1290))
SEALS = {'records': '1baec3b4594a0695953ea5ce672e499ee5d5d0f549328ee9220ffe794b339fde', 'unresolvedTextualDifferences': '032f98ae0f06ef78f3f5f20c185e9d98604fad1072cab13865515cd5ed06dd3b', 'presentationFindings': '461e9cb9910ebe5e201814a696a1680a7b12282f87740e2f57d0fab1349ea883', 'englishComparisons': '7097bd5beea8849fde9f5ed38a391a988093a99c42779e174a21c103e5aff51e'}

def load():
    first, inventory, english = base.load()
    return base.read('research/funerals-third-source-audit.json'), base.read('research/funerals-second-source-audit.json'), first, inventory, english

def validate(a, prior, first, inventory, english):
    previous.validate(prior, first, inventory, english)
    require(a['schemaVersion'] == 1 and a['status'] == 'partial-source-comparison-not-wording-approval'
            and a['independentReview'] == 'pending' and a['readerAdmission'] is False,
            'A source comparison cannot approve wording or reader admission')
    require(a['previousStage'] == 'research/funerals-second-source-audit.json' and a['source'] == first['source'],
            'Third stage must bind the same immutable source inventory')
    require(a['comparisonScope'] == {
        'newlyLocatedReferences': REFERENCES,
        'cumulativeLocatedReferences': [n for n in range(1180, 1290) if n != 1201],
        'pendingReferences': list(range(1290, 1331)),
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
            and [p['inspectedPdfPages'] for p in a['printedComparisons']] == [list(range(330, 341)), list(range(317, 328))]
            and [p['bytes'] for p in a['printedComparisons']] == [28290204, 45304371],
            'Inspected PDF identity or page scope changed')
    require(sorted({p for r in a['records'] for p in r['printedReferences']})
            == a['distinctModernPrintedReferencesAccountedFor'] == list(range(1312, 1356)),
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
    expected = {**{n: n - 851 for n in range(1250, 1283)}, 1283: 431,
                **{n: n - 852 for n in range(1284, 1290)}}
    require([r['reference'] for r in a['records']] == REFERENCES, 'English comparison scope changed')
    seen = {}
    for row in a['records']:
        n = row['reference']
        match = row['englishComparisons']['khan']
        ref = '2.23.' + str(expected[n])
        require(match['references'] == [ref] and len(match['parts']) == 1
                and match['parts'][0]['reference'] == ref, 'English occurrence matched to the wrong body')
        part = match['parts'][0]
        scope = 'shared-body-first-occurrence' if n == 1282 else 'shared-body-continuation' if n == 1283 else 'located-body'
        require(part['scope'] == scope, 'Shared English body ownership lost')
        r = records[ref]
        body = [paragraphs[i] for i in r['bodyParagraphs']]
        require(part['recordSha256'] == hashjson(r) and part['bodySha256'] == hashjson(body) == r['textSha256'],
                'Actual English body or inventory binding changed')
        seen.setdefault(ref, []).append(n)
    require(set(seen) == {'2.23.' + str(n) for n in range(399, 438)}, 'Compared English bodies missing')
    require({k: v for k, v in seen.items() if len(v) > 1} == {'2.23.431': [1282, 1283]},
            'Only the checked 431 body can be shared')
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
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Funerals · Third source comparison</title><style>{base.STYLE}</style></head><body><main>
<p class="eyebrow">MindfulMod · Source comparison · 1250–1289</p><h1>Every route belongs to its account.</h1>
<div class="notice" id="later-eighth-batch-corrections"><strong>Later wording-review correction and qualification.</strong> At 1289, al-Qastallani documents transmissions both with and without Ishaq al-Kalbi. The two print excerpts below do not by themselves require adding that name to the selected source. The historical JSON remains unchanged. See the <a href="funerals-eighth-wording-addendum.json">later evidence addendum</a> and <a href="../reader/funerals-review.html#hadith-1291">current reader source notes</a>. Independent review remains pending.</div><p>40 further entries compared · 109 of 150 selected entries located so far.</p>
<div class="notice"><strong>Partial comparison. Wording review remains pending.</strong> These are source findings for the personal prototype. No new report, translation or recording has entered the reader. The remaining 41 entries, 1290–1330, still need print and English-body comparison.</div>
<div class="notice" id="later-pronoun-clarification"><strong>Later qualification for references 1251 and 1253.</strong> The historical Arabic print has second-person تذهبون in both reports; the selected and modern text have third-person يذهبون. The English comparison’s “you” has a printed basis and must not be characterized as an unequivocal error. The historical intake remains unchanged. See the <a href="funerals-fifth-wording-addendum.json">later evidence and qualification</a>. Independent review remains pending.</div>
<div class="notice" id="later-sixth-batch-corrections"><strong>Later corrections for references 1255, 1257, 1259 and 1265.</strong> Reinspection reads فصلينا (we prayed), not فسلمنا, in the historical 1259 passage. Both prints have singular مسجدا at 1265; the earlier historical-plural claim is incorrect. The 1257 closing is a statement, and the 1255 EPUB parenthesis explains leading the prayer. These corrections supersede the corresponding descriptions below without altering the historical JSON evidence. See the <a href="funerals-sixth-wording-addendum.json">exact later evidence</a>. Independent review remains pending.</div>
<div class="notice" id="later-seventh-batch-corrections"><strong>Later corrections for references 1271, 1276 and 1277.</strong> The selected 1271 says “with the Prophet,” not “with your Prophet.” At 1276 the historical print does support the plural images used by the English comparisons; selected and modern remain singular. At 1277 the modern print reads Ibn Mubarak without the article, correcting the earlier excerpt below. The intercourse reading is a documented lexical choice, while Fulayh’s tentative sin gloss remains separate. See the <a href="funerals-seventh-wording-addendum.json">exact later evidence and qualifications</a>. The historical JSON is preserved and independent review remains pending.</div>
<article><h2>What needs care</h2><ul><li><a href="#1261-intervening-chain">An additional historical narrator chain</a> is absent from selected and modern text.</li><li><a href="#shared-english-1282-1283">One English body combines two Arabic entries.</a> The later matches must follow their contents.</li><li><a href="#1277-closing-attributions">Closing comments have their own speakers.</a> Preserve each role and every complete route.</li><li><a href="#parallel-occurrences-not-interchangeable">Similar accounts have different wording.</a> A longer parallel cannot fill a shorter source occurrence.</li></ul><p><a href="funerals-third-source-audit.json">Complete evidence map</a> · <a href="funerals-second-source-review.html">Previous comparison stage</a></p></article>
<nav aria-label="Compared source references">{''.join(f'<a href="#report-{n}">{n}</a>' for n in REFERENCES)}</nav>
{''.join(cards)}
<article id="differences"><h2>Printed wording differences</h2><p>Twenty-nine known differences are recorded here, with no correction applied. This is not an exhaustive collation or independent approval.</p>{''.join(differences)}</article>
<article id="structure"><h2>Ordering and source boundaries</h2><ul>{findings}</ul></article>
<article id="pending"><h2>What remains</h2><p>41 selected entries still need occurrence comparison. All Funerals entries require wording and role review before admission. The missing printed report 1260, proposed app reference 1200b, still needs transcription and review.</p><ul>{limits}</ul></article>
<footer><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic Wikisource contributors, revision 393137, under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Display formatting only; original wording unchanged.</p><p><a href="../reader/">Local reader</a> · <a href="funerals-source-review.html">Complete unchanged Arabic inventory</a></p></footer></main></body></html>
'''

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--bewley-html', type=Path)
    parser.add_argument('--brill-pdf', type=Path)
    parser.add_argument('--modern-pdf', type=Path)
    args = parser.parse_args()
    a, prior, first, inventory, english = load()
    validate(a, prior, first, inventory, english)
    count = verify_epub(a, english)
    if args.bewley_html:
        base.verify_bewley(first, args.bewley_html.read_bytes())
    for path, witness in zip([args.brill_pdf, args.modern_pdf], a['printedComparisons']):
        if path:
            data = path.read_bytes()
            require(len(data) == witness['bytes'] and sha(data) == witness['sha256'], 'Printed witness bytes changed')
    target = ROOT / 'research/funerals-third-source-review.html'
    page = render(a, inventory)
    if args.write:
        target.write_text(page)
    else:
        require(target.read_text() == page, 'Third review page stale')
    print(f'Funerals: 40 further selected entries, {count} exact EPUB bodies; 109 cumulative entries located, 41 pending; no admission.')
