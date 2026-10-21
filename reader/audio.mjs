import {store} from './store.js';
import {recording as defaultRecording,recordings,playbackRecordings,recordingForNumber,recordedChapter} from './recording.mjs';
import {chapterAt,safePosition} from './session.mjs';
import {listeningPlan} from './listening-plan.mjs';
const audio=document.querySelector('#narration'),player=document.querySelector('#player');
const $=s=>document.querySelector(s);
let recording=defaultRecording,activated=false,pendingSeek=null,lastSaved=0,busy=false,playAttempt=0,queuePlan=null,queueIndex=0,queueComplete=false,continueQueue=false;
const time=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const sourceURL=()=>new URL(recording.src,import.meta.url).href;
const mediaMatches=()=>audio.getAttribute('src')===sourceURL();
const position=()=>pendingSeek??(mediaMatches()?audio.currentTime:0);
const chapter=()=>chapterAt(recording.chapters,position());
const mediaDuration=()=>mediaMatches()&&Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:recording.duration;
function session(type){try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}}
function save(){if(activated)store.set({audio:{release:recording.id,seconds:audio.ended&&mediaMatches()?(queuePlan?recording.duration:0):position()}});}
function metadata(){
 if(!activated||!('mediaSession'in navigator))return;
 navigator.mediaSession.metadata=new MediaMetadata({title:`Hadith ${chapter().number} · Sahih al-Bukhari`,artist:`${recording.voice} · AI narration under review`,album:recording.album,artwork:[{src:new URL('icon-512.png',import.meta.url).href,sizes:'512x512',type:'image/png'}]});
}
export const getActiveRecording=()=>recording;
export const getListeningState=()=>queuePlan?{...queuePlan,index:queueIndex,complete:queueComplete}:null;
const queueStep=()=>queuePlan?.steps[queueIndex];
const allowedChapters=()=>queueStep()?.recordingId===recording.id?recording.chapters.filter(c=>queueStep().numbers.includes(c.number)):recording.chapters;
function clearQueue(){queuePlan=null;queueIndex=0;queueComplete=false;continueQueue=false;}

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
 const chapters=allowedChapters();
 $('#audio-previous').disabled=c===chapters[0]&&seconds<chapters[0].start+1&&(!queuePlan||queueIndex===0);
 $('#audio-next').disabled=c===chapters.at(-1)&&(!queuePlan||queueIndex===queuePlan.steps.length-1);
 if(activated&&'mediaSession'in navigator){
  const key=recording.id+':'+c.number;if($('#audio-title').dataset.chapter!==key){metadata();$('#audio-title').dataset.chapter=key;}
  navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
  try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:seconds});}catch{}
 }
 document.dispatchEvent(new CustomEvent('hadith:audio'));
}
function setPosition(value){
 if(!Number.isFinite(value))return;
 queueComplete=false;
 const next=Math.min(Math.max(queueStep()?.start||0,value),Math.max(0,mediaDuration()-.1));
 if(mediaMatches()&&audio.readyState>0){audio.currentTime=next;pendingSeek=null;}else pendingSeek=next;
 update();
}
function ensureSource(){if(!mediaMatches()){const next=pendingSeek??0,rate=audio.playbackRate;audio.src=sourceURL();audio.playbackRate=rate;pendingSeek=next;}}
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
 activate();if(audio.ended)setPosition(queueStep()?.start||0);continueQueue=!!queuePlan;if(audio.error){pendingSeek=position();audio.load();}session('playback');busy=true;$('#audio-message').textContent='';
 const attempt=++playAttempt;update();
 try{await audio.play();}
 catch{if(attempt===playAttempt){session('auto');$('#audio-message').textContent='Playback did not start. Tap Play again, or reconnect and finish saving this Cedar recording.';}}
 finally{if(attempt===playAttempt){busy=false;update();}}
}
export function listen(number){
 const target=recordingForNumber(number);if(!target)return false;
 clearQueue();selectRecording(target);activate();setPosition(recordedChapter(number).start);play();return true;
}
export function listenAlong(number){
 const target=recordingForNumber(number);if(!target)return false;
 if(activated&&!audio.ended&&chapter().number===number){play();return true;}
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
 if(queuePlan&&queueStep()?.numbers.includes(number)&&chapter().number===number){update();return true;}
 clearQueue();selectRecording(target);
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
 const target=recordingId===undefined?(activated?recording:playbackRecordings.find(r=>r.id===saved?.release)??defaultRecording):playbackRecordings.find(r=>r.id===recordingId);
 if(!target)return false;
 clearQueue();
 if(!activated||target.id!==recording.id){selectRecording(target);setPosition(saved?.release===target.id?safePosition(saved.seconds,target.duration):0);}
 play();return true;
}


