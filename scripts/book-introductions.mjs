/* Book-level quotations stay outside numbered entries and narration. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
export function buildBookIntroduction(inventory,review,manifest,config){
 const declaration=inventory.bookIntroduction;
 if(declaration===undefined){assert.equal(review.bookIntroduction,undefined,'Unexpected book introduction review');assert.equal(config.bookIntroduction,undefined,'Configured book introduction is missing');return;}
 assert.equal(config.bookIntroduction,'preserved-arabic','Unsupported book introduction');
 assert(declaration&&declaration.schemaVersion===1&&declaration.role==='book-introduction'&&declaration.status==='layout-only-not-wording-approval','Invalid book introduction declaration');
 assert.deepEqual(manifest.bookIntroduction,declaration,'Book introduction manifest changed');
 const firstHeading=inventory.blocks.findIndex(b=>b.tag==='h3');assert(firstHeading>0,'Missing book introduction boundary');
 const paragraphs=inventory.blocks.slice(0,firstHeading).filter(b=>b.text.trim());
 assert(paragraphs.length&&paragraphs.every(b=>b.tag==='p'&&!/\[\d+\]/u.test(b.text)),'Only unnumbered book introduction paragraphs are supported');
 const pins=paragraphs.map(b=>({htmlId:b.htmlId,textSha256:sha(b.text)}));assert.deepEqual(declaration.blocks,pins,'Changed book introduction text or order');
 const owned=new Set([...inventory.chapters.flatMap(c=>[c.headingId,...c.contextIds]),...inventory.records.flatMap(r=>r.paragraphIds),...inventory.blankIds]);
 assert(paragraphs.every(b=>!owned.has(b.htmlId)),'Book introduction is also assigned to a chapter or report');
 const row=review.bookIntroduction;assert(row,'Book introduction needs an explicit review');
 const {reviewRecordSha256,...record}=row;assert.equal(reviewRecordSha256,hash(record),'Stale book introduction review');
 assert.equal(row.schemaVersion,1);assert.equal(row.status,'personal-prototype-only');assert.equal(row.reviewerKind,'ai');assert.equal(row.independentReview,'pending');assert.equal(row.englishStatus,'pending','No English book-introduction translation is approved');
 assert.equal(row.sourceId,inventory.sourceId);assert.equal(row.sourceSha256,inventory.sourceSha256);assert.deepEqual(row.blocks,pins,'Book introduction review omits or changes source blocks');
 assert(Array.isArray(row.notes)&&row.notes.length&&row.notes.every(n=>typeof n==='string'&&n.trim()),'Missing book introduction comparison notes');
 assert.deepEqual(row.printedWitnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Book introduction needs both printed locations');
 for(const w of row.printedWitnesses){const source=review.sources.find(s=>s.id===w.sourceId);assert(source?.kind==='arabic-witness'&&source.sha256===w.sourceSha256&&Number.isSafeInteger(w.pdfPage)&&w.pdfPage>0&&typeof w.note==='string'&&w.note.trim(),'Invalid book introduction printed evidence');}
 return {schemaVersion:1,arabicParagraphs:paragraphs.length,englishStatus:'pending',independentReview:'pending',evidenceSha256:reviewRecordSha256,notes:{path:config.id+'-review.html',fragment:'book-introduction'}};
}
export function bookIntroductionNotes(inventory,review,manifest,config){
 const row=review.bookIntroduction;if(!row)return '';
 const paragraphs=row.blocks.map(pin=>inventory.blocks.find(b=>b.htmlId===pin.htmlId));
 return `<article id="book-introduction"><p class="eyebrow">Book introduction · separate from numbered hadith</p><h2>Opening quotations</h2><p>The original Arabic is preserved below. English translation and independent review are pending. This material is available while browsing and is not part of a numbered reading or listening session.</p><div class="arabic" lang="ar" dir="rtl">${paragraphs.map(b=>`<p data-book-introduction-block="${esc(b.htmlId)}">${esc(b.text)}</p>`).join('')}</div><p><a href="${esc(manifest.url)}" target="_blank" rel="noopener">Pinned Arabic source · revision ${manifest.revision} ↗</a></p><h3>Source comparison notes</h3><ul>${row.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>${row.printedWitnesses.map(w=>{const s=review.sources.find(s=>s.id===w.sourceId),url=new URL(s.url);url.hash='page='+w.pdfPage;return `<p><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} · PDF page ${w.pdfPage} ↗</a></p><p>${esc(w.note)}</p>`;}).join('')}<p><a href="./#book/${config.id}">Return to the Book of ${esc(config.title)} →</a></p></article>`;
}
