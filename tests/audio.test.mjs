import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {recording,recordedChapter} from '../reader/recording.mjs';
import {chapterAt,safePosition} from '../reader/session.mjs';
function harness(saved={}){
 const elements=new Map(),classes=new Set();
 const node=()=>({hidden:true,dataset:{},textContent:'',setAttribute(){},addEventListener(){},focus(){},getBoundingClientRect:()=>({height:50})});
 const query=selector=>{if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);};
 const audio=query('#narration');Object.assign(audio,{currentTime:0,duration:NaN,readyState:1,paused:true,ended:false,playbackRate:1,playCalls:0,src:'',getAttribute(name){return this[name];},play(){this.playCalls++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;}});
 const state={audio:saved},store={get:()=>structuredClone(state),set:patch=>Object.assign(state,patch)};
 const document={querySelector:query,body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},addEventListener(){},dispatchEvent(){},documentElement:{style:{setProperty(){}}}};
 const context={document,store,recording,recordedChapter,chapterAt,safePosition,URL,navigator:{},window:{addEventListener(){}},CustomEvent:class{},ResizeObserver:class{observe(){}}};
 const code=readFileSync(new URL('../reader/audio.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll('import.meta.url',JSON.stringify('https://example.com/reader/audio.mjs'))+'\nglobalThis.api={listen,listenAlong,prepareListening,resumeListening,getPlaybackState};';
 vm.runInNewContext(code,context);
 return {api:context.api,audio,player:query('#player'),state,classes};
}
test('unknown audio references never activate media or fall back to the first hadith',()=>{
 const h=harness();
 for(const number of [3,999,0,-1,NaN,'1',null,undefined])for(const method of ['listen','listenAlong','prepareListening'])assert.equal(h.api[method](number),false);
 assert.equal(h.audio.playCalls,0);assert.equal(h.audio.src,'');assert.equal(h.player.hidden,true);assert.equal(h.api.getPlaybackState().active,false);assert.equal(h.classes.has('has-player'),false);
});
test('unavailable requests leave an active recording and saved position untouched',async()=>{
 const h=harness({release:recording.id,seconds:12});assert.equal(h.api.listen(2),true);await new Promise(resolve=>setImmediate(resolve));h.audio.currentTime=45;
 const before=JSON.stringify(h.api.getPlaybackState());
 for(const method of ['listen','listenAlong','prepareListening'])assert.equal(h.api[method](7),false);
 assert.equal(JSON.stringify(h.api.getPlaybackState()),before);assert.equal(h.audio.playCalls,1);assert.equal(h.state.audio.seconds,12);
});
test('opening successive listening routes prepares the requested chapter without autoplay',()=>{
 const h=harness({release:recording.id,seconds:9});
 h.api.prepareListening(1);assert.equal(h.api.getPlaybackState().seconds,9);
 h.api.prepareListening(2);assert.equal(h.api.getPlaybackState().seconds,recording.chapters[1].start);
 h.api.prepareListening(1);assert.equal(h.api.getPlaybackState().seconds,9);assert.equal(h.audio.playCalls,0);assert.equal(h.audio.src,'');
});
test('listen-along resumes only the matching chapter and uses its start otherwise',async()=>{
 const h=harness({release:recording.id,seconds:45});h.api.listenAlong(1);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.audio.currentTime,0);
 h.audio.currentTime=12;h.api.listenAlong(1);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.audio.currentTime,12);
 h.api.listenAlong(2);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.audio.currentTime,recording.chapters[1].start);
 const same=harness({release:recording.id,seconds:45});same.api.listenAlong(2);assert.equal(same.audio.currentTime,45);
});
test('listening navigation preserves playing audio and respects the requested chapter when paused',async()=>{
 const h=harness();h.api.listen(1);await new Promise(resolve=>setImmediate(resolve));h.audio.currentTime=10;h.api.prepareListening(2);assert.equal(h.audio.currentTime,10);
 h.audio.paused=true;h.api.prepareListening(2);assert.equal(h.audio.currentTime,recording.chapters[1].start);assert.equal(h.audio.playCalls,1);
 h.audio.currentTime=45;h.api.prepareListening(2);assert.equal(h.audio.currentTime,45);
 h.audio.ended=true;h.api.prepareListening(2);assert.equal(h.audio.currentTime,recording.chapters[1].start);
});
