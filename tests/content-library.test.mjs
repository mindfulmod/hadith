import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {planSession} from '../reader/session.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const source=read('research/bukhari-opening-review.json'),ledger=read('content/review/opening-ledger.json');
function fixture(){
 const result=buildBooks(source,ledger),responses=new Map(result.files),files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const calls=[];let failure=null;
 const fetcher=async url=>{const path=new URL(url).pathname.slice('/reader/'.length);calls.push(path);if(failure&&path!== 'books/catalog.json')return failure();return new Response(responses.get(path),{status:responses.has(path)?200:404});};
 return {result,responses,files,calls,fetcher,fail:fn=>{failure=fn;}};
}
const setup=f=>createContentLibrary({files:f.files,base:new URL('https://example.com/reader/'),fetcher:f.fetcher});
test('book publisher preserves every source field and produces identical output each time',()=>{
 const one=buildBooks(source,ledger),two=buildBooks(source,ledger);
 assert.deepEqual(one,two);
 const pack=JSON.parse(one.files.get(one.catalog.books[0].path));
 assert.deepEqual({...pack.sourceRecord,entries:pack.entries},source);
 assert.deepEqual(planSession(one.catalog.entries,1,5),planSession(source.entries,1,5));
});
test('publication rejects changed wording, missing chains, duplicate identities and wrong book order',()=>{
 for(const change of [s=>s.entries[0].english_blocks[1]+=' changed',s=>s.entries[0].arabic_blocks.shift(),s=>s.entries[1].id=s.entries[0].id]){
  const copy=structuredClone(source);change(copy);assert.throws(()=>buildBooks(copy,ledger));
 }
 const order=structuredClone(ledger);order.books[0].entryNumbers=[2,1];assert.throws(()=>buildBooks(source,order));
 const expanded=structuredClone(source);expanded.entries.push({...source.entries[1],number:3,id:'bukhari:3'});const review=structuredClone(ledger);review.sourceRecordSha256=objectHash(expanded);review.entries.push({...review.entries[1],number:3,id:'bukhari:3'});assert.throws(()=>buildBooks(expanded,review));
});
test('the current prototype is refused as production and cannot promote itself by changing one flag',()=>{
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text/);
 const copy=structuredClone(ledger);copy.publication='production';assert.throws(()=>buildBooks(source,copy),/Reuse rights/);
});
test('production checks require human sign-off bound to exact text, context and rights hashes',()=>{
 // Synthetic fixture only; no approvals are written to the real ledger.
 const copy=structuredClone(ledger);copy.publication='production';
 const approved=sha256=>({status:'approved',reviewerKind:'human',reviewer:'TEST FIXTURE ONLY',reviewedAt:'2026-10-18',sha256,evidence:['test fixture']});
 copy.rights=approved(copy.sourceRecordSha256);copy.collectionReview=approved(copy.catalogContextSha256);
 for(const e of copy.entries){e.status='approved';e.unresolvedDiscrepancies=[];e.arabicReview=approved(e.arabicSha256);e.englishReview=approved(e.englishSha256);e.contextReview=approved(e.entrySha256);}
 assert.equal(buildBooks(source,copy,{production:true}).catalog.publication,'production');
 for(const change of [r=>r.entries[0].englishReview.sha256='old',r=>r.entries[0].contextReview.reviewerKind='ai',r=>r.entries[0].unresolvedDiscrepancies.push('unresolved'),r=>r.rights.evidence=[],r=>r.books[0].title='Changed context']){
  const bad=structuredClone(copy);change(bad);assert.throws(()=>buildBooks(source,bad,{production:true}));
 }
});
test('startup loads metadata only; concurrent reading and search share one immutable book download',async()=>{
 const f=fixture(),library=await setup(f);assert.deepEqual(f.calls,['books/catalog.json']);assert.equal(library.getEntry(1),undefined);
 const [one,two]=await Promise.all([library.loadForNumber(1),library.loadForNumber(2)]);
 assert.strictEqual(one,two);assert.equal(f.calls.length,2);
 assert.deepEqual(await library.loadAllEntries(),source.entries);assert.equal(f.calls.length,2);
 assert.throws(()=>{one.entries[0].english_blocks[0]='changed';},TypeError);
 await assert.rejects(library.loadForNumber(999));
});
test('corrupt, partial and failed book downloads never become available; an explicit retry recovers',async()=>{
 for(const failure of [()=>new Response('broken'),()=>new Response('partial',{status:206}),()=>{throw new Error('offline');}]){
  const f=fixture(),library=await setup(f);f.fail(failure);
  await assert.rejects(library.loadForNumber(1));assert.equal(library.getEntry(1),undefined);await assert.rejects(library.loadAllEntries());
  f.fail(null);assert.deepEqual((await library.loadForNumber(1)).entries,source.entries);
 }
});
test('a changed or incompatible catalog is rejected before text is requested',async()=>{
 const f=fixture();f.responses.set('books/catalog.json',f.responses.get('books/catalog.json').replace('bukhari-opening-v1','wrong-namespace'));
 await assert.rejects(setup(f));assert.equal(f.calls.length,1);
 const g=fixture();const catalog=JSON.parse(g.responses.get('books/catalog.json'));catalog.namespace='different-edition';const body=JSON.stringify(catalog);g.responses.set('books/catalog.json',body);Object.assign(g.files.find(f=>f.path==='books/catalog.json'),{bytes:Buffer.byteLength(body),sha256:digest(body)});await assert.rejects(setup(g),/Unsupported collection/);
});
test('book packs from another release are not fetched even if the catalog names them',async()=>{
 const f=fixture();f.files=f.files.filter(f=>f.path==='books/catalog.json');const library=await setup(f);
 await assert.rejects(library.loadForNumber(1),/does not belong/);assert.equal(f.calls.length,1);
});
test('a multi-book search refuses partial results and retries only the missing book',async()=>{
 // Synthetic split verifies loading behavior, not an assertion about Bukhari book divisions.
 const original=buildBooks(source,ledger),basePack=JSON.parse(original.files.get(original.catalog.books[0].path));
 const catalog={...original.catalog,books:[],entries:[]},responses=new Map(),calls=[];let unavailable=true;
 for(const [index,entry] of source.entries.entries()){
  const id=`fixture-${index+1}`,pack={...basePack,book:{id,number:index+1,title:'Test fixture'},entries:[entry]},body=JSON.stringify(pack),sha256=digest(body),path=`books/${id}-${sha256.slice(0,16)}.json`;
  responses.set(path,body);catalog.books.push({...pack.book,entryNumbers:[entry.number],bytes:Buffer.byteLength(body),sha256,path});catalog.entries.push({...original.catalog.entries[index],bookId:id});
 }
 responses.set('books/catalog.json',JSON.stringify(catalog));
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const fetcher=async url=>{const path=url.pathname.slice('/reader/'.length);calls.push(path);return new Response(responses.get(path),{status:unavailable&&path===catalog.books[1].path?503:200});};
 const library=await createContentLibrary({files,fetcher,base:new URL('https://example.com/reader/')});
 await library.loadForNumber(1);assert.equal(library.getEntry(2),undefined);await assert.rejects(library.loadAllEntries());assert.equal(library.getEntry(2),undefined);
 unavailable=false;assert.deepEqual(await library.loadAllEntries(),source.entries);assert.equal(calls.filter(p=>p===catalog.books[0].path).length,1);assert.equal(calls.filter(p=>p===catalog.books[1].path).length,2);
});
test('a stalled index request is aborted rather than leaving startup pending indefinitely',async()=>{
 const f=fixture();
 await assert.rejects(createContentLibrary({files:f.files,timeoutMs:5,fetcher:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Timed out')),{once:true}))}),/Timed out/);
});
