import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {validateSourceReferences} from '../reader/source-references.mjs';
import {createOfflineStore,readerCacheName} from '../reader/offline-store.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
function snapshots(){
 const source=read('reader/source-record.json'),ledger=read('content/review/personal-collection-ledger.json');
 const names=['opening-revelation-5e0fa92072afc757','faith-9b3863a16f3114b6','knowledge-dcfdc4c22041885b','ablution-1c3632f8d20804db'];
 const oldPacks=names.map(p=>read('reader/books/'+p+'.json'));
 const oldSource=Object.fromEntries(Object.keys(source).map(k=>[k,k==='entries'?oldPacks.flatMap(p=>p.entries):oldPacks[0].sourceRecord[k]]));
 const admission=read('content/review/prototype-admissions.json').admissions.find(a=>a.sourceRecordSha256===objectHash(oldSource));assert(admission,'Historical fixture must be an exact admitted source version');
 const oldLedger=structuredClone(ledger);oldLedger.sourceRecordSha256=objectHash(oldSource);oldLedger.books=admission.books;oldLedger.catalogContextSha256=objectHash(admission.books);oldLedger.entries=oldLedger.entries.filter(e=>e.number<=167);
 const cited=new Set(oldPacks.flatMap(p=>p.sourceReferences.sources.map(s=>s.id)));
 oldLedger.sourceReferences={...oldLedger.sourceReferences,sourceRecordSha256:objectHash(oldSource),entries:oldPacks.flatMap(p=>p.sourceReferences.entries),sources:oldLedger.sourceReferences.sources.filter(s=>cited.has(s.id))};oldLedger.referencesSha256=objectHash(oldLedger.sourceReferences);
 return {source,ledger,oldSource,before:buildBooks(oldSource,oldLedger),after:buildBooks(source,ledger)};
}
const snapshot=snapshots();
function responsesFor(result){
 const responses=new Map(result.files);
 for(const descriptor of result.catalog.books){const pack=JSON.parse(result.files.get(descriptor.path));for(const row of pack.sourceReferences.entries)responses.set(row.localNotes.path,'Local comparison notes fixture');for(const c of pack.book.chapters||[])if(c.sourceContext)responses.set(c.sourceContext.notes.path,'Local chapter notes fixture');}
 return responses;
}
async function libraryFor(result){
 const responses=responsesFor(result),files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)})),calls=[];
 const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async url=>{const path=url.pathname.slice('/reader/'.length);calls.push(path);return new Response(responses.get(path),{status:responses.has(path)?200:404});}});
 return {library,calls};
}
function mutateBook(change){
 const result=structuredClone(snapshot.after),descriptor=result.catalog.books[0],oldPath=descriptor.path,pack=JSON.parse(result.files.get(oldPath));change(pack);const body=JSON.stringify(pack),sha256=digest(body),path=`books/${descriptor.id}-${sha256.slice(0,16)}.json`;result.files.delete(oldPath);result.files.set(path,body);Object.assign(descriptor,{path,sha256,bytes:Buffer.byteLength(body)});result.files.set('books/catalog.json',JSON.stringify(result.catalog));return result;
}
test('real 167-to-180 expansion changes only the book whose contents or citations changed',()=>{
 const {before,after,source}=snapshot;assert.equal(before.catalog.schemaVersion,2);assert.equal(after.catalog.schemaVersion,2);
 assert.deepEqual(after.catalog.books.filter((b,i)=>b.path!==before.catalog.books[i].path).map(b=>b.id),['ablution']);
 for(const id of ['opening-revelation','faith','knowledge']){const a=before.catalog.books.find(b=>b.id===id),b=after.catalog.books.find(b=>b.id===id);assert.equal(before.files.get(a.path),after.files.get(b.path));}
 assert.notEqual(before.files.get('books/catalog.json'),after.files.get('books/catalog.json'));
 const packs=after.catalog.books.map(b=>JSON.parse(after.files.get(b.path)));assert.deepEqual({...after.catalog.sourceRecord,entries:packs.flatMap(p=>p.entries)},source);assert(packs.every(p=>!Object.hasOwn(p,'sourceRecord')));
 for(const p of packs){assert.equal(p.sourceReferences.entriesSha256,objectHash(p.entries));assert.equal(p.sourceReferences.sourceRecordSha256,undefined);}
});
test('the reader attaches the exact current collection source trail without another download',async()=>{
 const {library,calls}=await libraryFor(snapshot.after);assert.deepEqual(calls,['books/catalog.json']);
 for(const b of library.catalog.books){const p=await library.loadBook(b.id);assert.strictEqual(p.sourceRecord,library.catalog.sourceRecord);assert.deepEqual(p.sourceRecord,snapshot.after.catalog.sourceRecord);}
 assert.deepEqual(await library.loadAllEntries(),snapshot.source.entries);assert.equal(calls.length,5);assert.throws(()=>{library.catalog.sourceRecord.license.attribution='changed';},TypeError);
});
test('book-local reference hashes and each cited entry reject stale text even with a new file checksum',async()=>{
 for(const [mutate,message]of [
  [p=>p.entries[0].english_blocks[0]='X'+p.entries[0].english_blocks[0].slice(1),/another book text version/],
  [p=>p.sourceReferences.entriesSha256='0'.repeat(64),/another book text version/],
  [p=>p.sourceReferences.entries[0].entrySha256='0'.repeat(64),/Reference entry hash mismatch/],
  [p=>p.sourceReferences.sourceRecordSha256=snapshot.after.catalog.sourceRecordSha256,/another book text version/],
  [p=>p.sourceRecord={license:{url:'https://example.com/conflicting'}},/conflicting collection metadata/],
  [p=>p.sourceReferences.schemaVersion=1,/incompatible source references/]
 ]){const {library}=await libraryFor(mutateBook(mutate));await assert.rejects(library.loadForNumber(1),message);assert.equal(library.getEntry(1),undefined);}
});
test('missing or invalid shared source metadata prevents startup',async()=>{
 for(const mutate of [c=>delete c.sourceRecord,c=>c.sourceRecord.entries=[],c=>c.sourceRecord.license.url='javascript:alert(1)',c=>c.sourceRecordSha256='stale']){
  const result=structuredClone(snapshot.after);mutate(result.catalog);result.files.set('books/catalog.json',JSON.stringify(result.catalog));await assert.rejects(libraryFor(result));
 }
});
test('legacy version-one catalogs and book files remain readable with their original binding',async()=>{
 const result=structuredClone(snapshot.after),metadata=result.catalog.sourceRecord;result.catalog.schemaVersion=1;delete result.catalog.sourceRecord;
 for(const descriptor of result.catalog.books){const oldPath=descriptor.path,p=JSON.parse(result.files.get(oldPath));p.schemaVersion=1;p.sourceRecord=metadata;p.sourceReferences={schemaVersion:1,sourceRecordSha256:result.catalog.sourceRecordSha256,sources:p.sourceReferences.sources,entries:p.sourceReferences.entries};const body=JSON.stringify(p),sha256=digest(body),path=`books/${descriptor.id}-${sha256.slice(0,16)}.json`;result.files.delete(oldPath);result.files.set(path,body);Object.assign(descriptor,{path,sha256,bytes:Buffer.byteLength(body)});}
 result.files.set('books/catalog.json',JSON.stringify(result.catalog));const {library}=await libraryFor(result);assert.deepEqual(await library.loadAllEntries(),snapshot.source.entries);
 const refs=JSON.parse(result.files.get(result.catalog.books[0].path)).sourceReferences;refs.entriesSha256=objectHash(snapshot.source.entries.slice(0,7));assert.throws(()=>validateSourceReferences(refs,snapshot.source.entries.slice(0,7),{sourceRecordSha256:result.catalog.sourceRecordSha256}));
});
class MemoryCaches{
 constructor(){this.maps=new Map();}async keys(){return [...this.maps.keys()];}async open(name){if(!this.maps.has(name))this.maps.set(name,new Map());const values=this.maps.get(name);return {match:async url=>values.get(String(url))?.clone(),put:async(url,response)=>{values.set(String(url),response.clone());},delete:async url=>values.delete(String(url))};}async delete(name){return this.maps.delete(name);}
}
function releaseFor(result){const files=[...result.files].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));return {id:'opening-'+objectHash(files).slice(0,12),files,packs:[{id:'reading',kind:'reading',title:'Reading test',requires:[],files:files.map(f=>f.path),bytes:files.reduce((s,f)=>s+f.bytes,0)}]};}
test('offline upgrades transfer only the changed book and catalog, rechecking reused bytes',async()=>{
 for(const corrupt of [false,true]){
  const cacheStorage=new MemoryCaches(),base='https://example.com/reader/',oldRelease=releaseFor(snapshot.before),newRelease=releaseFor(snapshot.after),requests=[];
  const oldStore=createOfflineStore({release:oldRelease,base,cacheStorage,fetcher:async url=>new Response(snapshot.before.files.get(url.slice(base.length)))});await oldStore.run('save','reading');
  const first=snapshot.before.catalog.books[0].path;if(corrupt)await(await cacheStorage.open(readerCacheName(oldRelease))).put(base+first,new Response('wrong text'));
  const store=createOfflineStore({release:newRelease,base,cacheStorage,fetcher:async url=>{const path=url.slice(base.length);requests.push(path);return new Response(snapshot.after.files.get(path));}});
  const state=await store.run('save','reading');assert(state.packs[0].ready);
  assert.deepEqual(requests.sort(),['books/catalog.json',snapshot.after.catalog.books.find(b=>b.id==='ablution').path,...(corrupt?[first]:[])].sort());
  const cache=await cacheStorage.open(readerCacheName(newRelease));for(const [path,body]of snapshot.after.files)assert.equal(await(await cache.match(base+path)).text(),body);
 }
});
test('packing changes cannot supply human approval or bypass the exact source ledger',()=>{
 assert.throws(()=>buildBooks(snapshot.source,snapshot.ledger,{production:true}),/Evaluation text/);
 const stale=structuredClone(snapshot.ledger);stale.sourceRecordSha256='0'.repeat(64);assert.throws(()=>buildBooks(snapshot.source,stale),/Source metadata or text changed/);
 const staleRefs=structuredClone(snapshot.ledger);staleRefs.sourceReferences.entries[0].citations[0].locator='changed';assert.throws(()=>buildBooks(snapshot.source,staleRefs),/references changed since review/);
});
