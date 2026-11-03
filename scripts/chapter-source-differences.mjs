/* Unresolved chapter readings stay evidence-bound and separate from numbered reports. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const root=new URL('../',import.meta.url),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const registry=read('content/review/chapter-context-differences.json');
export function validateChapterDifferences(chapter,inventory,review,readEvidence=read){
 assert.equal(registry.schemaVersion,1);
 const keys=registry.records.map(r=>r.sourceId+':'+r.chapterId);assert.equal(new Set(keys).size,keys.length,'Duplicate chapter difference registration');
 const expected=registry.records.find(r=>r.sourceId===inventory.sourceId&&r.chapterId===chapter.id);
 if(expected)assert.deepEqual(chapter.contextDifferences,expected.bindings,'Known chapter differences cannot be omitted or changed');
 if(chapter.contextDifferences===undefined)return [];
 assert(expected,'Unregistered chapter difference');
 assert(Array.isArray(chapter.contextDifferences)&&chapter.contextDifferences.length,'Empty chapter differences');
 const seen=new Set();
 return chapter.contextDifferences.map(binding=>{
  assert.deepEqual(Object.keys(binding).sort(),['auditPath','auditSha256','differenceId'],'Unexpected chapter difference binding');
  assert(/^research\/[a-z0-9-]+\.json$/.test(binding.auditPath),'Unsafe chapter evidence path');
  assert(!seen.has(binding.differenceId),'Duplicate chapter difference');seen.add(binding.differenceId);
  const audit=readEvidence(binding.auditPath);assert.equal(hash(audit),binding.auditSha256,'Changed chapter difference audit');
  assert.equal(audit.source.id,inventory.sourceId);assert.equal(audit.source.sha256,inventory.sourceSha256,'Chapter difference belongs to another source');
  const item=audit.unresolvedTextualDifferences?.find(v=>v.id===binding.differenceId);
  const heading=item?.paragraphId===chapter.headingId;
  assert(item&&(heading||chapter.contextIds.includes(item.paragraphId)),'Difference must belong to this chapter heading or introduction');
  const block=inventory.blocks.find(b=>b.htmlId===item.paragraphId);
  assert.equal(item.sourceBlockSha256,sha(block.text),'Changed chapter paragraph');
  assert(typeof item.sourceReading==='string'&&item.sourceReading.trim()&&block.text.includes(item.sourceReading),'Difference must retain selected source reading');
  assert.equal(item.status,'unresolved-not-applied');assert.equal(item.independentReview,'pending');
  assert(typeof item.finding==='string'&&item.finding.trim()&&typeof item.transcriptionPolicy==='string'&&item.transcriptionPolicy.trim(),'Missing chapter difference explanation');
  assert.deepEqual(item.witnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Chapter difference needs both printed readings');
  for(const w of item.witnesses){
   const source=review.sources.find(s=>s.id===w.sourceId),print=audit.printedComparisons.find(p=>p.id===w.sourceId);
   assert(source?.kind==='arabic-witness'&&source.sha256===w.sourceSha256&&print?.sha256===w.sourceSha256,'Changed chapter witness');
   assert(Number.isSafeInteger(w.pdfPage)&&w.pdfPage>0&&print.inspectedPdfPages.includes(w.pdfPage),'Chapter witness page was not inspected');
   if(w.reading===null)assert(heading&&w.readingSha256===null,'A missing heading excerpt must stay explicitly absent');
   else assert(typeof w.reading==='string'&&w.reading.trim()&&sha(w.reading)===w.readingSha256,'Changed printed chapter reading');
  }
  assert(item.witnesses.some(w=>typeof w.reading==='string'&&w.reading.trim()),'A chapter difference needs a present printed reading');
  return {...structuredClone(item),...(heading?{sourceRole:'heading'}:{})};
 });
}
export function chapterDifferenceContext(items){return items.length?{textualDifferences:{count:items.length,evidenceSha256:hash(items),status:'unresolved',englishStatus:'pending',...(items.some(item=>item.sourceRole==='heading')?{includesHeading:true}:{})}}:{};}
export function chapterDifferenceDetails(items,sources){
 return items.map(item=>`<section class="chapter-source-difference" data-chapter-difference="${esc(item.id)}"><h3>A difference between the printed readings</h3><p>${esc(item.finding)}</p><p>Selected source wording:</p><p class="arabic" lang="ar" dir="rtl">${esc(item.sourceReading)}</p><details><summary>Compare the two printed readings</summary>${item.witnesses.map(w=>{const source=sources.find(s=>s.id===w.sourceId),url=new URL(source.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(source.label)} · PDF page ${w.pdfPage} ↗</a></p>${w.reading===null?'<p>Absent from this inspected heading.</p>':`<p class="arabic" lang="ar" dir="rtl">${esc(w.reading)}</p>`}`;}).join('')}<p>${esc(item.transcriptionPolicy)}</p></details></section>`).join('');
}
