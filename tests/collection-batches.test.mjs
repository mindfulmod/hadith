import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFaithBatch,collectionFiles,combineFaithReviews} from '../scripts/build-collection.mjs';
import {prototypeFiles} from '../scripts/build-opening-prototype.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {startSession,resolveSession,planSession,nextSession} from '../reader/session.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {recordedChapter} from '../reader/recording.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-faith-wikisource/catalog.json'),read('content/review/faith-first-review.json'),read('content/sources/wikisource-faith/manifest.json')];
test('the Faith batch retains exact Arabic, complete English and all declared source roles',()=>{
 const args=input(),original=structuredClone(args),{entries}=buildFaithBatch(...args);assert.deepEqual(args,original);
 for(const entry of entries){const row=args[1].entries.find(r=>r.number===entry.number);
  assert.deepEqual(entry.arabic_blocks,row.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));
  assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),row.segments.map(s=>s.english));
 }
 assert.deepEqual(sourceSegments(entries.find(e=>e.number===10),'english').map(s=>s.kind),['chain','report','transmission-note']);
 for(const n of [13,15])assert.deepEqual(sourceSegments(entries.find(e=>e.number===n),'english').map(s=>s.kind),['chain','chain','report']);
});
test('stale wording, Arabic replacements, missing chains and reassigned chapters cannot enter a batch',()=>{
 for(const change of [a=>a[1].entries[0].segments[1].english+=' changed',a=>a[1].entries[0].segments[0].arabic+=' changed',a=>{const s=a[1].entries[0].segments[0];s.english=s.english.replace('related to us','informed us');s.englishSha256=digest(s.english);a[1].entries[0].englishSha256=digest(a[1].entries[0].segments.map(s=>s.english).join('\n\n'));},a=>a[1].entries[0].segments.shift(),a=>a[1].chapters[0].entryNumbers=[9],a=>a[1].entries[0].independentReview='approved']){
  const a=input();change(a);const r=a[1].entries[0];delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);assert.throws(()=>buildFaithBatch(...a));
 }
});
test('assembly preserves the seven existing entries and admits only the explicit two-book version',()=>{
 const opening=prototypeFiles(),{source,ledger}=collectionFiles();assert.deepEqual(source.entries.slice(0,7),opening.source.entries);
 assert.equal(buildBooks(source,ledger).catalog.books.length,2);assert.equal(ledger.books[1].sourceEntryCount,51);assert.throws(()=>validateChapters({...ledger.books[1],sourceEntryCount:9}),/source entry count/);assert.throws(()=>buildBooks(source,ledger,{production:true}));
 const copy=structuredClone(source),l=structuredClone(ledger);copy.entries.push({...copy.entries.at(-1),number:59,id:'bukhari:59'});l.sourceRecordSha256=objectHash(copy);l.entries.push({...l.entries.at(-1),number:59,id:'bukhari:59'});assert.throws(()=>buildBooks(copy,l),/not admitted/);
});
test('a ten-minute session crosses the real book boundary without growing an existing seven-entry session',()=>{
 const {source}=collectionFiles();const plan=startSession(source.entries,7,10);assert(plan.numbers.includes(7)&&plan.numbers.includes(8));
 const saved={numbers:[7],cursor:7,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,7),saved);assert.equal(nextSession(source.entries,saved,5).cursor,8);
 assert(planSession(source.entries,17,5).numbers.includes(18));assert.deepEqual(resolveSession(source.entries,{numbers:[17],cursor:17,ended:false},5,17),{numbers:[17],cursor:17,ended:false});assert(planSession(source.entries,29,5).numbers.includes(30));assert(planSession(source.entries,43,5).numbers.includes(44));assert.deepEqual(planSession(source.entries,58,5).numbers,[58]);for(let n=8;n<=58;n++)assert.equal(recordedChapter(n),null);
});
test('the two real books load separately and expose complete search content only after both succeed',async()=>{
 const {source,ledger,files:derived}=collectionFiles(),published=buildBooks(source,ledger),responses=new Map(published.files),calls=[];
 responses.set('source-review.html','Original notes');responses.set('prototype-review.html','Opening notes');responses.set('faith-review.html',derived.get('reader/faith-review.html'));
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async u=>{const path=u.pathname.slice(8);calls.push(path);return new Response(responses.get(path));}});
 await library.loadForNumber(8);assert.equal(calls.length,2);assert.equal(library.getEntry(7),undefined);assert.equal(library.getEntry(8).id,'bukhari:8');assert.deepEqual(await library.loadAllEntries(),source.entries);assert.equal(calls.length,3);
});

