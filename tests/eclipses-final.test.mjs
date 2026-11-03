import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=x=>sha(JSON.stringify(x));
const inv=read('content/staging/bukhari-eclipses-wikisource/catalog.json'),manifest=read('content/sources/wikisource-eclipses/manifest.json'),review=()=>read('content/review/eclipses-final-review.json'),config=BOOK_CONFIGS.eclipses;
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book==='Eclipses'&&e.number>=1011&&e.number<=1016),get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const original=r=>r.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);};

test('final six reports retain every derived Arabic span, working-English block and complete narration script',()=>{
 assert.deepEqual(entries.map(e=>e.number),[1011,1012,1013,1014,1015,1016]);
 assert.equal(review().entries.reduce((n,r)=>n+r.segments.length,0),19);
 const plan=narrationPlan(source);
 for(const r of review().entries){
  const e=get(r.number),expected=original(r).map(s=>r.number===1011?s.replace('زيادة بن علاقة','زياد بن علاقة'):s);
  assert.deepEqual(e.arabic_blocks,expected);assert.equal(r.segments.map(s=>s.arabic).join(''),expected.join(''));
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,text(r.number));
  assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('Ziyad correction retains original input, two inspected readings and its visible English-bound notice',()=>{
 const r=review(),row=r.entries[0],orig=original(row),c=row.arabicCorrections[0];
 assert(orig[0].includes('زيادة بن علاقة'));assert(get(1011).arabic_blocks[0].includes('زياد بن علاقة'));
 assert.equal(Array.from(orig[0]).length-Array.from(get(1011).arabic_blocks[0]).length,1);
 assert.equal(row.originalArabicSha256,sha(orig.join('\n\n')));assert.equal(c.before,'زيادة بن علاقة');assert.equal(c.after,'زياد بن علاقة');
 assert.match(text(1011),/Ziyad ibn ‘Ilaqah.*I heard al-Mughirah ibn Shu‘bah/);
 assert.match(text(1011),/two of Allah’s signs.*death or life.*supplicate to Allah and pray until it clears/);
 assert.doesNotMatch(text(1011),/Ziyadah|the son of the Prophet/);
 for(const mutate of [x=>x.arabicCorrections[0].start++,x=>x.arabicCorrections[0].witnesses.pop(),x=>x.arabicCorrections[0].witnesses[0].reading='زيادة بن علاقة',x=>x.contextNotes=[],x=>x.arabicCorrections[0].englishRendering='Ziyadah',x=>x.originalArabicSha256='0'.repeat(64)]){
  const bad=structuredClone(row);mutate(bad);assert.throws(()=>deriveArabicBlocks(bad,orig,r.sources));
 }
});

test('short Asma occurrence cannot claim a borrowed Khan body or lose its informed-me route',()=>{
 const r=review(),row=r.entries.find(e=>e.number===1012),c=row.comparisons[1];
 assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['2.18.168','2.18.169']);
 assert.match(text(1012),/And Abu Usamah said: Hisham related to us.*Fatimah bint al-Mundhir informed me/);
 assert.match(text(1012),/sun had cleared.*praised Allah as He deserves.*“To proceed.”/);
 assert.match(get(1012).english_status,/missing|absent|not present|not found|no matching|one English/i);
 for(const mutate of [c=>c.reference='2.18.168',c=>c.checkedReferences=['2.18.168','2.18.170'],c=>c.checkedReferenceEvidence[0].recordSha256='0'.repeat(64)]){
  const bad=review(),row=bad.entries.find(e=>e.number===1012);mutate(row.comparisons[1]);rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));
 }
});

test('solar report remains under its source lunar heading and distinct from the following account',()=>{
 const c=ledger.books.find(b=>b.id==='eclipses').chapters.find(c=>c.id==='chapter-17');
 assert.deepEqual(c.entryNumbers,[1013,1014]);assert.match(c.title,/lunar/);
 assert.match(text(1013),/Mahmud related to us.*Sa‘id ibn ‘Amir.*Shu‘bah.*Yunus.*al-Hasan.*Abu Bakrah/);
 assert.match(text(1013),/The sun was eclipsed.*Messenger of Allah.*two rak‘ahs/);
 assert.doesNotMatch(text(1013),/ibn Ghaylan|The moon/);assert.notEqual(get(1013).arabic_sha256,get(1014).arabic_sha256);
});