function playQueueStep(index,seconds){
 const step=queuePlan.steps[index],target=playbackRecordings.find(r=>r.id===step.recordingId);
 if(!target)return false;
 queueIndex=index;queueComplete=false;selectRecording(target);activate();setPosition(seconds??step.start);save();play();return true;
}
export function listenSession(numbers,{number}={}){
 const plan=listeningPlan(numbers,recordings);if(!plan?.steps.length)return false;
 if(number!==undefined&&!plan.playable.includes(number))return false;
 if(number===undefined&&queuePlan?.key===plan.key&&!queueComplete){play();return true;}
 const saved=store.get().audio,restart=number===undefined&&(queueComplete&&queuePlan?.key===plan.key||plan.steps.some(s=>s.recordingId===saved?.release&&saved.seconds>=playbackRecordings.find(r=>r.id===s.recordingId).duration));
 let index=number===undefined?plan.steps.findIndex(s=>s.recordingId===saved?.release):plan.steps.findIndex(s=>s.numbers.includes(number));
 if(index<0||restart)index=0;
 const step=plan.steps[index],target=playbackRecordings.find(r=>r.id===step.recordingId);
 const seconds=restart?step.start:number!==undefined?target.chapters.find(c=>c.number===number).start:saved?.release===target.id?Math.max(step.start,safePosition(saved.seconds,target.duration)):step.start;
 queuePlan=plan;return playQueueStep(index,seconds);
}
function moveChapter(direction){
 const chapters=allowedChapters(),index=chapters.indexOf(chapter()),next=chapters[index+direction];
 if(next){setPosition(next.start);queueComplete=false;return;}
 if(direction<0&&(!queuePlan||queueIndex===0)){setPosition(chapters[0].start);return;}
 const stepIndex=queueIndex+direction;
 if(queuePlan&&stepIndex>=0&&stepIndex<queuePlan.steps.length){
  const wasPlaying=!audio.paused&&!audio.ended,step=queuePlan.steps[stepIndex],target=playbackRecordings.find(r=>r.id===step.recordingId);
  queueIndex=stepIndex;queueComplete=false;selectRecording(target);activate();setPosition(direction<0?allowedChapters().at(-1).start:step.start);save();if(wasPlaying)play();else update();
 }
}

function pause(){continueQueue=false;playAttempt++;busy=false;audio.pause();save();session('auto');update();}
$('#audio-toggle').onclick=()=>audio.paused?(queueComplete?playQueueStep(0):play()):pause();
$('#audio-back').onclick=()=>setPosition(position()-15);$('#audio-forward').onclick=()=>setPosition(position()+15);
$('#audio-previous').onclick=()=>moveChapter(-1);
$('#audio-next').onclick=()=>moveChapter(1);
$('#audio-seek').addEventListener('input',e=>setPosition(Number(e.target.value)));
$('#audio-close').onclick=()=>{pause();clearQueue();player.hidden=true;document.body.classList.remove('has-player');if('mediaSession'in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}activated=false;$('#dock a')?.focus({preventScroll:true});};
$('#audio-speed').onchange=e=>{audio.playbackRate=Number(e.target.value);update();};
audio.addEventListener('loadedmetadata',()=>{if(pendingSeek!==null)setPosition(pendingSeek);update();});
audio.addEventListener('timeupdate',()=>{update();if(Date.now()-lastSaved>2000){save();lastSaved=Date.now();}});
for(const event of ['play','pause','seeked','durationchange'])audio.addEventListener(event,update);
audio.addEventListener('waiting',()=>{busy=true;update();});audio.addEventListener('playing',()=>{busy=false;update();});
audio.addEventListener('ended',()=>{
 if(!audio.ended||!mediaMatches())return;
 playAttempt++;busy=false;save();
 // Start the next file immediately on the same element; no cache or network await here.
 if(queuePlan&&continueQueue&&queueIndex+1<queuePlan.steps.length){playQueueStep(queueIndex+1);return;}
 queueComplete=!!queuePlan;continueQueue=false;session('auto');
 $('#audio-message').textContent=queuePlan?(queuePlan.nextNumber?`Audio stops here. Continue with Hadith ${queuePlan.nextNumber} in reading.`:'Listening session complete. Your reading marks are kept separately.'):'Recording complete. Your reading marks are kept separately.';update();
});
audio.addEventListener('error',()=>{continueQueue=false;playAttempt++;busy=false;save();session('auto');$('#audio-message').textContent='This recording could not load. Your place is kept. Reconnect and save its Cedar audio from your session page.';update();});
window.addEventListener('pagehide',()=>{save();session('auto');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
if('mediaSession'in navigator){
 const handlers={play:()=>queueComplete?playQueueStep(0):play(),pause,seekbackward:d=>setPosition(position()-(d.seekOffset||15)),seekforward:d=>setPosition(position()+(d.seekOffset||15)),seekto:d=>setPosition(d.seekTime),previoustrack:()=>$('#audio-previous').click(),nexttrack:()=>$('#audio-next').click()};
 let bound=false;audio.addEventListener('play',()=>{if(bound)return;bound=true;for(const [action,handler]of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}});
}
new ResizeObserver(()=>document.documentElement.style.setProperty('--player-height',player.hidden?'0px':player.getBoundingClientRect().height+'px')).observe(player);
