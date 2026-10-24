import {assertHistoricalBook} from './helpers/stable-book.mjs';
import {ENTRY_COUNT,LAST_NUMBER} from './published-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {bookView} from '../reader/library.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-menstruation-wikisource/catalog.json'),read('content/review/menstruation-final-review.json'),read('content/sources/wikisource-menstruation/manifest.json'),BOOK_CONFIGS.menstruation];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('final Menstruation batch preserves all prior 309 entries and five other packs',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95','ghusl-1382b7bd3720f4ff'];
 assert.deepEqual(source.entries.slice(0,309),[...stable,'menstruation-0f3c3cdf2218693b'].flatMap(n=>read('reader/books/'+n+'.json').entries));assert.equal(source.entries.length,ENTRY_COUNT);
 for(const n of stable)assertHistoricalBook(published,'books/'+n+'.json');
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('seventeen reports and forty-four segments cover the complete source and narration order',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),plan=narrationPlan(collectionFiles().source);assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:17},(_,i)=>310+i));assert.equal(a[1].entries.flatMap(r=>r.segments).length,44);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),b=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]);let expected=b.text;if(r.number===311)expected=expected.replace('وانفضي','وانقضي');if(r.number===324)expected=expected.replace('عن عائشة قال','عن عائشة قالت');assert.equal(r.segments.map(s=>s.arabic).join(''),expected);assert.equal(e.arabic_blocks[0],expected);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries[r.number-1].script,e.english_blocks.join('\n\n'));}
});
test('two letter corrections retain originals and reject incomplete evidence',()=>{
 const {files,ledger}=collectionFiles();
 for(const n of [311,324]){const a=input(),r=a[1].entries.find(r=>r.number===n),c=r.arabicCorrections[0],original=a[0].blocks.find(b=>b.htmlId===c.paragraphId).text;assert.equal(r.originalArabicSha256,digest(original));assert(files.get('reader/menstruation-review.html').includes(original));assert(ledger.sourceReferences.entries.find(r=>r.number===n).contextNotes.some(x=>x.id===c.contextNoteId));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].witnesses[0].reading=r.arabicCorrections[0].before,r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='invented rendering']){const bad=input(),r=bad[1].entries.find(r=>r.number===n);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...bad));}}
});
test('four chapter introductions remain separately browsable and excluded from numbered sessions and audio',()=>{
 const a=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='menstruation'),plan=narrationPlan(source),state=normalizeState({session:{numbers:[309],cursor:309,ended:false},last:309}),before=structuredClone(state);
 assert.equal(book.entryNumbers.length,37);assert.equal(book.chapters.length,30);assert.equal(JSON.parse(files.get('reader/menstruation-inputs.json')).selectedBlocks.length,74);
 for(const id of ['chapter-19','chapter-20','chapter-24','chapter-28']){const c=a[1].chapters.find(c=>c.id===id),chapter=book.chapters.find(c=>c.id===id);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');for(const bid of c.contextIds){const text=a[0].blocks.find(b=>b.htmlId===bid).text;assert(files.get('reader/menstruation-review.html').includes(text));assert(source.entries.every(e=>!e.arabic_blocks.includes(text)));assert(plan.entries.every(e=>!e.script.includes(text)));}assert(bookView(buildBooks(source,ledger).catalog,state,{mode:'book',book,chapter,page:1}).includes('menstruation-review.html#'+id));}
 assert.deepEqual(state,before);assert.deepEqual(resolveSession(source.entries,state.session,5,326),state.session);assert.equal(nextSession(source.entries,{...state.session,ended:true},5).cursor,310);assert.deepEqual(planSession(source.entries,LAST_NUMBER,10).numbers,[LAST_NUMBER]);assert.equal(nextSession(source.entries,{numbers:[LAST_NUMBER],cursor:LAST_NUMBER,ended:true},5),null);
});
test('untitled printed chapter is distinct from funeral material without rewriting digital grouping',()=>{
 const a=input(),before=structuredClone(a[0]),batch=buildBookBatch(...a),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='menstruation'),r=a[1].entries.at(-1),heading=r.printedHeading;
 assert.deepEqual(a[0],before);assert.deepEqual(a[0].chapters.at(-1).entryNumbers,[325,326]);assert.deepEqual(book.chapters.find(c=>c.id==='chapter-29').entryNumbers,[325]);assert.deepEqual(book.chapters.at(-1).entryNumbers,[326]);assert.equal(book.chapters.at(-1).title,'Chapter');assert.equal(heading.arabic,'باب');assert.equal(batch.chapters.length,16);assert(files.get('reader/menstruation-review.html').includes('chapter-29-print-30'));
 assert.match(source.license.changes,/A declared printed addition supplies a missing chapter heading;/);assert.equal(narrationPlan(source).entries.at(-1).script,source.entries.at(-1).english_blocks.join('\n\n'));
 for(const mutate of [r=>r.printedHeading.witnesses.pop(),r=>r.printedHeading.beforeEntry=325,r=>r.printedHeading.digitalArabicSha256='0'.repeat(64),r=>r.contextNotes=[]]){const bad=input(),r=bad[1].entries.at(-1);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...bad));}
});
test('embedded chains and narrator alternatives remain in their source positions',()=>{
 const {source}=collectionFiles(),e=n=>source.entries[n-1];assert.deepEqual(e(316).presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.equal(e(316).english_blocks[2],'She said: And she related to me:');assert.match(e(316).english_blocks[3],/kiss her.*And I and the Prophet/);
 assert.deepEqual(e(318).presentation.english.map(s=>s.kind),['chain','report','transmission-note','chain','report']);assert.match(e(318).english_blocks[1],/twelve expeditions.*six/);assert.match(e(318).english_blocks[2],/May my father be ransomed/);assert.equal(e(318).english_blocks[3],'I heard him say:');assert.match(e(318).english_blocks[4],/women and the women in seclusion—or the young women in seclusion/);assert.match(e(318).english_blocks[4],/such-and-such and such-and-such/);
 assert.equal(e(315).english_blocks.at(-1),'Or she said: “We did not do it.”');assert.equal(e(323).presentation.english.at(-1).kind,'transmission-note');assert.match(e(323).english_blocks.at(-1),/Then I heard him/);assert.doesNotMatch(e(323).english_blocks.at(-1),/Ibn ‘Abbas|Tawus/);
});
test('comparison omissions and commentary are not imported into narration wording',()=>{
 const {source,ledger}=collectionFiles(),e=n=>source.entries[n-1],plan=narrationPlan(source);assert.match(e(320).english_blocks[1],/brownish and yellow/);assert.doesNotMatch(e(320).english_blocks[1],/purification|days/);assert.match(e(321).english_blocks[1],/instructed her to bathe.*She used to bathe for every prayer/);assert.match(e(324).english_blocks[1],/wash the blood/);assert.doesNotMatch(e(324).english_blocks[1],/bathe/);assert.match(e(326).english_blocks[0],/al-Waddah.*from his book.*my maternal aunt/);assert.match(e(326).english_blocks[1],/lying beside the place.*touched me/);
 for(const n of [310,311,315,318,322,323,324,325,326])for(const note of ledger.sourceReferences.entries.find(r=>r.number===n).contextNotes)assert(!plan.entries[n-1].script.includes(note.text));
});
test('every final English body comparison is individually pinned and stale evidence is rejected',()=>{
 const a=input();assert.deepEqual(a[1].entries.map(r=>r.comparisons[1].reference),Array.from({length:17},(_,i)=>'1.6.'+(313+i)));for(const r of a[1].entries)assert.equal(r.comparisons[0].reference,String(r.number));const bad=input(),r=bad[1].entries[0];r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...bad),/pinned-inventory evidence/);
});
