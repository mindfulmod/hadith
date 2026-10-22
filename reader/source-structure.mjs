/* Layout ranges address Unicode code points in unchanged canonical source blocks.
   Classification is reviewed content metadata, never inferred from wording. */
import {sourceHTML} from './source-format.mjs';
const kinds=new Set(['chain','report','letter','transmission-note']);
const requireValue=(value,message)=>{if(!value)throw new Error(message);};
export function sourceSegments(entry,language){
 requireValue(['english','arabic'].includes(language),'Unknown source language');
 const blocks=entry[language+'_blocks'];
 requireValue(Array.isArray(blocks)&&blocks.length>0&&blocks.every(b=>typeof b==='string'&&b.trim()),'Incomplete source blocks');
 const points=blocks.map(b=>Array.from(b));
 let ranges;
 if(entry.presentation===undefined){
  // Compatibility only for the two existing, hash-locked opening records.
  requireValue([1,2].includes(entry.number)&&entry.id===`bukhari:${entry.number}`&&blocks.length===2,'Explicit source presentation required');
  ranges=points.map((p,block)=>({block,start:0,end:p.length,kind:block===0?'chain':'report'}));
 }else{
  requireValue(entry.presentation?.schemaVersion===1,'Unsupported source presentation');
  ranges=entry.presentation[language];
  requireValue(Array.isArray(ranges)&&ranges.length>0,'Missing source presentation');
 }
 const supplements=entry.review?.arabicSupplements||[],seenSupplements=new Set();
 requireValue(Array.isArray(supplements)&&new Set(supplements.map(a=>a.id)).size===supplements.length,'Invalid printed supplement records');
 let block=0,offset=0;
 const segments=ranges.map(range=>{
  requireValue(range&&Number.isSafeInteger(range.block)&&Number.isSafeInteger(range.start)&&Number.isSafeInteger(range.end)&&kinds.has(range.kind),'Invalid source range');
  requireValue(range.block===block&&range.start===offset&&block<points.length&&range.end>offset&&range.end<=points[block].length,'Source ranges must cover each block exactly once in order');
  const segment={...range,text:points[block].slice(offset,range.end).join('')};
  if(range.provenance!==undefined){
   const origin=range.provenance,item=supplements.find(a=>a.id===origin.id);
   requireValue(origin.kind==='printed-supplement'&&item&&!seenSupplements.has(item.id),'Unknown or repeated printed provenance');
   requireValue(range.kind===item.kind&&item.kind==='transmission-note'&&segment.text===item[language]&&range.start===0&&range.end===points[block].length,'Printed supplement wording or presentation differs');
   seenSupplements.add(item.id);
  }
  offset=range.end;
  if(offset===points[block].length){block++;offset=0;}
  return segment;
 });
 requireValue(block===points.length&&offset===0,'Source presentation omits text');
 requireValue(seenSupplements.size===supplements.length,'Printed supplement is not visibly identified');
 requireValue(segments.some(s=>s.kind==='report'||s.kind==='letter'),'Source presentation has no narration');
 return segments;
}
export function validateSourceStructure(entry){
 for(const language of ['english','arabic'])sourceSegments(entry,language);
}
export function narrationHTML(entry){
 const groups=[];
 for(const segment of sourceSegments(entry,'english')){
  if(groups.at(-1)?.kind===segment.kind&&groups.at(-1)?.provenance?.id===segment.provenance?.id)groups.at(-1).segments.push(segment);
  else groups.push({kind:segment.kind,provenance:segment.provenance,segments:[segment]});
 }
 return groups.map(({kind,segments,provenance},index)=>{
  const paragraphs=segments.map(s=>`<p data-source-block="english-${s.block}" data-source-start="${s.start}" data-source-end="${s.end}">${sourceHTML(s.text)}</p>`).join('');
  if(kind==='chain')return `<details class="chain"><summary>Chain of narrators <span>${index===0?'Full introduction':'Full chain'}</span></summary><div class="prose">${paragraphs}</div></details>`;
  if(kind==='transmission-note')return `<section class="source-note" aria-label="Transmission note"><p class="source-section-label">${provenance?'Transmission note · from an Arabic print':'Transmission note'}</p><div class="prose">${paragraphs}</div></section>`;
  if(kind==='letter')return `<section class="source-letter" aria-label="Letter in the narration"><p class="source-section-label">Letter in the narration</p><div class="prose">${paragraphs}</div></section>`;
  return `<div class="narration prose">${paragraphs}</div>`;
 }).join('');
}
