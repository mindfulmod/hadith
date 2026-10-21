import {recordings} from './recordings.mjs';
export {recordings};
// Preserve the original default and saved recording ID when the catalogue grows.
export const recording=recordings.find(item=>item.id==='cedar-opening-v1')??recordings[0];
export const recordingForNumber=number=>recordings.find(item=>item.chapters.some(chapter=>chapter.number===number))??null;
export const recordedChapter=number=>recordingForNumber(number)?.chapters.find(chapter=>chapter.number===number)??null;
export function recordingCoverage(numbers){
 const recorded=numbers.filter(number=>recordedChapter(number)),missing=numbers.filter(number=>!recordedChapter(number));
 const completeRecording=recordings.find(item=>JSON.stringify(item.chapters.map(c=>c.number))===JSON.stringify(numbers))??null;
 return {recorded,missing,completeRecording};
}
