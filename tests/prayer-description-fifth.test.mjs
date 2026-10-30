import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-fifth-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const get=(batch,n)=>batch.entries.find(e=>e.number===n).english_blocks.join(' ');

test('779–799 retain every raw Arabic span, complete chains and exact unrecorded scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:21},(_,i)=>779+i));assert.equal(a[1].entries.flatMap(e=>e.segments).length,50);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks.join(''),raw);assert.equal(r.segments.map(s=>s.arabic).join(''),raw);assert(!r.arabicCorrections);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(sourceSegments(e,'english')[0].kind,'chain');
  assert.equal((raw.match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));
 }
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('785 preserves the attested and reading, both repeated instructions and the narrator interruption',()=>{
 const a=input(),r=row(a,785),e=buildBookBatch(...a).entries.find(e=>e.number===785),t=e.english_blocks.join(' ');
 assert(e.arabic_blocks[0].includes('الثالثة والرابعة'));assert(t.includes('third and fourth'));assert(!r.arabicCorrections);
 assert.equal((t.match(/pray such-and-such a prayer at such-and-such a time/g)||[]).length,2);
 assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','report']);
 assert(r.contextNotes[0].text.includes('third or fourth'));assert(r.additionalCitations.some(c=>c.sourceId==='tawdih-prayer-description-785'));
 const b=input(),bad=row(b,785);bad.segments[2].arabic=bad.segments[2].arabic.replace('والرابعة','أو الرابعة');rehash(bad);assert.throws(()=>buildBookBatch(...b));
});

test('794 preserves two opening chains, three closing hearing links and both full closing routes',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===794),s=sourceSegments(e,'english');
 assert.deepEqual(s.map(s=>s.kind),['chain','chain','report','transmission-note']);
 for(const name of ['Khalid','Sa‘id','Muhammad ibn ‘Amr ibn Halhalah','Muhammad ibn ‘Amr ibn ‘Ata’'])assert(s[0].text.includes(name));
 for(const name of ['Yazid ibn Abi Habib','Yazid ibn Muhammad','Muhammad ibn ‘Amr ibn Halhalah','Muhammad ibn ‘Amr ibn ‘Ata’'])assert(s[1].text.includes(name));
 assert.equal((s[3].text.match(/heard/g)||[]).length,3);assert.equal((s[3].text.match(/Every vertebra/g)||[]).length,2);
 for(const name of ['Abu Salih','Ibn al-Mubarak','Yahya ibn Ayyub','Yazid ibn Abi Habib','Muhammad ibn ‘Amr'])assert(s[3].text.includes(name));
 assert(s[3].text.includes('related to me'));assert(s[3].text.includes('related to him'));assert(!s[3].text.includes('Every vertebra in its place'));
});

test('795 preserves the interleaved client variant before the companion identification',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===795),s=sourceSegments(e,'english');assert.equal(s[0].kind,'chain');
 let previous=-1;for(const term of ['‘Abd al-Rahman ibn Hurmuz','Banu ‘Abd al-Muttalib','on one occasion','Rabi‘ah ibn al-Harith','‘Abdullah ibn Buhaynah','Azd Shanu’ah','Banu ‘Abd Manaf']){const index=s[0].text.indexOf(term);assert(index>previous);previous=index;}
 assert(s[1].text.includes('before saying the closing greeting. Then he said the closing greeting.'));
});

test('798 retains its complete closing route and different informed-us/informed-me forms',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===798),s=sourceSegments(e,'english');
 assert(s[0].text.includes('‘Urwah ibn al-Zubayr informed us'));assert.equal((s[1].text.match(/I seek refuge in You/g)||[]).length,4);
 assert.equal(s[2].kind,'transmission-note');for(const phrase of ['from al-Zuhri','‘Urwah informed me','‘A’ishah','I heard the Messenger'])assert(s[2].text.includes(phrase));
 assert(row(a,798).contextNotes[0].text.includes('historical Arabic print'));assert(!e.english_blocks.join(' ').includes('Khalaf'));
});

test('small distinctions in number, agency, repetition and quote order remain',()=>{
 const b=buildBookBatch(...input()),t=n=>get(b,n);
 assert(t(779).includes('we do not gather'));assert(t(779).includes('pointed with his hand'));assert(t(781).includes('The women were told'));
 assert(t(782).includes('was commanded'));assert(t(782).includes('seven bones'));assert(t(783).includes('on seven,'));assert(!t(783).includes('bones'));
 assert.equal((t(780).match(/What you seek lies ahead of you/g)||[]).length,2);assert(t(780).includes('should return'));assert(t(780).includes('until I saw'));
 assert.equal((t(787).match(/He has forgotten/g)||[]).length,2);assert(t(789).includes('odd-numbered rak‘ah'));assert(!t(789).includes('Witr prayer'));
 assert(t(790).includes('I am leading you in prayer'));assert.equal((t(790).match(/Ayyub said/g)||[]).length,2);
 assert(t(791).includes('takbir aloud'));assert(!t(791).includes('doing'));
 assert(t(792).indexOf('has led us')<t(792).indexOf('has reminded me'));assert(!t(792).includes('Ibn Husayn'));
 assert(t(793).includes('from ‘Abdullah, who informed him'));assert(t(793).includes('He used to see'));assert(t(793).includes('I did so'));
 assert(t(799).includes('forgive me with forgiveness from You'));
});

test('784 closing comment and 797 inserted explanation retain their respective speech roles',()=>{
 const b=buildBookBatch(...input()),e=b.entries.find(e=>e.number===784);assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');assert(e.english_blocks.at(-1).includes('putting the Quran into practice'));
 const t=get(b,797);assert(t.includes('Greetings belong to Allah, and prayers and good things'));assert(t.indexOf('When you say this')<t.indexOf('I testify'));assert(t.includes('Allah is Peace'));
});

test('chapters 52–67 and three separate Arabic introductions do not leak into sessions or narration',()=>{
 const a=input(),b=buildBookBatch(...a);assert.equal(b.chapters.length,16);assert.equal(b.chapters.reduce((sum,c)=>sum+c.sourceContext.introduction.arabicParagraphs,0),3);
 for(const c of a[1].chapters)for(const id of c.contextIds){const raw=a[0].blocks.find(x=>x.htmlId===id).text;assert(!b.entries.some(e=>e.arabic_blocks.includes(raw)));}
 const {source}=collectionFiles(),session=startSession(source.entries,785,5);assert.equal(session.numbers[0],785);assert(!session.numbers.some(n=>String(n).startsWith('chapter-')));assert.deepEqual(visitSession(session,1),session);
});

test('all twenty-one English references are exact individually mapped inventory records',()=>{
 const a=input();for(const r of a[1].entries){const c=r.comparisons[1];assert.equal(c.reference,'1.12.'+(r.number-3));assert.equal(c.referenceEvidence.sourceRecordId,read('content/staging/bukhari-en-islamhouse/catalog.json').namespace+':'+c.reference);}
 const b=input(),r=row(b,794);r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...b));
});
