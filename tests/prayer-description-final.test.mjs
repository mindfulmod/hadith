import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-final-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const entry=(b,n)=>b.entries.find(e=>e.number===n),text=(b,n)=>entry(b,n).english_blocks.join(' ');

test('819–835 retain all Arabic spans, full honorifics and exact complete scripts',()=>{
 const a=input(),b=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(b.entries.filter(e=>!e.review.printedReport).map(e=>e.number),Array.from({length:17},(_,i)=>819+i));assert.equal(a[1].entries.filter(e=>!e.printedReport).flatMap(e=>e.segments).length,46);
 for(const r of a[1].entries.filter(e=>!e.printedReport)){const e=entry(b,r.number),raw=a[0].blocks.find(x=>x.htmlId===r.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks.join(''),raw);assert.equal(r.segments.map(s=>s.arabic).join(''),raw);assert(!r.arabicCorrections);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(sourceSegments(e,'english')[0].kind,'chain');
  assert.equal((raw.match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));
 }assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('821 retains the intermediate narrator description, final exchange and limited Quran excerpt',()=>{
 const b=buildBookBatch(...input()),s=sourceSegments(entry(b,821),'english');assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);
 assert(s[2].text.includes('very small in amount'));assert(s[4].text.includes('the eye of the Prophet'));assert(s[4].text.includes('‘Ubayd ibn ‘Umayr'));
 assert(s[4].text.endsWith('{I see in a dream that I am slaughtering you.}'));assert(!text(b,821).includes('Fajr'));assert(!text(b,821).includes('last hours'));
});

test('824 preserves its short first account and second full route',()=>{
 const b=buildBookBatch(...input()),s=sourceSegments(entry(b,824),'english');assert.deepEqual(s.map(s=>s.kind),['chain','report','chain','report','transmission-note']);
 assert(s[0].text.includes('Abu al-Yaman'));assert(s[0].text.includes('Shu‘ayb'));assert(s[2].text.includes('‘Ayyash'));assert(s[2].text.includes('‘Abd al-A‘la'));assert(s[2].text.includes('Ma‘mar'));
 assert(s[1].text.endsWith('delayed until late.'));assert(s[4].text.includes('people of Madinah'));
 assert(text(b,824).includes('is praying this prayer'));assert(text(b,826).includes('is waiting for it'));
});

test('827 corroboration and 829 chain switch are not dropped from complete narration',()=>{
 const b=buildBookBatch(...input()),s=sourceSegments(entry(b,827),'english');assert.equal(s[2].kind,'transmission-note');
 for(const name of ['Shu‘bah','al-A‘mash','Mujahid','Ibn ‘Umar'])assert(s[2].text.includes(name));
 const a=input(),r=row(a,829),t=sourceSegments(entry(b,829),'english');assert.deepEqual(t.map(s=>s.kind),['chain','chain','report']);
 assert(r.segments[0].arabic.includes('ح'));assert(t[0].text.includes('‘Abdullah ibn Maslamah'));assert(t[1].text.includes('‘Abdullah ibn Yusuf'));
 assert(t[0].text.includes('Malik'));assert(t[1].text.includes('Malik'));assert(!t[0].text.includes('Ha'));
});

test('source-specific age, attribution, OR and short wording resist comparison expansion',()=>{
 const b=buildBookBatch(...input());assert(text(b,819).includes('formed rows at it'));assert(text(b,819).endsWith('He said, “Ibn ‘Abbas.”'));
 assert(text(b,823).includes('nearly reached puberty'));assert(!text(b,823).includes('past puberty'));assert(text(b,823).includes('dismounted'));
 assert(text(b,825).includes('reminded them'));assert(!text(b,825).includes('necklace'));assert(!text(b,825).includes('kinship'));
 assert(text(b,830).includes('‘Abdullah ibn Abi Qatadah al-Ansari, from his father'));
 assert(text(b,831).includes('had introduced'));assert(!text(b,831).includes('mosque'));assert(text(b,832).includes('We think'));
 assert(text(b,834).includes('or they would not recognise'));assert(!text(b,834).includes('nor'));
 assert(!text(b,835).includes('at night'));assert(!text(b,835).includes('mosque'));assert(text(b,835).endsWith('he must not prevent her.'));
});

test('selected digital coverage and separately admitted printed occurrences remain distinct',()=>{
 const [inventory,review]=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer-description');
 for(const original of inventory.records)assert(source.entries.some(e=>e.id==='bukhari:'+original.number));
 assert.equal(inventory.records.length,137);assert(source.entries.some(e=>e.id==='bukhari:724b'));assert.equal(book.chapters.length,86);
 assert.equal(review.chapters.length,6);assert.equal(review.chapters.flatMap(c=>c.contextIds).length,0);
 const boundary=read('research/prayer-description-boundary-review.json');assert.equal(boundary.status,'two-print-tail-admitted-personal-prototype');assert.deepEqual(boundary.admittedOccurrences.map(x=>x.printedReference),['874','875']);
 assert.equal(boundary.unadmittedOccurrences.length,0);assert.equal(review.entries.filter(e=>e.printedReport).length,2);
 const session=startSession(source.entries,833,5);assert.deepEqual(session.numbers,[833,834,835,'835b','835c']);assert.deepEqual(visitSession(session,819),session);
});

test('each final English comparison binds its exact inventory record',()=>{
 const a=input();for(const r of a[1].entries.filter(e=>!e.printedReport)){const c=r.comparisons[1];assert.equal(c.reference,'1.12.'+(r.number-3));assert.equal(c.referenceEvidence.sourceRecordId,read('content/staging/bukhari-en-islamhouse/catalog.json').namespace+':'+c.reference);}
 const b=input(),r=row(b,835);r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...b));
});
