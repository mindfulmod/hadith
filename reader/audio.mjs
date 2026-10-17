import {recording} from './recording.mjs';
import {chapterAt,safePosition} from './session.mjs';
const audio=document.querySelector('#narration'), player=document.querySelector('#player');
const store=window.HadithStore, $=s=>document.querySelector(s);
let activated=false, pendingSeek=null, lastSaved=0, busy=false;
const time=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const chapter=()=>chapterAt(recording.chapters,audio.currentTime);
function session(type){try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}}
function save(){if(!activated)return;store.set({audio:{release:recording.id,seconds:audio.ended?0:audio.currentTime}});}
function metadata(){
 if(!activated||!('mediaSession' in navigator))return;
 const c=chapter();
 navigator.mediaSession.metadata=new MediaMetadata({title:`Hadith ${c.number} · Sahih al-Bukhari`,artist:'Cedar · AI narration under review',album:'The Beginning of Revelation',artwork:[{src:new URL('icon-512.png',import.meta.url).href,sizes:'512x512',type:'image/png'}]});
}
function update(){
 const c=chapter(),duration=Number.isFinite(audio.duration)?audio.duration:recording.duration;
 $('#audio-title').textContent=`Hadith ${c.number} of ${recording.chapters.length}`;
 $('#audio-reading').href=`#read/${c.number}`;
 $('#audio-toggle').textContent=busy?'Loading…':audio.paused?'Play':'Pause';
 $('#audio-toggle').setAttribute('aria-label',audio.paused?'Play narration':'Pause narration');
 $('#audio-elapsed').textContent=time(audio.currentTime);$('#audio-total').textContent=time(duration);
 $('#audio-seek').max=duration;$('#audio-seek').value=audio.currentTime;
 $('#audio-seek').setAttribute('aria-valuetext',`${time(audio.currentTime)} of ${time(duration)}`);
 $('#audio-previous').disabled=c===recording.chapters[0]&&audio.currentTime<1;
 $('#audio-next').disabled=c===recording.chapters.at(-1);
 if(activated&&'mediaSession' in navigator){
  if($('#audio-title').dataset.chapter!==String(c.number)){metadata();$('#audio-title').dataset.chapter=c.number;}
  navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
  try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,duration)});}catch{}
 }
}
function setPosition(value){
 const duration=Number.isFinite(audio.duration)?audio.duration:recording.duration;
 const next=Math.min(Math.max(0,value),Math.max(0,duration-.1));
 if(audio.readyState>0){audio.currentTime=next;pendingSeek=null;}else pendingSeek=next;
 update();
}
function activate(){
 activated=true;player.hidden=false;document.body.classList.add('has-player');
 if(!audio.getAttribute('src'))audio.src=new URL(recording.src,import.meta.url).href;
 metadata();
}
async function play(){
 activate();session('playback');busy=true;$('#audio-message').textContent='';update();
 try{await audio.play();}
 catch{session('auto');$('#audio-message').textContent='Playback did not start. Tap Play again, or reconnect and finish saving the offline sample.';}
 finally{busy=false;update();}
}
export function listen(number){activate();const c=recording.chapters.find(c=>c.number===number)||recording.chapters[0];setPosition(c.start);play();}
export function resumeListening(){activate();const saved=store.get().audio;setPosition(saved?.release===recording.id?safePosition(saved.seconds,recording.duration):0);play();}
function pause(){audio.pause();save();session('auto');update();}
$('#audio-toggle').onclick=()=>audio.paused?play():pause();
$('#audio-back').onclick=()=>setPosition(audio.currentTime-15);
$('#audio-forward').onclick=()=>setPosition(audio.currentTime+15);
$('#audio-previous').onclick=()=>{const index=recording.chapters.indexOf(chapter());setPosition(recording.chapters[Math.max(0,index-1)].start);};
$('#audio-next').onclick=()=>{const index=recording.chapters.indexOf(chapter());setPosition(recording.chapters[Math.min(recording.chapters.length-1,index+1)].start);};
$('#audio-seek').addEventListener('input',e=>setPosition(Number(e.target.value)));
$('#audio-close').onclick=()=>{pause();player.hidden=true;document.body.classList.remove('has-player');if('mediaSession' in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}activated=false;};
$('#audio-speed').onchange=e=>{audio.playbackRate=Number(e.target.value);update();};
audio.addEventListener('loadedmetadata',()=>{if(pendingSeek!==null)setPosition(pendingSeek);update();});
audio.addEventListener('timeupdate',()=>{update();if(Date.now()-lastSaved>2000){save();lastSaved=Date.now();}});
for(const event of ['play','pause','seeked','durationchange'])audio.addEventListener(event,update);
audio.addEventListener('waiting',()=>{busy=true;update();});
audio.addEventListener('playing',()=>{busy=false;update();});
audio.addEventListener('ended',()=>{busy=false;save();session('auto');$('#audio-message').textContent='Sample complete. Your reading marks are kept separately.';update();});
audio.addEventListener('error',()=>{busy=false;session('auto');$('#audio-message').textContent='Audio could not load. Reconnect and use Save for offline to check the complete download.';update();});
window.addEventListener('pagehide',()=>{save();session('auto');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
if('mediaSession' in navigator){
 const handlers={play,pause,seekbackward:d=>setPosition(audio.currentTime-(d.seekOffset||15)),seekforward:d=>setPosition(audio.currentTime+(d.seekOffset||15)),seekto:d=>setPosition(d.seekTime),previoustrack:()=>$('#audio-previous').click(),nexttrack:()=>$('#audio-next').click()};
 // Register lock-screen handlers only when the user initiates playback.
 let bound=false;audio.addEventListener('play',()=>{if(bound)return;bound=true;for(const [action,handler] of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}});
}
new ResizeObserver(()=>{document.documentElement.style.setProperty('--player-height',player.hidden?'0px':player.getBoundingClientRect().height+'px');}).observe(player);
