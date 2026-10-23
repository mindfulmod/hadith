/* Keep one authoritative layout resolver; reader admission consumes its exact checked output. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const root=new URL('../',import.meta.url);
const verified=new Map();
function checkedInventory(id){
 assert.equal(id,'ablution','Unknown mapped source book');
 if(!verified.has(id)){
  // The Python resolver checks the raw revision, audit, every original span and its review.
  // Keep this build-time dependency out of the browser and avoid a second layout algorithm.
  const resolved=execFileSync('python3',[fileURLToPath(new URL('scripts/resolve-wikisource-layout.py',root)),'--check','--json',id],{cwd:fileURLToPath(root),env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',maxBuffer:2*1024*1024});
  verified.set(id,JSON.parse(resolved));
 }
 return verified.get(id);
}
export function validateBookInventory(inventory,review,config){
 if('bookIntroduction' in inventory)assert.equal(config.bookIntroduction,'preserved-arabic','Book introductions need explicit reader provenance and browsing support before admission');
 if(config.sourceLayout!=='mapped'){
  assert(inventory.schemaVersion===1&&!('layoutReview' in inventory)&&!('layoutReviewSha256' in inventory)&&!('originalBlocks' in inventory),'Mapped source inventories need explicit reader provenance support before admission');
  assert.equal(review.sourceLayout,undefined,'Ordinary inventory cannot claim a layout map');return;
 }
 assert.equal(inventory.schemaVersion,2,'Mapped book requires its structural inventory');
 assert.deepEqual(inventory,checkedInventory(config.id),'Mapped inventory differs from the authoritative checked source map');
 assert.deepEqual(review.sourceLayout,layoutEvidence(inventory),'Batch must explicitly bind its source layout review');
}
export function layoutEvidence(inventory){
 return {schemaVersion:1,sourceId:inventory.sourceId,sourceSha256:inventory.sourceSha256,layoutAuditSha256:inventory.layoutAuditSha256,layoutReviewSha256:inventory.layoutReviewSha256};
}
export function entryLayoutEvidence(inventory,record){
 const blocks=new Map(inventory.blocks.map(b=>[b.htmlId,b]));
 return {...layoutEvidence(inventory),sourceRecordId:record.id,sourceReference:structuredClone(record.sourceReference),paragraphs:record.paragraphIds.map(id=>{const b=blocks.get(id);assert(b,'Unknown mapped source unit');return {id,textSha256:b.textSha256,origin:structuredClone(b.origin),...(b.layoutDecisionId?{layoutDecisionId:b.layoutDecisionId}:{})};}),...(record.referenceMapping?{referenceMapping:structuredClone(record.referenceMapping)}:{})};
}
export function validateEntryLayout(inventory,row,record){
 if(inventory.schemaVersion!==2){assert.equal(row.sourceLayout,undefined,'Unexpected mapped entry evidence');return;}
 assert.deepEqual(row.sourceLayout,entryLayoutEvidence(inventory,record),'Entry must retain exact source origins and reference mapping');
 if(record.referenceMapping){
  const m=record.referenceMapping;
  assert.equal(row.comparisons.find(c=>c.id==='bewley-ablution')?.reference,m.bewley.reference,'Mapped Bewley comparison changed');
  assert.equal(row.comparisons.find(c=>c.id==='islamhouse-khan')?.reference,m.khan.reference,'Mapped Khan comparison changed');
  for(const witness of inventory.layoutReview.decisions.find(d=>d.id===inventory.blocks.find(b=>b.htmlId===record.paragraphIds[0]).layoutDecisionId).printedWitnesses){
   const actual=row.printedWitnesses.find(w=>w.id===witness.id);assert(actual&&witness.pdfPages.every(p=>actual.pdfPages.includes(p)),'Mapped reference requires the inspected printed boundary pages');
  }
 }
}
export function layoutInputEvidence(inventory,selectedIds){
 const selected=inventory.blocks.filter(b=>selectedIds.has(b.htmlId)),originalIds=new Set(selected.map(b=>b.origin.blockId));
 const decisionIds=new Set(selected.map(b=>b.layoutDecisionId).filter(Boolean));
 return {...layoutEvidence(inventory),completeLayoutReview:structuredClone(inventory.layoutReview),originalBlocks:inventory.originalBlocks.filter(b=>originalIds.has(b.htmlId)),selectedDecisionIds:[...decisionIds]};
}
export function layoutSourceNotice(row){
 const m=row.sourceLayout?.referenceMapping;if(!m)return [];
 return [{id:`${row.number}-source-numbering`,label:'A different number in the original source',text:`The source prints [${m.sourceLabel}]. This reader uses ${m.number}, matched to Bewley ${m.bewley.reference}; the modern Arabic print uses ${m.modernPrintReference}. The original numeral remains unchanged. Independent reference review is pending.`,citations:['base','bewley','khan','brill-1862','dar-ibn-kathir-2002'],related:[]}];
}
export function layoutSourceDetails(inventory,row){
 if(!row.sourceLayout)return '';
 const originals=[...new Set(row.sourceLayout.paragraphs.map(p=>p.origin.blockId))].map(id=>inventory.originalBlocks.find(b=>b.htmlId===id));
 const m=row.sourceLayout.referenceMapping;
 return `<details class="source-layout"><summary>Original source labels and boundaries</summary><p>These original digital paragraphs remain unchanged. The reading text uses the exact spans listed here, with any separately declared wording correction shown above.${row.arabicSupplements?' The additional printed note has its own provenance record and is not part of these digital paragraphs.':''} Offsets count Unicode characters from zero; the end is excluded.</p>${m?`<p>${esc(m.note)}</p>`:''}<ul>${row.sourceLayout.paragraphs.map(p=>`<li>Source block ${esc(p.origin.blockId)} · characters ${p.origin.start}–${p.origin.end}</li>`).join('')}</ul><div class="arabic source-original-blocks" lang="ar" dir="rtl">${originals.map(b=>`<p>${esc(b.text)}</p>`).join('')}</div></details>`;
}
