const audio=document.querySelector('#audition');
const status=document.querySelector('#voice-status');
const buttons=[...document.querySelectorAll('[data-voice]')];
let current='',request=0;
function release(){try{if(navigator.audioSession)navigator.audioSession.type='auto';}catch{}if('mediaSession' in navigator)navigator.mediaSession.metadata=null;}
buttons.forEach(button=>button.addEventListener('click',async()=>{
 const id=++request; audio.pause(); current=button.dataset.voice;
 const name=button.querySelector('strong').textContent;
 buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 audio.src=`./audio/audition-${current}-v1.mp3`;
 status.textContent=`Loading ${name}…`;
 try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
 if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:`${name} · Voice audition`,artist:'Hadith · AI-generated sample'});}
 try{await audio.play();if(id===request)status.textContent=`Listening to ${name}`;}
 catch(error){if(error.name==='AbortError')return;if(id===request){status.textContent='Could not start. Check your connection and try again.';release();}}
}));
audio.addEventListener('ended',()=>{status.textContent='Sample finished. Try the other voice, or replay this one.';release();});
audio.addEventListener('error',()=>{status.textContent='The sample could not load. Check your connection and try again.';release();});

audio.addEventListener('playing',()=>{status.textContent=`Listening to ${current==='cedar'?'Cedar':'Marin'}`;});
audio.addEventListener('pause',()=>{if(!audio.ended)status.textContent='Paused. Press play to continue.';});
