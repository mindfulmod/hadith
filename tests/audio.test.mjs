import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {recording,recordings,recordedChapter,playbackVariants} from '../reader/recording.mjs';
import {listeningPlan} from '../reader/listening-plan.mjs';
import {chapterAt,safePosition} from '../reader/session.mjs';
function harness(saved={},items=[recording]){
 const elements=new Map(),classes=new Set();
 const node=()=>({hidden:true,dataset:{},textContent:'',listeners:{},setAttribute(name,value){this[name]=value;},addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},emit(name,event={}){for(const fn of this.listeners[name]||[])fn(event);},click(){this.onclick?.({});},focus(){},getBoundingClientRect:()=>({height:50})});
 const query=selector=>{if(!elements.has(selector))elements.set(selector,node());return elements.get(selector);};
 const audio=query('#narration');Object.assign(audio,{currentTime:0,duration:NaN,readyState:1,paused:true,ended:false,playbackRate:1,playCalls:0,src:'',getAttribute(name){return this[name];},play(){this.playCalls++;this.paused=false;this.ended=false;return Promise.resolve();},pause(){this.paused=true;}});
 const state={audio:saved},store={get:()=>structuredClone(state),set:patch=>Object.assign(state,patch)};
 const document={querySelector:query,body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},addEventListener(){},dispatchEvent(){},documentElement:{style:{setProperty(){}}}};
 const recordingForNumber=n=>items.find(r=>r.chapters.some(c=>c.number===n))??null,recordedChapter=n=>recordingForNumber(n)?.chapters.find(c=>c.number===n)??null;
 const context={document,store,defaultRecording:items[0],recordings:items,playbackRecordings:[...items,...playbackVariants(items)],listeningPlan,recordingForNumber,recordedChapter,chapterAt,safePosition,URL,navigator:{},window:{addEventListener(){}},CustomEvent:class{},ResizeObserver:class{observe(){}}};
 const code=readFileSync(new URL('../reader/audio.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll('import.meta.url',JSON.stringify('https://example.com/reader/audio.mjs'))+'\nglobalThis.api={listen,listenAlong,prepareListening,resumeListening,getPlaybackState,getActiveRecording,listenSession,getListeningState};';
 vm.runInNewContext(code,context);
 return {api:context.api,audio,player:query('#player'),state,classes,elements};
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

const otherRecording={...recording,id:'synthetic-recording',src:'audio/synthetic-only.m4a',album:'Synthetic test book',duration:40,chapters:[{number:3,start:0,duration:20},{number:4,start:20,duration:20}]};
test('a saved place selects its own recording and opening another route never interrupts playback',async()=>{
 const h=harness({release:otherRecording.id,seconds:25},[recording,otherRecording]);h.api.resumeListening();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.api.getPlaybackState().recordingId,otherRecording.id);assert.equal(h.api.getPlaybackState().number,4);assert.equal(h.audio.currentTime,25);
 h.api.prepareListening(1);assert.equal(h.api.getPlaybackState().recordingId,otherRecording.id);assert.equal(h.audio.currentTime,25);
 h.elements.get('#audio-toggle').click();h.api.prepareListening(1);assert.equal(h.api.getPlaybackState().recordingId,recording.id);assert.equal(h.api.getPlaybackState().seconds,0);assert.equal(h.audio.playCalls,1);
});
test('selecting a new recording changes the same media element and seeks within that recording only',async()=>{
 const h=harness({},[recording,otherRecording]),originalAudio=h.audio;h.api.listen(2);await new Promise(resolve=>setImmediate(resolve));
 h.api.listen(4);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.audio,originalAudio);assert(h.audio.src.endsWith(otherRecording.src));assert.equal(h.audio.currentTime,20);
 h.elements.get('#audio-next').click();assert.equal(h.audio.currentTime,20);h.elements.get('#audio-previous').click();assert.equal(h.audio.currentTime,0);
 h.elements.get('#audio-toggle').click();assert.equal(h.state.audio.release,otherRecording.id);assert.equal(h.state.audio.seconds,0);
});
test('late play failures cannot overwrite a later selection or a user pause',async()=>{
 const h=harness({},[recording,otherRecording]);let rejectFirst;
 h.audio.play=function(){this.paused=false;return new Promise((resolve,reject)=>{rejectFirst=reject;});};h.api.listen(1);
 h.audio.play=function(){this.paused=false;return Promise.resolve();};h.api.listen(3);await new Promise(resolve=>setImmediate(resolve));
 rejectFirst(new Error('Old request interrupted'));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.api.getPlaybackState().number,3);assert.equal(h.elements.get('#audio-message').textContent,'');
 let rejectPending;h.audio.play=function(){this.paused=false;return new Promise((resolve,reject)=>{rejectPending=reject;});};h.api.listen(4);h.elements.get('#audio-toggle').click();rejectPending(new Error('User paused'));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.api.getPlaybackState().playing,false);assert.equal(h.elements.get('#audio-message').textContent,'');
});
test('failed or completed recordings keep their reference and never start unrequested media',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listen(1);await new Promise(resolve=>setImmediate(resolve));const plays=h.audio.playCalls;
 h.audio.currentTime=21;h.audio.emit('error');assert.equal(h.audio.playCalls,plays);assert.equal(h.api.getPlaybackState().number,1);assert(h.elements.get('#audio-message').textContent.includes('could not load'));
 h.audio.currentTime=recording.duration;h.audio.ended=true;h.audio.paused=true;h.audio.emit('ended');assert.equal(h.audio.playCalls,plays);assert.equal(h.api.getPlaybackState().recordingId,recording.id);assert.equal(h.state.audio.seconds,0);
});

