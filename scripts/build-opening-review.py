"""Build a labelled review artifact. Does not admit candidates to the reader."""
import argparse
import html
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'research/opening-next.html'

def verifier():
    spec=importlib.util.spec_from_file_location('opening_review',ROOT/'scripts/check-opening-review.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def render(catalog,draft):
    h=html.escape
    sources={s['id']:s for s in draft['sources']}
    labels={'arabic-base':'Pinned Arabic','bewley':'Aisha Bewley','islamhouse-khan':'Khan-family English','brill-1862':'Historical Arabic print','dar-ibn-kathir-2002':'Modern Arabic print','ibn-hajar-opening-5':'Ibn Hajar · Fath al-Bari'}
    links=lambda ids:' · '.join(f'<a href="{h(sources[id]["url"],quote=True)}">{labels[id]}</a>' for id in ids)
    articles=[]
    for e in draft['entries']:
        n=e['number'];segments=e['segments'];parts=[]
        # Only adjacent chain segments share the expandable introduction.
        chain=[s for s in segments if s['kind']=='chain']
        paras=lambda ss,language:''.join(f'<p data-{language}-segment="{s["id"]}">{h(s[language])}</p>' for s in ss)
        parts.append('<details class="chain"><summary>Chain of narrators · complete source introduction</summary>'+paras(chain,'english')+'</details>')
        for s in segments:
            if s['kind']=='chain':continue
            kind=s['kind']
            label='<h3>Transmission note from the source</h3>' if kind=='transmission-note' else '<h3>Letter within the report</h3>' if kind=='letter' else ''
            parts.append(f'<section class="segment {kind}">{label}{paras([s],"english")}</section>')
        issues=''.join('<li>'+h(i if isinstance(i,str) else i['detail'])+'</li>' for i in e['unresolved'])
        proposals=''.join(f'<section class="correction-proposal"><h4>Proposed correction · not applied</h4><p><span lang="ar" dir="rtl">{h(c["original"])}</span> → <span lang="ar" dir="rtl">{h(c["replacement"])}</span></p><p>English: “{h(c["englishOriginal"])}” → “{h(c["englishReplacement"])}”</p><p>{h(c["reason"])}</p><p class="small">{links(c["sources"])}</p></section>' for c in e.get('proposedCorrections',[]))
        checks=''.join(f'<section class="check"><h4>{h(c["topic"])}</h4><p>{h(c["finding"])}</p><p class="small">{links(c["sources"])}</p></section>' for c in e['checks'])
        # Preserve exact original paragraphs, including the source’s trailing note.
        arabic=[]
        for id in e['arabicParagraphIds']:
            spans=''.join(f'<span data-arabic-segment="{s["id"]}">{h(s["arabic"])}</span>' for s in segments if s['paragraphId']==id)
            arabic.append(f'<p data-source-paragraph="{h(id,quote=True)}">{spans}</p>')
        mapping=e['comparators'][1]['reference']
        articles.append(f'''<article id="hadith-{n}"><header><p class="eyebrow">OPENING BOOK · SOURCE NUMBER {n}</p><h2>Hadith {n}</h2><p class="status">Working translation · unresolved review items below</p><p class="small">English comparison reference: {h(mapping)}{' (combined 3–4)' if n in (3,4) else ''} · {links(['arabic-base','bewley','islamhouse-khan'])}</p></header><div class="english" lang="en">{''.join(parts)}</div><details class="review"><summary>Open review questions</summary><ul>{issues}</ul>{proposals}</details><details class="review"><summary>Exact Arabic source</summary><div class="arabic" lang="ar" dir="rtl">{''.join(arabic)}</div></details><details class="review"><summary>Comparisons and wording decisions</summary>{checks}<p class="small">Printed pages inspected: {', '.join(labels[w['id']]+' '+', '.join(str(p) for p in w['pdfPages']) for w in e['printedWitnesses'])}. Page numbers are PDF pages, counted from 1.</p></details><a class="back" href="#top">Back to entries ↑</a></article>''')
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>The next five hadith · Source review</title><style>
:root{color-scheme:light dark;--paper:#faf3e7;--ink:#332820;--muted:#6c5d50;--accent:#a83e21;--line:#d9c9b8;--wash:#f0e4d4}@media(prefers-color-scheme:dark){:root{--paper:#251e2a;--ink:#f3e8dd;--muted:#c6b9be;--accent:#ffb47d;--line:#50414e;--wash:#302733}}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,sans-serif}main{max-width:790px;margin:auto;padding:30px 24px 70px}a{color:var(--accent);text-underline-offset:4px}h1,h2{font:400 42px/1.14 Georgia,serif}h2{font-size:34px}.eyebrow{font-size:11px;letter-spacing:1.4px;color:var(--muted)}.intro{font-size:18px;max-width:650px}.notice{padding:18px 20px;border-left:3px solid var(--accent);background:var(--wash)}nav{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}nav a{display:flex;align-items:center;min-height:44px;padding:7px 15px;border:1px solid var(--line);border-radius:8px;text-decoration:none}.small,.status{font-size:13px;color:var(--muted)}article{margin-top:55px;padding-top:28px;border-top:1px solid var(--line);scroll-margin-top:20px}.english{font:21px/1.85 Georgia,serif}.english p{margin:24px 0}.chain{font-size:18px;line-height:1.7}.chain summary{font:14px/1.6 system-ui,sans-serif;color:var(--muted)}summary{cursor:pointer;min-height:48px;padding:12px 0}.transmission-note,.letter{border-left:2px solid var(--line);padding-left:18px}.segment h3{font:13px/1.6 system-ui,sans-serif;color:var(--muted);margin-top:25px}.review{border-top:1px solid var(--line);margin-top:15px}.review li{margin:15px 0}.check{padding:14px 0;border-bottom:1px solid var(--line)}h4{font-size:16px;margin:10px 0}.check p{margin:10px 0}.arabic{font:25px/2.1 'Geeza Pro',serif;overflow-wrap:break-word}.back{display:inline-flex;min-height:44px;align-items:center;font-size:13px;margin-top:20px}footer{margin-top:60px;padding-top:25px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}:focus-visible{outline:2px solid var(--accent);outline-offset:4px}@media(max-width:360px){main{padding:24px 18px}h1{font-size:35px}.english{font-size:20px}}
</style></head><body><main id="top"><header><p class="eyebrow">HADITH · SOURCE WORK · 20 OCTOBER 2026</p><h1>The next five hadith.</h1><p class="intro">Complete working drafts for opening entries 3–7, with exact Arabic, named comparisons and wording questions available beside each report.</p><p class="notice">These drafts are not in the reader. AI comparison is recorded; independent scholarly review is pending. Several wording and source differences still need resolution. Do not treat this page as an approved edition.</p><nav aria-label="Review entries">'''+''.join(f'<a href="#hadith-{n}">Hadith {n}</a>' for n in range(3,8))+'''</nav><p class="small"><a href="../reader/">Return to the current reader</a> · The two published evaluation entries remain unchanged.</p></header>'''+''.join(articles)+'''<footer><p>Arabic source: Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; digital transcription by Arabic Wikisource contributors, revision 484874. Arabic wording is unchanged. New English drafts, segment labels and review notes are AI-assisted.</p><p>Arabic-derived drafts and review text: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. The linked comparison translations remain with their respective rights holders; they are not reproduced here. No endorsement is implied.</p><p>Numbering is edition-specific: the Khan-family reference 1.1.3 combines source entries 3 and 4; references 1.1.4–6 correspond to source entries 5–7. Source notes are retained rather than silently treated as prophetic quotations.</p></footer></main></body></html>'''


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    catalog,draft=verifier().build();text=render(catalog,draft)
    if args.check:
        if OUTPUT.read_text()!=text:raise ValueError('Review artifact is stale')
    else:OUTPUT.write_text(text)
    print('Five-entry review artifact matches the pinned candidate text; reader unchanged')


if __name__=='__main__':main()
