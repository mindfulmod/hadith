import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-sixth-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const get=(batch,n)=>batch.entries.find(e=>e.number===n).english_blocks.join(' ');

test('800–818 cover every source span with full chains, honorifics and unrecorded scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:19},(_,i)=>800+i));assert.equal(a[1].entries.flatMap(e=>e.segments).length,47);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  let expected=raw;for(const c of r.arabicCorrections||[])expected=expected.replace(c.before,c.after);
  assert.equal(e.arabic_blocks.join(''),expected);assert.equal(r.segments.map(s=>s.arabic).join(''),expected);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(sourceSegments(e,'english')[0].kind,'chain');
  assert.equal((raw.match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));
 }
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('806 and 810 corrections require both printed witnesses and preserve their raw inputs',()=>{
 const a=input(),b=buildBookBatch(...a);
 assert.deepEqual(a[1].entries.filter(r=>r.arabicCorrections).map(r=>r.number),[806,810]);
 for(const n of [806,810]){const r=row(a,n),c=r.arabicCorrections[0],raw=a[0].blocks.find(x=>x.htmlId===r.paragraphIds[0]).text;
  assert(raw.includes(c.before));assert(!raw.includes(c.after));assert.equal(c.witnesses.length,2);
  assert(b.entries.find(e=>e.number===n).arabic_blocks[0].includes(c.after));
  const bad=input(),br=row(bad,n);br.arabicCorrections[0].witnesses.pop();rehash(br);assert.throws(()=>buildBookBatch(...bad));
 }
 assert(get(b,806).includes('Sufyan related to us. He said: ‘Amr related to us. He said: Abu Ma‘bad informed me'));
 assert(get(b,810).includes('a believer in Me'));assert(get(b,810).includes('By the naw’ of such-and-such a star'));
});

test('807 retains conflicting counts and does not invent a named recipient for the return',()=>{
 const a=input(),b=buildBookBatch(...a),e=b.entries.find(e=>e.number===807),s=sourceSegments(e,'english');
 assert.equal(s[2].kind,'transmission-note');assert(s[2].text.includes('thirty-three times, praise thirty-three times and declare His greatness thirty-four times'));
 assert(s[2].text.includes('I went back to him'));assert(!s[2].text.includes('Prophet'));assert(!s[2].text.includes('each'));assert(!s[2].text.includes('eleven'));
 assert(row(a,807).contextNotes[0].text.includes('Sumayy and Abu Salih'));
 for(const phrase of ['Hajj','‘Umrah','jihad','charity'])assert(s[1].text.includes(phrase));
});

test('808 keeps both closing routes and the separate final lexical gloss',()=>{
 const b=buildBookBatch(...input()),e=b.entries.find(e=>e.number===808),s=sourceSegments(e,'english'),t=s.at(-1).text;
 assert.equal(s.at(-1).kind,'transmission-note');
 for(const term of ['Shu‘bah','‘Abd al-Malik','al-Hakam','al-Qasim ibn Mukhaymirah','Warrad'])assert(t.includes(term));
 assert.equal((t.match(/with this report/g)||[]).length,2);assert(t.endsWith('Al-Hasan said: Jadd means wealth.'));
});

test('812 keeps the written route and all six closing routes without collapsing Hind variants',()=>{
 const b=buildBookBatch(...input()),e=b.entries.find(e=>e.number===812),s=sourceSegments(e,'english');
 assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','chain','report','transmission-note']);
 assert(s[2].text.includes('We think'));assert(s[3].text.includes('Ibn Shihab wrote to him'));assert(s[3].text.includes('Ja‘far ibn Rabi‘ah informed me'));
 const t=s.at(-1).text;let previous=-1;for(const name of ['Ibn Wahb','‘Uthman ibn ‘Umar','Al-Zubaydi','Shu‘ayb','Ibn Abi ‘Atiq','Al-Layth']){const at=t.indexOf(name);assert(at>previous);previous=at;}
 assert.equal((t.match(/al-Firasiyyah/g)||[]).length,3);assert.equal((t.match(/al-Qurashiyyah/g)||[]).length,2);
 for(const term of ['Ma‘bad ibn al-Miqdad','Banu Zuhrah','Yahya ibn Sa‘id','a woman of Quraysh'])assert(t.includes(term));
});

test('817 and 818 remain adjacent distinct source spans with no lost compiler clause',()=>{
 const a=input(),b=buildBookBatch(...a),r817=row(a,817),r818=row(a,818);
 assert.deepEqual(r817.paragraphIds,['mwAYM@0-567']);assert.deepEqual(r818.paragraphIds,['mwAYM@567-742']);
 const t=get(b,817);assert(t.includes('garlic or onions'));assert(t.includes('or he said'));assert(t.includes('and stay in his house'));
 assert(t.includes('Al-Layth and Abu Safwan'));assert(t.includes('I do not know whether'));assert(t.endsWith('He confirms Yunus’s statement.'));assert(!t.includes('angels'));
 assert(get(b,818).includes('or must not pray with us'));assert(!get(b,818).includes('nor'));assert(!get(b,816).includes('Ahmad ibn Salih'));
 const bad=input(),r=row(bad,817);r.sourceLayout.paragraphs[0].origin.end=742;rehash(r);assert.throws(()=>buildBookBatch(...bad));
});

test('chapter context, uncertain wording and source-specific short names stay distinct',()=>{
 const a=input(),b=buildBookBatch(...a);assert.equal(b.chapters.length,11);assert.equal(b.chapters.reduce((sum,c)=>sum+c.sourceContext.introduction.arabicParagraphs,0),4);
 assert(get(b,800).includes('every servant in heaven or between heaven and earth'));assert(get(b,802).includes('I think'));
 assert(get(b,804).includes('He pointed out to him'));assert(!get(b,804).includes('on me'));
 assert(get(b,811).includes('‘Abdullah related to us; he heard Yazid'));assert(!get(b,811).includes('Isha'));
 assert(get(b,816).includes('our mosques'));assert(get(b,816).includes('I only think'));assert(get(b,816).includes('Makhlad ibn Yazid'));
 for(const c of a[1].chapters)for(const id of c.contextIds){const raw=a[0].blocks.find(x=>x.htmlId===id).text;assert(!b.entries.some(e=>e.arabic_blocks.includes(raw)));}
 const {source}=collectionFiles(),session=startSession(source.entries,812,5);assert.equal(session.numbers[0],812);assert.deepEqual(visitSession(session,800),session);
});

test('nineteen English comparisons bind the exact individually matched records',()=>{
 const a=input();for(const r of a[1].entries){const c=r.comparisons[1];assert.equal(c.reference,'1.12.'+(r.number-3));assert.equal(c.referenceEvidence.sourceRecordId,read('content/staging/bukhari-en-islamhouse/catalog.json').namespace+':'+c.reference);}
 const b=input(),r=row(b,812);r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...b));
});
