/* Explicit printed additions never alter or impersonate the pinned digital input. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hash=o=>sha(JSON.stringify(o));
const identifier=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const text=s=>typeof s==='string'&&s.trim().length>0;
function validatePrintedAddition(item,row,originals,sources){
 assert.equal(item.schemaVersion,1);assert(identifier(item.id),'Invalid printed addition identity');
 assert.equal(item.status,'chosen-for-personal-prototype');assert.equal(item.reviewerKind,'ai');assert.equal(item.independentReview,'pending');
 assert.equal(item.sourceRecordId,row.sourceRecordId,'Printed addition belongs to another digital report');
 assert.equal(item.digitalArabicSha256,sha(originals.join('\n\n')),'Printed addition is bound to changed digital input');
 assert(text(item.arabic)&&text(item.english)&&text(item.reason)&&text(item.transcriptionPolicy),'Incomplete printed addition');
 assert.equal(item.arabicSha256,sha(item.arabic));assert.equal(item.englishSha256,sha(item.english));
 assert.deepEqual(item.witnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Printed addition needs two distinct witnesses');
 for(const w of item.witnesses){
  const source=sources.find(s=>s.id===w.sourceId),inspected=row.printedWitnesses.find(p=>p.id===w.sourceId);
  assert.equal(source?.kind,'arabic-witness');assert.equal(w.sourceSha256,source.sha256,'Printed witness hash changed');
  assert(Number.isSafeInteger(w.pdfPage)&&inspected?.status===undefined&&inspected.pdfPages.includes(w.pdfPage),'Printed addition needs an inspected page');
  assert(text(w.reading));assert.equal(w.readingSha256,sha(w.reading),'Printed witness reading changed');
  assert(w.reading===item.arabic||text(w.differenceNote),'Different printed readings need an explicit explanation');
 }
 const selected=item.witnesses.find(w=>w.sourceId===item.selectedWitnessId);assert(selected&&selected.reading===item.arabic,'Selected printed wording does not match its witness');
 if(item.englishComparisons!==undefined){
  assert(Array.isArray(item.englishComparisons)&&item.englishComparisons.length===row.comparisons.length,'Incomplete printed-note comparison coverage');
  assert.deepEqual(item.englishComparisons.map(c=>c.sourceId).sort(),row.comparisons.map(c=>c.id).sort(),'Printed-note comparisons must identify both English sources');
  for(const c of item.englishComparisons){const matching=row.comparisons.find(r=>r.id===c.sourceId);assert(c.reference===matching.reference&&['includes-note','omits-note'].includes(c.status)&&text(c.note),'Invalid printed-note comparison coverage');}
 }
 const notice=row.contextNotes?.find(n=>n.id===item.contextNoteId);
 assert(notice?.label?.trim()&&notice.text?.trim()&&['base',...item.witnesses.map(w=>w.sourceId)].every(id=>notice.citations.includes(id)),'Printed addition needs a visible source notice');
}
export function derivePrintedBlocks(row,originals,corrected,sources){
 const blockIds=[...row.paragraphIds],arabicBlocks=[...corrected],additions=row.arabicSupplements;
 if(additions===undefined)return {blockIds,arabicBlocks};
 assert(Array.isArray(additions)&&additions.length,'Empty printed additions');
 const ids=new Set(blockIds);
 for(const item of additions){
  validatePrintedAddition(item,row,originals,sources);
  assert(!ids.has(item.id),'Duplicate printed addition identity');ids.add(item.id);
  assert.equal(item.position,'after-report');assert.equal(item.kind,'transmission-note','Only closing transmission notes are supported');
  const segments=row.segments.filter(s=>s.paragraphId===item.id);
  assert.equal(segments.length,1,'Printed note needs one complete translated segment');const s=segments[0];
  assert.equal(s.id,item.englishSegmentId);assert.equal(s.kind,item.kind);assert.equal(s.start,0);assert.equal(s.end,Array.from(item.arabic).length);
  assert.equal(s.arabic,item.arabic);assert.equal(s.english,item.english,'Printed addition translation changed');
  blockIds.push(item.id);arabicBlocks.push(item.arabic);
 }
 return {blockIds,arabicBlocks};
}
export function validatePrintedHeading(row,originals,sources){
 const item=row.printedHeading;if(item===undefined)return;
 validatePrintedAddition(item,row,originals,sources);assert.equal(item.kind,'chapter-heading');
 assert.equal(item.sourceChapterId,row.chapterId);assert.equal(item.beforeEntry,row.number);
 assert(item.id.startsWith(row.chapterId+'-print-')&&item.id!==row.chapterId,'Printed heading needs a distinct stable chapter identity');
 assert(Number.isSafeInteger(item.printedChapterNumber)&&item.printedChapterNumber>0);
 for(const w of item.witnesses)assert.equal(w.chapterNumber,item.printedChapterNumber,'Printed heading number differs between witnesses');
 assert(row.arabicSupplements?.every(s=>s.id!==item.id)??true,'Heading cannot also be a narrated supplement');
 assert(!row.segments.some(s=>s.paragraphId===item.id),'Chapter heading must stay outside narration');
}
export function reviewedChapterViews(review){
 const views=[],ids=new Set(review.chapters.map(c=>c.id));
 for(const chapter of review.chapters){
  const divisions=review.entries.filter(r=>r.chapterId===chapter.id&&r.printedHeading).map(r=>r.printedHeading);
  if(!divisions.length){views.push(chapter);continue;}
  let cursor=0,current={...chapter,entryNumbers:[]};
  for(const d of divisions){
   assert(!ids.has(d.id),'Duplicate printed chapter identity');ids.add(d.id);
   const index=chapter.entryNumbers.indexOf(d.beforeEntry);assert(index>cursor,'Printed division must follow a nonempty source section');
   current.entryNumbers=chapter.entryNumbers.slice(cursor,index);current.printedDivisions=divisions.map(h=>({id:h.id,title:h.english,beforeEntry:h.beforeEntry}));views.push(current);
   current={id:d.id,title:d.english,titleArabic:d.arabic,headingId:null,contextIds:[],entryNumbers:[],status:'ai-working-translation',independentReview:'pending',printedHeading:d};cursor=index;
  }
  current.entryNumbers=chapter.entryNumbers.slice(cursor);assert(current.entryNumbers.length);views.push(current);
 }
 assert.deepEqual(views.flatMap(c=>c.entryNumbers),review.chapters.flatMap(c=>c.entryNumbers),'Printed headings changed report coverage');
 return views;
}
export function printedHeadingContext(heading){return {sourceChapterId:heading.sourceChapterId,beforeEntry:heading.beforeEntry,printedChapterNumber:heading.printedChapterNumber,evidenceSha256:hash(heading)};}
export function printedAdditionDetails(item,sources){
 return `<section class="printed-addition" data-printed-addition="${esc(item.id)}"><h3>${item.kind==='chapter-heading'?'Chapter heading from Arabic prints':'Closing transmission note from an Arabic print'}</h3><p>${esc(item.reason)}</p><p>AI transcription and working English; independent review pending. ${esc(item.transcriptionPolicy)}</p><div class="arabic" lang="ar" dir="rtl"><p>${esc(item.arabic)}</p></div><p>${esc(item.english)}</p>${item.englishComparisons?`<h4>English comparison coverage</h4><ul>${item.englishComparisons.map(c=>`<li>${esc(sources.find(s=>s.id===c.sourceId).label)} · ${esc(c.reference)}: ${esc(c.note)}</li>`).join('')}</ul>`:''}<details><summary>Both printed readings and exact pages</summary>${item.witnesses.map(w=>{const source=sources.find(s=>s.id===w.sourceId),url=new URL(source.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(source.label)} · PDF page ${w.pdfPage} ↗</a>${w.sourceId===item.selectedWitnessId?' · Selected wording':''}</p><p class="arabic" lang="ar" dir="rtl">${esc(w.reading)}</p>${w.differenceNote?`<p>${esc(w.differenceNote)}</p>`:''}`;}).join('')}</details></section>`;
}
