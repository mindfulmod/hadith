import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-second-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};

test('second Ablution batch preserves all earlier entry objects and completes eleven source chapters',()=>{
 const args=input(),snapshot=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger}=collectionFiles();
 assert.deepEqual(args.slice(0,3),snapshot);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>142+i));assert.equal(batch.chapters.length,11);
 const previous=['opening-revelation-75034cf565efa4a7','faith-6727a26330f3f5f3','knowledge-b4c7f5998e10997e','ablution-88a67f0d3dc9b73b'].flatMap(p=>read('reader/books/'+p+'.json').entries);
 assert.deepEqual(source.entries.slice(0,141),previous);assert.equal(source.entries.length,309);
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.chapters.length,77);assert.equal(book.entryNumbers.length,110);
 assert(!batch.chapters.some(c=>c.id==='chapter-20'));assert(!batch.entries.some(e=>e.number===154||e.number===155));
 for(const e of batch.entries)assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),args[1].entries.find(r=>r.number===e.number).segments.map(s=>s.english));
});
test('146 retains both narrations, both chains, closing explanation and evidence-bound split references',()=>{
 const args=input(),row=args[1].entries.find(r=>r.number===146),{source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===146),segments=sourceSegments(e,'english');
 assert.deepEqual(segments.map(s=>s.kind),['chain','report','chain','report','transmission-note']);assert.match(segments[1].text,/we have recognised.*verse of hijab/s);assert.match(segments[2].text,/Zakariyya.*Abu Usamah.*Hisham.*his father.*‘A’ishah/s);assert.match(segments.at(-1).text,/Hisham.*relieving oneself/);
 assert.deepEqual(row.comparisons[1].splitReferences.map(p=>p.reference),['1.4.148','1.4.149']);
 assert(ledger.sourceReferences.entries.find(r=>r.number===146).citations.some(c=>c.locator.includes('148, 149')));assert.match(files.get('reader/ablution-review.html'),/separately numbered comparison parts/);
 for(const change of [r=>r.comparisons[1].splitReferences.pop(),r=>r.comparisons[1].splitReferences[1].segmentIds.pop(),r=>r.comparisons[1].splitReferences[1].referenceEvidence.recordSha256='0'.repeat(64)]){const a=input(),r=a[1].entries.find(r=>r.number===146);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('146 hamza correction remains visible, exact and separate from unchanged digital provenance',()=>{
 const args=input(),row=args[1].entries.find(r=>r.number===146),original=args[0].blocks.find(b=>b.htmlId==='mwPA'),{source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===146);
 assert.match(original.text,/قد إذن أن تخرجن/);assert.match(e.arabic_blocks[1],/قد أذن أن تخرجن/);assert.notEqual(row.originalArabicSha256,row.arabicSha256);assert.equal(row.sourceLayout.paragraphs[1].textSha256,original.textSha256);
 assert(ledger.sourceReferences.entries.find(r=>r.number===146).contextNotes.some(n=>n.id==='146-source-correction'));assert(files.get('reader/ablution-review.html').includes(original.text));
 for(const change of [r=>{delete r.arabicCorrections;delete r.originalArabicSha256;},r=>r.arabicCorrections[0].witnesses[0].pdfPage=49,r=>r.arabicCorrections[0].englishSegmentId='146-2',r=>r.contextNotes=[]]){const a=input(),r=a[1].entries.find(r=>r.number===146);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('complete scripts preserve transmission alternatives and explanations without chapter introductions',()=>{
 const {source}=collectionFiles(),get=n=>sourceSegments(source.entries.find(e=>e.number===n),'english'),plan=narrationPlan(source);
 assert.match(get(142).at(-1).text,/Ibn ‘Ar‘arah.*Ghundar.*Musa.*Sa‘id ibn Zayd.*wanted to enter/s);
 assert.match(get(145)[1].text,/hips.*I do not know/s);assert.match(get(145).at(-1).text,/Malik.*pressed against the ground/s);
 assert.equal(get(149).at(-1).kind,'transmission-note');assert.match(get(151).at(-1).text,/Al-Nadr and Shadhan.*staff with an iron tip/s);
 for(const n of [152,153])assert.match(get(n)[0].text,/‘Abdullah ibn Abi Qatadah, from his father/);
 for(const n of [142,145,146,149,151])assert.equal(plan.entries.find(e=>e.number===n).script,get(n).map(s=>s.text).join('\n\n'));
 assert(!plan.entries.find(e=>e.number===150).script.includes('Darda'));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
test('numbered sessions cross the previous end while chapter context remains separately browseable',()=>{
 const {source,ledger,files}=collectionFiles(),saved={numbers:[141],cursor:141,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,150),saved);assert.equal(nextSession(source.entries,saved,5).cursor,142);
 assert(planSession(source.entries,141,5).numbers.includes(142));assert.deepEqual(planSession(source.entries,309,5).numbers,[309]);
 const chapter=ledger.books.find(b=>b.id==='ablution').chapters.find(c=>c.id==='chapter-16');assert.deepEqual(chapter.entryNumbers,[150]);assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);
 const inputs=JSON.parse(files.get('reader/ablution-inputs.json')),intro=inputs.selectedBlocks.find(b=>b.htmlId==='mwTQ');assert.match(intro.text,/أبو الدرداء/);assert(!source.entries.find(e=>e.number===150).arabic_blocks.some(s=>s.includes(intro.text)));assert(files.get('reader/ablution-review.html').includes('id="chapter-16"'));
});
