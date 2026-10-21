import {store} from './store.js';
import {recording as defaultRecording,recordings,recordingForNumber,recordedChapter} from './recording.mjs';
import {chapterAt,safePosition} from './session.mjs';
const audio=document.querySelector('#narration'),player=document.querySelector('#player');
const $=s=>document.querySelector(s);
let recording=defaultRecording,activated=false,pendingSeek=null,lastSaved=0,busy=false,playAttempt=0;
const time=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const sourceURL=()=>new URL(recording.src,import.meta.url).href;
const mediaMatches=()=>audio.getAttribute('src')===sourceURL();
const position=()=>pendingSeek??(mediaMatches()?audio.currentTime:0);
const chapter=()=>chapterAt(recording.chapters,position());
const mediaDuration=()=>mediaMatches()&&Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:recording.duration;
function session(type){try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}}
function save(){if(activated)store.set({audio:{release:recording.id,seconds:audio.ended&&mediaMatches()?0:position()}});}
function metadata(){
 if(!activated||!('mediaSession'in navigator))return;
 navigator.mediaSession.metadata=new MediaMetadata({title:`Hadith ${chapter().number} · Sahih al-Bukhari`,artist:`${recording.voice} · AI narration under review`,album:recording.album,artwork:[{src:new URL('icon-512.png',import.meta.url).href,sizes:'512x512',type:'image/png'}]});
}
export const getActiveRecording=()=>recording;
export function getPlaybackState(){return {recordingId:recording.id,number:chapter().number,seconds:position(),playing:activated&&mediaMatches()&&!audio.paused&&!audio.ended,active:activated,ended:mediaMatches()&&audio.ended};}
function update(){
 const c=chapter(),duration=mediaDuration(),seconds=Math.min(position(),duration);
 $('#audio-title').textContent=`Hadith ${c.number}`;$('#audio-room').href=`#listen/${c.number}`;
 $('#audio-toggle .audio-label').textContent=busy?'Loading…':audio.paused?'Play':'Pause';
 $('#audio-toggle .audio-symbol').textContent=busy?'…':audio.paused?'▶':'Ⅱ';
 $('#audio-progress').max=duration;$('#audio-progress').value=seconds;
 $('#audio-toggle').setAttribute('aria-label',audio.paused?'Play narration':'Pause narration');
 $('#audio-elapsed').textContent=time(seconds);$('#audio-total').textContent=time(duration);
 $('#audio-seek').max=duration;$('#audio-seek').value=seconds;$('#audio-seek').setAttribute('aria-valuetext',`${time(seconds)} of ${time(duration)}`);
 $('#audio-previous').disabled=c===recording.chapters[0]&&seconds<1;
 $('#audio-next').disabled=c===recording.chapters.at(-1);
 if(activated&&'mediaSession'in navigator){
  const key=recording.id+':'+c.number;if($('#audio-title').dataset.chapter!==key){metadata();$('#audio-title').dataset.chapter=key;}
  navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
  try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:seconds});}catch{}
 }
 document.dispatchEvent(new CustomEvent('hadith:audio'));
}
function setPosition(value){
 if(!Number.isFinite(value))return;
 const next=Math.min(Math.max(0,value),Math.max(0,mediaDuration()-.1));
 if(mediaMatches()&&audio.readyState>0){audio.currentTime=next;pendingSeek=null;}else pendingSeek=next;
 update();
}
function ensureSource(){if(!mediaMatches()){const next=pendingSeek??0;audio.src=sourceURL();pendingSeek=next;}}
function selectRecording(next){
 if(next.id===recording.id)return;
 save();playAttempt++;busy=false;audio.pause();
 recording=next;pendingSeek=0;lastSaved=0;$('#audio-message').textContent='';
}
function activate(){
 activated=true;player.hidden=false;document.body.classList.add('has-player');ensureSource();
 if(pendingSeek!==null&&audio.readyState>0)setPosition(pendingSeek);
 metadata();
}
async function play(){
 activate();if(audio.ended)setPosition(0);if(audio.error){pendingSeek=position();audio.load();}session('playback');busy=true;$('#audio-message').textContent='';
 const attempt=++playAttempt;update();
 try{await audio.play();}
 catch{if(attempt===playAttempt){session('auto');$('#audio-message').textContent='Playback did not start. Tap Play again, or reconnect and finish saving this Cedar recording.';}}
 finally{if(attempt===playAttempt){busy=false;update();}}
}
export function listen(number){
 const target=recordingForNumber(number);if(!target)return false;
 selectRecording(target);activate();setPosition(recordedChapter(number).start);play();return true;
}
export function listenAlong(number){
 const target=recordingForNumber(number);if(!target)return false;
 if(activated&&!audio.ended&&recording.id===target.id&&chapter().number===number){play();return true;}
 const saved=store.get().audio,seconds=saved?.release===target.id?safePosition(saved.seconds,target.duration):0;
 if(!activated&&chapterAt(target.chapters,seconds).number===number){selectRecording(target);setPosition(seconds);play();}
 else listen(number);
 return true;
}
export function prepareListening(number){
 const target=recordingForNumber(number);if(!target)return false;
 player.hidden=false;document.body.classList.add('has-player');
 // Opening a route does not replace media that is currently playing.
 if(activated&&!audio.paused&&!audio.ended){update();return true;}
 selectRecording(target);
 const requested=recordedChapter(number);
 if(!activated){
  const saved=store.get().audio,seconds=saved?.release===recording.id?safePosition(saved.seconds,recording.duration):0;
  setPosition(chapterAt(recording.chapters,seconds).number===number?seconds:requested.start);
 }else if(!busy){
  ensureSource();if(audio.ended||chapter().number!==number)setPosition(requested.start);
 }
 update();return true;
}
export function resumeListening(recordingId){
 const saved=store.get().audio;
 const target=recordingId===undefined?(activated?recording:recordings.find(r=>r.id===saved?.release)??defaultRecording):recordings.find(r=>r.id===recordingId);
 if(!target)return false;
 if(!activated||target.id!==recording.id){selectRecording(target);setPosition(saved?.release===target.id?safePosition(saved.seconds,target.duration):0);}
 play();return true;
}

