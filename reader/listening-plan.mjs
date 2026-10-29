/* A finite contiguous prefix. A missing recording is a stopping point, never a skip. */
import {validNumber,contiguousReferences} from './references.mjs';
import {playbackVariants} from './recording.mjs';
export function listeningPlan(numbers,recordings,entries){
 const all=entries?.map(e=>e.number);
 if(all?!contiguousReferences(numbers,all):!Array.isArray(numbers)||!numbers.length||numbers.some((n,i)=>!validNumber(n)||i&&n!==numbers[i-1]+1))return null;
 const steps=[],variants=playbackVariants(recordings);let i=0,reason='complete';
 while(i<numbers.length){
  const recording=recordings.find(r=>r.chapters.some(c=>c.number===numbers[i]));
  if(!recording){reason='unrecorded';break;}
  const first=recording.chapters.findIndex(c=>c.number===numbers[i]),tail=recording.chapters.slice(first);
  if(tail.every((c,j)=>c.number===numbers[i+j])){
   steps.push({recordingId:recording.id,start:tail[0].start,numbers:tail.map(c=>c.number),duration:recording.duration-tail[0].start});i+=tail.length;
  }else{
   const single=variants.find(r=>r.parentId===recording.id&&r.chapters[0].number===numbers[i]);
   if(!single){reason='boundary-unavailable';break;}
   steps.push({recordingId:single.id,start:0,numbers:[numbers[i]],duration:single.duration});i++;
  }
 }
 return {key:numbers.join(','),numbers:[...numbers],playable:steps.flatMap(s=>s.numbers),steps,nextNumber:numbers[i]??null,reason,duration:steps.reduce((sum,s)=>sum+s.duration,0)};
}
