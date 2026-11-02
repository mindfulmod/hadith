import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT,RECORDED_NUMBERS} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=t=>createHash('sha256').update(t).digest('hex');
const input=()=>[read('content/staging/bukhari-friday-prayer-wikisource/catalog.json'),read('content/review/friday-prayer-third-review.json'),read('content/sources/wikisource-friday-prayer/manifest.json'),BOOK_CONFIGS['friday-prayer']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=objectHash(e);};

test('Friday third batch preserves every source span, honorific and complete narration script',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:21},(_,i)=>859+i));assert.equal(a[1].entries.flatMap(e=>e.segments).length,51);
 for(const r of a[1].entries){
  const e=batch.entries.find(e=>e.number===r.number),original=r.paragraphIds.map(p=>a[0].blocks.find(b=>b.htmlId===p).text),derived=deriveArabicBlocks(r,original,a[1].sources);
  assert.deepEqual(e.arabic_blocks,derived);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.deepEqual(r.paragraphIds.map(p=>r.segments.filter(s=>s.paragraphId===p).map(s=>s.arabic).join('')),derived);
  if(r.number!==861)assert.deepEqual(derived,original);
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
 }
 assert.equal(source.entries.length,ENTRY_COUNT);assert.deepEqual(RECORDED_NUMBERS,[1,2,3,4,5,6]);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('861 corrects only the feminine reply with both witnesses and the original retained',()=>{
 const a=input(),r=row(a,861),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text,e=buildBookBatch(...a).entries.find(e=>e.number===861);
 assert.equal(r.arabicCorrections.length,1);assert.equal(r.originalArabicSha256,sha(raw));
 const c=r.arabicCorrections[0];assert.equal(c.before,'فقال');assert.equal(c.after,'فقالت');
 assert.equal(e.arabic_blocks[0],raw.replace('فقال: قالت عائشة','فقالت: قالت عائشة'));
 assert.deepEqual(c.witnesses.map(w=>w.pdfPage),[229,219]);assert(r.segments[1].english.startsWith('She said: ‘A’ishah'));
 assert.equal(e.review.originalArabicSha256,sha(raw));assert(r.contextNotes[0].citations.includes('brill-1862'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].witnesses[0].sourceSha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='He said']){
  const b=input(),r=row(b,861);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...b));
 }
});

test('864 keeps the Friday qualification, omission variant, two routes and unanswered final question',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===864),p=sourceSegments(e,'english');
 assert.deepEqual(p.map(s=>s.kind),['chain','report','transmission-note','transmission-note','chain','report']);
 assert.equal(p[2].text,'Meaning the Friday prayer.');assert(p[3].text.includes('Yunus ibn Bukayr'));assert(p[3].text.includes('without mentioning the Friday prayer'));
 assert(p[4].text.includes('Bishr ibn Thabit'));assert(p[4].text.includes('Abu Khaldah related to us'));
 assert(p[5].text.endsWith('pray the noon prayer?”'));assert(!p[5].text.includes('al-Hakam'));
 const b=input(),r=row(b,864);r.segments.splice(2,1);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b));
});

test('866 retains both opening chains and 867 does not lose its qualified father link',()=>{
 const a=input(),batch=buildBookBatch(...a),entry=n=>batch.entries.find(e=>e.number===n),p=sourceSegments(entry(866),'english');
 assert.deepEqual(p.map(s=>s.kind),['chain','chain','report']);
 for(const name of ['Adam','Ibn Abi Dhi’b','al-Zuhri','Sa‘id and Abu Salamah','Abu Hurayrah'])assert(p[0].text.toLowerCase().includes(name.toLowerCase()));
 for(const name of ['Abu al-Yaman','Shu‘ayb','Abu Salamah ibn ‘Abd al-Rahman','informed me'])assert(p[1].text.includes(name));
 const q=sourceSegments(entry(867),'english');assert.equal(q[1].kind,'transmission-note');assert.equal(q[1].text,'I know it only as being from his father.');assert(!q[1].text.includes('Abu ‘Abdullah'));
 const b=input(),r=row(b,866),s=r.segments[0];s.english=s.english.replace('Al-Zuhri said','Al-Zuhri related to us');s.englishSha256=sha(s.english);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b),/Reporting verb mismatch/);
});

