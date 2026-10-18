/* Estimates choose whole entries; they never shorten source text. */
export function planSession(entries, startNumber, minutes = 5, wordsPerMinute = 160) {
 const start = Math.max(0, entries.findIndex(e => e.number === startNumber));
 const target = (minutes === 10 ? 10 : 5) * 60;
 const selected = []; let seconds = 0;
 for (const entry of entries.slice(start)) {
  const duration = (entry.englishWords ?? entry.english_blocks.join(' ').trim().split(/\s+/u).length) / wordsPerMinute * 60;
  selected.push(entry.number); seconds += duration;
  if (seconds >= target) break;
 }
 return {numbers:selected, seconds, target, short:seconds < target};
}
export function chapterAt(chapters, seconds) {
 return chapters.findLast(c => c.start <= Math.max(0, Number(seconds) || 0)) || chapters[0];
}
export function safePosition(seconds, duration) {
 return Number.isFinite(seconds) && seconds >= 0 && seconds < duration - .25 ? seconds : 0;
}

/* A saved session is finite and contiguous; adding content cannot lengthen it. */
export function resolveSession(entries, saved, minutes = 5, last = entries[0]?.number) {
 const all=entries.map(e=>e.number);
 const numbers=saved?.numbers;
 const start=Array.isArray(numbers)?all.indexOf(numbers[0]):-1;
 const valid=start>=0 && numbers.length>0 && numbers.every((n,i)=>all[start+i]===n);
 const selected=valid?[...numbers]:planSession(entries,all[0],minutes).numbers;
 const cursor=selected.includes(saved?.cursor)?saved.cursor:selected.includes(last)?last:selected[0];
 return {numbers:selected,cursor,ended:valid&&saved.ended===true};
}
/* Follow whole entries only, and defer while a dialog or hidden page is in use. */
export function followTarget({enabled,mode,current,chapter,playing,blocked}) {
 return enabled && mode==='read' && playing && !blocked && chapter!==current ? chapter : null;
}
