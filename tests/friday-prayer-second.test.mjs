import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT,RECORDED_NUMBERS} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=t=>createHash('sha256').update(t).digest('hex');
const input=()=>[read('content/staging/bukhari-friday-prayer-wikisource/catalog.json'),read('content/review/friday-prayer-second-review.json'),read('content/sources/wikisource-friday-prayer/manifest.json'),BOOK_CONFIGS['friday-prayer']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=objectHash(e);};

test('Friday second batch preserves every selected Arabic span, honorific and complete script',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:13},(_,i)=>846+i));
 assert.equal(a[1].entries.flatMap(e=>e.segments).length,34);
 for(const r of a[1].entries){
  const e=batch.entries.find(e=>e.number===r.number),original=r.paragraphIds.map(p=>a[0].blocks.find(b=>b.htmlId===p).text);
  assert.deepEqual(e.arabic_blocks,original);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.deepEqual(r.paragraphIds.map(p=>r.segments.filter(s=>s.paragraphId===p).map(s=>s.arabic).join('')),original);
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal(r.comparisons[1].reference,'2.13.'+(r.number-835));
  assert.equal(r.comparisons[1].referenceEvidence.sourceRecordId,'islamhouse-bukhari-epub-2010:2.13.'+(r.number-835));
 }
 assert.equal(source.entries.length,ENTRY_COUNT);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
 assert.deepEqual(RECORDED_NUMBERS,[1,2,3,4,5,6]);
});

test('853 keeps the letter, both reports, both Ruzayq roles and narrator uncertainty',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===853),parts=sourceSegments(e,'english');
 assert.deepEqual(parts.map(p=>p.kind),['chain','report','transmission-note','report','transmission-note','report']);
 for(const phrase of ['Al-Layth added','Yunus said','Ruzayq ibn Hukaym','while I was with him','Do you think I should hold','land which he cultivated','Black people and others','in charge of Aylah','while I was listening','Salim had related to him','I heard the Messenger'])assert(parts[2].text.includes(phrase),phrase);
 for(const phrase of ['The imam','A man','A woman','A servant'])assert(parts[3].text.includes(phrase));
 assert.equal(parts[4].text,'He said: I think he also said:');
 assert(parts[5].text.includes('his father’s property'));assert(parts[5].text.includes('Each of you'));
 assert(!parts[0].text.includes('ibn al-Mubarak'));assert(!e.english_blocks.join(' ').includes('Sudanese'));
 const b=input(),r=row(b,853);r.segments.splice(4,1);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b));
});

test('856 remains one complete entry with three printed portions and its full second route',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===856),parts=sourceSegments(e,'english');
 assert.deepEqual(parts.map(p=>p.kind),['chain','report','transmission-note','report','chain','report']);
 assert(parts[1].text.includes('we were given it after them'));
 assert.equal(parts[2].text,'He fell silent, then said:');assert(parts[3].text.includes('washing his head and his body'));
 for(const name of ['Aban ibn Salih','Mujahid','Tawus','Abu Hurayrah'])assert(parts[4].text.includes(name));
 assert(parts[5].text.includes('Allah Most High has a right'));
 assert.equal(row(a,856).comparisons[0].status,'abbreviated-report');
 assert(row(a,856).notes[0].includes('896, 897 and 898'));
 const {source}=collectionFiles(),plan=narrationPlan(source);assert.equal(plan.entries.filter(e=>e.number===856).length,1);
 const b=input(),r=row(b,856);r.segments.splice(4,2);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b));
});

test('the printed chapter before 857 is separate, witnessed and excluded from narration',()=>{
 const a=input(),batch=buildBookBatch(...a),original=a[0].chapters.find(c=>c.id==='chapter-12');
 assert.deepEqual(original.entryNumbers,[854,855,856,857,858]);
 assert.equal(batch.chapters.length,7);
 const c=batch.chapters.find(c=>c.id==='chapter-12'),p=batch.chapters.find(c=>c.id==='chapter-12-print-13');
 assert(c.title.includes('do not attend'));assert.deepEqual(c.entryNumbers,[854,855,856]);
 assert.equal(p.title,'Untitled chapter');assert.deepEqual(p.entryNumbers,[857,858]);
 assert.equal(row(a,857).printedHeading.arabic,'باب');
 assert.deepEqual(row(a,857).printedHeading.witnesses.map(w=>w.pdfPage),[228,217]);
 assert.equal(batch.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),2);
 const {source}=collectionFiles(),script=narrationPlan(source).entries.find(e=>e.number===857).script;assert(!script.includes('Untitled'));
 for(const mutate of [h=>h.witnesses.pop(),h=>h.beforeEntry=856,h=>h.arabic='باب الجمعة',h=>h.witnesses[0].sourceSha256='0'.repeat(64)]){
  const b=input(),r=row(b,857);mutate(r.printedHeading);rehash(r);assert.throws(()=>buildBookBatch(...b));
 }
});

test('short reports retain alternatives, limited quotations and unnamed participants',()=>{
 const a=input(),batch=buildBookBatch(...a),body=n=>batch.entries.find(e=>e.number===n).english_blocks.slice(1).join(' ');
 assert(body(847).includes('my community—or to the people'));
 assert(!body(849).includes('prayer'));assert(!body(849).includes('toothstick'));assert(body(849).includes('clean his mouth'));
 assert(body(850).includes('I broke it, then chewed it'));assert(!body(850).includes('half'));
 assert(body(851).includes('{Alif. Lam. Mim. The revelation}'));assert(!body(851).includes('Sajdah'));
 assert(body(858).includes('A wife of ‘Umar'));assert(!body(858).includes('‘Atikah'));assert(!body(858).includes('Ibn ‘Umar said'));
 const text=batch.entries.find(e=>e.number===855).english_blocks[0];assert(text.includes('from Malik'));assert(!text.includes('informed us'));
});

test('source notes cite real evidence and Volume 2 comparison identities remain strict',()=>{
 const a=input(),{source,ledger}=collectionFiles();buildBooks(source,ledger);
 for(const n of [846,849,853,857]){const r=ledger.sourceReferences.entries.find(e=>e.number===n),ids=new Set(r.citations.map(c=>c.id));assert(r.contextNotes.length);for(const note of r.contextNotes)for(const id of note.citations)assert(ids.has(id));}
 for(const mutate of [c=>c.reference='1.13.18',c=>c.referenceEvidence.recordSha256='0'.repeat(64),c=>delete c.referenceEvidence]){
  const b=input(),r=row(b,853);mutate(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...b));
 }
 const b=input(),r=row(b,849),s=r.segments[0];s.english=s.english.replace('Sufyan informed us','Sufyan related to us');s.englishSha256=sha(s.english);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b),/Reporting verb mismatch/);
});

test('sessions cross 845 to 846 and preserve the compound 856 as one complete entry',()=>{
 const {source}=collectionFiles(),session=startSession(source.entries,845,10);
 assert.deepEqual(session.numbers.slice(0,2),[845,846]);assert.deepEqual(visitSession(session,1),session);
 const compound=startSession(source.entries,856,5);assert.equal(compound.numbers[0],856);assert.equal(compound.numbers.filter(n=>n===856).length,1);
});
