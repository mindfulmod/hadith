import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createPersonalStore} from '../reader/personal-state.mjs';
import {planSession,chapterAt,safePosition,resolveSession,followTarget} from '../reader/session.mjs';
import {verifyResponse} from '../reader/integrity.mjs';
import {recording} from '../reader/recording.mjs';
import {sourceParts,sourceHTML,honorifics} from '../reader/source-format.mjs';
import {release} from '../reader/release.mjs';
const entry=(number,words)=>({number,english_blocks:['word '.repeat(words)]});
test('session keeps order, completes a boundary entry and never splits a long hadith',()=>{
 const entries=[entry(12,400),entry(15,450),entry(16,100)];
 assert.deepEqual(planSession(entries,12,5).numbers,[12,15]);
 assert.deepEqual(planSession(entries,15,10).numbers,[15,16]);
 assert.equal(planSession(entries,15,10).short,true);
 assert.deepEqual(planSession([entry(1,2000),entry(2,100)],1,5).numbers,[1]);
 assert.deepEqual(planSession([],1,5).numbers,[]);
});
test('continuous audio boundary and corrupt saved positions',()=>{
 const boundary=recording.chapters[1].start;
 assert.equal(chapterAt(recording.chapters,boundary-.001).number,1);
 assert.equal(chapterAt(recording.chapters,boundary).number,2);
 for(const position of [NaN,Infinity,-1,recording.duration,999])assert.equal(safePosition(position,recording.duration),0);
 assert.equal(safePosition(10,recording.duration),10);
});
test('offline verifier rejects partial, truncated and changed responses',async()=>{
 const bytes=Buffer.from('complete recording');const f={path:'test',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 await verifyResponse(new Response(bytes),f);
 await assert.rejects(verifyResponse(new Response(bytes,{status:206}),f));
 await assert.rejects(verifyResponse(new Response(bytes.subarray(0,4)),f));
 await assert.rejects(verifyResponse(new Response(Buffer.alloc(bytes.length)),f));
});
test('existing preferences, bookmarks and reading positions survive the upgrade',()=>{
 const saved={theme:'night',last:2,saved:[1,2,999],finished:[1],positions:{2:323},size:24};
 const store=createPersonalStore({getItem:()=>JSON.stringify(saved),setItem:()=>{}});
 const state=store.get();
 assert.deepEqual(state.saved,[1,2,999]);assert.equal(state.positions[2],323);assert.equal(state.theme,'night');assert.equal(state.last,2);assert.equal(state.size,24);assert.equal(state.minutes,5);
});
test('release bytes match every shipped file and audio scripts match the complete source',async()=>{
 for(const f of release.files)await verifyResponse(new Response(readFileSync(new URL('../reader/'+f.path,import.meta.url))),f);
 const source=JSON.parse(readFileSync(new URL('../research/bukhari-opening-review.json',import.meta.url)));
 const provenance=JSON.parse(readFileSync(new URL('../reader/audio/provenance.json',import.meta.url)));
 assert.deepEqual(provenance.scripts,source.entries.map(e=>e.english_blocks.join('\n\n')));
 for(const c of recording.chapters)assert(c.duration>0);
 assert.equal(recording.chapters.at(-1).start+recording.chapters.at(-1).duration,recording.duration);
});

test('returning reader migrates into a finite session without changing reading or audio state',()=>{
 const entries=[entry(1,40),entry(2,50)];
 const legacy={last:2,finished:[1],audio:{seconds:25},positions:{2:323}};
 const session=resolveSession(entries,undefined,5,legacy.last);
 assert.deepEqual(session,{numbers:[1,2],cursor:2,ended:false});
 assert.deepEqual(legacy,{last:2,finished:[1],audio:{seconds:25},positions:{2:323}});
 const expanded=[...entries,entry(3,400)];
 assert.deepEqual(resolveSession(expanded,session,10,1),session);
});
test('invalid saved sessions recover to an ordered whole-hadith plan',()=>{
 const entries=[entry(1,20),entry(2,20)];
 for(const bad of [null,{}, {numbers:[2,1]}, {numbers:[1,1]}, {numbers:[1,999]}, {numbers:[]}, {numbers:'12'}]) {
  assert.deepEqual(resolveSession(entries,bad,5,2),{numbers:[1,2],cursor:2,ended:false});
 }
 assert.deepEqual(resolveSession(entries,{numbers:[1,2],cursor:999,ended:true},5,1),{numbers:[1,2],cursor:1,ended:true});
});

test('updater release manifest identifies the exact generated reader bundle',()=>{
 const version=JSON.parse(readFileSync(new URL('../reader-version.json',import.meta.url),'utf8'));
 assert.equal(version.release,release.id);
});
test('worker reports its release without forcing activation or changing stored data',()=>{
 const handlers={},messages=[];
 const context={release,URL,self:{location:{href:'https://example.com/hadith/reader/sw.js'},addEventListener:(name,handler)=>handlers[name]=handler}};
 const source=readFileSync(new URL('../reader/sw.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,context);
 handlers.message({data:{type:'GET_READER_RELEASE'},ports:[{postMessage:message=>messages.push(message)}]});
 assert.equal(messages[0].release,release.id);
 assert.equal(messages.length,1);
 handlers.message({data:{type:'SKIP_WAITING'},ports:[]});
 assert.equal(messages.length,1);
});

test('smaller honorific spans preserve every character of the complete English source',()=>{
 const source=JSON.parse(readFileSync(new URL('../research/bukhari-opening-review.json',import.meta.url)));
 let count=0;
 for(const entry of source.entries)for(const text of entry.english_blocks){
  const parts=sourceParts(text);
  assert.equal(parts.map(part=>part.text).join(''),text);
  for(const part of parts.filter(p=>p.honorific)){assert(honorifics.includes(part.text));count++;}
 }
 assert.equal(count,7);
 assert.equal(sourceHTML('<script>&"'), '&lt;script&gt;&amp;&quot;');
 assert.equal(sourceHTML('An unmatched phrase remains complete.'),'An unmatched phrase remains complete.');
});
test('follow advances whole hadith only while playing, and defers to source dialogs and manual browsing',()=>{
 const state={enabled:true,mode:'read',current:1,chapter:2,playing:true,blocked:false};
 assert.equal(followTarget(state),2);
 for(const patch of [{enabled:false},{mode:'listen'},{mode:'home'},{playing:false},{blocked:true},{chapter:1}])assert.equal(followTarget({...state,...patch}),null);
 assert.equal(followTarget({...state,blocked:false}),2);
});
test('legacy preferences default to following, while an explicit off choice survives reload',()=>{
 for(const enabled of [undefined,false,true]){
  const store=createPersonalStore({getItem:()=>JSON.stringify({followAudio:enabled,saved:[1],last:2}),setItem:()=>{}});
  assert.equal(store.get().followAudio,enabled!==false);
  assert.equal(store.get().last,2);
 }
});
