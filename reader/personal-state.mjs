/* Personal data never contains or changes the source text. */
export const storageKey='mindfulmod-hadith-reader-v1';
export const defaults=Object.freeze({theme:'device',size:21,font:'serif',spacious:false,art:true,last:1,saved:[],finished:[],positions:{},minutes:5,audio:null,followAudio:true});
export const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const validNumber=n=>Number.isSafeInteger(n)&&n>0&&n<=10000000;
const numbers=value=>Array.isArray(value)?[...new Set(value.filter(validNumber))]:[];
export function normalizeState(input){
 const value=isRecord(input)?input:{};
 const state={...defaults,saved:numbers(value.saved),finished:numbers(value.finished),positions:{}};
 for(const key of ['theme','font'])if((key==='theme'?['device','day','night']:['serif','sans']).includes(value[key]))state[key]=value[key];
 if([18,21,24,28].includes(value.size))state.size=value.size;
 state.minutes=value.minutes===10?10:5;
 for(const key of ['spacious','art','followAudio'])if(typeof value[key]==='boolean')state[key]=value[key];
 if(validNumber(value.last))state.last=value.last;
 if(isRecord(value.positions))for(const [n,y] of Object.entries(value.positions))if(/^\d+$/.test(n)&&validNumber(Number(n))&&Number.isFinite(y)&&y>=0&&y<=10000000)state.positions[n]=y;
 if(isRecord(value.audio)&&typeof value.audio.release==='string'&&value.audio.release.length<=100&&Number.isFinite(value.audio.seconds)&&value.audio.seconds>=0&&value.audio.seconds<=10000000)state.audio={release:value.audio.release,seconds:value.audio.seconds};
 const session=value.session;
 if(isRecord(session)&&Array.isArray(session.numbers)&&session.numbers.length&&session.numbers.every(validNumber)&&new Set(session.numbers).size===session.numbers.length&&session.numbers.includes(session.cursor))state.session={numbers:[...session.numbers],cursor:session.cursor,ended:session.ended===true};
 return state;
}
export function createPersonalStore(storage){
 let value=normalizeState(null),available=true,held=false;
 try{value=normalizeState(JSON.parse(storage.getItem(storageKey)||'null'));}catch{available=false;}
 return {
  get:()=>value,available:()=>available,
  holdWrites(){held=true;},
  set(patch){if(held)return value;value=normalizeState({...value,...patch});try{storage.setItem(storageKey,JSON.stringify(value));available=true;}catch{available=false;}return value;},
  /* Imports either persist completely or leave both live and stored state alone. */
  replaceTransactional(next){const candidate=normalizeState(next);storage.setItem(storageKey,JSON.stringify(candidate));value=candidate;available=true;return value;}
 };
}
