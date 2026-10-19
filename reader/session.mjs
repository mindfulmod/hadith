/* Estimates choose whole entries; they never shorten source text. */
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
 const start=Array.isArray(numbers)?all.indexOf(numbers[0]):-1;
 const valid=start>=0&&numbers.length>0&&numbers.every((n,i)=>all[start+i]===n);
 if(!valid)return startSession(entries,all.includes(last)?last:all[0],minutes);
 const cursor=numbers.includes(saved.cursor)?saved.cursor:numbers.includes(last)?last:numbers[0];
 return {numbers:[...numbers],cursor,ended:saved.ended===true};
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
