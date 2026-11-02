import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles}from'../scripts/build-collection.mjs';
import {narrationPlan}from'../scripts/build-audio.mjs';
import {buildBooks}from'../scripts/publish-books.mjs';
import {validateChapters,chapterForNumber}from'../reader/navigation.mjs';
import {resolveSession,startSession}from'../reader/session.mjs';
import {release}from'../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const inv=read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-rain-prayer/manifest.json'),review=()=>read('content/review/rain-prayer-second-review.json'),cfg=BOOK_CONFIGS['rain-prayer'];
const {source,ledger,files}=collectionFiles(),batch=buildBookBatch(inv,review(),manifest,cfg),plan=narrationPlan(source),get=n=>batch.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('second Rain Prayer batch preserves all nine complete source accounts, 28 spans and previous published wording',()=>{
 assert.deepEqual(batch.entries.map(e=>e.number),[967,968,969,970,971,972,973,974,975]);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),28);
 const old=read('reader/books/rain-prayer-0181f9afd9236ac3.json');assert.deepEqual(source.entries.filter(e=>old.entries.some(o=>o.id===e.id)),old.entries);
 for(const r of review().entries){
  const e=get(r.number),original=inv.blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks[0]);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  if(r.number!==968)assert.equal(e.arabic_blocks[0],original);
  assert.equal(plan.entries.find(p=>p.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal(text(r.number).split('may Allah bless him and grant him peace').length-1,original.split('ﷺ').length-1);
  assert.equal(e.audio_status,'No recording yet.');assert.equal(e.review.independentReview,'pending');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('only the evidenced narrator-name span changes and its visible note remains outside complete narration',()=>{
 const r=review().entries.find(e=>e.number===968),c=r.arabicCorrections[0],original=inv.blocks.find(b=>b.htmlId===c.paragraphId).text,e=get(968);
 assert.equal(r.originalArabicSha256,sha(original));assert.equal(e.arabic_blocks[0],original.slice(0,c.start)+c.after+original.slice(c.end));assert.equal(c.before,'قتيبة بن سعد');assert.equal(c.after,'قتيبة بن سعيد');assert.match(e.english_blocks[0],/Qutaybah ibn Sa‘id/);
 const inputs=JSON.parse(files.get('reader/rain-prayer-inputs.json'));assert.equal(inputs.selectedBlocks.find(b=>b.htmlId===c.paragraphId).text,original);
 const ref=ledger.sourceReferences.entries.find(e=>e.number===968);assert(ref.contextNotes.some(n=>n.id===c.contextNoteId));assert(!text(968).includes(r.contextNotes[0].text));assert(files.get('reader/rain-prayer-review.html').includes(c.before));
 for(const mutate of [r=>r.originalArabicSha256='0'.repeat(64),r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].witnesses[0].reading='different',r=>r.arabicCorrections[0].witnesses[1].pdfPage=247,r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='Sa‘d']){const copy=review(),row=copy.entries.find(r=>r.number===968);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(inv,copy,manifest,cfg));}
});

test('the two English labels 968 retain separate chapter/occurrence identities even after the Arabic correction',()=>{
 const refs=ledger.sourceReferences.entries;
 for(const [number,chapter,occurrence]of [[967,'V',1],[968,'VI',2]]){
  const c=refs.find(r=>r.number===number).citations.find(c=>c.id==='bewley');assert.match(c.locator,new RegExp('Chapter '+chapter+' .*displayed entry 968.*occurrence '+occurrence));
 }
 for(const mutate of [rows=>delete rows[1].comparisons[0].occurrenceLocator,rows=>rows[1].comparisons[0].occurrenceLocator=structuredClone(rows[0].comparisons[0].occurrenceLocator),rows=>rows[0].comparisons[0].part={index:1,count:2},rows=>rows[0].comparisons[0].reference='967']){
  const copy=review();mutate(copy.entries);for(const row of copy.entries)rehash(row);assert.throws(()=>buildBookBatch(inv,copy,manifest,cfg));
 }
});

