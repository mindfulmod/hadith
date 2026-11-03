import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const inv=read('content/staging/bukhari-eclipses-wikisource/catalog.json'),manifest=read('content/sources/wikisource-eclipses/manifest.json'),review=()=>read('content/review/eclipses-second-review.json'),config=BOOK_CONFIGS.eclipses;
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book==='Eclipses'&&e.number>=999&&e.number<=1004),get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');

test('six reports retain all exact Arabic spans, all English blocks and complete future narration',()=>{
 assert.deepEqual(entries.map(e=>e.number),[999,1000,1001,1002,1003,1004]);
 assert.equal(review().entries.reduce((n,r)=>n+r.segments.length,0),23);
 const plan=narrationPlan(source);
 for(const r of review().entries){
  const e=get(r.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text));
  assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.equal(plan.entries.find(p=>p.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');
 }
});

test('both routes and the full closing Kathir transmission are preserved in 999',()=>{
 assert.deepEqual(get(999).presentation.english.map(p=>p.kind),['chain','chain','report','report','transmission-note']);
 assert.match(text(999),/al-Layth related to me/);assert.match(text(999),/Ahmad ibn Salih related to me/);
 assert.match(text(999),/Kathir ibn ‘Abbas.*‘Abdullah ibn ‘Abbas/);assert.match(text(999),/Most High.*both/);
 assert.match(text(999),/praised Allah as He deserves/);assert.doesNotMatch(text(999),/praised Prophet|Ursa/);
 assert.match(text(999),/four bowings in four prostrations/);assert.match(text(999),/he said the like of that/);
 assert.match(text(999),/two rak‘ahs, like the dawn prayer/);
});

test('1001 keeps the full omission list and source-specific order of its two corroborating routes',()=>{
 assert.match(text(1001),/‘Abd al-Warith, Shu‘bah, Khalid ibn ‘Abdullah and Hammad ibn Salamah/);
 assert.match(text(1001),/Musa.*Mubarak.*al-Hasan.*Abu Bakrah informed me.*Ash‘ath.*al-Hasan/);
 assert.equal(get(1001).presentation.english.at(-1).kind,'transmission-note');
 assert.doesNotMatch(text(1001),/Abu Bakr\b|anyone’s death or life/);
 assert.equal(text(1001).split('Allah Most High').length-1,2);
});

test('combined 1002 retains all four bowings and both printed occurrences without an extra app number',()=>{
 assert.equal(text(1002).split('bowed for a long time').length-1,4);
 assert.equal(text(1002).split('but less than the first standing').length-1,3);
 assert.equal(text(1002).split('but less than the first bowing').length-1,3);
 assert.match(text(1002),/I seek refuge in Allah from that/);assert.doesNotMatch(text(1002),/affirmative|wives|journey/);
 assert(get(1002).review.notes.some(n=>n.includes('1049')&&n.includes('1050')));
 assert.equal(source.entries.some(e=>e.number==='1002b'),false);
 assert.equal(text(1002).split('may Allah bless him and grant him peace').length-1,5);
});

test('contextual prayer terminology is documented and the full concluding questions remain intact',()=>{
 assert.equal(text(1003).split('two bowings in one rak‘ah').length-1,2);
 assert.match(text(1003),/He said: ‘Aishah, may Allah Most High/);
 assert(get(1003).review.notes.some(n=>n.includes('Al-Nawawi')&&n.includes('sajdah')));
 assert(ledger.sourceReferences.entries.find(r=>r.number===1003).citations.some(c=>c.sourceId==='nawawi-eclipse-prayer-terms'));
 assert.equal(text(1004).split('bowed for a long time').length-1,4);
 assert.match(text(1004),/about as long as the recitation/);assert.match(text(1004),/I was shown the Fire/);
 assert.match(text(1004),/Do they disbelieve in Allah/);assert.match(text(1004),/I have never seen any good from you/);
 assert.doesNotMatch(text(1004),/grapes|birth|undesirable/);
});

test('both limited comparisons are disclosed; known web defects cannot be promoted to complete evidence',()=>{
 for(const n of [999,1001,1002]){
  assert.match(get(n).english_status,/Both English comparisons contain errors or omissions/);
  assert.doesNotMatch(get(n).english_status,/one complete English/);
  const original=review(),row=original.entries.find(r=>r.number===n),c=row.comparisons[0];
  assert.equal(validateDamagedBewleyComparison(c,row,config,original.sources),true);
  for(const mutate of [x=>{delete x.status;delete x.damageEvidence;},x=>x.reference='998',x=>x.damageEvidence.bodySha256='0'.repeat(64),x=>x.damageEvidence.occurrence=2,x=>x.damageEvidence.path='../private.json',x=>x.part={index:1,count:2},x=>x.note='']){
   const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,original.sources));
  }
  assert.throws(()=>validateDamagedBewleyComparison(c,{...row,arabicSha256:'0'.repeat(64)},config,original.sources));
  assert.throws(()=>validateDamagedBewleyComparison(c,row,config,original.sources,()=>({...read(c.damageEvidence.path),checkedAt:'changed'})),/Changed damaged-comparison audit/);
 }
});

test('damaged EPUB bodies and full selected chains are enforced independently of review checksums',()=>{
 for(const mutate of [r=>r.comparisons[1].checkedBody[1]+=' changed',r=>r.comparisons[1].damagedExcerpt='invented damage',r=>r.segments[0].english=r.segments[0].english.replace('al-Layth related to me','al-Layth related to us')]){
  const r=review(),row=r.entries[0];mutate(row);
  for(const s of row.segments)s.englishSha256=createHash('sha256').update(s.english).digest('hex');
  row.englishSha256=createHash('sha256').update(row.segments.map(s=>s.english).join('\n\n')).digest('hex');delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);
  assert.throws(()=>buildBookBatch(inv,r,manifest,config));
 }
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('all four chapter-context blocks stay separate from the numbered reports and narration',()=>{
 const book=ledger.books.find(b=>b.id==='eclipses'),chapters=book.chapters.slice(3,9);
 assert.deepEqual(chapters.map(c=>c.entryNumbers),[[999],[1000],[1001],[1002],[1003],[1004]]);
 assert.deepEqual(chapters.map(c=>c.sourceContext.introduction.arabicParagraphs),[1,1,1,0,0,1]);
 for(const c of chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs))assert.equal(c.sourceContext.introduction.englishStatus,'pending');
 for(const c of review().chapters)for(const id of c.contextIds){const text=inv.blocks.find(b=>b.htmlId===id).text;assert(entries.every(e=>!e.arabic_blocks.includes(text)));}
});
