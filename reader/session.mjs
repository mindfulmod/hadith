/* Estimates choose whole entries; they never shorten source text. */
import {validReference,compareReferences,orderedReferences} from './references.mjs';
export function readingSeconds(entry,wordsPerMinute=160){
 const words=entry.englishWords??entry.english_blocks.join(' ').trim().split(/\s+/u).length;
 return words/wordsPerMinute*60;
}
export function planSession(entries,startNumber,minutes=5,wordsPerMinute=160){
 const start=Math.max(0,entries.findIndex(e=>e.number===startNumber));
 const target=(minutes===10?10:5)*60;
 const selected=[];let seconds=0;
 for(const entry of entries.slice(start)){
  selected.push(entry.number);seconds+=readingSeconds(entry,wordsPerMinute);
  if(seconds>=target)break;
 }
 return {numbers:selected,seconds,target,short:seconds<target};
}
export function startSession(entries,startNumber,minutes=5){
 const numbers=planSession(entries,startNumber,minutes).numbers;
 return {numbers,cursor:numbers[0],ended:false};
}
/* A valid saved session is finite: browsing and new publications cannot enlarge it. */
export function resolveSession(entries,saved,minutes=5,last=entries[0]?.number){
 const all=entries.map(e=>e.number),numbers=saved?.numbers;
 // New reports may be inserted between old entries. Preserve the saved ordered
 // subset; duplicates, reversals and removed/unknown entries still recover.
 const valid=orderedReferences(numbers,all);
 if(!valid)return startSession(entries,all.includes(last)?last:all[0],minutes);
 const cursor=numbers.includes(saved.cursor)?saved.cursor:numbers.includes(last)?last:numbers[0];
 return rememberSessionPending({numbers:[...numbers],cursor,ended:saved.ended===true},saved.pendingNumbers);
}
/* Remember leading and internal holds so a later addition can be offered apart
   from the session. This metadata contains references only, never source text. */
export function rememberSessionPending(saved,pending=[]){
 const pendingNumbers=[...new Set([...(saved.pendingNumbers||[]),...(Array.isArray(pending)?pending:[])].filter(n=>validReference(n)&&!saved.numbers.includes(n)))].sort(compareReferences);
 return pendingNumbers.length?{...saved,pendingNumbers}:saved;
}
export function sessionAvailable(entries,saved){
 const selected=new Set(saved.numbers),remembered=new Set(saved.pendingNumbers||[]),first=entries.findIndex(e=>e.number===saved.numbers[0]),last=entries.findIndex(e=>e.number===saved.numbers.at(-1));
 // Legacy sessions lack hold metadata. An omitted entry inside their finite
 // span is still available separately; do not claim when it was published.
 return entries.filter((e,i)=>!selected.has(e.number)&&(remembered.has(e.number)||first>=0&&i>first&&i<last));
}
export function visitSession(saved,number){return saved.numbers.includes(number)?{...saved,cursor:number}:saved;}
export function nextSession(entries,saved,minutes=5){
 const index=entries.findIndex(e=>e.number===saved.numbers.at(-1));
 return index<0||index===entries.length-1?null:startSession(entries,entries[index+1].number,minutes);
}
export function chapterAt(chapters,seconds){return chapters.findLast(c=>c.start<=Math.max(0,Number(seconds)||0))||chapters[0];}
export function safePosition(seconds,duration){return Number.isFinite(seconds)&&seconds>=0&&seconds<duration-.25?seconds:0;}
/* Follow whole entries only, and defer while a dialog or hidden page is in use. */
export function followTarget({enabled,mode,current,chapter,playing,blocked}){return enabled&&mode==='read'&&playing&&!blocked&&chapter!==current?chapter:null;}
