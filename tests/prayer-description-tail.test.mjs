import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {collectionFiles,buildBookBatch,BOOK_CONFIGS} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {chapterForNumber,validateChapters} from '../reader/navigation.mjs';
import {compareReferences,validReference} from '../reader/references.mjs';
import {ENTRY_COUNT} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const candidate=()=>read('content/review/prayer-description-tail-candidate.json');

test('admitted tails preserve the reviewed text and earlier Arabic and English, with no invented recordings',()=>{
 const c=candidate(),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(source.entries.findIndex(e=>e.number==='835c')+1,839);
 for(const r of c.entries){const e=source.entries.find(e=>e.number===r.proposedAppReference);assert.equal(e.review.sourceRecordId,r.sourceRecordId);assert.equal(e.arabic_blocks.join(''),r.arabic);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(e.review.printedReport.referenceDecision.status,'user-confirmed');assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));}
 const old=read('reader/books/prayer-description-0274c5ac052a45e0.json');for(const e of old.entries){const now=source.entries.find(n=>n.number===e.number);assert.deepEqual(now.arabic_blocks,e.arabic_blocks);assert.deepEqual(now.english_blocks,e.english_blocks);}
 const book=ledger.books.find(b=>b.id==='prayer-description');validateChapters(book);assert.equal(chapterForNumber(book,835).id,'chapter-84');assert.equal(chapterForNumber(book,'835b').id,'chapter-84-print-163');assert.deepEqual(chapterForNumber(book,'835c').entryNumbers,['835b','835c']);
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
 assert(read('content/review/prayer-description-batches.json').batches.every(b=>b.path!=='content/review/prayer-description-tail-candidate.json'));
});

test('two independent occurrences retain exact chains and the feminine closing comment',()=>{
 const c=candidate();assert.deepEqual(c.entries.map(e=>e.printedReference),['874','875']);assert.deepEqual(c.entries.map(e=>e.secondPrintedReference),['884','885']);
 for(const e of c.entries){assert.equal(e.arabic,e.segments.map(s=>s.arabic).join(''));assert.equal(e.arabicSha256,hash(e.arabic));assert.equal(e.englishSha256,hash(JSON.stringify(e.segments.map(s=>s.english))));assert.equal(e.segments[0].kind,'chain');assert.equal(e.witnesses.length,2);assert.equal(new Set(e.witnesses.map(w=>w.sourceId)).size,2);assert(e.witnesses.every(w=>w.reading===e.arabic&&w.readingSha256===e.arabicSha256));assert.equal((e.arabic.match(/ﷺ/g)||[]).length,(e.segments.map(s=>s.english).join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 const tail=c.entries[1];assert(tail.segments[2].arabic.startsWith('قالت نرى'));assert(tail.segments[2].english.startsWith('She said: We think'));assert(!tail.arabic.includes('أحد من الرجال'));assert(!tail.segments[2].english.includes('al-Zuhri'));assert(!tail.arabic.includes('رضي الله'));
 assert(c.sources.find(s=>s.id==='qastallani-repeated-tail').excerpt.includes('بتاء التأنيث'));
});

test('printed tails cannot bypass book-end, witness, heading, reference or English evidence checks',()=>{
 const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-final-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
 const changes=[r=>r.printedReport.afterReference=834,r=>r.printedReport.beforeReference=836,r=>r.printedReport.previousArabicSha256='0'.repeat(64),r=>r.printedReport.nextArabicSha256='0'.repeat(64),r=>r.printedReport.position='after-report',r=>r.printedReport.referenceDecision.status='pending',r=>r.printedReport.referenceDecision.printedReference='875',r=>r.printedReport.witnesses.pop(),r=>r.printedReport.witnesses[1].sourceSha256='0'.repeat(64),r=>delete r.printedReport.chapterHeading,r=>r.printedReport.chapterHeading.witnesses[1].chapterNumber=164,r=>r.printedReport.chapterHeading.arabic+=' زيادة',r=>r.printedReport.chapterHeading.beforeEntry='835c',r=>r.contextNotes=[],r=>r.comparisons[1].checkedBody[1]+=' changed',r=>r.comparisons[0].status=undefined];
 for(const change of changes){const a=input(),r=a[1].entries.find(e=>e.number==='835b');change(r);delete r.reviewRecordSha256;r.reviewRecordSha256=hash(JSON.stringify(r));assert.throws(()=>buildBookBatch(...a));}
 const a=input(),rows=a[1].entries;[rows[rows.length-2],rows[rows.length-1]]=[rows.at(-1),rows.at(-2)];assert.throws(()=>buildBookBatch(...a));
});

test('proposed suffixes sort after the exact selected book end without shifting the next numeric reference',()=>{
 const c=candidate(),inventory=read('content/staging/bukhari-prayer-description-wikisource/catalog.json');
 assert.equal(inventory.records.at(-1).number,835);assert.equal(c.insertion.afterReference,835);assert.equal(c.digitalInventorySha256,hash(JSON.stringify(inventory)));
 assert.deepEqual(c.insertion.appReferences,['835b','835c']);assert(c.insertion.appReferences.every(validReference));
 assert.deepEqual([836,'835c',835,'835b'].sort(compareReferences),[835,'835b','835c',836]);
 assert.equal(new Set(c.entries.map(e=>e.sourceRecordId)).size,2);assert.equal(c.sources.find(s=>s.id==='dar-tasil-2012-v1').sha256,'0136ed57436e607acebf53d33fd89695230bd88e76d7c7c10bd4b54ff1f5f0e6');
});
