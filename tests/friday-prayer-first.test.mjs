import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT,BOOK_COUNT,RECORDED_NUMBERS} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=t=>createHash('sha256').update(t).digest('hex');
const input=()=>[read('content/staging/bukhari-friday-prayer-wikisource/catalog.json'),read('content/review/friday-prayer-first-review.json'),read('content/sources/wikisource-friday-prayer/manifest.json'),BOOK_CONFIGS['friday-prayer']];
const row=(a,n)=>a[1].entries.find(e=>e.number===n);
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=objectHash(e);};

test('Friday Prayer admits ten complete unchanged Arabic records and all translated spans',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:10},(_,i)=>836+i));
 assert.equal(a[1].entries.flatMap(e=>e.segments).length,22);
 for(const r of a[1].entries){
  const e=batch.entries.find(e=>e.number===r.number),original=r.paragraphIds.map(p=>a[0].blocks.find(b=>b.htmlId===p).text);
  assert.deepEqual(e.arabic_blocks,original);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.deepEqual(r.paragraphIds.map(p=>r.segments.filter(s=>s.paragraphId===p).map(s=>s.arabic).join('')),original);
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal(r.sourceLayout.sourceRecordId,r.sourceRecordId);
  assert(r.notes.some(note=>note.includes('Modern print reference: '+(r.number+40))));
 }
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
 assert.deepEqual(RECORDED_NUMBERS,[1,2,3,4,5,6]);
});

test('chapter quotations and the untitled chapter are kept distinct from numbered reports',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='friday-prayer');
 assert.equal(batch.chapters.length,6);
 assert.equal(batch.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),2);
 assert.equal(book.chapters[4].title,'Untitled chapter');assert.deepEqual(book.chapters[4].entryNumbers,[842]);
 const r=row(a,836);assert.deepEqual(r.paragraphIds,['mwBg@110-452']);assert.equal(r.sourceLayout.paragraphs[0].origin.start,110);
 for(const c of a[1].chapters)for(const id of c.contextIds){const text=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(text)));}
 assert(!narrationPlan(source).entries.find(e=>e.number===836).script.includes('When the call'));
 const b=input(),changed=row(b,836);changed.sourceLayout.paragraphs[0].origin.start=0;rehash(changed);assert.throws(()=>buildBookBatch(...b),/source origins/);
});

test('Volume 2 comparisons require the exact body identity and reject other volumes or books',()=>{
 const a=input();assert.deepEqual(a[3].khanVolumes,[2]);assert.deepEqual(a[3].khanBooks,[13]);
 for(const r of a[1].entries){assert.equal(r.comparisons[1].reference,'2.13.'+(r.number-835));assert.equal(r.comparisons[1].referenceEvidence.sourceRecordId,'islamhouse-bukhari-epub-2010:2.13.'+(r.number-835));}
 for(const mutate of [c=>c.reference='1.13.1',c=>c.reference='2.12.1',c=>delete c.referenceEvidence,c=>c.referenceEvidence.recordSha256='0'.repeat(64),c=>c.referenceEvidence.sourceRecordId='islamhouse-bukhari-epub-2010:2.13.2',c=>c.reference='2.13.2']){
  const b=input(),r=row(b,836);mutate(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...b));
 }
 // Earlier books keep their Volume 1 constraint.
 const old=[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-first-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
 old[1].entries[0].comparisons[1].reference='2.12.699';rehash(old[1].entries[0]);assert.throws(()=>buildBookBatch(...old));
});

test('840 retains both testimonies, explicit uncertainty and the full compiler comment',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===840),parts=sourceSegments(e,'english');
 assert.deepEqual(parts.map(p=>p.kind),['chain','report','transmission-note','transmission-note']);
 assert.equal((parts[1].text.match(/I testify/g)||[]).length,2);
 assert(parts[2].text.includes('Allah knows best whether it is obligatory or not'));
 for(const phrase of ['Abu ‘Abdullah said','brother of Muhammad','personal name was not given','Bukayr ibn al-Ashajj','Sa‘id ibn Abi Hilal','several others','kunyahs Abu Bakr and Abu ‘Abdullah'])assert(parts[3].text.includes(phrase));
 assert.equal(row(a,840).comparisons[0].status,'abbreviated-report');
 assert(row(a,840).notes[0].includes('Khan-family comparison omits it'));
 const b=input(),r=row(b,840);r.segments.pop();r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b));
});

test('the five offerings and separate perfume replies do not acquire comparison expansions',()=>{
 const a=input(),b=buildBookBatch(...a),text=n=>b.entries.find(e=>e.number===n).english_blocks.slice(1).join(' ');
 for(const phrase of ['a camel','a cow','a horned ram','a hen','an egg'])assert(text(841).includes(phrase));
 assert(!text(841).includes('first hour'));assert(text(841).includes('listen to the remembrance'));
 assert(text(843).includes('the other Friday'));assert(!text(843).includes('previous'));assert(!text(843).includes('hair oil'));
 assert(text(844).includes('as for perfume, I do not know'));assert(text(845).includes('I do not know of it'));
 assert(text(845).includes('perfume or oil'));assert(!text(845).includes('ordered'));
 assert.equal(b.entries.find(e=>e.number===838).english_blocks[0].includes('Juwayriyah informed us'),true);
 assert(!b.entries.find(e=>e.number===842).english_blocks[0].includes('ibn Abi Kathir'));
});

test('reporting links and their plural or singular forms remain separate',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===845);
 for(const phrase of ['related to us','Hisham informed us','Ibn Jurayj informed them','Ibrahim ibn Maysarah informed me'])assert(e.english_blocks[0].includes(phrase));
 const b=input(),r=row(b,845),s=r.segments[0];s.english=s.english.replace('informed me','informed us');s.englishSha256=sha(s.english);r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b),/Reporting verb mismatch/);
});

test('sessions cross the printed tail into Friday Prayer while independent browsing preserves Continue',()=>{
 const {source,ledger}=collectionFiles(),s=startSession(source.entries,'835c',10);
 assert.equal(s.numbers[0],'835c');assert(s.numbers.includes(836));assert.deepEqual(visitSession(s,1),s);
 for(const n of [836,840,845]){
  const r=ledger.sourceReferences.entries.find(e=>e.number===n);
  assert(r.translation.description.includes('not the Darussalam translation'));
  assert(r.citations.find(c=>c.id==='khan').locator.startsWith('Volume 2, Book 13, Number '));
  assert.equal(r.localNotes.fragment,'hadith-'+n);
 }
});
