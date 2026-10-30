import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validatePrintedReportRows} from '../scripts/printed-reports.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {validateSourceReferences,sourceContextHTML,sourceDialogHTML} from '../reader/source-references.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url))),sha=s=>createHash('sha256').update(s).digest('hex');
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-second-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n),rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const expected=[717,718,719,720,721,722,723,724,'724b',725,726,727,728,729,730,731,732,733,734,735,736,737,738];

test('the next batch retains 22 digital reports unchanged and adds one independently sourced whole report',()=>{
 const a=input(),before=JSON.stringify(a[0]),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.equal(JSON.stringify(a[0]),before);assert.deepEqual(batch.entries.map(e=>e.number),expected);assert.equal(source.entries.length,ENTRY_COUNT);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  if(!r.printedReport)assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text));
 }
 assert.equal(a[0].records.length,137);assert.equal(ledger.books.find(b=>b.id==='prayer-description').sourceEntryCount,140);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('724b retains both complete printed readings and the source and chapter differences',()=>{
 const a=input(),r=row(a,'724b'),p=r.printedReport,b=buildBookBatch(...a),e=b.entries.find(e=>e.number==='724b');
 assert.equal(r.sourceRecordId,'dar-ibn-kathir-2002:758');assert.equal(r.sourceLayout,undefined);assert.equal(p.afterReference,724);assert.equal(p.beforeReference,725);
 assert.equal(e.arabic_blocks[0],p.arabic);assert.equal(p.printReference,'758');assert.equal(p.witnesses.length,2);
 const modern=p.witnesses.find(w=>w.sourceId==='dar-ibn-kathir-2002'),brill=p.witnesses.find(w=>w.sourceId==='brill-1862');
 assert(modern.reading.includes('عبد الملك بن عمير'));assert(brill.reading.includes('عبد الله بن عمير'));
 assert.match(brill.chapterPlacement,/After printed chapter 96/);assert.match(modern.chapterPlacement,/Before printed chapter 96/);
 assert.deepEqual(b.chapters.find(c=>c.id==='chapter-13').entryNumbers,[722,723,724,'724b']);assert.deepEqual(a[0].chapters.find(c=>c.id==='chapter-13').entryNumbers,[722,723,724]);
 assert.match(e.english_blocks[0],/Abu al-Nu‘man related to us\. Abu ‘Awanah related to us/);assert.match(e.english_blocks[1],/two afternoon prayers/);assert(!e.english_blocks[1].includes('night prayer'));
 const refs=collectionFiles().ledger.sourceReferences,ref=refs.entries.find(r=>r.number==='724b');
 assert.equal(ref.citations[0].sourceId,p.inputSourceId);assert.equal(ref.citations[0].pdfPage,187);assert.match(ref.citations[0].locator,/Printed reference 758 · app reference 724b/);
 assert.match(sourceContextHTML(refs,'724b'),/missing from the digital source/);
 assert.match(sourceDialogHTML(e,{sourceReferences:refs,sourceRecord:collectionFiles().source}),/Printed reference 758/);
});

