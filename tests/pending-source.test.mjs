import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,combineBookReviews,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapters,pendingForNumber,pendingBefore,pendingBetween,sessionPending} from '../reader/navigation.mjs';
import {pendingEntryView,pendingNoticeView,bookView} from '../reader/library.mjs';
import {startSession,resolveSession,visitSession,nextSession} from '../reader/session.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {release} from '../reader/release.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8')),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const config=BOOK_CONFIGS['two-eids'],inv=read('content/staging/bukhari-two-eids-wikisource/catalog.json'),manifest=read('content/sources/wikisource-two-eids/manifest.json');
const review=()=>read('content/review/two-eids-final-review.json');
const catalog=read('reader/books/catalog.json'),book=catalog.books.find(b=>b.id==='two-eids'),held=pendingForNumber(catalog,926);

test('all forty Two Eids occurrences are accounted for as 39 complete entries and one explicit hold',()=>{
 const {source,ledger}=collectionFiles(),b=ledger.books.find(b=>b.id==='two-eids');
 assert.equal(source.entries.length,948);assert.equal(b.entryNumbers.length,39);assert.equal(b.sourceEntryCount,40);assert.equal(b.chapters.length,26);
 assert.deepEqual(b.pendingEntries.map(p=>p.number),[926]);assert.equal(b.pendingEntries[0].evidenceSha256,read('content/review/source-holds.json').holds[0].evidence.sha256);
 assert.deepEqual([...b.entryNumbers,926].sort((a,b)=>a-b),inv.records.map(r=>r.number));
 assert(!source.entries.some(e=>e.number===926));assert(!narrationPlan(source).entries.some(e=>e.number===926));
 assert.match(source.scope,/Pending source review: 926/);assert.doesNotMatch(source.scope,/complete numbered entries 1–945/);
 for(const row of review().entries){const e=source.entries.find(e=>e.number===row.number);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(e.arabic_blocks.join(''),row.segments.map(s=>s.arabic).join(''));}
});

test('unregistered, hidden, duplicated and remapped gaps cannot be admitted',()=>{
 for(const change of [r=>delete r.pendingReferences,r=>r.pendingReferences.push(927),r=>r.pendingReferences.push(926),r=>r.pendingReferences=[925],r=>r.chapters.shift(),r=>r.chapters[0].entryNumbers=[926]]){
  const bad=review();change(bad);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));
 }
 const registry=read('content/review/two-eids-batches.json'),bad=review();delete bad.pendingReferences;registry.batches.at(-1).sha256=hash(bad);
 assert.throws(()=>combineBookReviews(registry,config,p=>p.endsWith('final-review.json')?bad:read(p)),/consecutive/);
 const altered=structuredClone(inv);altered.records.find(r=>r.number===926).id+='-remapped';assert.throws(()=>buildBookBatch(altered,review(),manifest,config),/Held source record/);
});

test('the held chapter preserves its exact Arabic context without claiming an empty chapter or a translated report',()=>{
 const c=book.chapters.find(c=>c.id==='chapter-11');assert.deepEqual(c.entryNumbers,[]);assert.equal(c.sourceContext.numberedReports,'pending-review');assert.equal(c.sourceContext.introduction.arabicParagraphs,1);assert.equal(c.sourceContext.introduction.englishStatus,'pending');
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='two-eids'),route=notes.routes.find(r=>r.id==='chapter-11');
 const html=readFileSync(new URL('reader/'+route.path,root),'utf8');assert(html.includes(inv.blocks.find(b=>b.htmlId==='mwQQ').text));assert(html.includes('numbered report in this chapter is pending source review'));
 const view=bookView(catalog,{minutes:5,finished:[]},{book,chapter:c,page:1});assert.match(view,/Numbered hadith pending source review/);assert.match(view,/#read\/926/);assert.doesNotMatch(view,/No numbered hadith in this source chapter|data-start-session/);
});