test('new Faith batches preserve all seventeen earlier entries and every new Arabic paragraph',()=>{
 const {source}=collectionFiles(),opening=prototypeFiles().source.entries,first=buildFaithBatch(...input()).entries;
 assert.deepEqual(source.entries.slice(0,17),[...opening,...first]);assert.equal(source.entries.length,58);
 const inventory=input()[0],next=read('content/review/faith-next-review.json');
 for(const row of next.entries){const e=source.entries.find(e=>e.number===row.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('registered batches reject stale records, gaps, reordered references and duplicate chapter ownership',()=>{
 const registry=read('content/review/faith-batches.json');
 assert.equal(combineFaithReviews(registry).entries.length,51);
 const stale=structuredClone(registry);stale.batches[1].sha256='0'.repeat(64);assert.throws(()=>combineFaithReviews(stale),/Changed/);
 const gap=structuredClone(registry);gap.batches[1].first=19;assert.throws(()=>combineFaithReviews(gap),/consecutive/);
 for(const mutate of [r=>r.entries.reverse(),r=>r.entries.pop(),r=>r.chapters[0].id='chapter-01']){
  const r=read('content/review/faith-next-review.json');mutate(r);const reg=structuredClone(registry);reg.batches[1].sha256=objectHash(r);assert.throws(()=>combineFaithReviews(reg,p=>p===reg.batches[1].path?r:read(p)));
 }
});
test('narrator doubt and alternate transmission remain separate and in exact source order',()=>{
 const {source}=collectionFiles();
 assert.deepEqual(sourceSegments(source.entries.find(e=>e.number===22),'english').map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);
 assert.deepEqual(sourceSegments(source.entries.find(e=>e.number===27),'english').map(s=>s.kind),['chain','report','transmission-note']);
 assert.deepEqual(sourceSegments(source.entries.find(e=>e.number===28),'english').map(s=>s.kind),['chain','report','report']);
});
test('reporting verb checks recognize Arabic marks and distinguish singular from plural',()=>{
 for(const [number,from,to]of [[20,'related to us','informed us'],[22,'related to me','related to us']]){
  const review=read('content/review/faith-next-review.json'),row=review.entries.find(e=>e.number===number),s=row.segments[0];s.english=s.english.replace(from,to);s.englishSha256=digest(s.english);row.englishSha256=digest(row.segments.map(s=>s.english).join('\n\n'));delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildFaithBatch(input()[0],review,input()[2]),/Reporting verb mismatch/);
 }
});
test('the disputed heading is an explicit status with offline original and cited source context',()=>{
 const {ledger,files}=collectionFiles(),chapter=ledger.books[1].chapters.find(c=>c.entryNumbers.includes(29));assert.equal(chapter.title,'Chapter heading under review');
 const ref=ledger.sourceReferences.entries.find(e=>e.number===29);assert(ref.contextNotes[0].citations.includes('brill-1862'));assert(ref.contextNotes[0].citations.includes('dar-ibn-kathir-2002'));
 const inputs=JSON.parse(files.get('reader/faith-inputs.json'));assert(inputs.selectedBlocks.some(b=>b.text.includes('وكفر بعد كفر فيه')));assert(files.get('reader/faith-review.html').includes('not source wording'));
 const review=read('content/review/faith-next-review.json');delete review.chapters.at(-1).headingDiscrepancy;assert.throws(()=>buildFaithBatch(input()[0],review,input()[2]));
});

test('third Faith batch preserves the earlier 29 entries and exact new source spans',()=>{
 const {source}=collectionFiles(),[inventory,first,manifest]=input();
 const previous=[...prototypeFiles().source.entries,...buildFaithBatch(inventory,first,manifest).entries,...buildFaithBatch(inventory,read('content/review/faith-next-review.json'),manifest).entries];
 assert.deepEqual(source.entries.slice(0,29),previous);
 const review=read('content/review/faith-third-review.json');
 for(const row of review.entries){const entry=source.entries.find(e=>e.number===row.number);assert.deepEqual(entry.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),row.segments.map(s=>s.english));}
 assert.deepEqual(sourceSegments(source.entries[30],'english').map(s=>s.kind),['chain','report','report']);
 assert.deepEqual(sourceSegments(source.entries[31],'english').map(s=>s.kind),['chain','chain','report']);
 assert.deepEqual(sourceSegments(source.entries[33],'english').map(s=>s.kind),['chain','report','transmission-note']);
 assert.deepEqual(sourceSegments(source.entries[39],'english').map(s=>s.kind),['chain','report','report','transmission-note']);
});
test('an unavailable English comparison stays explicit without borrowing the next reference',()=>{
 const {source,ledger,files}=collectionFiles(),entry=source.entries.find(e=>e.number===41),ref=ledger.sourceReferences.entries.find(e=>e.number===41);
 assert.match(entry.english_status,/one English translation family/);assert.doesNotMatch(entry.english_status,/two English translation families/);
 assert.match(ref.citations.find(c=>c.id==='khan').locator,/No corresponding report/);assert.match(ref.citations.find(c=>c.id==='khan').scope,/not a completed English comparison/);
 assert.match(ref.contextNotes[0].text,/does not borrow a chain/);assert.deepEqual(ref.contextNotes[0].related,[]);
 assert.match(files.get('reader/faith-review.html'),/1\.2\.39 → 1\.2\.40/);
 assert.equal(ledger.sourceReferences.entries.find(e=>e.number===42).citations.find(c=>c.id==='khan').locator,'Volume 1, Book 2, Number 40');
});
test('missing or contradictory comparison evidence cannot be admitted even after rehashing',()=>{
 for(const mutate of [c=>c.reference='1.2.40',c=>delete c.checkedReferences,c=>c.checkedReferences=['1.2.39','1.2.42'],c=>c.note='',c=>c.status='approved']){
  const review=read('content/review/faith-third-review.json'),row=review.entries.find(e=>e.number===41);mutate(row.comparisons[1]);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildFaithBatch(input()[0],review,input()[2]));
 }
 const review=read('content/review/faith-third-review.json'),row=review.entries[0];row.comparisons[1]={...row.comparisons[0]};delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildFaithBatch(input()[0],review,input()[2]),/distinct English/);
});

