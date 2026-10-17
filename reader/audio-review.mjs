import './offline.mjs';
const s=window.HadithStore.get();document.documentElement.dataset.theme=s.theme==='night'||(s.theme==='device'&&matchMedia('(prefers-color-scheme:dark)').matches)?'night':'day';
document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(b=>{if(a!==b)b.pause();})));
