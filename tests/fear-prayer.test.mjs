import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBookBatch,BOOK_CONFIGS,collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inputs=()=>[read('content/staging/bukhari-fear-prayer-wikisource/catalog.json'),read('content/review/fear-prayer-complete-review.json'),read('content/sources/wikisource-fear-prayer/manifest.json'),BOOK_CONFIGS['fear-prayer']];

test('Fear Prayer keeps every selected character and complete English span in reading and scripts',()=>{
 const [inv,review]=inputs(),source=collectionFiles().source,plan=narrationPlan(source);
 assert.deepEqual(review.entries.map(e=>e.number),[900,901,902,903,904,905]);
 assert.equal(review.entries.flatMap(e=>e.segments).length,14);
 for(const row of review.entries){
  const e=source.entries.find(e=>e.number===row.number),ar=inv.blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks.join(''),ar);assert.equal(row.segments.map(s=>s.arabic).join(''),ar);
  assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===row.number).script,e.english_blocks.join('\n\n'));
  assert.equal((ar.match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(row.arabicCorrections,undefined);assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});

test('abbreviated Mujahid attribution retains its actual chain and no invented back-link',()=>{
 const row=inputs()[1].entries.find(e=>e.number===901),text=row.segments.map(s=>s.english).join(' ');
 assert(text.includes('My father related to me'));assert(text.includes('Something similar to Mujahid’s statement'));
 assert(text.includes('Ibn ‘Umar added, from the Prophet'));assert(text.includes('more numerous than that'));
 assert.deepEqual(row.contextNotes[0].related,[]);assert(row.additionalCitations.some(c=>c.id==='mujahid-ellipsis'));
 assert(!/head gesture|individually|another report/i.test(text));
});

test('almost sunset in Umar’s speech stays distinct from the later actual sunset',()=>{
 const row=inputs()[1].entries.find(e=>e.number===903),text=row.segments[1].english;
 assert(text.includes('almost setting'));assert(text.includes('after the sun had set'));
 assert(text.indexOf('prayed ‘Asr after')<text.indexOf('prayed Maghrib after'));
 assert.equal(row.segments[0].english.startsWith('Yahya related to us.'),true);
 assert(!row.segments[0].english.includes('Ja‘far'));
});

test('absent EPUB occurrence cannot impersonate the website’s colliding legacy reference',()=>{
 const a=inputs(),row=a[1].entries.find(e=>e.number===904),k=row.comparisons[1];
 assert.equal(k.reference,null);assert.equal(k.status,'not-present-in-checked-sequence');
 assert.deepEqual(k.checkedReferences,['2.14.67','2.14.68']);assert.equal(k.checkedReferenceEvidence.length,2);
 assert(row.additionalCitations.some(c=>c.id==='modern-946'&&c.sourceId==='sunnah-fear-946'));
 for(const change of [r=>r.comparisons[1].reference='2.14.67',r=>r.comparisons[1].checkedReferenceEvidence[0].recordSha256='0'.repeat(64),r=>r.comparisons[1].checkedReferences.reverse()]){
  const b=inputs(),r=b[1].entries.find(e=>e.number===904);change(r);delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);assert.throws(()=>buildBookBatch(...b));
 }
});

test('Khaybar retains both transmitters, the army gloss and the complete final exchange',()=>{
 const row=inputs()[1].entries.find(e=>e.number===905),text=row.segments.map(s=>s.english).join(' ');
 assert(text.includes('‘Abd al-‘Aziz ibn Suhayb and Thabit al-Bunani'));
 assert(text.includes('Al-khamis means the army'));assert(text.includes('killed the fighting men and took the children captive'));
 assert(text.includes('Dihyah al-Kalbi'));assert(text.includes('made her freedom her bridal gift'));
 assert.equal(row.segments.at(-1).kind,'transmission-note');assert(row.segments.at(-1).english.endsWith('Then he smiled.'));
 assert(row.notes.some(s=>s.includes('absent from pinned EPUB 2.14.68')));
});

test('three chapter paragraphs stay separate and the discrepant heading is visibly withheld',()=>{
 const a=inputs(),batch=buildBookBatch(...a),review=a[1];
 assert.equal(review.chapters.length,6);assert.equal(review.chapters.flatMap(c=>c.contextIds).length,3);
 const c=review.chapters.at(-1);assert.equal(c.title,'Chapter heading under review');assert.equal(c.status,'heading-discrepancy-pending');
 assert.equal(c.headingDiscrepancy.digitalPhrase,'التبكير');assert.equal(c.headingDiscrepancy.printedPhrase,'التكبير');
 assert.deepEqual(c.headingDiscrepancy.printedWitnesses.map(w=>w.pdfPages),[[241],[230]]);
 assert.equal(batch.entries.length,6);
 a[1].chapters.at(-1).title='A silently translated heading';assert.throws(()=>buildBookBatch(...a));
 const scripts=narrationPlan(collectionFiles().source).entries.filter(e=>e.number>=900);
 assert(scripts.every(e=>!e.script.includes('al-Awza‘i')&&!e.script.includes('Makhul')));
});
