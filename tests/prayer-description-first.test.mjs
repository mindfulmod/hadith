import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT,BOOK_COUNT} from './published-fixture.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sha=s=>createHash('sha256').update(s).digest('hex');
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-first-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);};
const entry=(a,n)=>a[1].entries.find(e=>e.number===n);

test('Description of Prayer preserves all eighteen complete source spans and exact full narration scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:18},(_,i)=>699+i));
 assert.equal(a[1].entries.flatMap(e=>e.segments).length,43);
 for(const row of a[1].entries){
  const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);
  assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));
  assert.deepEqual(row.paragraphIds.map(id=>row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),e.arabic_blocks);
  if(row.number!==707)assert.deepEqual(e.arabic_blocks,original);
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===row.number).script,e.english_blocks.join('\n\n'));
  assert.equal(row.comparisons[1].reference,'1.12.'+row.number);
  assert.equal(row.sourceLayout.sourceRecordId,row.sourceRecordId);
 }
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('707 keeps the original alongside both two-print corrections and the full attribution distinction',()=>{
 const a=input(),row=entry(a,707),e=buildBookBatch(...a).entries.find(e=>e.number===707);
 const original=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;
 assert(original.includes('النبي الله'));assert(original.includes('قال إسماعيل ينمي ذلك ولم يقل ينمي'));
 assert.equal(e.arabic_blocks[0],original.replace('النبي الله','النبي').replace('قال إسماعيل ينمي ذلك','قال إسماعيل ينمى ذلك'));
 assert.equal(row.originalArabicSha256,sha(original));assert.equal(row.arabicCorrections.length,2);
 assert(row.arabicCorrections[1].start>row.arabicCorrections[0].end);
 for(const c of row.arabicCorrections){assert.equal(c.correctedParagraphSha256,sha(e.arabic_blocks[0]));assert.equal(c.witnesses.length,2);assert.equal(c.independentReview,'pending');}
 assert.match(e.english_blocks[2],/I know him only as attributing/);
 assert(e.english_blocks[2].includes('“It is attributed,” and did not say, “He attributes.”'));
 assert.equal(sourceSegments(e,'english')[2].kind,'transmission-note');
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections.reverse(),r=>r.contextNotes=[],r=>r.arabicCorrections[1].before='ينمي']){
  const b=input(),r=entry(b,707);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...b));
 }
});

test('the eclipse account keeps all repeated actions and separates both narrator uncertainty phrases',()=>{
 const e=buildBookBatch(...input()).entries.find(e=>e.number===712),s=sourceSegments(e,'english');
 assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);
 assert.equal((s[1].text.match(/prolonged the bowing/g)||[]).length,4);
 assert.equal((s[1].text.match(/prolonged the prostration/g)||[]).length,4);
 assert.equal((s[1].text.match(/prolonged the standing/g)||[]).length,4);
 assert.equal(s[2].text,'I think he said:');assert.match(s[4].text,/Nafi‘ said: I think he said/);
 assert(s[4].text.includes('khashish, or khashash'));assert(!e.english_blocks.join(' ').includes('grass'));
 assert(s[3].text.includes('She neither fed it nor let it go to eat'));
 const r=entry(input(),712);assert(r.contextNotes.some(n=>n.citations.includes('commentary-fath-prayer-description-712')));
});

test('the untitled printed division and both Arabic introductions stay outside numbered sessions and audio',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer-description');
 assert.equal(a[1].chapters.length,9);assert.equal(batch.chapters.length,10);
 assert.deepEqual(book.chapters.find(c=>c.id==='chapter-08').entryNumbers,[710,711]);
 const printed=book.chapters.find(c=>c.id==='chapter-08-print-90');assert.equal(printed.title,'Untitled chapter');assert.deepEqual(printed.entryNumbers,[712]);
 assert.equal(printed.sourceContext.printedHeading.sourceChapterId,'chapter-08');
 assert.deepEqual(a[1].chapters[7].entryNumbers,[710,711,712]);
 assert.equal(book.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),2);
 for(const c of a[1].chapters)for(const id of c.contextIds){const text=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(text)));}
 assert(!narrationPlan(source).entries.find(e=>e.number===712).script.includes('Untitled chapter'));
 for(const mutate of [r=>r.printedHeading.witnesses.pop(),r=>r.printedHeading.beforeEntry=711,r=>r.printedHeading.arabic='Invented title']){const b=input(),r=entry(b,712);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...b));}
});

test('abbreviated English pointers never replace the full 700 and 701 accounts or their distinct responses',()=>{
 const a=input(),b=buildBookBatch(...a),get=n=>b.entries.find(e=>e.number===n).english_blocks.join(' ');
 for(const n of [700,701]){const row=entry(a,n);assert.equal(row.comparisons[0].status,'abbreviated-report');assert.equal(row.comparisons[0].referencedReference,'699');assert(get(n).includes('When he says the takbir'));assert(!get(n).includes('As 699'));}
 assert(get(700).includes('The imam is only”—or, “The imam has only been appointed'));
 assert(get(700).includes('Our Lord, to You belongs praise'));assert(get(701).includes('Our Lord, and to You belongs praise'));
 assert(get(701).endsWith('all of you pray seated.”'));
 assert(!get(699).includes('fell'));assert(get(700).includes('fell from a horse'));
});

test('closing routes, reporting verbs and uncertainty stay complete without expanding source names',()=>{
 const a=input(),b=buildBookBatch(...a),get=n=>b.entries.find(e=>e.number===n);
 assert.equal(sourceSegments(get(706),'english').at(-1).kind,'transmission-note');
 for(const phrase of ['Hammad ibn Salamah','Ibn Tahman','Ayyub and Musa ibn ‘Uqbah','in an abridged form'])assert(get(706).english_blocks.at(-1).includes(phrase));
 assert(get(703).english_blocks[0].includes('‘Abdullah informed us'));assert(!get(703).english_blocks[0].includes('ibn al-Mubarak'));
 assert(get(710).arabic_blocks[0].includes('{ الحمد لله رب العالمين'));
 assert.deepEqual(sourceSegments(get(711),'english').map(s=>s.kind),['chain','report','transmission-note','report']);
 assert.equal(get(711).english_blocks[2],'He said: I think he said, “briefly.”');
 assert(get(714).english_blocks[0].includes('Abu Ishaq informed us'));assert(get(714).english_blocks[0].includes('delivering a sermon'));assert(get(714).english_blocks[0].includes('he was not a liar'));
 const c=input(),r=entry(c,714),s=r.segments[0];s.english=s.english.replace('Abu Ishaq informed us','Abu Ishaq');s.englishSha256=sha(s.english);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...c),/Reporting verb mismatch/);
});

test('new sessions cross the 698 boundary while independent browsing preserves the chosen session',()=>{
 const {source,ledger}=collectionFiles(),s=startSession(source.entries,698,10);
 assert.equal(s.numbers[0],698);assert(s.numbers.includes(699));assert(s.numbers.every(n=>typeof n==='number'));
 assert.deepEqual(visitSession(s,1),s);assert.deepEqual(visitSession(s,619),s);
 const refs=ledger.sourceReferences.entries;
 for(const n of [707,712]){const r=refs.find(e=>e.number===n);assert(r.translation.description.includes('not the Darussalam translation'));for(const note of r.contextNotes)for(const id of note.citations)assert(r.citations.some(c=>c.id===id));}
 assert.equal(refs.find(e=>e.number===716).localNotes.fragment,'hadith-716');
});