test('the separate call counts and all repeated responses remain unchanged',()=>{
 const batch=buildBookBatch(...input()),text=n=>batch.entries.find(e=>e.number===n).english_blocks.slice(1).join(' ');
 for(const n of [870,871,874])assert(text(n).includes('third call'));
 assert(text(873).includes('second call'));assert(!text(873).includes('pulpit'));
 assert.equal((text(872).match(/Allah is greater/g)||[]).length,4);assert.equal((text(872).match(/“And I.”/g)||[]).length,2);
 assert(!text(870).includes('market'));assert(text(874).includes('the practice remained that way'));
});

test('875 preserves both first days and the full prayer sequence; 876 retains the precise closing route',()=>{
 const batch=buildBookBatch(...input()),entry=n=>batch.entries.find(e=>e.number===n),e=entry(875),t=e.english_blocks[1];
 for(const phrase of ['ibn Muhammad ibn ‘Abdullah ibn ‘Abd, al-Qari','al-Qurashi al-Iskandarani'])assert(e.english_blocks[0].includes(phrase));
 for(const phrase of ['first day it was put in place','first day the Messenger','whom Sahl named','tamarisk from al-Ghabah','say the takbir','then bow','descended backwards','foot of the pulpit','so that you would follow me and learn my prayer'])assert(t.includes(phrase),phrase);
 assert(!t.includes('from the Ansar'));
 const p=sourceSegments(entry(876),'english');assert(p[0].text.includes('Ibn Anas informed me'));assert(p[1].text.includes('she-camels in late pregnancy'));
 assert.equal(p[2].text,'Sulayman said, from Yahya: Hafs ibn ‘Ubaydullah ibn Anas informed me that he heard Jabir.');
 assert(!p[0].text.includes('Yahya ibn Muhammad'));
});

test('six complete chapter contexts remain separate from the fifteen numbered chapter groups',()=>{
 const a=input(),batch=buildBookBatch(...a),{source}=collectionFiles(),plan=narrationPlan(source);
 assert.equal(batch.chapters.length,15);assert.equal(a[1].chapters.flatMap(c=>c.contextIds).length,6);
 assert.equal(batch.chapters.reduce((sum,c)=>sum+c.sourceContext.introduction.arabicParagraphs,0),6);
 for(const c of a[1].chapters)for(const id of c.contextIds){const original=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(original)));}
 assert(!plan.entries.find(e=>e.number===865).script.includes('Hasten to the remembrance'));
 const session=startSession(source.entries,858,10);assert.deepEqual(session.numbers.slice(0,2),[858,859]);assert.deepEqual(visitSession(session,1),session);
});

test('879 binds legacy 2.13.44 to the short Abu Said body and comparisons reject mismatched identities',()=>{
 const a=input(),r=row(a,879),{source,ledger}=collectionFiles();buildBooks(source,ledger);
 const c=r.comparisons[1];assert.equal(c.reference,'2.13.44');assert.equal(c.referenceEvidence.sourceRecordId,'islamhouse-bukhari-epub-2010:2.13.44');
 assert(r.notes[0].includes('following long Asma’ report'));assert(r.segments[1].english.includes('we sat around him'));
 for(const n of Array.from({length:21},(_,i)=>859+i)){const ref=ledger.sourceReferences.entries.find(e=>e.number===n);assert(ref.citations.find(c=>c.id==='khan').locator.includes('Volume 2, Book 13, Number '+(n-835)));}
 for(const mutate of [c=>c.reference='2.13.43',c=>c.referenceEvidence.sourceRecordId='islamhouse-bukhari-epub-2010:2.13.45',c=>delete c.referenceEvidence]){const b=input(),r=row(b,879);mutate(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...b));}
});
