import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {planSession,chapterAt,safePosition,resolveSession,advanceSession} from '../reader/session.mjs';
import {verifyResponse} from '../reader/integrity.mjs';
import {recording} from '../reader/recording.mjs';
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
 const context={window:{HadithContent:{entries:[{number:1},{number:2}]}},localStorage:{getItem:()=>JSON.stringify(saved),setItem:()=>{}}};
 vm.runInNewContext(readFileSync(new URL('../reader/store.js',import.meta.url),'utf8'),context);
 const state=JSON.parse(JSON.stringify(context.window.HadithStore.get()));
 assert.deepEqual(state.saved,[1,2]);assert.equal(state.positions[2],323);assert.equal(state.theme,'night');assert.equal(state.last,2);assert.equal(state.size,24);assert.equal(state.minutes,5);
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
test('session advances only by explicit completion, including skipped entries and revisits',()=>{
 const first={numbers:[1,2],cursor:1,ended:false};
 const second=advanceSession(first,1);
 assert.deepEqual(first,{numbers:[1,2],cursor:1,ended:false});
 assert.deepEqual(second,{numbers:[1,2],cursor:2,ended:false});
 assert.deepEqual(advanceSession(second,2),{numbers:[1,2],cursor:2,ended:true});
 assert.deepEqual(advanceSession(first,2),{numbers:[1,2],cursor:2,ended:true});
 assert.deepEqual(advanceSession(first,999),first);
 assert.deepEqual(advanceSession({...second,ended:true},1),second);
});
test('invalid saved sessions recover to an ordered whole-hadith plan',()=>{
 const entries=[entry(1,20),entry(2,20)];
 for(const bad of [null,{}, {numbers:[2,1]}, {numbers:[1,1]}, {numbers:[1,999]}, {numbers:[]}, {numbers:'12'}]) {
  assert.deepEqual(resolveSession(entries,bad,5,2),{numbers:[1,2],cursor:2,ended:false});
 }
 assert.deepEqual(resolveSession(entries,{numbers:[1,2],cursor:999,ended:true},5,1),{numbers:[1,2],cursor:1,ended:true});
});
