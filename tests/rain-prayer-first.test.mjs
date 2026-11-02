import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles}from'../scripts/build-collection.mjs';
import {narrationPlan}from'../scripts/build-audio.mjs';
import {buildBooks}from'../scripts/publish-books.mjs';
import {validateChapters,chapterForNumber,libraryRoute}from'../reader/navigation.mjs';
import {startSession,resolveSession}from'../reader/session.mjs';
import {release}from'../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inv=read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-rain-prayer/manifest.json'),review=()=>read('content/review/rain-prayer-first-review.json');
const {source,ledger,files}=collectionFiles(),entries=source.entries.filter(e=>e.book==='Rain Prayer'),book=ledger.books.find(b=>b.id==='rain-prayer'),get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n'),plan=narrationPlan(source);
test('opening Rain Prayer batch retains every exact paragraph, full-span role and complete script',()=>{
 assert.deepEqual(entries.map(e=>e.number),[960,961,962,963,964,965,966]);assert.equal(book.sourceEntryCount,33);assert.equal(book.chapters.length,5);validateChapters(book);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),23);
 for(const row of review().entries){const e=get(row.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text));assert.equal(row.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===row.number).script,e.english_blocks.join('\n\n'));assert.equal(e.audio_status,'No recording yet.');assert.equal(e.review.independentReview,'pending');}
 assert(!entries.some(e=>e.number===967||e.number==='983b'));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
test('two poetry occurrences and later chain stay separate rather than being deduplicated',()=>{
 const e=get(963);assert.equal(e.arabic_blocks.length,7);assert.equal(e.english_blocks.filter(x=>x==='And a fair one, through whose face rain is sought from the clouds,').length,2);assert.equal(e.english_blocks.filter(x=>x==='a refuge for orphans, a protection for widows.').length,2);
 assert.deepEqual(e.presentation.english.map(s=>s.kind),['chain','report','report','report','chain','report','report','report','transmission-note']);assert.match(text(963),/‘Abd al-Rahman ibn ‘Abdullah ibn Dinar.*his father/s);assert.match(text(963),/‘Umar ibn Hamzah.*Salim.*his father/s);assert.equal(e.english_blocks.at(-1),'And these are Abu Talib’s words.');
});
test('selected details and closing comments are retained without borrowing comparison expansions',()=>{
 assert.match(text(960),/‘Abbad ibn Tamim/);assert.doesNotMatch(text(960),/inside out/);assert.equal(get(961).presentation.english.at(-1).kind,'transmission-note');assert.match(text(961),/Ibn Abi al-Zinad said, from his father/);assert.equal(text(961).split('O Allah,').length-1,6);
 assert.match(text(962),/up to His words, “returning/);assert.match(text(962),/al-lizam/);assert.doesNotMatch(text(962),/accept Islam|moon|one year/);
 assert.match(text(964),/we used to seek a means to You through our Prophet/);assert.match(text(964),/may Allah Most High be pleased with him/);assert.doesNotMatch(text(964),/living|dead/);
 assert.equal(get(966).presentation.english.at(-1).kind,'transmission-note');assert.match(text(966),/relating to his father, from his uncle/);assert.match(text(966),/he was mistaken/);assert.doesNotMatch(text(966),/was weak/);
});
test('the empty chapter remains separately browseable, source-bound and excluded from all sessions and scripts',()=>{
 const chapter=book.chapters.at(-1),r=review().chapters.at(-1).printedEmptyChaptersAfter[0];assert.deepEqual(chapter.entryNumbers,[]);assert.equal(chapter.sourceContext.headingStatus,'heading-translation-pending');assert.equal(chapter.sourceContext.printedEmptyHeading.evidenceSha256,hash(r));assert.equal(chapterForNumber(book,966).id,'chapter-04');assert.equal(libraryRoute('#book/rain-prayer/chapter/'+chapter.id,{books:[book]}).chapter,chapter);
 for(const e of source.entries)assert(!e.arabic_blocks.includes(r.arabic));for(const p of plan.entries)assert(!p.script.includes(r.arabic)&&!p.script.includes(chapter.title));
 const session=startSession(source.entries,960,10);assert(session.numbers.every(n=>typeof n==='number'&&n>=960&&n<=966));const saved={numbers:[958,959],cursor:959,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,960),saved);
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='rain-prayer'),route=notes.routes.find(x=>x.id===chapter.id);assert(release.files.some(f=>f.path===route.path));const html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8');for(const w of r.witnesses)assert(html.includes(w.reading));assert.match(html,/English heading is pending/);
});
test('mislabelled comparison is visible and cannot revert to a guessed same-number citation',()=>{
 const e=ledger.sourceReferences.entries.find(e=>e.number===966),c=e.citations.find(c=>c.id==='bewley');assert.match(c.locator,/Chapter IV.*displayed entry 967.*occurrence 1/);assert.match(c.scope,/displayed number differs/);
 for(const mutate of [r=>delete r.comparisons[0].occurrenceLocator,r=>r.comparisons[0].reference='966',r=>r.comparisons[0].occurrenceLocator.sha256='0'.repeat(64)]){const reviewCopy=review(),row=reviewCopy.entries.at(-1);mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);assert.throws(()=>buildBookBatch(inv,reviewCopy,manifest,BOOK_CONFIGS['rain-prayer']));}
});
test('empty heading cannot be removed from the approved collection context or enter production on prototype evidence',()=>{
 const altered=structuredClone(ledger);altered.books.find(b=>b.id==='rain-prayer').chapters.pop();altered.catalogContextSha256=hash(altered.books);assert.throws(()=>buildBooks(source,altered));assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
 const copy=review();copy.chapters.at(-1).printedEmptyChaptersAfter[0].entryNumbers=[966];assert.throws(()=>buildBookBatch(inv,copy,manifest,BOOK_CONFIGS['rain-prayer']));
 assert(files.get('reader/rain-prayer-review.html').includes('AI-assisted'));
});
