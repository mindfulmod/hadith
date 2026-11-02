/* A heading omitted by the digital source can be preserved without inventing a report. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const text=s=>typeof s==='string'&&s.trim().length>0;
const PRINTS={'brill-1862':'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1','dar-ibn-kathir-2002':'9e32296488e37b86251cf10e71af0959aed2e1593ca876ac6f98b8366acf6098'};
export function validateEmptyPrintedChapters(chapter,inventory,review){
 const items=chapter.printedEmptyChaptersAfter;if(items===undefined)return [];
 assert(Array.isArray(items)&&items.length===1,'This source layout supports one empty printed chapter per digital gap');
 const index=inventory.chapters.findIndex(c=>c.id===chapter.id),before=inventory.chapters[index],after=inventory.chapters[index+1];
 assert(before&&after&&before.entryNumbers.length&&after.entryNumbers.length,'Empty printed chapter needs adjacent nonempty digital chapters');
 assert(!review.entries.some(r=>r.chapterId===chapter.id&&(r.printedHeading||r.printedReport?.chapterHeading)),'Empty heading and split chapter need an explicit combined layout');
 const ids=new Set(review.chapters.map(c=>c.id)),blocks=new Map(inventory.blocks.map(b=>[b.htmlId,b.text]));
 const anchor=n=>{const r=inventory.records.find(r=>r.number===n);return sha(r.paragraphIds.map(id=>blocks.get(id)).join('\n\n'));};
 for(const [i,item]of items.entries()){
  assert.equal(item.schemaVersion,1);assert.equal(item.kind,'empty-chapter-heading');assert.equal(item.status,'chosen-for-personal-prototype');assert.equal(item.reviewerKind,'ai');assert.equal(item.independentReview,'pending');
  assert(Number.isSafeInteger(item.printedChapterNumber)&&item.printedChapterNumber>0&&(!i||item.printedChapterNumber===items[i-1].printedChapterNumber+1),'Printed empty chapters must remain in declared order');
  assert.equal(item.id,chapter.id+'-print-'+String(item.printedChapterNumber).padStart(2,'0'));assert(!ids.has(item.id),'Duplicate printed chapter identity');ids.add(item.id);
  assert.equal(item.digitalSourceId,inventory.sourceId);assert.equal(item.digitalSourceSha256,inventory.sourceSha256);assert.equal(item.digitalInventorySha256,hash(inventory),'Empty chapter evidence belongs to changed input');
  assert.equal(item.afterChapterId,before.id);assert.equal(item.beforeChapterId,after.id);assert.equal(item.afterChapterSha256,hash(before));assert.equal(item.beforeChapterSha256,hash(after));
  assert.equal(item.afterReference,before.entryNumbers.at(-1));assert.equal(item.beforeReference,after.entryNumbers[0]);assert.equal(item.previousArabicSha256,anchor(item.afterReference));assert.equal(item.nextArabicSha256,anchor(item.beforeReference));
  assert(review.entries.some(r=>r.number===item.afterReference),'The preceding chapter must be admitted before its empty printed successor');
  assert.deepEqual(item.entryNumbers,[]);assert.deepEqual(item.contextParagraphs,[]);assert.equal(item.englishStatus,'pending');assert.equal(item.english,undefined,'Pending heading cannot supply an English translation');
  assert(text(item.arabic)&&item.arabicSha256===sha(item.arabic)&&text(item.reason)&&text(item.transcriptionPolicy),'Incomplete empty chapter evidence');
  assert.deepEqual(item.witnesses.map(w=>w.sourceId).sort(),Object.keys(PRINTS));
  for(const w of item.witnesses){
   const source=review.sources.find(s=>s.id===w.sourceId),report=review.entries.find(r=>r.number===item.afterReference),inspected=report.printedWitnesses.find(p=>p.id===w.sourceId);
   assert.equal(source?.kind,'arabic-witness');assert.equal(source.sha256,PRINTS[w.sourceId]);assert.equal(w.sourceSha256,source.sha256);
   assert(Number.isSafeInteger(w.pdfPage)&&w.pdfPage>0&&inspected?.status===undefined&&inspected.pdfPages.includes(w.pdfPage),'Empty chapter needs an inspected boundary page');assert.equal(w.chapterNumber,item.printedChapterNumber);
   assert(text(w.reading)&&w.readingSha256===sha(w.reading));assert(w.reading===item.arabic||text(w.differenceNote),'Different headings need a recorded reading');
  }
  assert(item.witnesses.some(w=>w.sourceId===item.selectedWitnessId&&w.reading===item.arabic),'Selected empty heading differs from its witness');
  assert(!inventory.blocks.some(b=>b.text===item.arabic),'A present digital heading cannot claim a print omission');
  assert(!review.entries.some(r=>r.paragraphIds.includes(item.id)||r.segments.some(s=>s.paragraphId===item.id||s.arabic.includes(item.arabic))),'Empty chapter must stay outside numbered reports');
 }
 return items;
}
export function emptyPrintedChapterViews(chapter){
 return (chapter.printedEmptyChaptersAfter||[]).map(item=>({id:item.id,title:'Printed chapter '+item.printedChapterNumber+' · English heading pending',titleArabic:item.arabic,headingId:null,contextIds:[],entryNumbers:[],status:'heading-translation-pending',independentReview:'pending',printedEmptyHeading:item}));
}
export function emptyPrintedChapterContext(item){return {afterChapterId:item.afterChapterId,beforeChapterId:item.beforeChapterId,afterReference:item.afterReference,beforeReference:item.beforeReference,printedChapterNumber:item.printedChapterNumber,evidenceSha256:hash(item)};}
export function emptyPrintedChapterNotes(chapter,sources,bookId){
 const item=chapter.printedEmptyHeading;
 return `<article id="${esc(item.id)}"><p class="eyebrow">Empty chapter · supplied from Arabic prints</p><h2>${esc(chapter.title)}</h2><p><a href="./#book/${esc(bookId)}/chapter/${esc(item.id)}">Open this chapter →</a></p><p>${esc(item.reason)}</p><p>The English heading is pending. This chapter contains no numbered report or separate introduction in either inspected print; no hadith number or narration has been invented.</p><div class="arabic" lang="ar" dir="rtl"><p>${esc(item.arabic)}</p></div><p>${esc(item.transcriptionPolicy)}</p><details><summary>Both printed headings and exact pages</summary>${item.witnesses.map(w=>{const s=sources.find(s=>s.id===w.sourceId),url=new URL(s.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} · PDF page ${w.pdfPage} ↗</a>${w.sourceId===item.selectedWitnessId?' · Selected wording':''}</p><p class="arabic" lang="ar" dir="rtl">${esc(w.reading)}</p>${w.differenceNote?`<p>${esc(w.differenceNote)}</p>`:''}`;}).join('')}</details><p><a href="#${esc(item.afterChapterId)}">Preceding digital chapter</a> · Printed chapter ${item.printedChapterNumber}, between digital references ${item.afterReference} and ${item.beforeReference}.</p></article>`;
}
