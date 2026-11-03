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
const inv=read('content/staging/bukhari-eclipses-wikisource/catalog.json'),manifest=read('content/sources/wikisource-eclipses/manifest.json'),review=()=>read('content/review/eclipses-third-review.json'),config=BOOK_CONFIGS.eclipses;
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book==='Eclipses'&&e.number>=1005&&e.number<=1010),get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');

test('six reports retain all exact Arabic spans, working-English blocks and complete narration scripts',()=>{
 assert.deepEqual(entries.map(e=>e.number),[1005,1006,1007,1008,1009,1010]);
 assert.equal(review().entries.reduce((n,r)=>n+r.segments.length,0),24);
 const plan=narrationPlan(source);
 for(const r of review().entries){
  const e=get(r.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text));
  assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.equal(plan.entries.find(p=>p.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});

test('Asma’s three exact-position uncertainty comments remain outside the quoted report presentation',()=>{
 const e=get(1005),kinds=e.presentation.english.map(p=>p.kind);
 assert.deepEqual(kinds,['chain','report','report','transmission-note','report','transmission-note','report','transmission-note','report']);
 assert.match(e.english_blocks[0],/his wife Fatimah bint al-Mundhir.*Asma’ bint Abi Bakr.*both/);
 assert.match(e.english_blocks[2],/like, or close to, the trial of the Dajjal/);
 assert.match(e.english_blocks[4],/believer, or the one who is certain/);
 assert.match(e.english_blocks[6],/hypocrite, or the one who doubts/);
 assert.deepEqual([3,5,7].map(i=>e.english_blocks[i]),['I do not know which of the two Asma’ said.','I do not know which of those Asma’ said.','I do not know which of the two Asma’ said.']);
 assert.match(text(1005),/were indeed certain/);assert(get(1005).review.notes.some(n=>n.includes('Brill reads believer')&&n.includes('modern print read certain')));
 assert.match(text(1005),/faintness overcame me/);assert.match(text(1005),/We responded, believed and followed/);
 assert.match(text(1005),/I heard people saying something, so I said it/);
 assert.doesNotMatch(text(1005),/angels|Masih|fainted|with her head|three times|Al Bakr/);
 assert.equal(text(1005).split('may Allah bless him and grant him peace').length-1,3);
});

test('the brief manumission report remains independent with its full own chain and emphasis',()=>{
 const e=get(1006);assert.equal(e.english_blocks.length,2);
 assert.match(e.english_blocks[0],/Rabi‘ ibn Yahya.*Za’idah.*Hisham.*Fatimah.*Asma’/);
 assert.match(e.english_blocks[1],/indeed commanded the freeing of slaves during a solar eclipse/);
 assert.doesNotMatch(text(1006),/bint al-Mundhir|‘Urwah/);
 const c=ledger.books.find(b=>b.id==='eclipses').chapters.find(c=>c.id==='chapter-11');assert.deepEqual(c.entryNumbers,[1006]);
});

test('the second combined occurrence retains all four bowings and its own prostration differences',()=>{
 assert.equal(text(1007).split('bowed for a long time').length-1,4);
 assert.match(text(1007),/prostrated for a long time/);assert.match(text(1007),/less than the first prostration/);
 assert.match(text(1007),/Malik related to me/);assert.equal(text(1007).split('may Allah bless him and grant him peace').length-1,5);
 assert(get(1007).review.notes.some(n=>n.includes('1055')&&n.includes('1056')));
 assert.equal(source.entries.some(e=>e.number==='1007b'),false);
 const earlier=source.entries.find(e=>e.number===1002);assert.notEqual(earlier.arabic_sha256,get(1007).arabic_sha256);
 assert.doesNotMatch(earlier.english_blocks.join('\n'),/less than the first prostration/);
 assert.doesNotMatch(text(1007),/affirmative|wives|journey|sermon/);
});

test('identical comparison bodies do not merge different selected reports or import their clauses',()=>{
 const audit=read('research/eclipses-source-audit.json'),a=n=>audit.records.find(r=>r.reference===n);
 assert.equal(a(994).englishComparisons.bewley.bodySha256,a(1008).englishComparisons.bewley.bodySha256);
 const earlier=source.entries.find(e=>e.number===994);assert.notEqual(earlier.arabic_sha256,get(1008).arabic_sha256);
 assert.match(text(1008),/Qays related to me/);assert.match(text(1008),/death or life/);assert.doesNotMatch(text(1008),/stand up|I heard/);
 assert.match(earlier.english_blocks.join('\n'),/stand up and pray/);
 for(const n of [1007,1008]){
  const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];
  assert.match(get(n).english_status,/One English comparison contains documented errors or omissions/);
  for(const mutate of [x=>{delete x.status;delete x.damageEvidence;},x=>x.reference='994',x=>x.damageEvidence.bodySha256='0'.repeat(64),x=>x.damageEvidence.occurrence=2]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,r.sources));}
 }
});

test('parallel transmitters, two prostrations and all three closing actions are retained',()=>{
 assert.match(text(1009),/al-Zuhri and Hisham ibn ‘Urwah, from ‘Urwah/);
 assert.match(text(1009),/prostrated twice/);assert.match(text(1009),/which He shows His servants/);
 assert.match(text(1010),/Burayd ibn ‘Abdullah, from Abu Burdah, from Abu Musa/);
 assert.match(text(1010),/in alarm, fearing that it might be the Hour/);
 assert.match(text(1010),/\{Allah makes His servants fear through them\}/);
 assert.match(text(1010),/remember Him, supplicate to Him and seek His forgiveness/);
 assert.doesNotMatch(text(1010),/mighty and majestic|Most High|Day of Judgment/);
});

test('damaged name evidence and exact transmission verbs cannot be silently standardized',()=>{
 for(const mutate of [r=>r.comparisons[1].checkedBody[1]=r.comparisons[1].checkedBody[1].replace('Al Bakr','Abi Bakr'),r=>r.comparisons[1].damagedExcerpt='invented damage']){
  const r=review(),row=r.entries[0];mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config));
 }
 const r=review(),row=r.entries.find(e=>e.number===1007);row.segments[0].english=row.segments[0].english.replace('Malik related to me','Malik related to us');row.segments[0].englishSha256=createHash('sha256').update(row.segments[0].english).digest('hex');row.englishSha256=createHash('sha256').update(row.segments.map(s=>s.english).join('\n\n')).digest('hex');delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/Reporting verb mismatch/);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('two further chapter-context blocks remain outside numbered reading and narration',()=>{
 const book=ledger.books.find(b=>b.id==='eclipses'),chapters=book.chapters.slice(9,14);
 assert.deepEqual(chapters.map(c=>c.entryNumbers),[[1005],[1006],[1007],[1008,1009],[1010]]);
 assert.deepEqual(chapters.map(c=>c.sourceContext.introduction.arabicParagraphs),[0,0,0,1,1]);
 for(const c of chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs))assert.equal(c.sourceContext.introduction.englishStatus,'pending');
 for(const c of review().chapters)for(const id of c.contextIds){const text=inv.blocks.find(b=>b.htmlId===id).text;assert(entries.every(e=>!e.arabic_blocks.includes(text)));}
 assert.equal(review().entries.some(e=>e.number===1011),false);
});
