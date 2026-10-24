import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {narrationHTML,sourceSegments} from '../reader/source-structure.mjs';
import {sourceContextHTML} from '../reader/source-references.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {chapterMaterialView} from '../reader/library.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-fifth-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 393–407 retains complete source spans, narration and all earlier Prayer entries',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:15},(_,i)=>393+i));assert.equal(batch.chapters.length,8);
 assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=392),read('reader/books/prayer-82b48a8d8e61e6c6.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text,expected=row.number===401?original.replace('ولا عن يمينة','ولا عن يمينه'):original;assert.equal(e.arabic_blocks.join(''),expected);assert.equal(row.segments.map(s=>s.arabic).join(''),expected);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((expected.match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('394 keeps its complete abbreviated chain visible and links to 393 without duplicating it',()=>{
 const {source,ledger}=collectionFiles(),e=source.entries.find(e=>e.number===394),html=narrationHTML(e),refs=sourceContextHTML(ledger.sourceReferences,394);
 assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain']);assert.match(html,/<details class="chain" open>/);assert.match(e.english_blocks[0],/I heard Anas relate this\.$/);assert.doesNotMatch(e.english_blocks[0],/three matters|veil|Station/);assert.match(refs,/#read\/393/);assert.match(refs,/has not been copied/);
 assert.equal(narrationPlan(source).entries.find(e=>e.number===394).script,e.english_blocks[0]);
});
test('a shortened English backward pointer needs exact body and target evidence',()=>{
 const row=input()[1].entries.find(e=>e.number===394),c=row.comparisons[1];assert.deepEqual(c.checkedBody,['Narrated Anas: ','as above (395). ']);assert.equal(c.referencedReference,'1.8.395');
 for(const change of [c=>delete c.referencedReferenceEvidence,c=>c.referencedReferenceEvidence.recordSha256='0'.repeat(64),c=>c.referencedReference='1.8.394',c=>c.checkedBody[1]='as above (397). ',c=>delete c.status,c=>c.referenceEvidence.recordSha256='0'.repeat(64)]){const a=input(),r=a[1].entries.find(e=>e.number===394);change(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('401 exposes the original and declared one-letter correction with both witnesses',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===401),{source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===401);assert.equal(r.arabicCorrections.length,1);assert.equal(r.arabicCorrections[0].before,'ولا عن يمينة');assert.equal(r.arabicCorrections[0].after,'ولا عن يمينه');assert.match(e.arabic_blocks[0],/ولا عن يمينه/);assert(files.get('reader/prayer-review.html').includes('ولا عن يمينة'));assert.match(sourceContextHTML(ledger.sourceReferences,401),/recorded Arabic correction/);
 for(const change of [r=>r.arabicCorrections[0].before='changed',r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].witnesses[0].reading='غيره',r=>r.contextNotes=[]]){const b=input(),x=b[1].entries.find(e=>e.number===401);change(x);rehash(x);assert.throws(()=>buildBookBatch(...b));}
});
test('a missing digital chapter quotation is separately preserved with print provenance',()=>{
 const a=input(),c=a[1].chapters.find(c=>c.id==='chapter-34'),p=c.printedIntroductions[0],{source,ledger,files}=collectionFiles(),chapter=ledger.books.find(b=>b.id==='prayer').chapters.find(c=>c.id==='chapter-34');assert.deepEqual(c.contextIds,[]);assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');assert.equal(chapter.sourceContext.printedIntroduction.evidenceSha256,objectHash(c.printedIntroductions));assert.match(chapterMaterialView(chapter),/absent from the digital chapter/);
 const html=files.get('reader/prayer-review.html');assert(html.includes('data-printed-introduction="chapter-34-print-introduction"'));assert(html.includes(p.arabic));assert.match(html,/PDF page 114/);assert.match(html,/PDF page 112/);assert(source.entries.every(e=>e.arabic_blocks.every(t=>!t.includes(p.arabic))));assert(narrationPlan(source).entries.every(e=>!e.script.includes(p.arabic)));
});
test('printed chapter additions reject wrong placement, stale evidence and invented approval',()=>{
 for(const change of [p=>p.sourceChapterId='chapter-33',p=>p.sourceChapterSha256='0'.repeat(64),p=>p.digitalSourceSha256='0'.repeat(64),p=>p.beforeEntry=401,p=>p.position='inside-report',p=>p.arabic+=' extra',p=>p.witnesses.pop(),p=>p.witnesses[0].sourceSha256='0'.repeat(64),p=>p.witnesses[0].pdfPage=113,p=>p.witnesses[0].chapterNumber=35,p=>p.witnesses[0].reading+=' extra',p=>p.selectedWitnessId='unknown',p=>p.english='Unreviewed text',p=>p.independentReview='approved']){const a=input();change(a[1].chapters.find(c=>c.id==='chapter-34').printedIntroductions[0]);assert.throws(()=>buildBookBatch(...a));}
 const a=input(),c=a[1].chapters.find(c=>c.id==='chapter-34');c.printedIntroductions.push(structuredClone(c.printedIntroductions[0]));assert.throws(()=>buildBookBatch(...a));
});
test('distinct source subjects, uncertainty, feet and closing chains survive comparison',()=>{
 const {source}=collectionFiles(),e=n=>source.entries.find(e=>e.number===n),t=n=>e(n).english_blocks.join(' ');
 assert.match(t(393),/I agreed with my Lord/);assert.match(t(393),/jealousy/);assert.doesNotMatch(t(393),/33:59|some of your prayers/);assert.match(t(395),/tonight/);assert.match(t(396),/They said/);assert.match(t(397),/under his feet/);assert.match(t(397),/Lord—or his Lord/);assert.match(t(399),/mucus, or sputum, or phlegm/);assert.match(t(400),/a pebble/);assert.match(t(401),/informed him/);assert.equal((t(401).match(/may Allah bless him and grant him peace/g)||[]).length,2);assert.doesNotMatch(t(402),/left foot/);assert.doesNotMatch(t(403),/left foot/);assert.match(e(404).english_blocks.at(-1),/al-Zuhri: he heard Humayd.*something similar/);assert.doesNotMatch(t(406),/left foot|recording angel|Most High/);assert.match(t(406),/as long as he is in his place of prayer/);assert.match(t(407),/was seen—or his dislike/);assert.match(t(407),/Lord—or his Lord/);
});
test('sessions include the abbreviated numbered entry while both introductions stay browse-only',()=>{
 const a=input(),{source,ledger}=collectionFiles(),saved={numbers:[391,392],cursor:392,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,407),saved);assert.equal(nextSession(source.entries,saved,5).cursor,393);
 for(const minutes of [5,10]){assert(planSession(source.entries,393,minutes).numbers.includes(394));assert.equal(planSession(source.entries,394,minutes).numbers[0],394);for(let n=393;n<=407;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));}
 const id=a[1].chapters[0].contextIds[0],intro=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(intro)));assert.equal(ledger.books.find(b=>b.id==='prayer').chapters.find(c=>c.id==='chapter-32').sourceContext.introduction.arabicParagraphs,1);
});

test('published printed introductions reject inconsistent counts, status and provenance',()=>{
 const {ledger}=collectionFiles(),original=ledger.books.find(b=>b.id==='prayer');assert.doesNotThrow(()=>validateChapters(original));
 for(const change of [c=>c.printedIntroduction=null,c=>c.printedIntroduction.arabicParagraphs=0,c=>c.printedIntroduction.arabicParagraphs=1.5,c=>c.printedIntroduction.arabicParagraphs=2,c=>c.printedIntroduction.evidenceSha256='0',c=>c.introduction.englishStatus='reviewed-translation',c=>c.printedHeading={}]){
  const book=structuredClone(original);change(book.chapters.find(c=>c.id==='chapter-34').sourceContext);assert.throws(()=>validateChapters(book));
 }
});