function pause(){playAttempt++;busy=false;audio.pause();save();session('auto');update();}
$('#audio-toggle').onclick=()=>audio.paused?play():pause();
$('#audio-back').onclick=()=>setPosition(position()-15);$('#audio-forward').onclick=()=>setPosition(position()+15);
$('#audio-previous').onclick=()=>{const index=recording.chapters.indexOf(chapter());setPosition(recording.chapters[Math.max(0,index-1)].start);};
$('#audio-next').onclick=()=>{const index=recording.chapters.indexOf(chapter());setPosition(recording.chapters[Math.min(recording.chapters.length-1,index+1)].start);};
$('#audio-seek').addEventListener('input',e=>setPosition(Number(e.target.value)));
$('#audio-close').onclick=()=>{pause();player.hidden=true;document.body.classList.remove('has-player');if('mediaSession'in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}activated=false;$('#dock a')?.focus({preventScroll:true});};
$('#audio-speed').onchange=e=>{audio.playbackRate=Number(e.target.value);update();};
audio.addEventListener('loadedmetadata',()=>{if(pendingSeek!==null)setPosition(pendingSeek);update();});
audio.addEventListener('timeupdate',()=>{update();if(Date.now()-lastSaved>2000){save();lastSaved=Date.now();}});
for(const event of ['play','pause','seeked','durationchange'])audio.addEventListener(event,update);
audio.addEventListener('waiting',()=>{busy=true;update();});audio.addEventListener('playing',()=>{busy=false;update();});
audio.addEventListener('ended',()=>{playAttempt++;busy=false;save();session('auto');$('#audio-message').textContent='Recording complete. Your reading marks are kept separately.';update();});
audio.addEventListener('error',()=>{playAttempt++;busy=false;save();session('auto');$('#audio-message').textContent='This recording could not load. Your place is kept. Reconnect and save its Cedar audio from your session page.';update();});
window.addEventListener('pagehide',()=>{save();session('auto');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
if('mediaSession'in navigator){
 const handlers={play,pause,seekbackward:d=>setPosition(position()-(d.seekOffset||15)),seekforward:d=>setPosition(position()+(d.seekOffset||15)),seekto:d=>setPosition(d.seekTime),previoustrack:()=>$('#audio-previous').click(),nexttrack:()=>$('#audio-next').click()};
 let bound=false;audio.addEventListener('play',()=>{if(bound)return;bound=true;for(const [action,handler]of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}});
}
new ResizeObserver(()=>document.documentElement.style.setProperty('--player-height',player.hidden?'0px':player.getBoundingClientRect().height+'px')).observe(player);
