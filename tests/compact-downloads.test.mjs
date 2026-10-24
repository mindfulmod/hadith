import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {createOfflineStore,readerCacheName} from '../reader/offline-store.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=read('research/bukhari-personal-collection.json'),ledger=read('content/review/personal-collection-ledger.json');
const base='https://example.com/reader/';
function fixture(pretty=false){
 const result=buildBooks(source,ledger),responses=new Map(),catalog=structuredClone(result.catalog);
 for(const descriptor of catalog.books){const pack=JSON.parse(result.files.get(descriptor.path)),body=pretty?JSON.stringify(pack,null,2)+'\n':result.files.get(descriptor.path),sha256=digest(body),path=`books/${descriptor.id}-${sha256.slice(0,16)}.json`;Object.assign(descriptor,{path,sha256,bytes:Buffer.byteLength(body)});responses.set(path,body);
  for(const row of pack.sourceReferences.entries)responses.set(row.localNotes.path,'Unchanged source-note test fixture');
  for(const chapter of pack.book.chapters||[])if(chapter.sourceContext)responses.set(chapter.sourceContext.notes.path,'Unchanged source-note test fixture');
  if(pack.book.introduction)responses.set(pack.book.introduction.notes.path,'Unchanged source-note test fixture');
 }
 responses.set('books/catalog.json',JSON.stringify(catalog,null,pretty?2:undefined)+'\n');
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const release={id:'opening-'+objectHash(files).slice(0,12),files,packs:[{id:'reading',kind:'reading',title:'Reading',requires:[],files:files.map(f=>f.path),bytes:files.reduce((n,f)=>n+f.bytes,0)}]};
 return {catalog,responses,release};
}
class MemoryCaches{
 constructor(){this.maps=new Map();}async keys(){return [...this.maps.keys()];}async open(name){if(!this.maps.has(name))this.maps.set(name,new Map());const values=this.maps.get(name);return {match:async url=>values.get(String(url))?.clone(),put:async(url,response)=>{values.set(String(url),response.clone());},delete:async url=>values.delete(String(url))};}async delete(name){return this.maps.delete(name);}
}
async function load(f,fetcher){return createContentLibrary({files:f.release.files,base:new URL(base),fetcher});}
test('compact and indented downloads reconstruct identical complete source, references and chapter context',async()=>{
 const old=fixture(true),compact=fixture(),libraries=[];
 for(const f of [old,compact]){const library=await load(f,async url=>new Response(f.responses.get(url.pathname.slice('/reader/'.length))));assert.deepEqual(await library.loadAllEntries(),source.entries);assert.deepEqual({...library.catalog.sourceRecord,entries:await library.loadAllEntries()},source);libraries.push(library);}
 for(const b of compact.catalog.books){const before=await libraries[0].loadBook(b.id),after=await libraries[1].loadBook(b.id);assert.deepEqual(after,before);}
 assert(compact.release.packs[0].bytes<old.release.packs[0].bytes*0.85,'Book downloads should retain the measured whitespace saving');
 const publicSource=read('reader/source-record.json');assert.deepEqual(publicSource,source);
});
test('an interrupted formatting upgrade leaves the old offline collection usable and retries to exact complete text',async()=>{
 const old=fixture(true),compact=fixture(),cacheStorage=new MemoryCaches(),requests=[];let broken=true;
 const oldStore=createOfflineStore({release:old.release,base,cacheStorage,fetcher:async url=>new Response(old.responses.get(url.slice(base.length)))});await oldStore.run('save','reading');
 const failedPath=compact.catalog.books.at(-1).path;
 const store=createOfflineStore({release:compact.release,base,cacheStorage,fetcher:async url=>{const path=url.slice(base.length);requests.push(path);const body=compact.responses.get(path);return new Response(broken&&path===failedPath?body.slice(0,-2):body);}});
 await assert.rejects(store.run('save','reading'),e=>e.code==='integrity');assert(!(await store.inspect()).packs[0].ready);assert((await oldStore.inspect()).packs[0].ready);
 const oldCache=await cacheStorage.open(readerCacheName(old.release)),oldLibrary=await load(old,url=>oldCache.match(url.href));assert.deepEqual(await oldLibrary.loadAllEntries(),source.entries);
 const firstRequests=requests.slice();broken=false;assert((await store.run('save','reading')).packs[0].ready);
 assert.deepEqual(requests.slice(firstRequests.length).sort(),[failedPath,'books/catalog.json'].sort());
 assert(firstRequests.every(path=>path.endsWith('.json')),'Unchanged source notes should be verified and reused');
 const cache=await cacheStorage.open(readerCacheName(compact.release)),library=await load(compact,url=>cache.match(url.href));assert.deepEqual(await library.loadAllEntries(),source.entries);
 for(const [path,body]of old.responses)assert.equal(await(await oldCache.match(base+path)).text(),body,'Previous release must remain intact');
});