test('the final Faith batch completes the selected numbered source without changing the first 43 entries',()=>{
 const {source,ledger}=collectionFiles(),[inventory,first,manifest]=input();
 const prior=[...prototypeFiles().source.entries,...[first,read('content/review/faith-next-review.json'),read('content/review/faith-third-review.json')].flatMap(r=>buildFaithBatch(inventory,r,manifest).entries)];
 assert.deepEqual(source.entries.slice(0,43),prior);assert.equal(ledger.books[1].entryNumbers.length,ledger.books[1].sourceEntryCount);assert.equal(ledger.books[1].chapters.length,42);
 for(const row of read('content/review/faith-final-review.json').entries){const e=source.entries.find(e=>e.number===row.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
 for(const number of [44,47,50])assert.equal(sourceSegments(source.entries[number-1],'english').at(-1).kind,'transmission-note');
 assert.equal(source.entries[54].arabic_blocks.length,1);assert.deepEqual(sourceSegments(source.entries[54],'english').map(s=>s.kind),['chain','report']);
 assert.equal(nextSession(source.entries,{numbers:[58],cursor:58,ended:true},5),null);
 assert.deepEqual(resolveSession(source.entries,{numbers:[43],cursor:43,ended:true},5,43),{numbers:[43],cursor:43,ended:true});assert.equal(nextSession(source.entries,{numbers:[43],cursor:43,ended:true},5).cursor,44);
});
test('a combined English reference identifies separate matched reports, not duplicated identities',()=>{
 const {source,ledger}=collectionFiles(),refs=ledger.sourceReferences.entries;
 for(const [number,index]of [[48,1],[49,2]])assert.equal(refs.find(r=>r.number===number).citations.find(c=>c.id==='khan').locator,`Volume 1, Book 2, Number 46 · report ${index} of 2`);
 assert.notEqual(source.entries[47].id,source.entries[48].id);assert.notDeepEqual(source.entries[47].english_blocks,source.entries[48].english_blocks);
 assert.equal(refs.find(r=>r.number===50).citations.find(c=>c.id==='khan').locator,'Volume 1, Book 2, Number 47');
});
test('shared comparison references refuse missing, repeated, out-of-range and inconsistent parts',()=>{
 for(const mutate of [c=>delete c.part,c=>c.part.index=1,c=>c.part.index=0,c=>c.part.index=3,c=>c.part.count=3,c=>c.part.count=1,c=>c.part.index=1.5]){
  const review=read('content/review/faith-final-review.json'),row=review.entries.find(e=>e.number===49);mutate(row.comparisons[1]);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildFaithBatch(input()[0],review,input()[2]));
 }
});
test('the visitor wording discrepancy remains visible and supported without modifying the Arabic',()=>{
 const {source,ledger,files}=collectionFiles(),entry=source.entries[49],ref=ledger.sourceReferences.entries.find(r=>r.number===50);
 assert(entry.arabic_blocks[1].includes('فأتاه جبريل'));assert(entry.english_blocks[1].includes('Jibril came to him'));
 assert.deepEqual(ref.contextNotes[0].citations,['base','brill-1862','dar-ibn-kathir-2002']);assert.match(ref.contextNotes[0].text,/Both printed comparisons say “a man”/);assert.match(files.get('reader/faith-review.html'),/visitor’s arrival/);
});

test('chapter source availability is exact and has its own admission without changing hadith wording',()=>{
 const {source,ledger,files}=collectionFiles(),inventory=input()[0];
 assert.equal(ledger.sourceRecordSha256,'d2c67f16c4e4f2701e3e591b1ea58a06101b1f4e64eab060afd8bd9b91651243');
 for(const chapter of ledger.books[1].chapters){const original=inventory.chapters.find(c=>c.id===chapter.id);assert.equal(chapter.sourceContext.introduction.arabicParagraphs,original.contextIds.length);assert.equal(chapter.sourceContext.introduction.englishStatus,original.contextIds.length?'pending':'not-applicable');assert.equal(chapter.sourceContext.notes.fragment,chapter.id);assert.equal((files.get('reader/faith-review.html').match(new RegExp('id="'+chapter.id+'"','g'))||[]).length,1);}
 assert.equal(ledger.books[1].chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,14);
 assert.equal(ledger.books[1].chapters[19].sourceContext.headingStatus,'heading-discrepancy-pending');
 const old=read('content/review/prototype-admissions.json').admissions.filter(a=>a.sourceRecordSha256===ledger.sourceRecordSha256);assert.equal(old.length,2);assert.notDeepEqual(old[0].books,old[1].books);assert.equal(old[1].catalogContextSha256,ledger.catalogContextSha256);
 assert.equal(buildBooks(source,ledger).catalog.entries.length,58);
 const bad=structuredClone(ledger);bad.books[1].chapters[0].sourceContext.introduction.arabicParagraphs=3;bad.catalogContextSha256=objectHash(bad.books);assert.throws(()=>buildBooks(source,bad),/not admitted/);
});
