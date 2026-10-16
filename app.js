import { tracks } from './tracks.js';
const $ = id => document.getElementById(id);
const audio = $('audio');
const STORAGE = 'hadith-audio-pilot-v1';
const CACHE = 'hadith-pilot-audio-v1';
const audioPaths = [...tracks.map(t => t.src), './audio/continuous.m4a'];
const checkItems = [
 ['locked','Audio continued while locked'], ['transitions','Heard all three recordings'],
 ['controls','Lock Screen pause / resume'], ['headphones','Headphone controls'],
 ['interruption','Resumed after an interruption'], ['reopen','Saved position after reopening'],
 ['offline','Worked in airplane mode']
];
function readState() { try { return JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch { return {}; } }
let saved = readState();
let mode = saved.mode === 'continuous' ? 'continuous' : 'queue';
let index = Number.isInteger(saved.index) && saved.index >= 0 && saved.index < tracks.length ? saved.index : 0;
let logs = Array.isArray(saved.logs) ? saved.logs.slice(-80) : [];
let reports = saved.reports && typeof saved.reports === 'object' ? saved.reports : {};
let requestedPosition = Number.isFinite(saved.position) && saved.position >= 0 ? saved.position : 0;
let lastSavedAt = 0;
let completed = false;
let playRequest = 0;
const initialPosition = requestedPosition;
let pendingSeek = requestedPosition;
function persist() {
 const position = pendingSeek !== null ? pendingSeek : audio.currentTime;
 try { localStorage.setItem(STORAGE, JSON.stringify({mode,index,position,reports,logs})); }
 catch { $('message').textContent = 'Your browser could not save progress. Playback still works.'; }
}
function log(event, extra = '') {
 logs.push({time:new Date().toISOString(),event,mode,recording:index+1,position:Math.round(audio.currentTime || 0),visibility:document.visibilityState,detail:extra});
 logs = logs.slice(-80); $('log').textContent = logs.map(x => `${x.time.slice(11,19)}  ${x.event} · ${x.mode} · ${x.recording} · ${x.position}s · ${x.visibility}${x.detail ? ' · '+x.detail : ''}`).join('\n');
 persist();
}
const format = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}` : '—';
const total = tracks.reduce((sum,t)=>sum+t.duration,0);
$('total-time').textContent = `${format(total)} · 3 recordings`;
function chapterAt(time) { let sum = 0; for(let i=0;i<tracks.length;i++){sum+=tracks[i].duration;if(time < sum)return i;} return tracks.length-1; }
function chapterStart(i) { return tracks.slice(0,i).reduce((sum,t)=>sum+t.duration,0); }
function configureSession() {
 try { if ('audioSession' in navigator) navigator.audioSession.type = 'playback'; } catch {}
 if (!('mediaSession' in navigator)) return;
 const handlers = {
  play:()=>play(),pause:()=>audio.pause(),stop:()=>{audio.pause();seekTo(0);},
  previoustrack:()=>move(-1),nexttrack:()=>move(1),
  seekbackward:d=>seekTo(audio.currentTime-(d.seekOffset||10)),
  seekforward:d=>seekTo(audio.currentTime+(d.seekOffset||10)),seekto:d=>seekTo(d.seekTime)
 };
 for(const [name,handler] of Object.entries(handlers)) { try{navigator.mediaSession.setActionHandler(name,handler);}catch{} }
}
function metadata() {
 if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
 navigator.mediaSession.metadata = new MediaMetadata({title:`Test recording ${index+1} of 3`,artist:'MindfulMod · Test speech only',album:mode==='queue'?'Separate recordings':'Continuous comparison',artwork:[{src:new URL('./icon-512.png',location.href).href,sizes:'512x512',type:'image/png'}]});
}
function positionState() {
 if (!navigator.mediaSession?.setPositionState || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
 try {navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{}
}
function render() {
 $('now-title').textContent = `Recording ${index+1} of 3`;
 $('toggle').innerHTML = audio.paused ? (completed ? 'Play again <span aria-hidden="true">↻</span>' : 'Play test <span aria-hidden="true">▶</span>') : 'Pause <span aria-hidden="true">Ⅱ</span>';
 $('toggle').setAttribute('aria-label',audio.paused?'Play test':'Pause test');
 $('previous').disabled = index === 0;
 $('next').disabled = index === tracks.length-1;
 const d = Number.isFinite(audio.duration) ? audio.duration : (mode==='queue'?tracks[index].duration:total);
 $('seek').max = d; $('seek').value = pendingSeek ?? audio.currentTime;
 $('seek').setAttribute('aria-valuetext',`${format(Number($('seek').value))} of ${format(d)}`);
 $('elapsed').textContent = format(Number($('seek').value)); $('duration').textContent = format(d);
 $('mode-hint').textContent = mode==='queue'?'Two file transitions. Keep the phone locked until you hear recording three.':'The same three readings in one file. Use this to compare if separate recordings stop.';
 positionState();
}
function seekTo(value) {
 if (!Number.isFinite(value))return;
 const duration=Number.isFinite(audio.duration)?audio.duration:(mode==='queue'?tracks[index].duration:total);
 const position=Math.max(0,Math.min(value,Math.max(0,duration-.1)));
 completed=false;
 if(audio.readyState>=1){pendingSeek=null;audio.currentTime=position;}else{pendingSeek=position;}
 if(mode==='continuous'){index=chapterAt(position);metadata();}
 persist();render();
}
function load(shouldPlay=false,position=0) {
 playRequest++; completed=false; pendingSeek=position;
 audio.src = mode==='queue' ? tracks[index].src : './audio/continuous.m4a';
 audio.load(); metadata();render();
 $('play-state').textContent='Ready';
 if(shouldPlay)play();
}
async function play() {
 if(completed){index=0;load(false,0);}
 const request=++playRequest;
 $('message').textContent=''; configureSession();
 try {await audio.play(); if(request===playRequest) log('play-request-succeeded');}
 catch(error){if(request!==playRequest)return; $('play-state').textContent='Stopped'; $('message').textContent='Playback could not start. Tap Play test again. If this happened while locked, record that in your results.';log('play-rejected',error.name);render();}
}
function move(delta) {
 const next=Math.max(0,Math.min(tracks.length-1,index+delta));
 if(next===index)return;
 const wasPlaying=!audio.paused;index=next;
 if(mode==='continuous'){seekTo(chapterStart(index));metadata();}else{load(wasPlaying);}
 log('recording-selected');
}
$('mode').value=mode;
$('mode').addEventListener('change',()=>{audio.pause();mode=$('mode').value;index=0;load();$('test-context').value=mode;renderReport();log('method-changed');});
$('toggle').addEventListener('click',()=>audio.paused?play():audio.pause());
$('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));
$('restart').addEventListener('click',()=>{audio.pause();index=0;load();log('restarted');});
$('seek').addEventListener('input',()=>seekTo(Number($('seek').value)));
audio.addEventListener('loadedmetadata',()=>{if(pendingSeek!==null){const p=pendingSeek;pendingSeek=null;seekTo(p);}render();log('loaded');});
audio.addEventListener('play',()=>{completed=false;$('play-state').textContent='Playing';if(navigator.mediaSession)navigator.mediaSession.playbackState='playing';metadata();render();log('play');});
audio.addEventListener('playing',()=>{$('play-state').textContent='Playing';render();});
audio.addEventListener('pause',()=>{$('play-state').textContent=completed?'Finished':'Paused';if(navigator.mediaSession)navigator.mediaSession.playbackState='paused';render();log('pause');});
audio.addEventListener('waiting',()=>{$('play-state').textContent='Loading…';log('waiting');});
audio.addEventListener('stalled',()=>log('stalled'));
audio.addEventListener('error',()=>{$('play-state').textContent='Audio unavailable';$('message').textContent='The recording could not load. Check your connection, or download the test before going offline.';log('audio-error',String(audio.error?.code));});
audio.addEventListener('timeupdate',()=>{
 if(mode==='continuous'){const next=chapterAt(audio.currentTime);if(next!==index){index=next;metadata();log('continuous-boundary');}}
 render();if(Date.now()-lastSavedAt>2000){persist();lastSavedAt=Date.now();}
});
audio.addEventListener('ended',()=>{
 log('ended');
 if(mode==='queue'&&index<tracks.length-1){index++;load(true);log('automatic-transition');}
 else{completed=true;$('play-state').textContent='Finished';$('message').textContent='Test finished. Record what you heard below.';if(navigator.mediaSession)navigator.mediaSession.playbackState='none';persist();render();log('session-finished');}
});
document.addEventListener('visibilitychange',()=>log('visibility'));
window.addEventListener('pagehide',persist);
window.addEventListener('offline',()=>log('network-offline'));
window.addEventListener('online',()=>log('network-online'));
function reportBucket(){const key=$('test-context').value;reports[key]??={checks:{},notes:''};return reports[key];}
function renderReport(){
 const report=reportBucket();$('checks').replaceChildren();
 for(const [key,label] of checkItems){
  const row=document.createElement('label');row.className='check-row';row.append(document.createTextNode(label));
  const select=document.createElement('select');select.setAttribute('aria-label',label);
  for(const [value,text] of [['','Not tested'],['passed','Passed'],['failed','Failed'],['unclear','Unclear']]){const option=new Option(text,value);select.add(option);}
  select.value=report.checks[key]||'';select.addEventListener('change',()=>{reportBucket().checks[key]=select.value;persist();});row.append(select);$('checks').append(row);
 }
 $('notes').value=report.notes||'';
}
$('test-context').value=mode;$('test-context').addEventListener('change',renderReport);
$('notes').addEventListener('input',()=>{reportBucket().notes=$('notes').value;persist();});
const standalone=matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
$('environment').textContent=`${standalone?'Home Screen app':'Browser tab'} · ${navigator.userAgent}`;
$('copy').addEventListener('click',async()=>{
 const report=['Hadith listening pilot v1',new Date().toISOString(),$('environment').textContent,
  ...Object.entries(reports).flatMap(([key,r])=>['',key,...checkItems.map(([k,label])=>`${label}: ${r.checks[k]||'not tested'}`),`Notes: ${r.notes||'—'}`]),'','Playback log:',...logs.map(x=>JSON.stringify(x))].join('\n');
 try{await navigator.clipboard.writeText(report);$('copy-state').textContent='Copied. Paste the report into our chat.';}
 catch{$('report-fallback').hidden=false;$('report-fallback').value=report;$('report-fallback').select();$('copy-state').textContent='Select and copy the report below, then paste it into our chat.';}
});
$('clear-log').addEventListener('click',()=>{logs=[];$('log').textContent='';persist();});
async function offlineReady(){
 if(!('caches' in window))return false;
 const cache=await caches.open(CACHE);
 return (await Promise.all(audioPaths.map(p=>cache.match(new URL(p,location.href).href)))).every(Boolean);
}
async function showOfflineStatus(){
 try{const ready=await offlineReady();$('offline-status').textContent=ready?'Audio downloaded. Reopen once while online, then try airplane mode.':'Download the audio before testing in airplane mode.';$('download').textContent=ready?'Check download':'Download test';}catch{}
}
$('download').addEventListener('click',async()=>{
 const button=$('download');button.disabled=true;
 try{
  if(!('serviceWorker' in navigator)||!('caches' in window))throw Error('unsupported');
  if(!registrationPromise)throw Error('registration');
  await registrationPromise;
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),15000))]);
  const cache=await caches.open(CACHE);
  for(let i=0;i<audioPaths.length;i++){
   $('offline-status').textContent=`Downloading audio ${i+1} of ${audioPaths.length}…`;
   const url=new URL(audioPaths[i],location.href).href;
   const response=await fetch(url,{cache:'reload'});
   if(!response.ok||response.status===206)throw Error('download');
   await cache.put(url,response);
  }
  await showOfflineStatus();log('offline-download-complete');
 }catch(error){$('offline-status').textContent='Download could not finish. Stay online and try again. Offline mode needs a secure connection.';log('offline-download-failed',error.message);}
 finally{button.disabled=false;}
});
let registrationPromise=null;
if('serviceWorker' in navigator){registrationPromise=navigator.serviceWorker.register('./sw.js',{type:'module'});registrationPromise.catch(error=>log('offline-registration-failed',error.name));}
configureSession();load(false,initialPosition);renderReport();showOfflineStatus();log('opened',standalone?'standalone':'browser');
