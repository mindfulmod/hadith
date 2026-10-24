/* Printed chapter quotations remain evidence-bound browsing material, never reports. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const text=s=>typeof s==='string'&&s.trim().length>0;
export function validatePrintedIntroductions(chapter,inventory,review){
 const items=chapter.printedIntroductions;if(items===undefined)return [];
 assert(Array.isArray(items)&&items.length,'Empty printed chapter introductions');
 const original=inventory.chapters.find(c=>c.id===chapter.id),ids=new Set();
 assert(original&&original.contextIds.length===0,'Printed introduction requires an explicitly empty digital introduction');
 for(const item of items){
  assert.equal(item.schemaVersion,1);assert.equal(item.kind,'chapter-introduction');
  assert(typeof item.id==='string'&&item.id.startsWith(chapter.id+'-print-')&&/^[a-z0-9-]+$/.test(item.id)&&!ids.has(item.id),'Invalid printed chapter identity');ids.add(item.id);
  assert.equal(item.sourceChapterId,chapter.id);assert.equal(item.sourceChapterSha256,hash(original),'Printed introduction belongs to changed chapter context');assert.equal(item.digitalSourceSha256,inventory.sourceSha256,'Printed introduction belongs to changed digital source');
  assert.equal(item.position,'after-heading');assert.equal(item.beforeEntry,original.entryNumbers[0],'Printed introduction is misplaced');
  assert.equal(item.status,'chosen-for-personal-prototype');assert.equal(item.reviewerKind,'ai');assert.equal(item.independentReview,'pending');assert.equal(item.englishStatus,'pending');assert.equal(item.english,undefined,'Unreviewed English chapter text cannot be supplied');
  assert(text(item.arabic)&&text(item.reason)&&text(item.transcriptionPolicy),'Incomplete printed chapter evidence');assert.equal(item.arabicSha256,sha(item.arabic),'Printed chapter text changed');
  assert.deepEqual(item.witnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Printed chapter introduction requires two witnesses');
  for(const w of item.witnesses){
   const source=review.sources.find(s=>s.id===w.sourceId),report=review.entries.find(e=>e.number===item.beforeEntry),witness=report?.printedWitnesses.find(p=>p.id===w.sourceId);
   assert(source?.kind==='arabic-witness'&&/^[a-f0-9]{64}$/.test(source.sha256),'Unpinned printed chapter witness');assert.equal(w.sourceSha256,source.sha256,'Printed chapter witness changed');
   assert(Number.isSafeInteger(w.pdfPage)&&w.pdfPage>0&&witness?.status===undefined&&witness?.pdfPages.includes(w.pdfPage),'Printed chapter needs an inspected page');assert.equal(w.chapterNumber,Number(chapter.id.slice('chapter-'.length)),'Wrong printed chapter number');
   assert(text(w.reading)&&w.readingSha256===sha(w.reading),'Printed chapter witness reading changed');assert(w.reading===item.arabic||text(w.differenceNote),'Different printed readings need an explanation');
  }
  assert(item.witnesses.some(w=>w.sourceId===item.selectedWitnessId&&w.reading===item.arabic),'Selected printed introduction differs from its witness');
  assert(!review.entries.some(e=>e.segments.some(s=>s.paragraphId===item.id||s.arabic.includes(item.arabic))),'Chapter introduction must not enter numbered reports');
 }
 return items;
}
export function printedIntroductionContext(items){return items.length?{printedIntroduction:{arabicParagraphs:items.length,evidenceSha256:hash(items)}}:{};}
export function printedIntroductionDetails(chapter,sources){
 return (chapter.printedIntroductions||[]).map(item=>`<section class="printed-chapter-introduction" data-printed-introduction="${esc(item.id)}"><h3>Chapter introduction from Arabic prints</h3><p>${esc(item.reason)}</p><p>English translation is pending. ${esc(item.transcriptionPolicy)}</p><div class="arabic" lang="ar" dir="rtl"><p>${esc(item.arabic)}</p></div><details><summary>Both printed readings and exact pages</summary>${item.witnesses.map(w=>{const source=sources.find(s=>s.id===w.sourceId),url=new URL(source.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(source.label)} · PDF page ${w.pdfPage} ↗</a>${w.sourceId===item.selectedWitnessId?' · Selected wording':''}</p><p class="arabic" lang="ar" dir="rtl">${esc(w.reading)}</p>${w.differenceNote?`<p>${esc(w.differenceNote)}</p>`:''}`;}).join('')}</details></section>`).join('');
}