test('explicit session resume selects that recording even while another recording is active',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listen(3);await new Promise(resolve=>setImmediate(resolve));
 h.api.resumeListening(recording.id);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.api.getPlaybackState().recordingId,recording.id);assert.equal(h.api.getPlaybackState().number,1);
 const before=JSON.stringify(h.api.getPlaybackState());assert.equal(h.api.resumeListening('unknown-recording'),false);assert.equal(JSON.stringify(h.api.getPlaybackState()),before);
});
test('retry reloads failed media and restores its saved position only after metadata is ready',async()=>{
 const h=harness();h.api.listen(2);await new Promise(resolve=>setImmediate(resolve));h.audio.currentTime=50;h.audio.error={code:2};h.audio.paused=true;h.audio.emit('error');
 assert.equal(h.state.audio.seconds,50);let loads=0;h.audio.load=function(){loads++;this.readyState=0;this.currentTime=0;this.error=null;};
 h.elements.get('#audio-toggle').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(loads,1);assert.equal(h.api.getPlaybackState().seconds,50);
 h.audio.readyState=1;h.audio.emit('loadedmetadata');assert.equal(h.audio.currentTime,50);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function finish(h){h.audio.currentTime=h.api.getActiveRecording().duration;h.audio.ended=true;h.audio.paused=true;h.audio.emit('ended');}
test('a listening session crosses files on the same media element and stops at its own end',async()=>{
 const h=harness({},[recording,otherRecording]),original=h.audio;h.api.listenSession([1,2,3,4]);await tick();
 finish(h);await tick();assert.equal(h.audio,original);assert.equal(h.api.getPlaybackState().number,3);assert.equal(h.audio.playCalls,2);assert.equal(h.state.audio.release,otherRecording.id);
 finish(h);await tick();assert(h.api.getListeningState().complete);assert.equal(h.audio.playCalls,2);assert(h.elements.get('#audio-message').textContent.includes('session complete'));
 h.elements.get('#audio-toggle').click();await tick();assert.equal(h.api.getPlaybackState().number,1);assert.equal(h.api.getListeningState().complete,false);
});
test('a one-hadith session uses the original complete clip and never leaks the next chapter',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listenSession([1]);await tick();assert.equal(h.api.getActiveRecording().chapters.length,1);assert(h.audio.src.endsWith('hadith-1-cedar-v1.mp3'));
 finish(h);await tick();assert.equal(h.audio.playCalls,1);assert.equal(h.api.getPlaybackState().number,1);
});
test('audio gaps are stopping points even when later recordings exist',async()=>{
 const later={...otherRecording,id:'later',chapters:[{number:4,start:0,duration:40}]};const h=harness({},[recording,later]);
 h.api.listenSession([1,2,3,4]);await tick();finish(h);await tick();assert.equal(h.audio.playCalls,1);assert.equal(h.api.getListeningState().nextNumber,3);assert(h.elements.get('#audio-message').textContent.includes('Hadith 3'));
 assert.equal(h.api.listenSession([3,4]),false);assert.equal(h.api.listenSession([1,3]),false);
});
test('queued retry keeps the intended next file and route preparation does not discard the queue',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listenSession([1,2,3,4]);await tick();
 h.audio.play=function(){this.playCalls++;this.paused=true;this.ended=false;return Promise.reject(new Error('Blocked'));};finish(h);await tick();
 assert.equal(h.api.getPlaybackState().number,3);assert(h.elements.get('#audio-message').textContent.includes('Tap Play'));
 h.api.prepareListening(3);assert(h.api.getListeningState());
 h.audio.play=function(){this.playCalls++;this.paused=false;return Promise.resolve();};h.elements.get('#audio-toggle').click();await tick();assert.equal(h.api.getPlaybackState().number,3);assert.equal(h.api.getListeningState().index,1);
});
test('queue navigation stays within the selected session and preserves paused state and speed',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listenSession([2,3,4]);await tick();h.audio.playbackRate=1.1;
 h.elements.get('#audio-next').click();await tick();assert.equal(h.api.getPlaybackState().number,3);assert.equal(h.audio.playbackRate,1.1);
 h.elements.get('#audio-toggle').click();h.elements.get('#audio-previous').click();assert.equal(h.api.getPlaybackState().number,2);assert.equal(h.api.getPlaybackState().playing,false);
 h.elements.get('#audio-back').click();assert.equal(h.api.getPlaybackState().seconds,recording.chapters[1].start);
});
test('a saved recording position resumes in its matching session and out-of-session positions are not reused',async()=>{
 const h=harness({release:otherRecording.id,seconds:25},[recording,otherRecording]);h.api.listenSession([1,2,3,4]);await tick();assert.equal(h.api.getPlaybackState().number,4);assert.equal(h.audio.currentTime,25);
 h.api.listenSession([1,2]);await tick();assert.equal(h.api.getPlaybackState().number,1);assert.equal(h.audio.currentTime,0);
});
test('a user pause or close cancels continuation and a new explicit recording clears the queue',async()=>{
 const h=harness({},[recording,otherRecording]);h.api.listenSession([1,2,3,4]);await tick();h.elements.get('#audio-toggle').click();const count=h.audio.playCalls;finish(h);await tick();assert.equal(h.audio.playCalls,count);
 h.api.listenSession([1,2,3,4],{number:2});await tick();h.api.listen(3);assert.equal(h.api.getListeningState(),null);
 h.api.listenSession([1,2,3,4]);await tick();h.elements.get('#audio-close').click();assert.equal(h.api.getListeningState(),null);assert.equal(h.player.hidden,true);
});