test('the omitted sun-clearing clause and trailing Ibrahim context remain in source order',()=>{
 assert.match(text(1014),/Then the sun cleared\.\n\nHe said:/);
 assert.match(text(1014),/until what has come upon you is removed/);
 assert.equal(get(1014).presentation.english.at(-1).kind,'transmission-note');
 assert.match(get(1014).english_blocks.at(-1),/a son of the Prophet.*had died, called Ibrahim.*people spoke about that/);
 assert.doesNotMatch(text(1014),/death or life|because of Ibrahim’s death/);
 const follow=read('research/eclipses-final-comparison-followup.json'),old=read(follow.sourceAudit.path),r=follow.records[0];
 assert.equal(follow.sourceAudit.sha256,hash(old));assert.equal(r.reference,1014);
 assert.equal(sha(r.checkedBewleyBody),r.englishComparisons.bewley.bodySha256);
 assert.equal(r.englishComparisons.bewley.bodySha256,old.records.find(v=>v.reference===1014).englishComparisons.bewley.bodySha256);
 for(const n of [1011,1014]){
  const reviewData=review(),row=reviewData.entries.find(e=>e.number===n),c=row.comparisons[0];
  for(const mutate of [x=>{delete x.status;delete x.damageEvidence;},x=>x.reference='994',x=>x.damageEvidence.bodySha256='0'.repeat(64)]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,reviewData.sources));}
 }
});

test('the short prayer-count report keeps its pronoun, repeated ending and separate lexical source',()=>{
 assert.match(text(1015),/from ‘Amrah, from ‘Aishah, may Allah Most High be pleased with her/);
 assert.match(text(1015),/led them.*four bowings in two rak‘ahs; the first, the first was longer/);
 assert.doesNotMatch(text(1015),/led us|four prostrations|from ‘Urwah/);
 const row=review().entries.find(e=>e.number===1015);assert.equal(row.additionalCitations[0].sourceId,'tawdih-eclipse-counts');
 assert(row.notes.some(n=>n.includes('sajdah')&&n.includes('Ibn al-Mulaqqin')));
});

test('combined final report retains both complete prayer counts, all routes and all closing notes',()=>{
 const e=get(1016);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','chain','report','transmission-note','transmission-note','transmission-note']);
 assert.equal(text(1016).split('four bowings in two rak‘ahs and four prostrations').length-1,2);
 assert.match(text(1016),/When he finished his recitation.*bowed/);assert.doesNotMatch(text(1016),/finished the eclipse prayer/);
 assert.match(e.english_blocks[2],/Al-Awza‘i and others said: I heard al-Zuhri, from ‘Urwah, from ‘Aishah/);
 assert.match(e.english_blocks[4],/‘Abd al-Rahman ibn Namir informed me that he heard the same from Ibn Shihab/);
 assert.match(e.english_blocks[5],/Your brother, ‘Abdullah ibn al-Zubayr, did not do that.*Madinah.*Yes, he was mistaken about the Sunnah/);
 assert.match(e.english_blocks.at(-1),/^Sufyan ibn Husayn and Sulayman ibn Kathir/);
 assert.equal(text(1016).split('may Allah bless him and grant him peace').length-1,2);assert.equal(text(1016).split('may Allah Most High be pleased with her').length-1,2);
 assert(e.review.notes.some(n=>n.includes('1065')&&n.includes('1066')));assert(e.review.notes.some(n=>n.includes('syntactic choice')&&n.includes('provisional')));
 assert.equal(source.entries.some(e=>e.number==='1016b'),false);
 const bad=review(),row=bad.entries.find(e=>e.number===1016);row.comparisons[1].checkedBody[1]=row.comparisons[1].checkedBody[1].replace('finished the eclipse prayer','finished his recitation');rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));
});

test('all 24 Eclipses source records and seven separate context blocks are accounted for',()=>{
 const book=ledger.books.find(b=>b.id==='eclipses');assert.deepEqual(book.entryNumbers,inv.records.map(r=>r.number));assert.equal(book.chapters.length,19);
 assert.deepEqual(book.chapters.slice(14).map(c=>c.entryNumbers),[[1011],[1012],[1013,1014],[1015],[1016]]);
 assert.equal(book.chapters.reduce((sum,c)=>sum+c.sourceContext.introduction.arabicParagraphs,0),7);
 const last=book.chapters.find(c=>c.id==='chapter-15');assert.equal(last.sourceContext.introduction.arabicParagraphs,1);assert.equal(last.sourceContext.introduction.englishStatus,'pending');
 const context=inv.blocks.find(b=>b.htmlId==='mwWA').text;assert(entries.every(e=>!e.arabic_blocks.includes(context)));
 assert.deepEqual(read('reader/books/catalog.json').books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957]);
});
