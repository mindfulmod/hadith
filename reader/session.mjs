/* Estimates choose whole entries; they never shorten source text. */
export function planSession(entries, startNumber, minutes = 5, wordsPerMinute = 160) {
 const start = Math.max(0, entries.findIndex(e => e.number === startNumber));
 const target = (minutes === 10 ? 10 : 5) * 60;
 const selected = []; let seconds = 0;
 for (const entry of entries.slice(start)) {
  const duration = entry.english_blocks.join(' ').trim().split(/\s+/u).length / wordsPerMinute * 60;
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
