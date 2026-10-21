import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOfflineStore,readerCacheName,verifiedCopy,validatePacks,releaseModuleSource,olderReaderCaches} from '../reader/offline-store.mjs';
import {offlinePanel,offlineError} from '../reader/offline-view.mjs';
import {release as published} from '../reader/release.mjs';
const base='https://example.com/hadith/reader/',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const contents={'index.html':'reader shell','book.json':'complete unchanged text','audio.m4a':'complete continuous recording','take.mp3':'voice comparison'};
function fixture(){
 const files=Object.entries(contents).map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:hash(body),core:path==='index.html',audio:/\.(m4a|mp3)$/.test(path)}));
 const packs=[{id:'reading',kind:'reading',title:'Reading',requires:[],files:['index.html','book.json']},{id:'audio',kind:'audio',title:'Cedar',requires:['reading'],files:['audio.m4a']},{id:'review',kind:'review',title:'Review',requires:['reading'],files:['take.mp3']}].map(p=>({...p,description:'Complete files',bytes:p.files.reduce((sum,path)=>sum+files.find(f=>f.path===path).bytes,0)}));
 return {id:'opening-123456789abc',files,packs};
}
class MemoryCaches{
 constructor(){this.maps=new Map();this.putHook=null;this.removed=[];}
 async keys(){return [...this.maps.keys()];}
 async open(name){if(!this.maps.has(name))this.maps.set(name,new Map());const entries=this.maps.get(name),outer=this;return {
  async match(url){return entries.get(String(url))?.clone();},
  async put(url,response){outer.putHook?.(name,String(url));entries.set(String(url),response.clone());},
  async delete(url){return entries.delete(String(url));}
 };}
 async delete(name){this.removed.push(name);return this.maps.delete(name);}
}
function setup(options={}){
 const release=fixture(),cacheStorage=new MemoryCaches(),requests=[];
 const fetcher=async(url)=>{requests.push(url);const path=url.slice(base.length);assert(Object.hasOwn(contents,path),'Unexpected fetch '+path);return new Response(contents[path]);};
 const store=createOfflineStore({release,base,cacheStorage,fetcher,...options});
 return {release,cacheStorage,requests,store};
}
const status=(state,id)=>state.packs.find(p=>p.id===id);
test('saving reading keeps every text file and no recordings; readiness includes exact release metadata',async()=>{
 const {store,requests,cacheStorage,release}=setup();
 const saved=await store.run('save','reading');assert(status(saved,'reading').ready);assert(!status(saved,'audio').ready);assert(!status(saved,'review').ready);
 assert.deepEqual(requests.map(u=>u.slice(base.length)),['index.html','book.json']);
 const cache=await cacheStorage.open(readerCacheName(release));
 assert.equal(await (await cache.match(base+'book.json')).text(),contents['book.json']);
 await cache.delete(base+'release.mjs');assert(!status(await store.inspect(),'reading').ready);
 await store.run('save','reading');assert.equal(requests.length,2);assert(status(await store.inspect(),'reading').ready);
});
test('saving a selected audio pack also saves reading but leaves other recordings optional',async()=>{
 const {store,requests}=setup();const state=await store.run('save','audio');
 assert(status(state,'reading').ready);assert(status(state,'audio').ready);assert(!status(state,'review').ready);
 assert(!requests.includes(base+'take.mp3'));
 await store.run('save','audio');assert.equal(requests.length,3,'verified existing files must be reused');
});
test('partial, altered, oversized and failed transfers never become saved audio',async()=>{
 for(const kind of ['partial','altered','oversized','network']){
  const {store,cacheStorage,release}=setup({fetcher:async url=>{
   const path=url.slice(base.length);if(path!=='audio.m4a')return new Response(contents[path]);
   if(kind==='network')throw new TypeError('connection interrupted');
   if(kind==='partial')return new Response(contents[path],{status:206});
   return new Response(kind==='altered'?'x'.repeat(contents[path].length):contents[path]+'extra');
  }});
  await assert.rejects(store.run('save','audio'),error=>error.code===(kind==='partial'||kind==='network'?'download':'integrity'));
  const state=await store.inspect();assert(!status(state,'audio').ready);
  assert.equal(await (await cacheStorage.open(readerCacheName(release))).match(base+'audio.m4a'),undefined);
 }
});
test('an interrupted save reuses complete files on retry and serializes simultaneous mutations',async()=>{
 let store,stop=true;
 const value=setup({notify:state=>{if(stop&&state.operation?.doneFiles===1){stop=false;store.cancel();}}});store=value.store;
 const first=store.run('save','audio');
 await assert.rejects(store.run('remove','audio'),error=>error.code==='busy');
 await assert.rejects(first,error=>error.code==='cancelled');
 assert.equal(value.requests.length,1);
 const resumed=await store.run('save','audio');assert(status(resumed,'audio').ready);
 assert.equal(value.requests.filter(u=>u===base+'index.html').length,1);
});
test('cancellation aborts an in-flight response and a stalled network times out',async()=>{
 for(const cancel of [true,false]){
  let started,signal;const ready=new Promise(resolve=>started=resolve);
  const {store}=setup({idleTimeout:15,fetcher:(_url,options)=>new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});started();})});
  const pending=store.run('save','reading');await ready;if(cancel)store.cancel();
  await assert.rejects(pending,error=>error.code===(cancel?'cancelled':'timeout'));assert(signal.aborted);assert(!store.busy);
 }
});
test('storage-full failures leave checked files reusable and never claim complete audio',async()=>{
 const {store,cacheStorage}=setup();let fail=true;
 cacheStorage.putHook=(_name,url)=>{if(fail&&url.endsWith('audio.m4a'))throw new DOMException('Full','QuotaExceededError');};
 await assert.rejects(store.run('save','audio'),error=>error.code==='quota');assert(!status(await store.inspect(),'audio').ready);
 fail=false;assert(status(await store.run('save','audio'),'audio').ready);
});
test('check downloads detects evicted and corrupted cached bytes, then save repairs only those files',async()=>{
 const {store,cacheStorage,release,requests}=setup();await store.run('save','audio');
 const cache=await cacheStorage.open(readerCacheName(release)),file=release.files.find(f=>f.path==='audio.m4a');
 await cache.put(base+file.path,verifiedCopy(new Response('x'.repeat(file.bytes)),file));
 const checked=await store.run('check');assert(!status(checked,'audio').ready);assert.equal(await cache.match(base+file.path),undefined);
 await store.run('save','audio');assert.equal(requests.filter(u=>u===base+'audio.m4a').length,2);assert.equal(requests.filter(u=>u===base+'book.json').length,1);
 await cache.delete(base+'book.json');const missing=await store.inspect();assert(!status(missing,'reading').ready);assert(!status(missing,'audio').ready);
});
test('old downloads are reused only after exact-byte checks; cleanup preserves current, pilot and other-library caches',async()=>{
 const {store,cacheStorage,release,requests}=setup(),old='hadith-reader-opening-abcdef123456';
 const cache=await cacheStorage.open(old);for(const [path,text] of Object.entries(contents))await cache.put(base+path,new Response(path==='book.json'?'wrong book':text));
 for(const name of ['hadith-cedar-v2','mindful-books-cache','hadith-reader-other-project'])await cacheStorage.open(name);
 await store.run('save','audio');assert.deepEqual(requests,[base+'book.json']);
 assert.equal((await store.inspect()).oldVersions,1);await store.run('cleanup');
 assert.deepEqual(cacheStorage.removed,[old]);assert((await cacheStorage.keys()).includes(readerCacheName(release)));assert((await cacheStorage.keys()).includes('mindful-books-cache'));
 assert(status(await store.inspect(),'audio').ready);
 assert.deepEqual(olderReaderCaches(['hadith-reader-opening-123456789abc','hadith-reader-opening-abcdef123456','hadith-reader-other-project'],readerCacheName(release)),[old]);
});
test('removing one audio pack preserves reading, other audio and protected metadata',async()=>{
 const {store,cacheStorage,release}=setup();await store.run('save','audio');await store.run('save','review');
 const state=await store.run('remove','audio');assert(status(state,'reading').ready);assert(status(state,'review').ready);assert(!status(state,'audio').ready);
 await assert.rejects(store.run('remove','reading'),error=>error.code==='protected-reading');
 const cache=await cacheStorage.open(readerCacheName(release));assert.equal(await (await cache.match(base+'release.mjs')).text(),releaseModuleSource(release));
});
test('pack manifests reject missing files, duplicated ownership, wrong sizes and dependency cycles',()=>{
 validatePacks(published);
 for(const mutate of [r=>r.packs[0].files.push('missing'),r=>r.packs[1].files.push('book.json'),r=>r.packs[0].bytes++,r=>r.packs[0].requires.push('audio'),r=>r.packs[1].requires.push('missing')]){
  const r=fixture();mutate(r);assert.throws(()=>validatePacks(r),error=>error.code==='manifest');
 }
 const html=offlinePanel(published);assert(html.includes('Save reading'));assert(html.includes('Save audio'));assert(html.includes('More download options'));assert(html.includes('Check downloads'));
 assert(offlineError('playing').includes('Pause'));assert(offlineError('quota').includes('Remove'));
 assert(published.packs.find(p=>p.kind==='audio').files.every(p=>/\.(m4a|mp3)$/.test(p)));
});

test('a receipt-write failure during a deep check never deletes intact source bytes',async()=>{
 const {store,cacheStorage,release}=setup();await store.run('save','reading');
 const cache=await cacheStorage.open(readerCacheName(release));
 await cache.put(base+'book.json',new Response(contents['book.json']));
 cacheStorage.putHook=(_name,url)=>{if(url.endsWith('book.json'))throw new DOMException('Full','QuotaExceededError');};
 await assert.rejects(store.run('check'),error=>error.code==='quota');
 assert.equal(await (await cache.match(base+'book.json')).text(),contents['book.json']);
 assert(!status(await store.inspect(),'reading').ready);
 cacheStorage.putHook=null;assert(status(await store.run('check'),'reading').ready);
});