test('a completed session restarts from its beginning after reopening, while seeking can replay the last recording',async()=>{
 const h=harness({release:otherRecording.id,seconds:otherRecording.duration},[recording,otherRecording]);h.api.listenSession([1,2,3,4]);await tick();assert.equal(h.api.getPlaybackState().number,1);
 finish(h);await tick();finish(h);await tick();assert.equal(h.state.audio.seconds,otherRecording.duration);
 h.api.listenSession([1,2,3,4],{number:3});await tick();assert.equal(h.api.getPlaybackState().number,3);finish(h);await tick();
 h.elements.get('#audio-back').click();assert.equal(h.api.getListeningState().complete,false);h.elements.get('#audio-toggle').click();await tick();assert.equal(h.api.getPlaybackState().recordingId,otherRecording.id);
});

test('the actual opening queue crosses all five files and stops before unrecorded Hadith 7',async()=>{
 const h=harness({},recordings),element=h.audio;h.api.listenSession([1,2,3,4,5,6,7]);await tick();
 for(const number of [3,4,5,6]){finish(h);await tick();assert.equal(h.audio,element);assert.equal(h.api.getPlaybackState().number,number);}
 finish(h);await tick();assert.equal(h.audio.playCalls,5);assert.equal(h.api.getListeningState().nextNumber,7);assert(h.elements.get('#audio-message').textContent.includes('Hadith 7'));
});

test('the media queue traverses a suffixed reference without coalescing or skipping it',async()=>{
 const entries=[619,'619b',620].map(number=>({number}));
 const items=entries.map(({number},i)=>({...otherRecording,id:`suffix-fixture-${number}`,src:`audio/synthetic-${number}.m4a`,duration:20,chapters:[{number,start:0,duration:20}]}));
 const h=harness({},items),original=h.audio;
 assert.equal(h.api.listenSession([619,'619b',620],{entries,number:619}),true);await tick();
 assert.equal(h.api.getPlaybackState().number,619);
 finish(h);await tick();assert.equal(h.api.getPlaybackState().number,'619b');assert.equal(h.audio,original);
 h.api.prepareListening('619b');assert(h.api.getListeningState());
 finish(h);await tick();assert.equal(h.api.getPlaybackState().number,620);
 finish(h);await tick();assert.equal(h.api.getListeningState().complete,true);assert.equal(h.audio.playCalls,3);
 const missing=harness({},[items[0],items[2]]);
 missing.api.listenSession([619,'619b',620],{entries});await tick();finish(missing);await tick();
 assert.equal(missing.api.getListeningState().nextNumber,'619b');assert.equal(missing.audio.playCalls,1);
 assert(missing.elements.get('#audio-message').textContent.includes('Hadith 619b'));
 assert.equal(missing.api.listenSession([619,620],{entries}),false);
});
