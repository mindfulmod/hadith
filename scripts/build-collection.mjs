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
export const BOOK_CONFIGS=Object.freeze({
 faith:Object.freeze({id:'faith',number:2,title:'Faith',first:8,arabicSourceId:'arabic-faith',bewleySourceId:'bewley',bewleyTitle:'Belief',revision:490285}),
 knowledge:Object.freeze({id:'knowledge',number:3,title:'Knowledge',first:59,arabicSourceId:'arabic-knowledge',bewleySourceId:'bewley-knowledge',bewleyTitle:'Knowledge',revision:252975})
});
function bookConfig(config){assert(Object.values(BOOK_CONFIGS).includes(config),'Unknown book configuration');return config;}
function validateComparisons(comparisons,config){
 const khanReference=new RegExp('^1\\.'+config.number+'\\.[1-9]\\d*$');
 assert.deepEqual(comparisons.map(c=>c.id).sort(),[config.bewleySourceId,'islamhouse-khan'].sort(),'Expected distinct English comparison records');
 const bewley=comparisons.find(c=>c.id===config.bewleySourceId),khan=comparisons.find(c=>c.id==='islamhouse-khan');
 assert(/^[1-9]\d*$/.test(bewley.reference)&&bewley.status===undefined,'Invalid Bewley comparison');
 assert(bewley.part===undefined,'Unexpected Bewley part metadata');
 if(khan.status===undefined){
  assert(khanReference.test(khan.reference),'Invalid Khan-family comparison');
  if(khan.part!==undefined)assert(khan.part&&Number.isSafeInteger(khan.part.index)&&Number.isSafeInteger(khan.part.count)&&khan.part.count>1&&khan.part.index>=1&&khan.part.index<=khan.part.count,'Invalid comparison part');
  return;
 }
 assert(khan.part===undefined,'An absent comparison cannot claim a report part');
 assert.equal(khan.status,'not-present-in-checked-sequence','Unknown comparison status');assert.equal(khan.reference,null,'An absent comparison cannot claim a matching reference');
 assert(Array.isArray(khan.checkedReferences)&&khan.checkedReferences.length===2&&khan.checkedReferences.every(r=>khanReference.test(r)),'Missing comparison search evidence');
 assert.equal(Number(khan.checkedReferences[1].split('.')[2]),Number(khan.checkedReferences[0].split('.')[2])+1,'Checked comparison references must be adjacent');
 assert(typeof khan.note==='string'&&khan.note.trim(),'Missing comparison absence explanation');
}
function khanCitation(record){
 if(record.status==='not-present-in-checked-sequence')return {id:'khan',sourceId:'islamhouse-khan',locator:`No corresponding report in the checked sequence: ${record.checkedReferences.join(' → ')}`,scope:record.note+' This is documented absence in that sequence, not a completed English comparison or a claim about every occurrence elsewhere in the collection.'};
 const [volume,book,number]=record.reference.split('.');
 return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number}${record.part?` · report ${record.part.index} of ${record.part.count}`:''}`,scope:record.part?'This English reference contains multiple reports. Only the identified report is matched here; the reader retains separate entries and full chains from its selected Arabic source.':'Khan-family English comparison, individually matched by wording. This reference is recorded per report; no full-collection numbering equivalence is assumed.'};
}
export function buildBookBatch(inventory,review,manifest,config){
 bookConfig(config);assert.equal(inventory.records[0].number,config.first,'Source book begins at the wrong reference');
 assert.equal(manifest.revision,config.revision,'Unexpected source revision');
 assert.equal(review.schemaVersion,1);assert.equal(review.status,'personal-prototype-only');assert.equal(review.independentReview,'pending');
 assert.equal(review.inventorySha256,hash(inventory),'Stale source inventory');assert.equal(review.sourceSha256,inventory.sourceSha256);assert.equal(review.sourceId,inventory.sourceId);assert.equal(manifest.file.sha256,inventory.sourceSha256);
 const numbers=review.entries.map(e=>e.number);assert(numbers.length,'Empty book batch');
 assert.deepEqual(numbers,inventory.records.filter(r=>r.number>=numbers[0]&&r.number<=numbers.at(-1)).map(r=>r.number),'Book batch must be in complete source order');
 const blocks=new Map(inventory.blocks.map(b=>[b.htmlId,b])),entries=[];
 const comparisonGroups=new Map();
 for(const row of review.entries){
  validateComparisons(row.comparisons,config);const c=row.comparisons.find(c=>c.id==='islamhouse-khan');
  if(c.status!==undefined)continue;
  const group=comparisonGroups.get(c.reference)||[];group.push(c);comparisonGroups.set(c.reference,group);
 }
 for(const group of comparisonGroups.values())if(group.length>1){
  assert(group.every(c=>c.part&&c.part.count===group[0].part?.count),'A shared reference needs consistent report parts');
  assert.equal(new Set(group.map(c=>c.part.index)).size,group.length,'A comparison part cannot be assigned twice');
 }

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
   if(['chain','transmission-note'].includes(s.kind))for(const [arabic,english]of [['حدثنا','related to us'],['حدثني','related to me'],['أخبرنا','informed us'],['أخبرني','informed me'],['سمعت','i heard']])assert.equal(s.arabic.replace(/\p{M}/gu,'').split(arabic).length,s.english.toLowerCase().split(english).length,'Reporting verb mismatch in '+s.id);
   presentation.arabic.push({block,start:s.start,end:s.end,kind:s.kind});presentation.english.push({block:i,start:0,end:Array.from(s.english).length,kind:s.kind});
  }
  assert.equal(row.arabicSha256,sha(arabic_blocks.join('\n\n')));assert.equal(row.englishSha256,sha(english_blocks.join('\n\n')));
  const entry={id:row.id,book:config.title,number:row.number,arabic_blocks,arabic_sha256:row.arabicSha256,english_blocks,english_status:row.comparisons.some(c=>c.status==='not-present-in-checked-sequence')?'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one English translation family compared. A second English comparison is absent from the checked sequence; see source notes. Independent Arabic, English and context review pending.':'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and two English translation families compared. Independent Arabic, English and context review pending.',presentation,review:{status:row.status,independentReview:row.independentReview,sourceRecordId:row.sourceRecordId,reviewRecordSha256,notes:row.notes,reviewScope:row.reviewScope},audio_status:'No recording yet.'};
  validateSourceStructure(entry);entries.push(entry);
 }
 const chapters=review.chapters.map(c=>{
  const original=inventory.chapters.find(r=>r.id===c.id);assert(original,'Unknown source chapter');
  assert.deepEqual(c.entryNumbers,original.entryNumbers);assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.headingId,original.headingId);assert.equal(c.titleArabic,blocks.get(c.headingId).text);assert(['ai-working-translation','heading-discrepancy-pending'].includes(c.status));assert.equal(c.independentReview,'pending');assert(c.title.trim());
  if(c.status==='heading-discrepancy-pending'){assert.equal(c.title,'Chapter heading under review');assert.equal(c.headingDiscrepancy?.status,'unresolved');assert(c.titleArabic.includes(c.headingDiscrepancy.digitalPhrase));assert(c.headingDiscrepancy.printedPhrase&&c.headingDiscrepancy.printedWitnesses.length===2);}
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers,sourceContext:{schemaVersion:1,headingStatus:c.status,numberedReports:c.entryNumbers.length?'present':'none-in-source',introduction:{arabicParagraphs:c.contextIds.length,englishStatus:c.contextIds.length?'pending':'not-applicable'},notes:{path:config.id+'-review.html',fragment:c.id}}};
 });
 assert.deepEqual(chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number),'Chapter coverage mismatch');
 // Empty source chapters are real context. They cannot disappear or be reordered in an admitted span.
 const start=inventory.chapters.findIndex(c=>c.id===review.chapters[0]?.id),end=inventory.chapters.findIndex(c=>c.id===review.chapters.at(-1)?.id);
 assert(start>=0&&end>=start,'Missing chapter span');
 assert.deepEqual(review.chapters.map(c=>c.id),inventory.chapters.slice(start,end+1).map(c=>c.id),'Incomplete source chapter span');
 if(numbers[0]===config.first)assert.equal(start,0,'Opening source-only chapters must be retained');
 return {entries,chapters};
}
export function assembleCollection(opening,inventory,review,manifest,config=BOOK_CONFIGS.faith){
 const batch=buildBookBatch(inventory,review,manifest,config),sources=structuredClone(opening.source.sources);
 assert(!opening.ledger.books.some(b=>b.id===config.id),'Book already assembled');
 assert.equal(opening.source.entries.at(-1).number+1,config.first,'Collection book order must be consecutive');
 for(const s of review.sources)if(!sources.some(v=>v.id===s.id))sources.push(s);
 const range=`${batch.entries[0].number}–${batch.entries.at(-1).number}`;
 const source={...opening.source,scope:config.id==='faith'?`Personal prototype: opening entries 1–7 and Book of Faith entries ${range}. The rest of the collection remains in preparation.`:`Personal prototype: complete numbered entries 1–${batch.entries.at(-1).number} across ${opening.ledger.books.length+1} books. The rest of the collection remains in preparation.`,
  license:{...opening.source.license,attribution:config.id==='faith'?'Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic digital transcription by Arabic Wikisource contributors, opening revision 484874 and Faith revision 490285.':opening.source.license.attribution+` Book of ${config.title}: revision ${config.revision}.`,changes:opening.source.license.changes+` Hadith ${range} retain their Arabic paragraphs unchanged from revision ${config.revision}; their new English and available chapter titles are AI-assisted.${review.chapters.some(c=>c.status==='heading-discrepancy-pending')?' A disputed chapter heading is explicitly withheld.':''} Chapter introductions are preserved separately in Arabic, with English translation still pending.`},sources,
  prototypeReview:config.id==='faith'?{...opening.source.prototypeReview,openingSourceSha256:hash(opening.source),faithReviewSha256:hash(review),faithSourceSha256:manifest.file.sha256}:{...opening.source.prototypeReview,[config.id+'ReviewSha256']:hash(review),[config.id+'SourceSha256']:manifest.file.sha256},entries:[...opening.source.entries,...batch.entries]};
 const sourceHash=hash(source),references=structuredClone(opening.ledger.sourceReferences);references.sourceRecordSha256=sourceHash;
 for(const {id,label,kind,format,url}of review.sources){const existing=references.sources.find(s=>s.id===id);if(existing)assert.deepEqual(existing,{id,label,kind,format,url},'Conflicting shared source');else references.sources.push({id,label,kind,format,url});}
 for(const e of batch.entries){
  const r=review.entries.find(r=>r.number===e.number),chapter=review.chapters.find(c=>c.entryNumbers.includes(e.number));
  references.entries.push({id:e.id,number:e.number,entrySha256:hash(e),translation:{label:'Personal prototype · English working translation',description:e.english_status+' This is a new working translation, not the Darussalam translation.'},citations:[
   {id:'base',sourceId:config.arabicSourceId,locator:`Book of ${config.title} · source entry ${e.number} · ${chapter.titleArabic}`,scope:'Exact Arabic paragraphs from the pinned revision. Source chapter grouping is retained; full chapter introductions are preserved separately in Arabic in the offline notes.'},
   {id:'bewley',sourceId:config.bewleySourceId,locator:`Book of ${config.bewleyTitle} · entry ${r.comparisons.find(c=>c.id===config.bewleySourceId).reference}`,scope:'Named English comparison for the report body. The shortened chain does not replace the selected full Arabic chain.'},
   khanCitation(r.comparisons.find(c=>c.id==='islamhouse-khan')),
   ...r.printedWitnesses.map(w=>({id:w.id,sourceId:w.id,locator:`PDF ${w.pdfPages.length===1?'page':'pages'} ${w.pdfPages.join(', ')}`,pdfPage:w.pdfPages[0],scope:'Printed Arabic comparison; narrator-name and chapter-division differences are recorded in the offline notes.'}))
  ],contextNotes:structuredClone(r.contextNotes||[]),localNotes:{path:config.id+'-review.html',fragment:`hadith-${e.number}`,label:'Comparison notes and chapter source for this hadith'}});
 }
 const books=[...structuredClone(opening.ledger.books),{id:config.id,number:config.number,title:config.title,sourceEntryCount:inventory.records.length,entryNumbers:batch.entries.map(e=>e.number),chapters:batch.chapters}];
 const ledger={...structuredClone(opening.ledger),sourceRecordSha256:sourceHash,books,catalogContextSha256:hash(books),sourceReferences:references,referencesSha256:hash(references)};
 ledger.entries.push(...batch.entries.map(e=>({number:e.number,id:e.id,entrySha256:hash(e),arabicSha256:e.arabic_sha256,englishSha256:sha(e.english_blocks.join('\n\n')),status:'personal-prototype-only',arabicReview:{status:'pending'},englishReview:{status:'pending'},contextReview:{status:'pending'}})));
 ledger.rights.evidence.push(`reader/${config.id}-inputs.json`,`reader/${config.id}-review.html`);
 const selectedIds=new Set([...review.chapters.flatMap(c=>[c.headingId,...c.contextIds]),...review.entries.flatMap(e=>e.paragraphIds)]);
 const inputs={schemaVersion:1,status:'personal-prototype-only',manifest,completeInventorySha256:hash(inventory),scope:`Only the blocks used by Hadith ${range} and their chapter context. The complete source inventory remains separately preserved.`,selectedBlocks:inventory.blocks.filter(b=>selectedIds.has(b.htmlId)),review};
 const chapterNotes=review.chapters.map(c=>{
  const sourceURL=new URL(manifest.url);sourceURL.hash=c.headingId;
  return `<article id="${esc(c.id)}"><p class="eyebrow">Chapter material · separate from numbered hadith</p><h2>${esc(c.title)}</h2><p><a href="./#book/${config.id}/chapter/${esc(c.id)}">Open this chapter →</a></p><p>${c.status==='heading-discrepancy-pending'?'The English heading is withheld because the selected digital and printed witnesses differ. The title above is an app status.':'The English heading is an AI-assisted working translation; independent review is pending.'}</p><h3>Selected Arabic heading</h3><div class="arabic" dir="rtl" lang="ar"><p>${esc(c.titleArabic)}</p></div><h3>Chapter introduction</h3>${c.contextIds.length?`<p>${c.contextIds.length} Arabic ${c.contextIds.length===1?'paragraph':'paragraphs'}. English translation is pending.</p><div class="arabic" dir="rtl" lang="ar">${c.contextIds.map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div>`:'<p>No separate introductory paragraph appears in this selected source chapter.</p>'}<p><a href="${esc(sourceURL.href)}" target="_blank" rel="noopener">Pinned Arabic source · revision ${manifest.revision} ↗</a></p><p>${c.entryNumbers.length?`Numbered reports in this chapter: ${c.entryNumbers.map(n=>`<a href="./#read/${n}">${n}</a>`).join(', ')}.`:'This source chapter has no numbered report. No hadith number has been invented for it.'}</p>${c.headingDiscrepancy?`<p>The heading difference is documented in the <a href="#hadith-${c.entryNumbers[0]}">report comparison notes</a>.</p>`:''}</article>`;
 }).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Book of ${config.title} · source notes</title><link rel="stylesheet" href="reader.css"><style>.review-page article{margin:3rem 0;padding-top:2rem;border-top:1px solid var(--line)}.review-page details{margin:1rem 0}.review-page summary{padding:1rem 0;cursor:pointer}.review-page .arabic{font-size:1.4rem;line-height:2}.review-page li{margin-bottom:1rem}</style></head><body><main class="review-page"><a href="./#book/${config.id}">← Book of ${config.title}</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>The Book of ${config.title}.</h1><p>${esc(review.scope)}</p><p>${esc(review.editionNote)}</p><p><a href="${config.id}-inputs.json">Exact inputs and comparison record</a> · <a href="source-record.json">Current reading text</a></p><nav aria-label="Chapter source notes">${review.chapters.map((c,i)=>`<a href="#${esc(c.id)}">Chapter ${i+1}</a>`).join(' · ')}</nav><nav aria-label="Hadith source notes">${batch.entries.map(e=>`<a href="#hadith-${e.number}">${e.number}</a>`).join(' · ')}</nav>${batch.entries.map(e=>{
  const r=review.entries.find(r=>r.number===e.number),c=review.chapters.find(c=>c.entryNumbers.includes(e.number)),row=references.entries.find(row=>row.number===e.number);
  return `<article id="hadith-${e.number}"><h2>Hadith ${e.number}</h2><p>AI-assisted working translation. Independent review pending.</p><a href="./#read/${e.number}">Open this hadith →</a><h3>Comparison findings</h3><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p>${esc(r.reviewScope)}</p><details><summary>Complete working English</summary>${e.english_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</details><details><summary>Unchanged Arabic report</summary><div class="arabic" dir="rtl" lang="ar">${e.arabic_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</div></details><details><summary>Chapter heading and introduction</summary><p>${esc(c.title)}</p><p>${c.status==='heading-discrepancy-pending'?'This heading has no published English translation because the digital and printed witnesses differ. The label above is an app status, not source wording.':'The heading’s English is provisional.'} Any following introduction is preserved in Arabic; it is separate from the numbered hadith and its English translation remains pending.</p><div class="arabic" dir="rtl" lang="ar">${[c.headingId,...c.contextIds].map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div></details><details><summary>Sources and exact locations</summary><ul>${row.citations.map(c=>{const s=references.sources.find(s=>s.id===c.sourceId),url=new URL(s.url);if(c.pdfPage)url.hash='page='+c.pdfPage;return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a><p>${esc(c.locator)}<br>${esc(c.scope)}</p></li>`;}).join('')}</ul></details></article>`;
 }).join('')}${chapterNotes}<p>${esc(source.license.attribution)}</p><p>${esc(source.license.changes)} <a href="${esc(source.license.url)}">CC BY-SA 4.0</a>.</p></main></body></html>\n`;
 return {source,ledger,files:new Map([...[...(opening.files||[])].filter(([path])=>Object.keys(BOOK_CONFIGS).some(id=>path===`reader/${id}-inputs.json`||path===`reader/${id}-review.html`)),['research/bukhari-personal-collection.json',bytes(source)],['content/review/personal-collection-ledger.json',bytes(ledger)],['reader/source-record.json',bytes(source)],[`reader/${config.id}-inputs.json`,bytes(inputs)],[`reader/${config.id}-review.html`,html]])};
}
export function combineBookReviews(registry,config,readReview=read){
 bookConfig(config);
 assert.equal(registry.schemaVersion,1);assert(registry.batches.length,'No book review batches');
 const reviews=[];let next=config.first;
 for(const batch of registry.batches){
  assert(new RegExp('^content/review/'+config.id+'-[a-z-]+-review\\.json$').test(batch.path),'Unsafe batch path');
  assert.equal(batch.first,next,'Book batches must be consecutive');assert(Number.isSafeInteger(batch.last)&&batch.last>=batch.first);
  const review=readReview(batch.path);assert.equal(hash(review),batch.sha256,'Changed book batch record');
  assert.deepEqual(review.entries.map(e=>e.number),Array.from({length:batch.last-batch.first+1},(_,i)=>batch.first+i),'Incomplete registered book batch');
  if(reviews.length)for(const key of ['schemaVersion','status','independentReview','sourceId','sourceSha256','inventorySha256','sources'])assert.deepEqual(review[key],reviews[0][key],'Conflicting book batch source');
  reviews.push(review);next=batch.last+1;
 }
 const entries=reviews.flatMap(r=>r.entries),chapters=reviews.flatMap(r=>r.chapters);
 assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length,'A chapter cannot be split across review batches');
 return {...reviews[0],entries,chapters,scope:`Complete numbered reports ${config.first}–${next-1}. Available chapter titles use provisional English. Disputed headings are labelled under review; unnumbered chapter introductions remain separately preserved in Arabic.`,editionNote:reviews.map(r=>r.editionNote).join(' '),batches:registry.batches};
}
export function buildFaithBatch(inventory,review,manifest){return buildBookBatch(inventory,review,manifest,BOOK_CONFIGS.faith);}
export function combineFaithReviews(registry,readReview=read){return combineBookReviews(registry,BOOK_CONFIGS.faith,readReview);}
export function collectionFiles(){
 let result=prototypeFiles();
 for(const config of Object.values(BOOK_CONFIGS))result=assembleCollection(result,read(`content/staging/bukhari-${config.id}-wikisource/catalog.json`),combineBookReviews(read(`content/review/${config.id}-batches.json`),config),read(`content/sources/wikisource-${config.id}/manifest.json`),config);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=collectionFiles();for(const [path,body]of result.files){const url=new URL(path,root);if(process.argv.includes('--check'))assert.equal(readFileSync(url,'utf8'),body,'Stale collection file: '+path);else writeFileSync(url,body);}
 console.log(`${result.ledger.books.length} books, ${result.source.entries.length} complete prototype reports; source ${hash(result.source)}`);
}
