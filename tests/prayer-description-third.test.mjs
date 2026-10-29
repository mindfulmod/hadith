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
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-third-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const entry=(a,n)=>a[1].entries.find(e=>e.number===n);

test('739–758 preserve every selected character, complete chains and full unrecorded narration scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:20},(_,i)=>739+i));
 assert.equal(a[1].entries.flatMap(e=>e.segments).length,46);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks.join(''),r.segments.map(s=>s.arabic).join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  if(![739,741,746].includes(r.number))assert.equal(e.arabic_blocks[0],raw);
  assert.equal(sourceSegments(e,'english')[0].kind,'chain');
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
 }
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('three two-print corrections preserve exact originals and reject missing or stale evidence',()=>{
 const expected=[[739,'سعد بن جبير','سعيد بن جبير'],[741,'عل لزوم','على لزوم'],[746,'يحيى بن كثير','يحيى بن أبي كثير']];
 for(const [n,before,after] of expected){const a=input(),r=entry(a,n),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text,e=buildBookBatch(...a).entries.find(e=>e.number===n),c=r.arabicCorrections[0];
  assert.equal(e.arabic_blocks[0],raw.replace(before,after));assert.equal(r.originalArabicSha256,sha(raw));assert.equal(c.before,before);assert.equal(c.after,after);assert.equal(c.witnesses.length,2);
  for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].originalParagraphSha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='Missing translation']){const b=input(),row=entry(b,n);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...b));}
 }
});

test('a corrected report with an absent English comparison discloses both facts',()=>{
 const a=input(),r=entry(a,741),e=buildBookBatch(...a).entries.find(e=>e.number===741),c=r.comparisons[1];
 assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['1.12.741','1.12.742']);assert.equal(c.checkedReferenceEvidence.length,2);
 assert.match(e.english_status,/recorded Arabic correction/);assert.match(e.english_status,/second is absent/);assert(!e.english_status.includes('English comparison bodies'));
 assert(r.segments[0].english.startsWith('‘Ubaydullah said'));assert(!r.segments[0].english.includes('related to us'));
 // The same combination already exists at 663; the fix must not be batch-specific.
 const existing=collectionFiles().source.entries.find(e=>e.number===663);
 assert.match(existing.english_status,/recorded Arabic correction/);assert.match(existing.english_status,/second is absent/);
 for(const mutate of [r=>r.comparisons[1].checkedReferences[1]='1.12.743',r=>r.comparisons[1].checkedReferenceEvidence[0].recordSha256='0'.repeat(64),r=>r.comparisons[1].reference='1.12.741']){const b=input(),row=entry(b,741);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...b));}
});

test('combined Khan 755 has two separately matched reports without shifting later references',()=>{
 const a=input();buildBookBatch(...a);
 for(const [n,reference,part] of [[739,'1.12.740'],[740,'1.12.741'],[742,'1.12.742'],[754,'1.12.754'],[755,'1.12.755',1],[756,'1.12.755',2],[757,'1.12.756'],[758,'1.12.757']]){const c=entry(a,n).comparisons[1];assert.equal(c.reference,reference);assert.equal(c.part?.index,part);}
 const b=input(),r=entry(b,756);r.comparisons[1].part.index=1;rehash(r);assert.throws(()=>buildBookBatch(...b),/part|duplicate/i);
});

test('closing routes and interleaved narrator wording remain outside the attributed report',()=>{
 const batch=buildBookBatch(...input()),get=n=>batch.entries.find(e=>e.number===n);
 assert.equal(sourceSegments(get(739),'english').at(-1).kind,'transmission-note');
 assert.equal(sourceSegments(get(747),'english').at(-1).kind,'transmission-note');
 for(const phrase of ['Muhammad ibn ‘Amr','Abu Salamah','Nu‘aym al-Mujmir'])assert(get(749).english_blocks.at(-1).includes(phrase));
 assert.equal(get(755).english_blocks.at(-1),'Musa said: Aban related to us. Qatadah related to us. ‘Ikrimah related to us.');
 assert.equal(sourceSegments(get(755),'english').at(-1).kind,'transmission-note');
 const s=sourceSegments(get(756),'english');assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','report']);
 assert.equal(s[2].text,'‘Abdullah said: “And to You belongs praise.”');assert.equal((get(756).english_blocks.join(' ').match(/say the takbir/g)||[]).length,7);
 assert(!get(756).english_blocks.join(' ').includes('‘Abdullah ibn Salih'));
});

test('six Arabic introductions and the unnumbered chapter remain browsable but outside sessions',()=>{
 const a=input(),batch=buildBookBatch(...a);assert.equal(batch.chapters.length,16);
 const empty=batch.chapters.find(c=>c.id==='chapter-38');assert.deepEqual(empty.entryNumbers,[]);assert.equal(empty.sourceContext.introduction.arabicParagraphs,1);
 assert.equal(batch.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),6);
 for(const c of a[1].chapters)for(const id of c.contextIds){const raw=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(raw)));}
 const {source}=collectionFiles(),s=startSession(source.entries,738,10);assert(s.numbers.includes(739));assert.deepEqual(visitSession(s,1),s);
 assert(s.numbers.every(n=>source.entries.some(e=>e.number===n)));assert(!narrationPlan(source).entries.some(e=>e.number==='chapter-38'));
});

test('selected differences and literal reproach stay intact with separate explanatory citations',()=>{
 const a=input(),b=buildBookBatch(...a),get=n=>b.entries.find(e=>e.number===n).english_blocks.join(' ');
 assert(get(739).includes('this is what has come between you'));assert(!get(742).includes('Ha Mim'));
 assert(!get(743).includes('Sometimes'));assert(get(745).includes('Sometimes'));
 assert(get(744).includes('I said to Khabbab'));assert(get(744).includes('We said'));
 assert(get(753).includes('”—or he said, “'));assert(get(757).includes('between my thighs'));assert(get(758).includes('natural disposition'));
 for(const n of [754,755]){const r=entry(a,n);assert(r.contextNotes[0].citations.includes('commentary-reproach'));assert.equal(r.additionalCitations[0].sourceId,'fath-prayer-description-754');}
 assert(get(754).includes('May you have no mother'));assert(get(755).includes('May your mother be bereaved of you'));
});
