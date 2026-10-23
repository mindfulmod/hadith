import {ENTRY_COUNT,BOOK_COUNT,LAST_NUMBER} from './published-fixture.mjs';
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
const input=()=>[read('content/staging/bukhari-menstruation-wikisource/catalog.json'),read('content/review/menstruation-first-review.json'),read('content/sources/wikisource-menstruation/manifest.json'),BOOK_CONFIGS.menstruation];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('new book preserves all 289 earlier entries and all five current book packs',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95','ghusl-1382b7bd3720f4ff'];
 assert.deepEqual(source.entries.slice(0,289),stable.flatMap(n=>read('reader/books/'+n+'.json').entries));assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);
 for(const n of stable)assert.equal(published.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('every new source character and all twenty English segments survive display and narration',()=>{
 const args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),plan=narrationPlan(collectionFiles().source);
 assert.deepEqual(args.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),[290,291,292,293,294,295,296,297]);assert.equal(args[1].entries.flatMap(e=>e.segments).length,20);
 for(const row of args[1].entries){const e=batch.entries.find(e=>e.number===row.number),b=args[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]);assert.equal(e.arabic_blocks[0],b.text);assert.equal(row.segments.map(s=>s.arabic).join(''),b.text);assert.equal(row.arabicCorrections,undefined);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===row.number).script,e.english_blocks.join('\n\n'));}
});
test('book quotation and chapter material remain separately browsable and outside session text',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='menstruation'),a=input(),data=JSON.parse(files.get('reader/menstruation-inputs.json'));
 assert.equal(book.chapters.length,30);assert.equal(book.introduction.englishStatus,'pending');assert.equal(data.selectedBlocks.length,74);
 const state=normalizeState({session:{numbers:[289],cursor:289,ended:false},last:289}),before=structuredClone(state);
 for(const [id,bid]of [['chapter-01','mwBw'],['chapter-03','mwHQ']]){const c=book.chapters.find(c=>c.id===id),b=a[0].blocks.find(b=>b.htmlId===bid);assert.equal(c.sourceContext.introduction.arabicParagraphs,1);assert.equal(c.sourceContext.introduction.englishStatus,'pending');assert(files.get('reader/menstruation-review.html').includes(b.text));assert(source.entries.every(e=>!e.arabic_blocks.includes(b.text)));assert(bookView(buildBooks(source,ledger).catalog,state,{mode:'book',book,chapter:c,page:1}).includes('menstruation-review.html#'+id));}
 assert.deepEqual(state,before);assert.deepEqual(resolveSession(source.entries,state.session,5,297),state.session);assert.equal(nextSession(source.entries,{numbers:[289],cursor:289,ended:true},5).cursor,290);assert.deepEqual(planSession(source.entries,LAST_NUMBER,5).numbers,[LAST_NUMBER]);assert.equal(nextSession(source.entries,{numbers:[LAST_NUMBER],cursor:LAST_NUMBER,ended:true},5),null);
 const original=a[0].blocks[0];assert(files.get('reader/menstruation-review.html').includes(original.text));assert(source.entries.every(e=>!e.arabic_blocks.includes(original.text)));
});
test('embedded feminine informed-me verb is checked without confusing it with informed-us',()=>{
 const args=input(),row=args[1].entries.find(e=>e.number===292);assert.deepEqual(row.segments.map(s=>s.kind),['chain','report','chain','report']);assert.equal(row.segments[2].arabic,'أخبرتني عائشة ');assert.match(row.segments[2].english,/‘A’ishah informed me/);buildBookBatch(...args);
 for(const wrong of ['‘A’ishah informed us that','‘A’ishah said that']){const bad=input(),r=bad[1].entries.find(e=>e.number===292),s=r.segments[2];s.english=wrong;s.englishSha256=digest(wrong);r.englishSha256=digest(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...bad),/Reporting verb mismatch/);}
});
test('source edition differences do not silently change chapter ownership or report boundaries',()=>{
 const args=input(),batch=buildBookBatch(...args),r=args[1].entries.find(e=>e.number===295);assert.equal(args[1].entries[0].printedHeading,undefined);assert.deepEqual(batch.chapters[0].entryNumbers,[290]);assert.deepEqual(batch.chapters[4].entryNumbers,[295,296,297]);assert.equal(r.segments.length,2);assert.match(r.notes.join(' '),/299, 300 and 301/);
 assert.match(args[1].entries.find(e=>e.number===294).segments[0].english,/Zaynab bint Umm Salamah.*Umm Salamah related to her/);assert.match(args[1].entries.find(e=>e.number===294).notes.join(' '),/historical print moves directly/);
 for(const n of [296,297])assert.equal(args[1].entries.find(e=>e.number===n).segments.at(-1).kind,'transmission-note');
});
test('individual English mapping evidence and separate uncertainty notes remain explicit',()=>{
 const args=input(),{source,ledger}=collectionFiles();assert.deepEqual(args[1].entries.map(r=>r.comparisons[1].reference),['1.6.293','1.6.294','1.6.295','1.6.296','1.6.297','1.6.298','1.6.299','1.6.300']);
 for(const r of args[1].entries)assert.equal(r.comparisons[1].referenceEvidence.sourceRecordId,'islamhouse-bukhari-epub-2010:'+r.comparisons[1].reference);
 const note=ledger.sourceReferences.entries.find(r=>r.number===296).contextNotes[0];assert.match(note.text,/independent review remains pending/);assert(!narrationPlan(source).entries[295].script.includes(note.text));
 const bad=input(),r=bad[1].entries[0];r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...bad),/pinned-inventory evidence/);
});