test('pending metadata rejects contradictory coverage, broken chapter links and unsupported evidence paths',()=>{
 validateChapters(book);
 for(const change of [b=>delete b.pendingEntries,b=>b.pendingEntries[0].number=927,b=>b.pendingEntries[0].id='bukhari:927',b=>b.pendingEntries.push({...held}),b=>b.pendingEntries[0].notes.path='../outside.html',b=>b.pendingEntries[0].evidenceSha256='changed',b=>b.pendingEntries[0].chapterId='missing',b=>b.sourceEntryCount=39,b=>b.chapters[10].sourceContext.numberedReports='none-in-source',b=>b.chapters[10].entryNumbers=[926]]){
  const bad=structuredClone(book);change(bad);assert.throws(()=>validateChapters(bad));
 }
});

test('reading and session notices follow actual reference order while saved sessions remain finite',()=>{
 assert.equal(pendingForNumber(catalog,926).number,926);assert.equal(pendingForNumber(catalog,927),undefined);
 assert.deepEqual(pendingBefore(catalog,927).map(p=>p.number),[926]);assert.deepEqual(pendingBefore(catalog,928),[]);assert.deepEqual(pendingBetween(catalog,925,927).map(p=>p.number),[926]);
 const plan=startSession(catalog.entries,925,5);assert.equal(plan.numbers[0],925);assert(plan.numbers.includes(927));assert(!plan.numbers.includes(926));assert.deepEqual(sessionPending(catalog,plan.numbers).map(p=>p.number),[926]);
 assert.deepEqual(sessionPending(catalog,[927]).map(p=>p.number),[926]);assert.deepEqual(sessionPending(catalog,[928]),[]);
 assert.strictEqual(visitSession(plan,926),plan);
 const saved={numbers:[925],cursor:925,ended:false};assert.deepEqual(resolveSession(catalog.entries,saved,10,927),saved);assert.equal(nextSession(catalog.entries,saved).cursor,927);
 const suffix={numbers:['835b','835c',836],cursor:'835c',ended:false};assert.deepEqual(resolveSession(catalog.entries,suffix,5,'835c'),suffix);
});

test('pending pages expose source evidence and continued reading without text, save or listen actions',()=>{
 const html=pendingEntryView(catalog,held);assert.match(html,/#read\/925/);assert.match(html,/#read\/927/);assert.match(html,/two-eids-review.html#hadith-926/);assert.match(html,/Your session and reading place have not changed/);assert.doesNotMatch(html,/data-listen|id="bookmark"|class="narration"/);
 assert.match(pendingNoticeView([held]),/Reading continues/);assert.equal(pendingNoticeView([]),'');
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='two-eids'),route=notes.routes.find(r=>r.id==='hadith-926');
 assert(release.files.some(f=>f.path===route.path));const text=readFileSync(new URL('reader/'+route.path,root),'utf8');assert(text.includes(inv.blocks.find(b=>b.htmlId==='mwQg').text));assert(text.includes('No English translation or recording is supplied'));
});

test('a changed pending descriptor is rejected even when catalog download hashes are internally consistent',async()=>{
 const copy=structuredClone(catalog);copy.books.find(b=>b.id==='two-eids').pendingEntries[0].reason+=' changed';
 const body=JSON.stringify(copy),files=structuredClone(release.files),descriptor=files.find(f=>f.path==='books/catalog.json');descriptor.bytes=Buffer.byteLength(body);descriptor.sha256=createHash('sha256').update(body).digest('hex');
 const library=await createContentLibrary({files,base:new URL('https://example.test/reader/'),fetcher:async url=>new Response(url.pathname.endsWith('/books/catalog.json')?body:readFileSync(new URL('reader/'+url.pathname.slice('/reader/'.length),root)))});
 await assert.rejects(library.loadForNumber(927),/Pending source coverage mismatch/);assert.equal(library.getEntry(927),undefined);await assert.rejects(library.loadForNumber(926),/not in this collection/);
});

test('site packaging verifies pending explanation anchors even though the reference has no reading entry',async()=>{
 const {checkSourceNoteLinks}=await import('../scripts/build-site.mjs');
 const packs=[{book:{pendingEntries:[held]},sourceReferences:{entries:[]}}];
 checkSourceNoteLinks(packs,{read:()=>'<article id="hadith-926"></article>'});
 assert.throws(()=>checkSourceNoteLinks(packs,{read:()=>'<article id="hadith-925"></article>'}),/Missing or duplicate/);
 assert.throws(()=>checkSourceNoteLinks(packs,{read:()=>'<article id="hadith-926"></article><article id="hadith-926"></article>'}),/Missing or duplicate/);
});