test('print-origin admission rejects forged digital identity, missing evidence, altered text and stale placement',()=>{
 const mutations=[r=>r.sourceRecordId='fake:758',r=>r.sourceLayout={},r=>r.printedReport.witnesses.pop(),r=>r.printedReport.witnesses[0].sourceSha256='0'.repeat(64),r=>r.printedReport.witnesses[0].pdfPage=188,r=>r.printedReport.witnesses[1].differenceNote='',r=>r.printedReport.afterReference=723,r=>r.printedReport.previousArabicSha256='0'.repeat(64),r=>r.printedReport.digitalInventorySha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.printedReport.inputSourceId='arabic-prayer-description',r=>r.printedReport.arabic+=' changed',r=>r.printedReport.chapterId='chapter-14'];
 for(const mutate of mutations){const a=input(),r=row(a,'724b');mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const a=input();a[1].entries.reverse();assert.throws(()=>validatePrintedReportRows(a[0],a[1]),/position/);
 const b=input(),copy=structuredClone(row(b,'724b'));copy.number='724c';copy.id='bukhari:724c';b[1].entries.splice(9,0,copy);assert.throws(()=>validatePrintedReportRows(b[0],b[1]),/origin cannot be assigned twice/);
});

test('the two reports sharing Bewley 725 have complete ordered parts and distinct Khan comparisons',()=>{
 const a=input(),first=row(a,'724b'),second=row(a,725);
 assert.deepEqual(first.comparisons[0].part,{index:1,count:2});assert.deepEqual(second.comparisons[0].part,{index:2,count:2});
 assert.equal(first.comparisons[1].reference,'1.12.725');assert.equal(second.comparisons[1].reference,'1.12.726');
 assert.equal(row(a,738).comparisons[1].reference,'1.12.739');
 for(const mutate of [a=>a[1].entries.splice(8,1),a=>{row(a,725).comparisons[0].part.index=1;rehash(row(a,725));}]){const b=input();mutate(b);assert.throws(()=>buildBookBatch(...b),/Bewley/);}
});

test('the browser rejects a printed report whose actual origin or visible explanation was lost',()=>{
 const {source,ledger}=collectionFiles();
 for(const mutate of [r=>r.contextNotes=[],r=>r.citations[0].pdfPage=188,r=>r.citations[0].sourceId='arabic-prayer-description',r=>r.citations[0].locator='App reference 724b']){
  const b=structuredClone(ledger.sourceReferences);mutate(b.entries.find(r=>r.number==='724b'));
  assert.throws(()=>validateSourceReferences(b,source.entries,{sourceRecordSha256:objectHash(source)}),/Printed report|Printed and app|Invalid PDF page/);
 }
});

test('full closing routes, narrator remarks, question differences and uncertainty remain visible',()=>{
 const b=buildBookBatch(...input()),e=n=>b.entries.find(e=>e.number===n),text=n=>e(n).english_blocks.join(' ');
 assert.equal(sourceSegments(e(720),'english').at(-1).kind,'transmission-note');assert(text(720).includes('Musa ibn ‘Uqbah and Ibn Abi Rawwad'));
 for(const phrase of ['a man—or men','show off and seek reputation','eyebrows','pinch them'])assert(text(722).includes(phrase));
 assert.equal(sourceSegments(e(722),'english').at(-1).kind,'transmission-note');assert(text(724).includes('—three times'));
 assert(text(725).includes('afternoon prayer he would recite the Opening of the Book and two surahs, and would make the first longer'));
 assert(text(726).includes('We asked Khabbab'));assert(text(727).includes('I said to Khabbab'));
 assert(!text(732).includes('What is this'));assert(text(734).includes('What is this'));
 assert(text(735).includes('—or recitation'));assert(text(736).includes('—or what I thought of you'));
 assert.deepEqual(sourceSegments(e(737),'english').map(s=>s.kind),['chain','report','transmission-note','report']);
 assert.equal(e(737).english_blocks[2],'I have forgotten what he said about the sunset prayer.');assert(text(737).includes('did not mind delaying'));assert(text(737).includes('—or in one of them'));
});

test('chapter material stays outside narration and ordered sessions include the missing report',()=>{
 const a=input(),b=buildBookBatch(...a),{source}=collectionFiles();
 const c=b.chapters.find(c=>c.id==='chapter-12');assert.equal(c.title,'Chapter heading under review');assert.equal(c.sourceContext.headingStatus,'heading-discrepancy-pending');
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),2);
 for(const c of a[1].chapters)for(const id of c.contextIds)assert(!b.entries.some(e=>e.arabic_blocks.includes(a[0].blocks.find(b=>b.htmlId===id).text)));
 const s=startSession(source.entries,724,10);assert.deepEqual(s.numbers.slice(0,3),[724,'724b',725]);assert.deepEqual(visitSession(s,1),s);
 const note=readFileSync('reader/notes/prayer-description-hadith-715-730.html','utf8');assert.match(note,/id="hadith-724b"/);assert.match(note,/Both printed readings and exact pages/);
});
