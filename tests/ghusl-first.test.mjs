import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles,combineBookReviews} from '../scripts/build-collection.mjs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {bookView,bookIntroductionView} from '../reader/library.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {checkSourceNoteLinks} from '../scripts/build-site.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ghusl-wikisource/catalog.json'),read('content/review/ghusl-first-review.json'),read('content/sources/wikisource-ghusl/manifest.json'),BOOK_CONFIGS.ghusl];
const rehash=o=>{delete o.reviewRecordSha256;o.reviewRecordSha256=objectHash(o);};
test('Ghusl adds six complete entries while every previous entry and stable book pack remains exact',()=>{
 const {source,ledger}=collectionFiles(),args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),published=buildBooks(source,ledger);
 const names=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95'];
 assert.deepEqual(source.entries.slice(0,244),names.flatMap(n=>read('reader/books/'+n+'.json').entries));
 for(const n of names){const path='books/'+n+'.json';assert.equal(published.files.get(path),readFileSync(new URL('../reader/'+path,import.meta.url),'utf8'));}
 assert.deepEqual(args.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),[245,246,247,248,249,250]);assert.equal(batch.chapters.length,3);assert.equal(source.entries.length,331);
 for(const row of args[1].entries){const entry=batch.entries.find(e=>e.number===row.number);assert.equal(entry.arabic_blocks[0],args[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));}
});
test('book quotations have a separately admitted browser context and exact offline source paragraph',()=>{
 const {source,ledger,files}=collectionFiles(),args=input(),book=ledger.books.find(b=>b.id==='ghusl'),intro=book.introduction,review=args[1].bookIntroduction,paragraph=args[0].blocks.find(b=>b.htmlId==='mwBA');
 assert.equal(book.sourceEntryCount,45);assert.equal(intro.evidenceSha256,review.reviewRecordSha256);assert.equal(intro.arabicParagraphs,1);assert.equal(intro.englishStatus,'pending');assert.equal(intro.notes.fragment,'book-introduction');validateChapters(book);
 assert(!book.chapters.some(c=>c.id==='book-introduction'));assert.deepEqual(book.chapters.slice(0,3).flatMap(c=>c.entryNumbers),[245,246,247,248,249,250]);
 const inputs=JSON.parse(files.get('reader/ghusl-inputs.json'));assert.deepEqual(inputs.selectedBlocks.find(b=>b.htmlId==='mwBA'),paragraph);assert.equal(inputs.selectedBlocks.length,79);
 const html=files.get('reader/ghusl-review.html');assert.equal((html.match(/id="book-introduction"/g)||[]).length,1);assert(html.includes(paragraph.text));assert.match(html,/English translation and independent review are pending/);
 for(const entry of source.entries.slice(244))assert(!entry.arabic_blocks.includes(paragraph.text));
});
test('missing, changed, reassigned or falsely approved book introduction evidence is refused after rehashing',()=>{
 for(const change of [a=>delete a[1].bookIntroduction,a=>a[1].bookIntroduction.blocks=[],a=>a[1].bookIntroduction.blocks[0].textSha256='0'.repeat(64),a=>a[1].bookIntroduction.englishStatus='reviewed-translation',a=>a[1].bookIntroduction.independentReview='approved',a=>a[1].bookIntroduction.printedWitnesses.pop(),a=>a[2].bookIntroduction.blocks=[],a=>a[0].chapters[0].contextIds.push('mwBA'),a=>delete a[0].bookIntroduction]){
  const a=input();change(a);if(a[1].bookIntroduction)rehash(a[1].bookIntroduction);a[1].inventorySha256=objectHash(a[0]);assert.throws(()=>buildBookBatch(...a));
 }
 const a=input();a[1].bookIntroduction.notes[0]+=' changed';assert.throws(()=>buildBookBatch(...a),/Stale book introduction review/);
});
test('catalog metadata cannot hide book material, approve its translation or redirect its offline source',()=>{
 const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='ghusl');
 for(const change of [b=>b.introduction=null,b=>b.introduction.arabicParagraphs=0,b=>b.introduction.englishStatus='reviewed-translation',b=>b.introduction.evidenceSha256='bad',b=>b.introduction.notes.path='../other.html',b=>b.introduction.notes.fragment='chapter-01']){const b=structuredClone(book);change(b);assert.throws(()=>validateChapters(b),/book introduction/);}
 const changed=structuredClone(ledger);delete changed.books.find(b=>b.id==='ghusl').introduction;changed.catalogContextSha256=objectHash(changed.books);assert.throws(()=>buildBooks(source,changed),/not admitted/);
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('printed closing note preserves both readings and correct English-comparison coverage',()=>{
 const {source,files}=collectionFiles(),a=input(),row=a[1].entries.at(-1),entry=source.entries.find(e=>e.number===250),note=row.arabicSupplements[0];
 assert.equal(entry.arabic_blocks.length,2);assert.equal(entry.arabic_blocks[1],note.arabic);assert.equal(entry.presentation.arabic.at(-1).provenance.kind,'printed-supplement');
 assert.match(note.witnesses[0].reading,/ما رواه أبو نعيم/);assert.match(note.witnesses[1].reading,/ما روى أبو نعيم/);assert.deepEqual(note.englishComparisons.map(c=>c.status),['includes-note','omits-note']);
 assert.doesNotMatch(entry.english_status,/the English comparisons omit/);assert.match(files.get('reader/ghusl-review.html'),/English comparison coverage/);
 for(const mutate of [n=>n.englishComparisons.pop(),n=>n.englishComparisons[0].reference='249',n=>n.englishComparisons[1].sourceId='bewley-ghusl',n=>n.englishComparisons[1].status='approved',n=>n.witnesses[0].reading+=' changed']){const args=input(),r=args[1].entries.at(-1);mutate(r.arabicSupplements[0]);rehash(r);assert.throws(()=>buildBookBatch(...args));}
});
test('chains, amount alternatives and the printed final note remain in complete narration scripts',()=>{
 const {source}=collectionFiles(),plan=narrationPlan(source),entries=source.entries.slice(244);
 for(const e of entries)assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));
 assert.equal(entries[3].presentation.english.filter(s=>s.kind==='transmission-note').length,1);assert.equal(entries[5].presentation.english.filter(s=>s.kind==='transmission-note').length,2);
 assert.match(entries[2].english_blocks[0],/Ibn Abi Dhi’b related to us/);assert.equal((entries[3].english_blocks[0].match(/related to me/g)||[]).length,3);
 assert.match(entries[5].english_blocks.at(-1),/Ibn ‘Abbas, from Maymunah.*Abu Nu‘aym related/s);
});
test('browsing the book introduction does not change Continue or introduce unnumbered session items',()=>{
 const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='ghusl'),state=normalizeState({session:{numbers:[244],cursor:244,ended:true},last:244}),before=structuredClone(state),catalog=buildBooks(source,ledger).catalog;
 const html=bookView(catalog,state,{mode:'book',book,chapter:null,page:1});assert.deepEqual(state,before);assert.match(html,/ghusl-review.html#book-introduction/);assert.doesNotMatch(bookIntroductionView(book),/data-start-session|#read\//);assert.doesNotMatch(bookIntroductionView(ledger.books[0]),/Book introduction/);
 assert.deepEqual(resolveSession(source.entries,state.session,5,250),state.session);assert.equal(nextSession(source.entries,state.session,5).cursor,245);assert(planSession(source.entries,244,5).numbers.includes(245));assert.deepEqual(planSession(source.entries,331,5).numbers,[331]);
});
function contentFixture(){
 const {source,ledger,files:derived}=collectionFiles(),published=buildBooks(source,ledger),responses=new Map(published.files);
 for(const row of ledger.sourceReferences.entries)responses.set(row.localNotes.path,derived.get('reader/'+row.localNotes.path)||'Fixture notes');
 const files=()=>[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const open=()=>createContentLibrary({files:files(),base:new URL('https://example.com/reader/'),fetcher:async u=>new Response(responses.get(u.pathname.slice(8)))});
 return {published,responses,open};
}
test('the loader requires offline book introduction notes and binds pack metadata to the catalog',async()=>{
 const f=contentFixture();f.responses.delete('ghusl-review.html');await assert.rejects(f.open(),/Offline book introduction/);
 const g=contentFixture(),catalog=structuredClone(g.published.catalog),book=catalog.books.find(b=>b.id==='ghusl'),pack=JSON.parse(g.responses.get(book.path));delete pack.book.introduction;
 const body=JSON.stringify(pack),sha256=digest(body),path='books/ghusl-'+sha256.slice(0,16)+'.json';g.responses.delete(book.path);g.responses.set(path,body);Object.assign(book,{path,sha256,bytes:Buffer.byteLength(body)});g.responses.set('books/catalog.json',JSON.stringify(catalog));
 const library=await g.open();await assert.rejects(library.loadForNumber(245),/Book introduction context mismatch/);assert.equal(library.getEntry(245),undefined);
});
test('deployment checks require one exact book-introduction anchor in offline notes',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),packs=published.catalog.books.map(b=>JSON.parse(published.files.get(b.path)));
 checkSourceNoteLinks(packs);
 assert.throws(()=>checkSourceNoteLinks(packs,{read:path=>readFileSync(new URL('../reader/'+path,import.meta.url),'utf8').replace('id="book-introduction"','id="removed-introduction"')}),/Missing or duplicate.*book-introduction/);
});
