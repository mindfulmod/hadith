/* A whole report absent from a digital witness has its own print origin. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validReference,compareReferences} from '../reader/references.mjs';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hash=o=>sha(JSON.stringify(o));
const text=s=>typeof s==='string'&&s.trim().length>0;
const PRINTS={'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1','dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098','dar-tasil-2012-v1':'0136ed57436e607acebf53d33fd89695230bd88e76d7c7c10bd4b54ff1f5f0e6'};

export function digitalReportRows(review){return review.entries.filter(r=>r.printedReport===undefined);}
export function validatePrintedReportRows(inventory,review){
 const originals=new Map(inventory.blocks.map(b=>[b.htmlId,b])),numbers=inventory.records.map(r=>r.number),additions=new Map(),origins=new Set();
 for(const row of review.entries.filter(r=>r.printedReport!==undefined)){
  const p=row.printedReport;
  assert([1,2].includes(p?.schemaVersion));assert.equal(p.kind,'complete-numbered-report');
  const tail=p.schemaVersion===2;
  const witnessIds=tail?['dar-ibn-kathir-2002','dar-tasil-2012-v1']:['brill-1862','dar-ibn-kathir-2002'];
  assert.equal(p.status,'chosen-for-personal-prototype');assert.equal(p.reviewerKind,'ai');assert.equal(p.independentReview,'pending');
  assert(validReference(row.number)&&typeof row.number==='string'&&!numbers.includes(row.number),'Printed report needs a distinct app reference');
  assert.equal(row.id,`bukhari:${row.number}`);assert.equal(row.sourceRecordId,`${p.selectedWitnessId}:${p.printReference}`);
  assert(!origins.has(row.sourceRecordId),'A printed report origin cannot be assigned twice');origins.add(row.sourceRecordId);
  assert(/^[1-9]\d*$/.test(p.printReference),'Missing selected printed reference');
  assert.equal(p.digitalSourceId,inventory.sourceId);assert.equal(p.digitalSourceSha256,inventory.sourceSha256);
  assert.equal(p.digitalInventorySha256,hash(inventory),'Printed report omission evidence is stale');
  const previous=inventory.records.find(r=>r.number===p.afterReference),next=inventory.records.find(r=>r.number===p.beforeReference);
  if(tail){
   assert.equal(p.position,'after-book-end');assert.equal(p.beforeReference,null);assert.equal(p.nextArabicSha256,null);
   assert(previous===inventory.records.at(-1),'Printed tail must follow the exact selected book end');
   assert(compareReferences(previous.number,row.number)<0&&compareReferences(row.number,previous.number+1)<0,'Printed tail must use a suffix of its final digital reference');
   assert.equal(row.chapterId,previous.chapterId,'Printed tail must retain its source-boundary anchor');
   assert(p.referenceDecision?.status==='user-confirmed'&&p.referenceDecision.appReference===row.number&&p.referenceDecision.printedReference===p.printReference&&text(p.referenceDecision.userReply),'Printed tail needs its recorded reference decision');
  }else{
   assert.equal(p.position,undefined);assert.equal(p.chapterHeading,undefined);
   assert(previous&&next&&numbers.indexOf(next.number)===numbers.indexOf(previous.number)+1,'Printed report must identify adjacent digital reports');
   assert(compareReferences(previous.number,row.number)<0&&compareReferences(row.number,next.number)<0,'Printed report reference is outside its declared gap');
  }
  assert.equal(p.previousArabicSha256,sha(previous.paragraphIds.map(id=>originals.get(id).text).join('\n\n')));
  if(!tail)assert.equal(p.nextArabicSha256,sha(next.paragraphIds.map(id=>originals.get(id).text).join('\n\n')));
  assert([previous.chapterId,next?.chapterId].includes(row.chapterId),'Printed chapter must correspond to a neighbouring source chapter');
  assert.equal(p.chapterId,row.chapterId);assert(text(p.chapterPlacementNote)&&text(p.reason)&&text(p.transcriptionPolicy)&&text(p.referenceNote));
  assert.equal(row.sourceLayout,undefined,'Printed report cannot impersonate a digital source span');
  for(const field of ['arabicCorrections','arabicSupplements','printedHeading','sourceForm'])assert.equal(row[field],undefined,'Whole printed report cannot claim another source form');
  assert.deepEqual(row.paragraphIds,[p.paragraphId]);assert(/^printed-report-[a-z0-9-]+$/.test(p.paragraphId)&&!originals.has(p.paragraphId),'Invalid printed report block');
  assert(text(p.arabic));assert.equal(p.arabicSha256,sha(p.arabic));assert.equal(row.arabicSha256,p.arabicSha256);
  assert.deepEqual(p.witnesses.map(w=>w.sourceId).sort(),witnessIds,'A missing report needs two distinct printed witnesses');
  for(const w of p.witnesses){
   const source=review.sources.find(s=>s.id===w.sourceId),checked=row.printedWitnesses.find(s=>s.id===w.sourceId);
   assert.equal(source?.kind,'arabic-witness');assert.equal(source.sha256,PRINTS[w.sourceId]);assert.equal(w.sourceSha256,source.sha256);
   assert(Number.isSafeInteger(w.pdfPage)&&w.pdfPage>0&&checked?.pdfPages.includes(w.pdfPage)&&checked.status===undefined,'Printed report requires inspected witness pages');
   assert(text(w.reading)&&text(w.chapterPlacement));assert.equal(w.readingSha256,sha(w.reading));
   assert(w.reading===p.arabic||text(w.differenceNote),'Printed report variants need an explanation');
  }
  const selected=p.witnesses.find(w=>w.sourceId===p.selectedWitnessId);
  assert(selected&&selected.reading===p.arabic&&selected.reference===p.printReference,'Selected complete report differs from its printed witness');
  const input=review.sources.find(s=>s.id===p.inputSourceId),witness=review.sources.find(s=>s.id===p.selectedWitnessId);
  assert(input?.kind==='arabic-input'&&input.format==='pdf'&&input.url===witness.url&&input.sha256===witness.sha256,'Printed report must identify the actual Arabic input');
  const notice=row.contextNotes?.find(n=>n.id===p.contextNoteId);
  assert(notice&&text(notice.label)&&text(notice.text)&&['base',...witnessIds].every(id=>notice.citations.includes(id)),'Printed report needs a visible source notice');
  if(tail&&p.chapterHeading){
   const h=p.chapterHeading;
   assert.equal(h.kind,'chapter-heading');assert.equal(h.schemaVersion,2);assert.equal(h.sourceChapterId,row.chapterId);assert.equal(h.beforeEntry,row.number);
   assert.equal(h.id,row.chapterId+'-print-'+h.printedChapterNumber);assert(text(h.arabic)&&text(h.english)&&text(h.reason)&&text(h.transcriptionPolicy));
   assert.equal(h.arabicSha256,sha(h.arabic));assert.equal(h.englishSha256,sha(h.english));
   assert.equal(h.independentReview,'pending');assert.equal(h.reviewerKind,'ai');assert.equal(h.status,'chosen-for-personal-prototype');
   assert.deepEqual(h.witnesses.map(w=>w.sourceId).sort(),witnessIds);
   for(const w of h.witnesses){const report=p.witnesses.find(x=>x.sourceId===w.sourceId);assert.equal(w.sourceSha256,report.sourceSha256);assert.equal(w.pdfPage,report.pdfPage);assert.equal(w.reading,h.arabic);assert.equal(w.readingSha256,h.arabicSha256);assert(text(w.chapterPlacement));}
   const selectedHeading=h.witnesses.find(w=>w.sourceId===h.selectedWitnessId);assert(selectedHeading&&Number.isSafeInteger(h.printedChapterNumber)&&h.printedChapterNumber>0&&selectedHeading.chapterNumber===h.printedChapterNumber,'Printed heading number needs its own selected witness');
   assert(!row.segments.some(s=>s.paragraphId===h.id),'Printed heading cannot enter narration');
  }
  assert(row.segments.some(s=>s.kind==='chain')&&row.segments.some(s=>s.kind==='report'),'Whole printed report needs its full chain and body');
  assert(!additions.has(p.paragraphId),'Duplicate printed report block');additions.set(p.paragraphId,{htmlId:p.paragraphId,text:p.arabic});
 }
 const digital=digitalReportRows(review).map(r=>r.number),expected=[...digital];
 for(const row of review.entries.filter(r=>r.printedReport).sort((a,b)=>compareReferences(a.number,b.number))){
  const p=row.printedReport,index=p.schemaVersion===2?expected.length:expected.indexOf(p.beforeReference);assert(index>=0&&digital.includes(p.afterReference),'Both sides or the exact book-end anchor must be reviewed in this batch');
  assert(!expected.includes(row.number),'Duplicate printed reference');expected.splice(index,0,row.number);
 }
 assert.deepEqual(review.entries.map(r=>r.number),expected,'Printed report was omitted, duplicated or moved from its declared position');
 const tails=review.entries.filter(r=>r.printedReport?.schemaVersion===2);
 if(tails.length){assert(tails[0].printedReport.chapterHeading,'Printed tail needs its separately sourced chapter');assert(tails.slice(1).every(r=>r.printedReport.chapterHeading===undefined),'Printed tail chapter cannot be silently repeated');}
 return additions;
}

export function printedReportDetails(p,sources){
 if(!p)return '';
 return `<section class="printed-report"><h3>Complete report transcribed from an Arabic print</h3><p>${esc(p.reason)}</p><p>${esc(p.referenceNote)}</p><p>${esc(p.chapterPlacementNote)}</p><p>${esc(p.transcriptionPolicy)}</p><details><summary>Both printed readings and exact pages</summary>${p.witnesses.map(w=>{const source=sources.find(s=>s.id===w.sourceId),url=new URL(source.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(source.label)} · PDF page ${w.pdfPage} ↗</a>${w.sourceId===p.selectedWitnessId?' · Selected wording':''}</p><p>${esc(w.chapterPlacement)}</p><p class="arabic" dir="rtl" lang="ar">${esc(w.reading)}</p>${w.differenceNote?`<p>${esc(w.differenceNote)}</p>`:''}`;}).join('')}</details></section>`;
}
