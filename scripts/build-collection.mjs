/* Assemble reviewed personal-prototype batches; never infer Arabic edits or sign-offs. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {prototypeFiles} from './build-opening-prototype.mjs';
import {validateSourceStructure} from '../reader/source-structure.mjs';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o)),bytes=o=>JSON.stringify(o,null,2)+'\n';
export function buildFaithBatch(inventory,review,manifest){
 assert.equal(review.schemaVersion,1);assert.equal(review.status,'personal-prototype-only');assert.equal(review.independentReview,'pending');
 assert.equal(review.inventorySha256,hash(inventory),'Stale source inventory');assert.equal(review.sourceSha256,inventory.sourceSha256);assert.equal(review.sourceId,inventory.sourceId);assert.equal(manifest.file.sha256,inventory.sourceSha256);
 assert.deepEqual(review.entries.map(e=>e.number),[8,9,10,11,12,13,14,15,16,17]);
 const blocks=new Map(inventory.blocks.map(b=>[b.htmlId,b])),entries=[];
 for(const row of review.entries){
  const {reviewRecordSha256,...record}=row;assert.equal(reviewRecordSha256,hash(record),'Stale entry review');
  assert.equal(row.status,'personal-prototype-only');assert.equal(row.reviewerKind,'ai');assert.equal(row.independentReview,'pending');
  const original=inventory.records.find(r=>r.number===row.number);assert(original&&original.id===row.sourceRecordId&&row.id===`bukhari:${row.number}`,'Source identity mismatch');
  assert.deepEqual(row.paragraphIds,original.paragraphIds);assert.equal(row.chapterId,original.chapterId);
  assert(row.notes.length&&row.printedWitnesses.length===2&&row.comparisons.length===2,'Missing comparison evidence');
  const arabic_blocks=row.paragraphIds.map(id=>blocks.get(id).text),english_blocks=row.segments.map(s=>s.english);
  const presentation={schemaVersion:1,arabic:[],english:[]};
  for(const [i,s] of row.segments.entries()){
   const block=row.paragraphIds.indexOf(s.paragraphId);assert(block>=0&&Number.isSafeInteger(s.start)&&Number.isSafeInteger(s.end));
   assert.equal(s.arabic,Array.from(arabic_blocks[block]).slice(s.start,s.end).join(''),'Changed Arabic span');assert.equal(s.arabicSha256,sha(s.arabic));assert.equal(s.englishSha256,sha(s.english));
   if(['chain','transmission-note'].includes(s.kind))for(const [arabic,english]of [['حدثنا','related to us'],['أخبرنا','informed us'],['أخبرني','informed me'],['سمعت','i heard']])assert.equal(s.arabic.split(arabic).length,s.english.toLowerCase().split(english).length,'Reporting verb mismatch in '+s.id);
   presentation.arabic.push({block,start:s.start,end:s.end,kind:s.kind});presentation.english.push({block:i,start:0,end:Array.from(s.english).length,kind:s.kind});
  }
  assert.equal(row.arabicSha256,sha(arabic_blocks.join('\n\n')));assert.equal(row.englishSha256,sha(english_blocks.join('\n\n')));
  const entry={id:row.id,book:'Faith',number:row.number,arabic_blocks,arabic_sha256:row.arabicSha256,english_blocks,english_status:'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and two English translation families compared. Independent Arabic, English and context review pending.',presentation,review:{status:row.status,independentReview:row.independentReview,sourceRecordId:row.sourceRecordId,reviewRecordSha256,notes:row.notes,reviewScope:row.reviewScope},audio_status:'No recording yet.'};
  validateSourceStructure(entry);entries.push(entry);
 }
 const chapters=review.chapters.map(c=>{
  const original=inventory.chapters.find(r=>r.id===c.id);assert(original,'Unknown source chapter');
  assert.deepEqual(c.entryNumbers,original.entryNumbers);assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.headingId,original.headingId);assert.equal(c.titleArabic,blocks.get(c.headingId).text);assert.equal(c.status,'ai-working-translation');assert.equal(c.independentReview,'pending');assert(c.title.trim());
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers};
 });
 assert.deepEqual(chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number),'Chapter coverage mismatch');
 return {entries,chapters};
}
export function assembleCollection(opening,inventory,review,manifest){
 const faith=buildFaithBatch(inventory,review,manifest),sources=structuredClone(opening.source.sources);
 for(const s of review.sources)if(!sources.some(v=>v.id===s.id))sources.push(s);
 const source={...opening.source,scope:'Personal prototype: opening entries 1–7 and Book of Faith entries 8–17. The rest of the collection remains in preparation.',
  license:{...opening.source.license,attribution:'Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic digital transcription by Arabic Wikisource contributors, opening revision 484874 and Faith revision 490285.',changes:opening.source.license.changes+' Hadith 8–17 retain their Arabic paragraphs unchanged from revision 490285; their new English and chapter titles are AI-assisted. Chapter introductions are preserved separately in Arabic, with English translation still pending.'},sources,
  prototypeReview:{...opening.source.prototypeReview,openingSourceSha256:hash(opening.source),faithReviewSha256:hash(review),faithSourceSha256:manifest.file.sha256},entries:[...opening.source.entries,...faith.entries]};
 const sourceHash=hash(source),references=structuredClone(opening.ledger.sourceReferences);references.sourceRecordSha256=sourceHash;
 for(const {id,label,kind,format,url}of review.sources){const existing=references.sources.find(s=>s.id===id);if(existing)assert.deepEqual(existing,{id,label,kind,format,url},'Conflicting shared source');else references.sources.push({id,label,kind,format,url});}
 for(const e of faith.entries){
  const r=review.entries.find(r=>r.number===e.number),chapter=review.chapters.find(c=>c.entryNumbers.includes(e.number));
  references.entries.push({id:e.id,number:e.number,entrySha256:hash(e),translation:{label:'Personal prototype · English working translation',description:e.english_status+' This is a new working translation, not the Darussalam translation.'},citations:[
   {id:'base',sourceId:'arabic-faith',locator:`Book of Faith · source entry ${e.number} · ${chapter.titleArabic}`,scope:'Exact Arabic paragraphs from the pinned revision. Source chapter grouping is retained; full chapter introductions are preserved separately in Arabic in the offline notes.'},
   {id:'bewley',sourceId:'bewley',locator:`Book of Belief · entry ${e.number}`,scope:'Named English comparison for the report body. The shortened chain does not replace the selected full Arabic chain.'},
   {id:'khan',sourceId:'islamhouse-khan',locator:`Volume 1, Book 2, Number ${e.number-1}`,scope:'Khan-family English comparison, individually matched by wording. This mapping is not assumed beyond the ten checked reports.'},
   ...r.printedWitnesses.map(w=>({id:w.id,sourceId:w.id,locator:`PDF ${w.pdfPages.length===1?'page':'pages'} ${w.pdfPages.join(', ')}`,pdfPage:w.pdfPages[0],scope:'Printed Arabic comparison; narrator-name and chapter-division differences are recorded in the offline notes.'}))
  ],contextNotes:[],localNotes:{path:'faith-review.html',fragment:`hadith-${e.number}`,label:'Comparison notes and chapter source for this hadith'}});
 }
 const books=[...structuredClone(opening.ledger.books),{id:'faith',number:2,title:'Faith',sourceEntryCount:inventory.records.length,entryNumbers:faith.entries.map(e=>e.number),chapters:faith.chapters}];
 const ledger={...structuredClone(opening.ledger),sourceRecordSha256:sourceHash,books,catalogContextSha256:hash(books),sourceReferences:references,referencesSha256:hash(references)};
 ledger.entries.push(...faith.entries.map(e=>({number:e.number,id:e.id,entrySha256:hash(e),arabicSha256:e.arabic_sha256,englishSha256:sha(e.english_blocks.join('\n\n')),status:'personal-prototype-only',arabicReview:{status:'pending'},englishReview:{status:'pending'},contextReview:{status:'pending'}})));
 ledger.rights.evidence.push('reader/faith-inputs.json','reader/faith-review.html');
 const selectedIds=new Set([...review.chapters.flatMap(c=>[c.headingId,...c.contextIds]),...review.entries.flatMap(e=>e.paragraphIds)]);
 const inputs={schemaVersion:1,status:'personal-prototype-only',manifest,completeInventorySha256:hash(inventory),scope:'Only the blocks used by Hadith 8–17 and their chapter context. The complete source inventory remains separately preserved.',selectedBlocks:inventory.blocks.filter(b=>selectedIds.has(b.htmlId)),review};
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Book of Faith · source notes</title><link rel="stylesheet" href="reader.css"><style>.review-page article{margin:3rem 0;padding-top:2rem;border-top:1px solid var(--line)}.review-page details{margin:1rem 0}.review-page summary{padding:1rem 0;cursor:pointer}.review-page .arabic{font-size:1.4rem;line-height:2}.review-page li{margin-bottom:1rem}</style></head><body><main class="review-page"><a href="./#book/faith">← Book of Faith</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>The Book of Faith.</h1><p>${esc(review.scope)}</p><p>${esc(review.editionNote)}</p><p><a href="faith-inputs.json">Exact inputs and comparison record</a> · <a href="source-record.json">Current reading text</a></p><nav aria-label="Hadith source notes">${faith.entries.map(e=>`<a href="#hadith-${e.number}">${e.number}</a>`).join(' · ')}</nav>${faith.entries.map(e=>{
  const r=review.entries.find(r=>r.number===e.number),c=review.chapters.find(c=>c.entryNumbers.includes(e.number)),row=references.entries.find(row=>row.number===e.number);
  return `<article id="hadith-${e.number}"><h2>Hadith ${e.number}</h2><p>AI-assisted working translation. Independent review pending.</p><a href="./#read/${e.number}">Open this hadith →</a><h3>Comparison findings</h3><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p>${esc(r.reviewScope)}</p><details><summary>Complete working English</summary>${e.english_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</details><details><summary>Unchanged Arabic report</summary><div class="arabic" dir="rtl" lang="ar">${e.arabic_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</div></details><details><summary>Chapter heading and introduction</summary><p>${esc(c.title)}</p><p>The heading’s English is provisional. Any following introduction is preserved in Arabic; it is separate from the numbered hadith and its English translation remains pending.</p><div class="arabic" dir="rtl" lang="ar">${[c.headingId,...c.contextIds].map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div></details><details><summary>Sources and exact locations</summary><ul>${row.citations.map(c=>{const s=references.sources.find(s=>s.id===c.sourceId),url=new URL(s.url);if(c.pdfPage)url.hash='page='+c.pdfPage;return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a><p>${esc(c.locator)}<br>${esc(c.scope)}</p></li>`;}).join('')}</ul></details></article>`;
 }).join('')}<p>${esc(source.license.attribution)}</p><p>${esc(source.license.changes)} <a href="${esc(source.license.url)}">CC BY-SA 4.0</a>.</p></main></body></html>\n`;
 return {source,ledger,files:new Map([['research/bukhari-personal-collection.json',bytes(source)],['content/review/personal-collection-ledger.json',bytes(ledger)],['reader/source-record.json',bytes(source)],['reader/faith-inputs.json',bytes(inputs)],['reader/faith-review.html',html]])};
}
export function collectionFiles(){return assembleCollection(prototypeFiles(),read('content/staging/bukhari-faith-wikisource/catalog.json'),read('content/review/faith-first-review.json'),read('content/sources/wikisource-faith/manifest.json'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=collectionFiles();for(const [path,body]of result.files){const url=new URL(path,root);if(process.argv.includes('--check'))assert.equal(readFileSync(url,'utf8'),body,'Stale collection file: '+path);else writeFileSync(url,body);}
 console.log(`${result.ledger.books.length} books, ${result.source.entries.length} complete prototype reports; source ${hash(result.source)}`);
}
