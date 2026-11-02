import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles}from'../scripts/build-collection.mjs';
import {narrationPlan}from'../scripts/build-audio.mjs';
import {buildBooks}from'../scripts/publish-books.mjs';
import {resolveSession,startSession}from'../reader/session.mjs';
import {validateChapters,chapterForNumber}from'../reader/navigation.mjs';
import {release}from'../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inv=read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-rain-prayer/manifest.json'),review=()=>read('content/review/rain-prayer-third-review.json'),cfg=BOOK_CONFIGS['rain-prayer'];
const {source,ledger,files}=collectionFiles(),batch=buildBookBatch(inv,review(),manifest,cfg),plan=narrationPlan(source),get=n=>batch.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('third Rain Prayer batch keeps eight complete unchanged Arabic reports, all honorifics and full narration scripts',()=>{
 assert.deepEqual(batch.entries.map(e=>e.number),[976,977,978,979,980,981,982,983]);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),20);
 const old=read('reader/books/rain-prayer-72b760b84d29aa76.json');assert.deepEqual(source.entries.filter(e=>old.entries.some(o=>o.id===e.id)),old.entries);
 for(const r of review().entries){const e=get(r.number),original=inv.blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks[0],original);assert.equal(r.segments.map(s=>s.arabic).join(''),original);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.equal(plan.entries.find(p=>p.number===r.number).script,e.english_blocks.join('\n\n'));assert.equal(text(r.number).split('may Allah bless him and grant him peace').length-1,original.split('ﷺ').length-1);
  assert.equal(e.audio_status,'No recording yet.');assert.equal(e.review.independentReview,'pending');assert.equal(r.arabicCorrections,undefined);
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('two absent English comparisons remain explicit and tied to the exact adjacent pinned source records',()=>{
 for(const n of [976,983]){const r=review().entries.find(e=>e.number===n),c=r.comparisons[1];assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.match(get(n).english_status,/second English comparison is absent/);
  const citation=ledger.sourceReferences.entries.find(e=>e.number===n).citations.find(c=>c.id==='khan');assert.match(citation.locator,/No corresponding report/);
  for(const mutate of [c=>c.checkedReferences.reverse(),c=>c.checkedReferenceEvidence[0].recordSha256='0'.repeat(64),c=>delete c.checkedReferenceEvidence,c=>c.note='']){const copy=review(),row=copy.entries.find(r=>r.number===n);mutate(row.comparisons[1]);rehash(row);assert.throws(()=>buildBookBatch(inv,copy,manifest,cfg));}
 }
});

test('companion and transmission comments stay attributed without importing comparison expansions',()=>{
 assert.deepEqual(get(976).presentation.english.map(s=>s.kind),['chain','report','transmission-note']);assert.match(text(976),/may Allah Most High be pleased with them/);assert.match(get(976).english_blocks[1],/He sought forgiveness/);assert.match(get(976).english_blocks[1],/No adhan or iqamah was given/);assert.match(get(976).english_blocks.at(-1),/had seen the Prophet/);assert.doesNotMatch(text(976),/narrated from the Prophet/);
 assert.equal(get(981).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(981).english_blocks.at(-1),'Sufyan said: Al-Mas‘udi informed me, from Abu Bakr, who said, “He put the right on the left.”');
 assert.equal(get(982).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(982).english_blocks.at(-1),'Abu ‘Abdullah said: This Ibn Zayd is Mazini, and the earlier one is Kufi; he is Ibn Yazid.');assert.doesNotMatch(text(982),/ibn Salam/);assert.match(get(982).english_blocks[1],/to pray\. When he supplicated, or intended to supplicate/);
});

test('parallel accounts retain their own sequence and short narration forms',()=>{
 assert.match(get(977).english_blocks[0],/one of the Companions of the Prophet/);assert.match(text(977),/He stood and supplicated to Allah while standing/);assert.match(text(977),/they were given rain/);
 assert.match(text(978),/Then he prayed two rak‘ahs, reciting aloud in both/);assert.match(text(979),/on the day he went out/);assert.match(text(979),/He said: He turned his back/);assert.match(text(979),/then led us in two/);
 assert.match(text(980),/then prayed two rak‘ahs and reversed his cloak/);
 for(const n of [977,978,979,980,981])assert.doesNotMatch(text(n),/‘Abbas ibn Tamim|inside out|Qur’an/);
});

test('983 ends at its actual source boundary and exposes lexical uncertainty without appending the separate printed occurrence',()=>{
 const e=get(983),last=e.english_blocks.at(-1),notes=files.get('reader/rain-prayer-review.html');assert.match(last,/the traveller is unable to proceed and the road is blocked\.\u201d$/);assert.equal(text(983).split('have perished').length-1,3);
 assert.doesNotMatch(text(983),/around us|armpits|al-Uwaysi|Ibn Hajar|Ibn Rajab/);assert(!batch.entries.some(e=>e.number==='983b'));assert(!text(983).includes('al-Uwaysi')); // The historical batch remains unchanged; a later admission owns the separate occurrence.
 for(const s of ['fath-rain-traveller','rajab-rain-traveller'])assert(ledger.sourceReferences.entries.find(e=>e.number===983).citations.some(c=>c.sourceId===s));assert(notes.includes('does not establish one uncontested lexical meaning'));
});

test('new chapter navigation and offline notes do not expand a saved finite session',()=>{
 const book=ledger.books.find(b=>b.id==='rain-prayer');validateChapters(book);assert.deepEqual(book.chapters.find(c=>c.id==='chapter-14').entryNumbers,[976,977]);assert.equal(chapterForNumber(book,983).id,'chapter-20');
 const saved={numbers:[974,975],cursor:975,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,976),saved);assert.equal(startSession(source.entries,976,5).numbers[0],976);
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='rain-prayer');for(const r of review().entries){const route=notes.routes.find(n=>n.id==='hadith-'+r.number);assert(release.files.some(f=>f.path===route.path));}
});
