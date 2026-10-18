/* Personal state is separate from the immutable source bundle and the audio pilot. */
window.HadithStore = (() => {
 const key='mindfulmod-hadith-reader-v1';
 const defaults={theme:'device',size:21,font:'serif',spacious:false,art:true,last:1,saved:[],finished:[],positions:{},minutes:5,audio:null,followAudio:true};
 let value={...defaults};let available=true;
 try {const parsed=JSON.parse(localStorage.getItem(key)||'null');if(parsed&&typeof parsed==='object')value={...defaults,...parsed};} catch {available=false;}
 const ids=new Set(window.HadithContent.entries.map(e=>e.number));
 value.minutes=value.minutes===10?10:5;
 value.followAudio=value.followAudio!==false;
 value.saved=Array.isArray(value.saved)?value.saved.filter(n=>ids.has(n)):[];
 value.finished=Array.isArray(value.finished)?value.finished.filter(n=>ids.has(n)):[];
 value.positions=value.positions&&typeof value.positions==='object'?value.positions:{};
 value.last=ids.has(value.last)?value.last:window.HadithContent.entries[0].number;
 value.size=[18,21,24,28].includes(value.size)?value.size:21;
 value.theme=['day','night','device'].includes(value.theme)?value.theme:'device';
 value.font=value.font==='sans'?'sans':'serif';
 return {get:()=>value,available:()=>available,set(patch){value={...value,...patch};try{localStorage.setItem(key,JSON.stringify(value));}catch{available=false;}return value;}};
})();
