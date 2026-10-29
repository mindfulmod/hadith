import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{createSearchIndex,createLibrarySearch,searchEntries}from'../reader/search.mjs';
import{createSearchClient}from'../reader/search-client.mjs';import{createWorkerSearchHandler}from'../reader/search-worker.mjs';
import{createContentLibrary}from'../reader/content-library.mjs';import{release}from'../reader/release.mjs';
const yieldFast=()=>Promise.resolve(),hash='a'.repeat(64),version='search-test-release';
const makeEntries=(count=95)=>Array.from({length:count},(_,i)=>({id:'fixture:'+i,number:i+1,book:'Fixture',english_blocks:['Chain '+i,'A shared phrase.'],arabic_blocks:['نص مستقل '+i]}));
function fixture(entries=makeEntries()){
 const catalog={sourceRecordSha256:hash,books:[{id:'one'},{id:'two'}],entries:entries.map(e=>({id:e.id,number:e.number,book:e.book}))};let fail=false,loads=0;
 const library={catalog,async loadBook(id){loads++;if(fail===true||typeof fail==='function'&&fail(id))throw new Error('Unavailable');const split=Math.ceil(entries.length/2);return {entries:id==='one'?entries.slice(0,split):entries.slice(split)};},getEntry:n=>entries.find(e=>e.number===n)};
 return {catalog,library,loadLibrary:async()=>library,setFail:v=>{fail=v;},loads:()=>loads};
}
function fakeWorker(){return {messages:[],terminated:false,postMessage(message){this.messages.push(message);},terminate(){this.terminated=true;},emit(data){this.onmessage?.({data});}};}
function response(request,result){return {...request,type:'result',result};}
const thin=result=>({...result,results:result.results.map(({entry,...row})=>({entry:{id:entry.id,number:entry.number,book:entry.book},...row}))});
function client(f,worker,options={}){return createSearchClient({catalog:f.catalog,releaseId:version,loadLibrary:f.loadLibrary,workerFactory:()=>worker,yieldTask:yieldFast,...options});}
const tick=()=>new Promise(r=>setImmediate(r));
test('indexed search preserves original Unicode, paragraph boundaries, language precedence and printed provenance',async()=>{
 const entries=[{id:'x',number:1,book:'Fixture',english_blocks:['Narrator\u00a0 said: Café’s words.','Next paragraph'],arabic_blocks:['عربي أصلي'],presentation:{english:[{block:0,provenance:{kind:'printed-supplement'}}]}}],before=JSON.stringify(entries),index=await createSearchIndex(entries,{yieldTask:yieldFast});
 for(const query of ["cafe\u0301's words",'narrator said','words. Next','عربي','Hadith 1','#1','""','missing'])assert.deepEqual(await index.search(query),thin(searchEntries(entries,query)));
 const result=await index.search("cafe\u0301's words");assert.equal(result.results[0].text,entries[0].english_blocks[0]);assert.equal(result.results[0].sourceOrigin,'printed-supplement');assert.equal(JSON.stringify(entries),before);
});
test('indexed search matches current bilingual source checks and complete pagination',async()=>{
 const entries=JSON.parse(readFileSync(new URL('../reader/source-record.json',import.meta.url))).entries,index=await createSearchIndex(entries,{yieldTask:yieldFast});
 for(const query of ['Allah','prayer','"Yatafayya’u"','[١٦٢]','يونس','514','Sahih al-Bukhari 1',"‘Umar",'not-in-this-text'])for(const offset of [0,30,90])assert.deepEqual(await index.search(query,30,offset),thin(searchEntries(entries,query,30,offset)));
 const sample=makeEntries(),small=await createSearchIndex(sample,{yieldTask:yieldFast}),numbers=[];for(let offset=0;offset<95;offset+=30){const r=await small.search('shared phrase',30,offset);assert.equal(r.total,95);numbers.push(...r.results.map(x=>x.entry.number));}assert.deepEqual(numbers,sample.map(e=>e.number));
});
test('fallback indexing yields, reuses a completed query for pagination and cancels obsolete scans',async()=>{
 let yields=0,current=true;const index=await createSearchIndex(makeEntries(),{batchSize:10,yieldTask:async()=>{yields++;}});assert(yields>=9);
 const result=await index.search('shared');assert.equal(result.total,95);const before=yields;await index.search('shared',30,30);assert.equal(yields,before);
 const cancelled=await createSearchIndex(makeEntries(),{batchSize:10,yieldTask:async()=>{if(yields++>before+12)current=false;}});current=true;await assert.rejects(cancelled.search('Chain',30,0,{isCurrent:()=>current}),{name:'AbortError'});
});
test('a failed book never yields partial search and can retry; wrong source version is refused',async()=>{
 const f=fixture(),engine=createLibrarySearch({...f,sourceRecordSha256:hash,yieldTask:yieldFast});f.setFail(id=>id==='two');await assert.rejects(engine.search('shared'));assert.equal(f.loads(),2);f.setFail(false);assert.equal((await engine.search('shared')).total,95);const loads=f.loads();await engine.search('Chain');assert.equal(f.loads(),loads);
 await assert.rejects(createLibrarySearch({...f,sourceRecordSha256:'b'.repeat(64),yieldTask:yieldFast}).search('shared'),/version/);
});
test('the worker loads and verifies actual release files before returning exact source snippets',async()=>{
 const root=new URL('../reader/',import.meta.url),catalog=JSON.parse(readFileSync(new URL('books/catalog.json',root))),messages=[];
 const handle=createWorkerSearchHandler({releaseId:release.id,loadLibrary:()=>createContentLibrary({files:release.files,base:root,fetcher:async url=>new Response(readFileSync(url))}),post:m=>messages.push(m)});
 await handle({protocol:1,type:'search',id:1,releaseId:release.id,sourceRecordSha256:catalog.sourceRecordSha256,query:'Yatafayya’u',limit:30,offset:0});const result=messages.at(-1);assert.equal(result.type,'result');assert.equal(result.result.total,1);assert.equal(result.result.results[0].entry.number,514);assert.equal(result.result.results[0].text,'And Ibn ‘Abbas said: “Yatafayya’u” means “it inclines.”');assert(!Object.hasOwn(result.result.results[0].entry,'arabic_blocks'));assert(messages.some(m=>m.type==='progress'));
});
test('worker protocol rejects an incompatible release or page and suppresses cancelled work',async()=>{
 const f=fixture(),messages=[];let unlock;const handle=createWorkerSearchHandler({releaseId:version,loadLibrary:()=>new Promise(r=>{unlock=()=>r(f.library);}),post:m=>messages.push(m)}),request={protocol:1,type:'search',id:1,releaseId:version,sourceRecordSha256:hash,query:'shared',limit:30,offset:0};
 await handle({...request,releaseId:'other'});assert.equal(messages.at(-1).code,'version');await handle({...request,id:2,limit:500});assert.equal(messages.at(-1).code,'version');
 const pending=handle({...request,id:3});await handle({type:'cancel',id:3});unlock();await pending;assert(!messages.some(m=>m.id===3&&m.type==='result'));
});
test('client lazily creates a worker and reuses it without loading the main-thread library',async()=>{
 const f=fixture(),w=fakeWorker();let created=0;const c=client(f,w,{workerFactory:()=>{created++;return w;}});assert.equal(created,0);
 const first=c.search('shared');assert.equal(created,1);w.emit(response(w.messages[0],thin(searchEntries(makeEntries(),'shared',30))));assert.equal((await first).total,95);assert.equal(f.loads(),0);
 const next=c.search('shared',{offset:30});w.emit(response(w.messages.at(-1),thin(searchEntries(makeEntries(),'shared',30,30))));assert.equal((await next).results[0].entry.number,31);assert.equal(created,1);c.dispose();
});
test('new searches cancel old promises and late replies cannot replace the current result',async()=>{
 const f=fixture(),w=fakeWorker(),c=client(f,w),old=c.search('shared'),rejected=assert.rejects(old,{name:'AbortError'}),oldRequest=w.messages[0],current=c.search('Chain 3');await rejected;w.emit(response(oldRequest,{total:0,results:[]}));let settled=false;current.then(()=>{settled=true;});await tick();assert.equal(settled,false);w.emit(response(w.messages.at(-1),thin(searchEntries(makeEntries(),'Chain 3',30))));assert.equal((await current).results[0].entry.number,4);c.dispose();
});
test('clear/dispose rejects pending work and ignores later worker replies',async()=>{
 const f=fixture(),w=fakeWorker(),c=client(f,w),p=c.search('shared'),rejected=assert.rejects(p,{name:'AbortError'});c.cancel();await rejected;assert.equal(w.messages.at(-1).type,'cancel');w.emit(response(w.messages[0],{total:0,results:[]}));c.dispose();assert(w.terminated);
});
test('unavailable workers and runtime crashes use the same complete cooperative search',async()=>{
 for(const mode of ['unavailable','crash','message']){const f=fixture(),w=fakeWorker(),c=client(f,w,{workerFactory:()=>{if(mode==='unavailable')throw new Error('Unsupported');return w;}}),p=c.search('shared');if(mode==='crash')w.onerror({preventDefault(){}});if(mode==='message')w.onmessageerror();assert.equal((await p).total,95);assert.equal(f.loads(),2);assert.equal((await c.search('Chain 2')).results[0].entry.number,3);assert.equal(f.loads(),2);c.dispose();}
});
test('an idle worker crash is detected before the next query',async()=>{
 const f=fixture(),w=fakeWorker(),c=client(f,w),p=c.search('shared');w.emit(response(w.messages[0],thin(searchEntries(makeEntries(),'shared',30))));await p;w.onerror({preventDefault(){}});assert(w.terminated);assert.equal((await c.search('shared')).total,95);c.dispose();
});
test('a stalled worker falls back and does not leave a search pending forever',async()=>{
 const f=fixture(),w=fakeWorker(),c=client(f,w,{stallMs:20});assert.equal((await c.search('shared')).total,95);assert(w.terminated);c.dispose();
});
test('wrong version, malformed results and content failure are refused without fallback',async()=>{
 for(const change of [m=>m.releaseId='stale',m=>m.sourceRecordSha256='b'.repeat(64),m=>m.protocol=9,m=>m.result={total:95,results:[]},m=>m.result.results[0].entry.number=999,m=>m.result.results.reverse(),m=>{m.type='error';m.code='content';}]){const f=fixture(),w=fakeWorker(),c=client(f,w),p=c.search('shared'),rejected=assert.rejects(p,/verify/),message=response(w.messages[0],thin(searchEntries(makeEntries(),'shared',30)));change(message);w.emit(message);await rejected;assert.equal(f.loads(),0);assert(w.terminated);c.dispose();}
});
test('invalid search pages cannot dispatch work and a missing book fails the fallback',async()=>{
 const f=fixture(),w=fakeWorker(),c=client(f,w);for(const options of [{limit:51},{limit:0},{offset:-1},{offset:NaN}])await assert.rejects(c.search('shared',options));assert.equal(w.messages.length,0);assert.deepEqual(await c.search('   '),{total:0,results:[]});c.dispose();
 f.setFail(true);const fallback=client(f,w,{workerFactory:()=>{throw new Error('Unsupported');}});await assert.rejects(fallback.search('shared'));f.setFail(false);assert.equal((await fallback.search('shared')).total,95);fallback.dispose();
});
