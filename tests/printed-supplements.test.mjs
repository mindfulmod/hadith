import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {validateSourceStructure,sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {validateChapters,chapterForNumber,libraryRoute} from '../reader/navigation.mjs';
import {chapterMaterialView} from '../reader/library.mjs';
import {searchEntries} from '../reader/search.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-third-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
function rejects(change){const a=input(),row=a[1].entries[1];change(row);rehash(row);assert.throws(()=>buildBookBatch(...a));}

test('printed additions preserve the original source map and every previous 153 entry object',()=>{
 const args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();assert.deepEqual(args.slice(0,3),before);
 const old=['opening-revelation-8f9b7206f3b1c395','faith-51ef5137099b1ce5','knowledge-0b3fbe8a82cf56d5','ablution-06f5b0511207d61d'].flatMap(p=>read('reader/books/'+p+'.json').entries);assert.deepEqual(source.entries.slice(0,153),old);assert.equal(source.entries.length,261);
 const original=args[0].records.find(e=>e.number===155),entry=batch.entries[1];assert.deepEqual(entry.arabic_blocks.slice(0,2),original.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert.equal(entry.arabic_blocks.length,3);
 assert.equal(entry.review.sourceLayout.paragraphs[0].origin.start,2);assert.equal(entry.review.sourceLayout.paragraphs.length,2);assert.equal(entry.review.arabicSupplements.length,1);
 const inputs=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(inputs.selectedBlocks.length,256);assert(!inputs.selectedBlocks.some(b=>b.htmlId.startsWith('print-')));assert(inputs.sourceLayout.originalBlocks.find(b=>b.htmlId==='mwYQ').text.startsWith('\n\n[155]'));
 assert.deepEqual(ledger.books.find(b=>b.id==='ablution').chapters.filter(c=>['chapter-20','chapter-20-print-21'].includes(c.id)).map(c=>c.entryNumbers),[[154],[155]]);
});
test('printed transmission notes require exact original identity, selected wording, two witnesses and a visible notice',()=>{
 for(const change of [r=>r.arabicSupplements[0].sourceRecordId='other',r=>r.arabicSupplements[0].digitalArabicSha256='0'.repeat(64),r=>r.arabicSupplements[0].arabic+=' زيادة',r=>r.arabicSupplements[0].english+=' Extra.',r=>r.arabicSupplements[0].selectedWitnessId='brill-1862',r=>r.arabicSupplements[0].witnesses.pop(),r=>r.arabicSupplements[0].witnesses[0].pdfPage=51,r=>r.arabicSupplements[0].witnesses[0].sourceSha256='0'.repeat(64),r=>r.arabicSupplements[0].witnesses[0].reading+=' زيادة',r=>r.arabicSupplements[0].witnesses[0].differenceNote='',r=>r.contextNotes=[],r=>r.arabicSupplements[0].independentReview='approved',r=>r.arabicSupplements[0].transcriptionPolicy=''])rejects(change);
});
test('a printed note cannot become an ordinary digital block, disappear, move or be split without its evidence',()=>{
 for(const change of [r=>delete r.arabicSupplements,r=>r.arabicSupplements=[],r=>r.arabicSupplements[0].position='before-report',r=>r.arabicSupplements[0].id='mwYw',r=>r.arabicSupplements[0].kind='report',r=>r.arabicSupplements[0].englishSegmentId='155-2',r=>r.segments[2].kind='report',r=>r.segments[2].end--,r=>r.segments.pop(),r=>r.paragraphIds.push(r.arabicSupplements[0].id)])rejects(change);
});
test('the printed heading is a separately navigable section with retained digital grouping and bound evidence',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ablution'),chapter=chapterForNumber(book,155);validateChapters(book);
 assert.equal(chapter.id,'chapter-20-print-21');assert.equal(chapter.title,'Not cleansing oneself with dung');assert.equal(chapter.sourceContext.printedHeading.beforeEntry,155);assert.equal(chapter.sourceContext.printedHeading.sourceChapterId,'chapter-20');
 assert.equal(chapterForNumber(book,154).id,'chapter-20');assert.equal(libraryRoute('#book/ablution/chapter/chapter-20-print-21',{books:ledger.books}).chapter,chapter);
 assert.match(chapterMaterialView(chapter),/supplied from two Arabic prints/);assert.match(files.get('reader/ablution-review.html'),/digital source groups 154, 155/);assert.match(files.get('reader/ablution-review.html'),/id="chapter-20-print-21"/);
 const entry=source.entries.find(e=>e.number===155);assert.equal(chapter.sourceContext.printedHeading.evidenceSha256,objectHash(entry.review.printedHeading));
 for(const change of [r=>r.printedHeading.beforeEntry=154,r=>r.printedHeading.sourceChapterId='chapter-19',r=>r.printedHeading.id='chapter-20',r=>r.printedHeading.id='chapter-20-print-../secret',r=>r.printedHeading.witnesses[0].chapterNumber=20,r=>r.printedHeading.english+=' different'])rejects(change);
 for(const change of [c=>c.sourceContext.printedHeading.sourceChapterId='missing',c=>c.sourceContext.printedHeading.beforeEntry=154,c=>c.sourceContext.printedHeading.evidenceSha256='',c=>c.sourceContext.introduction.arabicParagraphs=1]){const copy=structuredClone(book);change(copy.chapters.find(c=>c.id==='chapter-20-print-21'));assert.throws(()=>validateChapters(copy));}
});
test('rendered Arabic and English supplements cannot silently lose their origin labels',()=>{
 const {source}=collectionFiles(),entry=source.entries.find(e=>e.number===155);assert.match(narrationHTML(entry),/Transmission note · from an Arabic print/);
 for(const language of ['english','arabic']){const s=sourceSegments(entry,language).at(-1);assert.equal(s.provenance.kind,'printed-supplement');assert.equal(s.text,entry.review.arabicSupplements[0][language]);
  for(const change of [e=>delete e.presentation[language].at(-1).provenance,e=>e.presentation[language].at(-1).provenance.id='missing',e=>e.presentation[language].at(-1).kind='report',e=>e[language+'_blocks'][e.presentation[language].at(-1).block]+=' changed']){const copy=structuredClone(entry);change(copy);assert.throws(()=>validateSourceStructure(copy));}
 }
});
test('complete narration includes the printed closing note once and excludes the chapter heading and source notice',()=>{
 const {source}=collectionFiles(),entry=source.entries.find(e=>e.number===155),script=narrationPlan(source).entries.find(e=>e.number===155).script,note=entry.review.arabicSupplements[0].english;
 assert.equal(script,entry.english_blocks.join('\n\n'));assert.equal(script.split(note).length,2);assert(!script.includes(entry.review.printedHeading.english));assert(!script.includes('Independent review'));assert.match(script,/Ibrahim ibn Yusuf.*his father.*Abu Ishaq.*related to me/s);
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
test('both printed readings and the narrator uncertainty remain visible without harmonising wording',()=>{
 const {source,files}=collectionFiles(),entry=source.entries.find(e=>e.number===155),note=entry.review.arabicSupplements[0],html=files.get('reader/ablution-review.html');
 assert.match(note.witnesses[0].reading,/قال حدثنى/);assert(!note.arabic.includes('قال حدثني'));for(const w of note.witnesses)assert(html.includes(w.reading));assert(html.includes('Selected wording'));
 const prior=sourceSegments(source.entries.find(e=>e.number===154),'english');assert.deepEqual(prior.map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(prior[2].text,'Or words to that effect.');assert.match(entry.english_blocks[0],/not Abu ‘Ubaydah.*‘Abd al-Rahman ibn al-Aswad.*his father/s);
});
test('printed additions remain personal-prototype content and cannot satisfy production review gates',()=>{
 const {source,ledger}=collectionFiles();assert.equal(buildBooks(source,ledger).catalog.publication,'personal-prototype');assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
 assert.equal(source.entries.find(e=>e.number===155).review.arabicSupplements[0].independentReview,'pending');
});

test('exact search and number lookup retain the printed origin without changing displayed words',()=>{
 const {source}=collectionFiles(),entry=source.entries.find(e=>e.number===155),note=entry.review.arabicSupplements[0];
 for(const [query,language]of [['Ibrahim ibn Yusuf','english'],['وقال إبراهيم بن يوسف','arabic'],['155','english']]){
  const result=searchEntries(source.entries,query).results.find(r=>r.entry.number===155);assert.equal(result.sourceOrigin,'printed-supplement');assert.equal(result.text,note[language]);
 }
 const ordinary=searchEntries(source.entries,'This is unclean').results.find(r=>r.entry.number===155);assert.equal(ordinary.sourceOrigin,undefined);
});