test('parallel reports retain their different terrain, time, visitor and repetition wording',()=>{
 assert.match(text(967),/six days/);assert.match(text(968),/six days/);assert.doesNotMatch(text(967),/for a week|for seven/);
 assert.match(text(967),/mountains, the thickets/);assert.doesNotMatch(text(968),/mountains|thickets/);
 assert.equal(text(967).split('O Allah, give us rain.').length-1,3);assert.equal(text(968).split('O Allah, come to our aid.').length-1,3);
 assert.match(text(968),/meaning the second Friday/);assert.match(text(969),/That man, or someone else/);assert.match(text(971),/A man came/);
 assert.match(text(971),/mountaintops/);assert.match(text(973),/backs of the mountains/);
 assert.match(text(975),/trees have reddened/);assert.match(text(975),/“O Allah, give us rain,” twice/);assert.match(text(975),/looked at Medina/);assert.doesNotMatch(text(975),/looked towards the sky|return.*home|trees have dried/);
 assert.equal(get(967).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(968).presentation.english.at(-1).kind,'transmission-note');
});

test('972 discloses its damaged comparison and keeps absence of mention distinct from absence of action',()=>{
 const r=review().entries.find(e=>e.number===972),c=r.comparisons[1];assert.equal(c.status,'damaged-comparison');assert(c.checkedBody.some(p=>p.includes('I p man')));assert.match(get(972).english_status,/damaged/);
 assert.equal(get(972).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(972).english_blocks.at(-1),'It was not mentioned that he turned his cloak or faced the qibla.');assert.doesNotMatch(text(972),/Anas did not mention|did not turn his cloak/);
 for(const mutate of [c=>c.checkedBody[1]=c.checkedBody[1].replace('I p man','A man'),c=>c.damagedExcerpt='unobserved damage',c=>c.reference='2.17.130']){const copy=review(),row=copy.entries.find(e=>e.number===972);mutate(row.comparisons[1]);rehash(row);assert.throws(()=>buildBookBatch(inv,copy,manifest,cfg));}
});

test('974 retains the complete attributed addition without importing a grading or completing shortened Quranic excerpts',()=>{
 const e=get(974);assert.deepEqual(e.presentation.english.map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(e.english_blocks[2],'Abu ‘Abdullah said: Asbat added, from Mansur:');assert.match(e.english_blocks[3],/people around them were given rain/);assert.match(e.english_blocks[1],/carrion and bones/);
 assert.doesNotMatch(text(974),/Ibn Nasr|Ibn Muhammad|weak|mistaken|authentic|curse|We will take retribution/);
 const citations=ledger.sourceReferences.entries.find(r=>r.number===974).citations;for(const sid of ['fath-rain-asbat','tawdih-rain-asbat'])assert(citations.some(c=>c.sourceId===sid));
 assert(files.get('reader/rain-prayer-review.html').includes('Both inspected print main texts omit that attribution'));
});

test('the empty printed chapter stays in its now-complete digital gap and saved sessions remain finite',()=>{
 const book=ledger.books.find(b=>b.id==='rain-prayer');validateChapters(book);const index=book.chapters.findIndex(c=>c.id==='chapter-04-print-05');assert.equal(book.chapters[index-1].id,'chapter-04');assert.equal(book.chapters[index+1].id,'chapter-05');assert.deepEqual(book.chapters[index+1].entryNumbers,[967]);assert.deepEqual(book.chapters[index].entryNumbers,[]);assert.equal(chapterForNumber(book,968).id,'chapter-06');
 const saved={numbers:[965,966],cursor:966,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,967),saved);assert.equal(startSession(source.entries,967,5).numbers[0],967);
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='rain-prayer');for(const r of review().entries){const route=notes.routes.find(n=>n.id==='hadith-'+r.number);assert(release.files.some(f=>f.path===route.path));}
});
