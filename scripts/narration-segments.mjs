/* Preserve every input character while splitting only between complete paragraphs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function splitNarration(script,limit=999){
 assert(typeof script==='string'&&script.trim(),'Empty narration script');
 assert(Number.isSafeInteger(limit)&&limit>2,'Invalid narration input limit');
 const parts=[];let start=0;
 while(start<script.length){
  let end=Math.min(start+limit,script.length);
  if(end<script.length){const boundary=script.slice(start,end).lastIndexOf('\n\n');assert(boundary>=0,'A complete paragraph exceeds the studio input limit');end=start+boundary+2;}
  const text=script.slice(start,end);assert(text.trim(),'Empty narration segment');
  parts.push({index:parts.length+1,start,end,text,sha256:hash(text)});start=end;
 }
 assert.equal(parts.map(p=>p.text).join(''),script,'Narration split changed text');return parts;
}
export function validateSegmentedEvidence(evidence,chapters,{readOriginal}){
 assert(evidence.segmentation?.schemaVersion===1,'Missing segmented generation evidence');
 const {limit,entries}=evidence.segmentation;
 assert(evidence.segmentation.offsetUnit==='utf16-code-units'&&Number.isSafeInteger(limit)&&limit<=999,'Unexpected studio input limit or offset unit');
 assert(Array.isArray(entries)&&entries.length===chapters.length,'Segmented entry coverage differs');
 assert.equal(typeof readOriginal,'function','Original recording reader is required');
 const paths=new Set();
 for(const [i,entry]of entries.entries()){
  assert.equal(entry.number,chapters[i].number,'Segmented reference differs');
  assert.equal(entry.scriptSha256,hash(evidence.scripts[i]),'Segmented script hash differs');
  const expected=splitNarration(evidence.scripts[i],limit);
  assert.equal(entry.parts.length,expected.length,'Missing or extra narration segment');
  for(const [j,part]of entry.parts.entries()){
   assert.deepEqual(Object.fromEntries(['index','start','end','text','sha256'].map(k=>[k,part[k]])),expected[j],'Narration segment differs from exact ordered script');
   const asset=part.original;
   assert(/^content\/audio\/raw\/[a-z0-9-]+\.mp3$/.test(asset?.path)&&!paths.has(asset.path),'Invalid or repeated original audio path');paths.add(asset.path);
   const bytes=readOriginal(asset.path);assert(bytes.length===asset.bytes&&hash(bytes)===asset.sha256,'Original recording bytes changed');
  }
 }
}
