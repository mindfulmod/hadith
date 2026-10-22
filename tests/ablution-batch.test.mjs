import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {entryLayoutEvidence,validateEntryLayout,layoutSourceNotice,layoutSourceDetails} from '../scripts/mapped-source.mjs';
import {objectHash} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-first-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);};

test('Ablution admits seven complete reports and eight chapters while preserving all 134 prior entries',()=>{
 const args=input(),original=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source}=collectionFiles();
 assert.deepEqual(args.slice(0,3),original);assert.deepEqual(batch.entries.map(e=>e.number),[135,136,137,138,139,140,141]);assert.equal(batch.chapters.length,8);
 assert.deepEqual(batch.chapters[0].entryNumbers,[]);assert.equal(batch.chapters[0].sourceContext.introduction.arabicParagraphs,2);assert.equal(batch.chapters[5].sourceContext.introduction.arabicParagraphs,1);
 const previous=['opening-revelation-04b0db06903608d8','faith-72f493a0d1681cd6','knowledge-d3216a2acee5ec98'].flatMap(name=>read('reader/books/'+name+'.json').entries);
 assert.deepEqual(source.entries.slice(0,134),previous);assert.equal(source.entries.length,141);
 for(const entry of batch.entries){const row=args[1].entries.find(r=>r.number===entry.number);assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),row.segments.map(s=>s.english));assert.deepEqual(entry.review.sourceLayout,row.sourceLayout);}
});
test('mapped source changes are rejected even when the batch inventory hash is updated',()=>{
 for(const mutate of [i=>i.blocks[0].text+=' ',i=>i.originalBlocks[0].text+=' ',i=>i.records[0].sourceReference.label='136',i=>i.blocks[1].origin.end--,i=>i.layoutReview.decisions[0].units[1].start++,i=>i.chapters[0].contextIds.pop()]){
  const args=input();mutate(args[0]);args[1].inventorySha256=objectHash(args[0]);assert.throws(()=>buildBookBatch(...args),/authoritative checked source map/);
 }
 const args=input();delete args[1].sourceLayout;assert.throws(()=>buildBookBatch(...args),/bind its source layout review/);
});
test('each admitted report needs exact origins and individually pinned English comparison evidence',()=>{
 for(const mutate of [r=>delete r.sourceLayout,r=>r.sourceLayout.paragraphs[0].origin.start++,r=>r.sourceLayout.sourceReference.markerId='mwDA:0',r=>r.sourceLayout.sourceSha256='0'.repeat(64),r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.comparisons[1].reference='1.4.138']){
  const args=input();mutate(args[1].entries[0]);rehash(args[1].entries[0]);assert.throws(()=>buildBookBatch(...args));
 }
});
test('the 137 conjunction correction keeps its unchanged original and visible two-print evidence',()=>{
 const args=input(),row=args[1].entries.find(e=>e.number===137),entry=buildBookBatch(...args).entries.find(e=>e.number===137),{source,ledger,files}=collectionFiles();
 const original=args[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;
 assert(original.includes('عن سعيد بن المسيب عن عباد'));assert(entry.arabic_blocks[0].includes('عن سعيد بن المسيب وعن عباد'));
 assert.match(entry.english_blocks[0],/and from ‘Abbad ibn Tamim/);assert.equal(entry.review.sourceLayout.paragraphs[0].textSha256,args[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).textSha256);
 assert(ledger.sourceReferences.entries.find(r=>r.number===137).contextNotes.some(n=>n.id==='137-source-correction'));
 assert(files.get('reader/ablution-review.html').includes(original));assert(files.get('reader/ablution-review.html').includes('Recorded Arabic correction'));
 assert.equal(source.entries.find(e=>e.number===137).arabic_sha256,row.arabicSha256);
 for(const mutate of [r=>{delete r.arabicCorrections;delete r.originalArabicSha256;},r=>r.arabicCorrections[0].witnesses[0].pdfPage=47,r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='not translated']){const a=input(),r=a[1].entries.find(e=>e.number===137);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('the long report retains both left-wording occurrences, the repeated chain and closing discussion',()=>{
 const {source}=collectionFiles(),e=source.entries.find(e=>e.number===138),segments=sourceSegments(e,'english');
 assert.equal(segments.length,10);assert.equal(segments.filter(s=>s.kind==='chain').length,2);assert.equal(segments.filter(s=>s.kind==='transmission-note').length,4);
 assert.match(segments[2].text,/Sometimes he said/);assert.match(segments[3].text,/time after time.*‘Amr.*Kurayb.*Ibn ‘Abbas/);assert.match(segments[5].text,/light and small in amount/);assert.match(segments[6].text,/on his left/);assert.match(segments[7].text,/On his left/);assert.match(segments.at(-1).text,/‘Ubayd ibn ‘Umayr.*dreams of the prophets.*slaughtering you/s);
 assert.match(source.entries.find(e=>e.number===139).english_blocks.at(-1),/did not pray between the two/);
 assert.match(source.entries.find(e=>e.number===140).english_blocks[0],/meaning Sulayman/);assert.match(source.entries.find(e=>e.number===140).english_blocks.at(-1),/meaning the left/);
});
test('source-only chapter browsing and the next numbered session cross into Ablution without changing a saved plan',()=>{
 const {source,ledger}=collectionFiles(),saved={numbers:[134],cursor:134,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,134),saved);assert.equal(nextSession(source.entries,saved,5).cursor,135);
 assert(planSession(source.entries,134,5).numbers.includes(135));assert.deepEqual(planSession(source.entries,141,5).numbers,[141]);assert.equal(nextSession(source.entries,{numbers:[141],cursor:141,ended:true},5),null);
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.sourceEntryCount,110);assert.deepEqual(book.chapters[0].entryNumbers,[]);assert.equal(book.chapters[0].sourceContext.numberedReports,'none-in-source');
});
test('mapped labels and shared paragraphs keep original evidence in the future admission path',()=>{
 const [inventory]=input(),record=inventory.records.find(r=>r.number===160),row={number:160,sourceLayout:entryLayoutEvidence(inventory,record),comparisons:[{id:'bewley-ablution',reference:'160'},{id:'islamhouse-khan',reference:'1.4.163'}],printedWitnesses:[{id:'brill-1862',pdfPages:[53,54]},{id:'dar-ibn-kathir-2002',pdfPages:[53]}]};
 validateEntryLayout(inventory,row,record);assert.match(layoutSourceNotice(row)[0].text,/١٦٢.*160/);assert(layoutSourceDetails(inventory,row).includes('===باب الاستجمار وترا===[١٦٢]'));
 for(const mutate of [r=>delete r.sourceLayout.referenceMapping,r=>r.sourceLayout.sourceReference.label='160',r=>r.comparisons[0].reference='162',r=>r.printedWitnesses[0].pdfPages=[53]]){const r=structuredClone(row);mutate(r);assert.throws(()=>validateEntryLayout(inventory,r,record));}
 const later=inventory.records.find(r=>r.number===195),evidence=entryLayoutEvidence(inventory,later);assert.equal(evidence.paragraphs[0].origin.start,237);const detail=layoutSourceDetails(inventory,{sourceLayout:evidence});assert(detail.includes('[194]'));assert(detail.includes('[195]'));
});
test('offline source inputs retain every selected original paragraph and correct external source anchors',()=>{
 const {files}=collectionFiles(),inputs=JSON.parse(files.get('reader/ablution-inputs.json')),html=files.get('reader/ablution-review.html'),[inventory]=input();
 assert.equal(inputs.sourceLayout.originalBlocks.length,25);assert.equal(inputs.selectedBlocks.length,25);
 for(const block of inputs.selectedBlocks){const original=inputs.sourceLayout.originalBlocks.find(b=>b.htmlId===block.origin.blockId);assert.equal(Array.from(original.text).slice(block.origin.start,block.origin.end).join(''),block.text);}
 assert.deepEqual(inputs.sourceLayout.completeLayoutReview,inventory.layoutReview);assert(html.includes('id="chapter-01"'));assert(html.includes('Original source labels and boundaries'));assert(!html.includes('full collection is verified'));
});
