import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateEmptyPrintedChapters,emptyPrintedChapterViews,emptyPrintedChapterContext,emptyPrintedChapterNotes} from '../scripts/printed-empty-chapters.mjs';
import {reviewedChapterViews} from '../scripts/printed-supplements.mjs';
import {validateOccurrenceRegistry,validateEnglishOccurrence,englishOccurrenceGroup,englishOccurrenceCitation} from '../scripts/english-occurrences.mjs';
import {validateChapters,libraryRoute} from '../reader/navigation.mjs';
import {bookView} from '../reader/library.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
function emptyInput(){
 const inventory=read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'),candidate=read('content/review/rain-prayer-empty-chapter-candidate.json'),audit=read('research/rain-prayer-source-audit.json');
 const before=inventory.chapters[3],after=inventory.chapters[4],rows=audit.records;
 const {proposedId,readerEligible,architectureStatus,...item}=candidate;
 Object.assign(item,{id:proposedId,status:'chosen-for-personal-prototype',afterChapterSha256:hash(before),beforeChapterSha256:hash(after),previousArabicSha256:rows[6].arabicSha256,nextArabicSha256:rows[7].arabicSha256});
 const chapter={...structuredClone(before),title:'Turning the cloak',printedEmptyChaptersAfter:[item]},review={chapters:[chapter],sources:audit.printedComparisons.map(s=>({...s,kind:'arabic-witness',label:s.id})),entries:before.entryNumbers.map(number=>({number,chapterId:chapter.id,paragraphIds:inventory.records.find(r=>r.number===number).paragraphIds,printedWitnesses:[{id:'brill-1862',pdfPages:[256]},{id:'dar-ibn-kathir-2002',pdfPages:[245]}],segments:[]}))};
 return {chapter,inventory,review,item};
}
function readerBook(input=emptyInput(),withNext=true){
 const {chapter,item}=input,view=emptyPrintedChapterViews(chapter)[0],book={id:'rain-prayer',number:16,title:'Rain Prayer',sourceEntryCount:33,entryNumbers:[965,966,...(withNext?[967]:[])],chapters:[{id:'chapter-04',title:'Turning the cloak',entryNumbers:[965,966]},{id:view.id,title:view.title,entryNumbers:[],sourceContext:{schemaVersion:1,headingStatus:'heading-translation-pending',numberedReports:'none-in-source',introduction:{arabicParagraphs:0,englishStatus:'not-applicable'},notes:{path:'rain-prayer-review.html',fragment:view.id},printedEmptyHeading:emptyPrintedChapterContext(item)}},...(withNext?[{id:'chapter-05',title:'Rain prayer in the communal mosque',entryNumbers:[967]}]:[])]};return book;
}
test('a real missing printed chapter preserves both readings without assigning a hadith',()=>{
 const a=emptyInput(),snapshot=structuredClone(a);assert.deepEqual(validateEmptyPrintedChapters(a.chapter,a.inventory,a.review),[a.item]);assert.deepEqual(a,snapshot);
 const views=reviewedChapterViews(a.review);assert.deepEqual(views.flatMap(c=>c.entryNumbers),[965,966]);assert.deepEqual(views.map(c=>c.id),['chapter-04','chapter-04-print-05']);assert.equal(views[1].status,'heading-translation-pending');
 const notes=emptyPrintedChapterNotes(views[1],a.review.sources,'rain-prayer');for(const w of a.item.witnesses)assert(notes.includes(w.reading));assert.match(notes,/no hadith number or narration/);assert.match(notes,/#page=245/);assert.match(notes,/#page=256/);
});
test('empty heading needs unchanged source and neighbouring chapter/report identities',()=>{
 for(const change of [a=>a.item.digitalInventorySha256='0'.repeat(64),a=>a.item.beforeChapterId='chapter-06',a=>a.item.afterReference=965,a=>a.item.nextArabicSha256='0'.repeat(64),a=>a.item.afterChapterSha256='0'.repeat(64),a=>a.review.entries.pop(),a=>a.item.id='chapter-04']){
  const a=emptyInput();change(a);assert.throws(()=>validateEmptyPrintedChapters(a.chapter,a.inventory,a.review));
 }
});
test('empty heading cannot acquire invented translated content, reports or narration',()=>{
 for(const change of [a=>a.item.entryNumbers=[966],a=>a.item.contextParagraphs=['extra'],a=>a.item.english='An invented translation',a=>a.item.englishStatus='approved',a=>a.item.independentReview='approved',a=>a.review.entries[0].segments=[{paragraphId:a.item.id,arabic:a.item.arabic}],a=>a.chapter.printedEmptyChaptersAfter.push(structuredClone(a.item))]){
  const a=emptyInput();change(a);assert.throws(()=>validateEmptyPrintedChapters(a.chapter,a.inventory,a.review));
 }
});
test('both print readings, their hashes, selected wording and inspected pages are mandatory',()=>{
 for(const change of [a=>a.item.witnesses.pop(),a=>a.item.witnesses[0].sourceSha256='0'.repeat(64),a=>a.item.witnesses[0].reading+=' changed',a=>a.item.witnesses[0].differenceNote='',a=>a.item.witnesses[1].pdfPage=246,a=>a.item.witnesses[0].chapterNumber=6,a=>a.item.selectedWitnessId='brill-1862']){
  const a=emptyInput();change(a);assert.throws(()=>validateEmptyPrintedChapters(a.chapter,a.inventory,a.review));
 }
});
test('reader can browse the empty heading with no start-session or play action',()=>{
 for(const withNext of [true,false]){
  const book=readerBook(undefined,withNext);validateChapters(book);const catalog={books:[book],entries:book.entryNumbers.map(number=>({number,book:'Rain Prayer'}))},route=libraryRoute('#book/rain-prayer/chapter/chapter-04-print-05',catalog),html=bookView(catalog,{minutes:5,finished:[]},route);
  assert.equal(route.chapter.entryNumbers.length,0);assert.match(html,/Neither print places a numbered hadith beneath it/);assert.match(html,/English translation is still in preparation/);assert(!html.includes('recorded independent review'));assert(!html.includes('data-start-session'));assert(!html.includes('href="#read/'));assert.match(html,/rain-prayer-review.html#chapter-04-print-05/);
 }
});
test('reader rejects moved or contradictory printed empty chapters',()=>{
 for(const change of [b=>b.chapters[1].entryNumbers=[966],b=>b.chapters[1].sourceContext.printedEmptyHeading.beforeChapterId='chapter-06',b=>b.chapters[1].sourceContext.printedEmptyHeading.afterReference=965,b=>b.chapters[1].sourceContext.headingStatus='reviewed-translation',b=>b.chapters[1].sourceContext.introduction.arabicParagraphs=1,b=>delete b.chapters[1].sourceContext.printedEmptyHeading,b=>b.chapters.reverse(),b=>b.chapters[1].sourceContext.printedIntroduction={arabicParagraphs:1}]){
  const b=readerBook();change(b);assert.throws(()=>validateChapters(b));
 }
 const b=readerBook(undefined,false);b.sourceEntryCount=2;assert.throws(()=>validateChapters(b));
});
const registry=()=>read('content/review/english-occurrence-locators.json');
function locatedInput(n){const item=registry().locators.find(x=>x.appReference===n);return {item,comparison:{id:item.sourceId,reference:item.displayedReference,note:'Full chain remains from the selected Arabic.',occurrenceLocator:{id:item.id,sha256:hash(item)}},row:{number:n,sourceRecordId:item.arabicSourceRecordId,arabicSha256:item.originalArabicSha256},config:{bewleySourceId:item.sourceId},sources:[{id:item.sourceId,kind:'english-comparison',url:item.sourceUrl}]};}
test('duplicate displayed numbers are separately located, never shared report parts',()=>{
 validateOccurrenceRegistry(registry());const a=locatedInput(967),b=locatedInput(968);
 for(const x of [locatedInput(966),a,b])validateEnglishOccurrence(x.comparison,x.row,x.config,x.sources);
 assert.equal(a.comparison.reference,b.comparison.reference);assert.notEqual(englishOccurrenceGroup(a.comparison),englishOccurrenceGroup(b.comparison));assert.match(englishOccurrenceCitation(a.comparison).locator,/Chapter V.*occurrence 1/);assert.match(englishOccurrenceCitation(b.comparison).locator,/Chapter VI.*occurrence 2/);
});
test('mislabelled references cannot be silently repaired or bound to another report',()=>{
 for(const change of [x=>delete x.comparison.occurrenceLocator,x=>x.comparison.reference='966',x=>x.row.number=999,x=>x.row.arabicSha256='0'.repeat(64),x=>x.comparison.part={index:1,count:2},x=>x.comparison.status='abbreviated-report',x=>x.sources[0].url='https://example.com',x=>x.comparison.occurrenceLocator.sha256='0'.repeat(64)]){
  const x=locatedInput(967);change(x);assert.throws(()=>validateEnglishOccurrence(x.comparison,x.row,x.config,x.sources));
 }
 const x=locatedInput(968);x.row.originalArabicSha256=x.row.arabicSha256;x.row.arabicSha256='1'.repeat(64);validateEnglishOccurrence(x.comparison,x.row,x.config,x.sources);
});
test('locator registry rejects changed source snapshots, body hashes, duplicated occurrence and unsafe paths',()=>{
 for(const change of [r=>r.locators[0].sourceSnapshotSha256='0'.repeat(64),r=>r.locators[0].locatedTextSha256='0'.repeat(64),r=>r.locators[1].occurrence=2,r=>r.locators[0].auditEvidence.path='../private.json',r=>r.locators[0].auditEvidence.sha256='0'.repeat(64),r=>r.locators.push(structuredClone(r.locators[0]))]){const r=registry();change(r);assert.throws(()=>validateOccurrenceRegistry(r));}
});
test('normal comparisons keep their previous identity and cannot borrow a locator',()=>{
 const c={reference:'946'},row={sourceRecordId:'ordinary'};validateEnglishOccurrence(c,row,{bewleySourceId:'bewley-witr'},[]);assert.equal(englishOccurrenceGroup(c),'946');assert.equal(englishOccurrenceCitation(c),null);
 c.occurrenceLocator=locatedInput(967).comparison.occurrenceLocator;assert.throws(()=>validateEnglishOccurrence(c,row,{bewleySourceId:'bewley-witr'},[]));
});
