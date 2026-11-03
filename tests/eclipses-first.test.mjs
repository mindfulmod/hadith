import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {validateChapters,chapterForNumber} from '../reader/navigation.mjs';
import {release} from '../reader/release.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const inv=read('content/staging/bukhari-eclipses-wikisource/catalog.json');
const manifest=read('content/sources/wikisource-eclipses/manifest.json');
const review=()=>read('content/review/eclipses-first-review.json');
const {source,ledger}=collectionFiles();
const entries=source.entries.filter(e=>e.book==='Eclipses'&&e.number<=998);
const get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const book=ledger.books.find(b=>b.id==='eclipses'),plan=narrationPlan(source);

test('Eclipses opening preserves all six exact Arabic bodies, 14 spans and full narration scripts',()=>{
 assert.deepEqual(entries.map(e=>e.number),[993,994,995,996,997,998]);
 assert.equal(review().entries.reduce((sum,r)=>sum+r.segments.length,0),14);
 for(const row of review().entries){
  const e=get(row.number);
  assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));
  assert.equal(row.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));
  assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));
  assert.equal(plan.entries.find(p=>p.number===row.number).script,e.english_blocks.join('\n\n'));
  assert.equal(e.presentation.english[0].kind,'chain');
  assert.equal(e.review.independentReview,'pending');
  assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});

test('source-specific honorifics and clauses are retained without importing comparison expansions',()=>{
 assert.equal(text(993).split('may Allah bless him and grant him peace').length-1,3);
 assert.doesNotMatch(text(993),/house/);assert.match(text(993),/until what has befallen you is removed/);
 assert.match(text(994),/I heard Abu Mas‘ud/);assert.match(text(994),/stand up and pray/);
 assert.match(text(995),/who related it to him/);assert.match(text(995),/may Allah Most High be pleased with them both/);assert.doesNotMatch(text(995),/birth/);
 assert.match(text(996),/day Ibrahim died/);assert.doesNotMatch(text(996),/son|two of Allah’s signs/);
 assert.equal(text(996).split('may Allah bless him and grant him peace').length-1,2);
});

test('the long account retains its prayer sequence, both oaths and explicitly documented lexical choice',()=>{
 const e=get(997);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','report','report']);
 assert.match(text(997),/shorter than the first standing/);assert.match(text(997),/shorter than the first bowing/);
 assert.match(text(997),/second rak‘ah as he had done in the first/);
 assert.equal(text(997).split('O community of Muhammad').length-1,2);assert.equal(text(997).split('by Allah').length-1,2);
 assert.match(text(997),/supplicate to Allah, proclaim His greatness, pray and give charity/);
 assert.match(text(997),/greater ghayrah/);assert.match(text(997),/male servant.*female servant/);
 assert.doesNotMatch(text(997),/against the signs|self-respect|as He has forbidden/);
 assert(e.review.notes.some(n=>n.includes('deliberately retained')&&n.includes('Independent lexical')));
 const row=ledger.sourceReferences.entries.find(r=>r.number===997);
 assert(row.citations.some(c=>c.sourceId==='fath-eclipses-charity'));
 assert(row.citations.some(c=>c.id==='khan'&&c.locator.includes('damaged')));
});

test('the long chain preserves singular and plural verbs instead of being harmonized to the prints',()=>{
 const chain=get(998).english_blocks[0];assert(chain.startsWith('Ishaq related to me.'));
 assert.match(chain,/Mu‘awiyah ibn Sallam ibn Abi Sallam al-Habashi al-Dimashqi related to us/);
 assert.match(chain,/Yahya ibn Abi Kathir related to us/);assert.match(chain,/ibn ‘Awf al-Zuhri informed me/);
 assert.match(text(998),/The prayer is in congregation/);
 const copy=review(),row=copy.entries.at(-1);row.segments[0].english=row.segments[0].english.replace('Ishaq related to me.','Ishaq related to us.');
 row.segments[0].englishSha256=createHash('sha256').update(row.segments[0].english).digest('hex');
 row.englishSha256=createHash('sha256').update(row.segments.map(s=>s.english).join('\n\n')).digest('hex');
 delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);
 assert.throws(()=>buildBookBatch(inv,copy,manifest,BOOK_CONFIGS.eclipses),/Reporting verb mismatch/);
});

test('damaged English evidence and exact source identity cannot be replaced by plausible labels',()=>{
 for(const mutate of [r=>r.comparisons[1].reference='2.18.155',r=>r.comparisons[1].checkedBody[1]+=' changed',r=>r.comparisons[1].damagedExcerpt='invented damage',r=>r.paragraphIds=['mwFg']]){
  const copy=review(),row=copy.entries.find(r=>r.number===997);mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);
  assert.throws(()=>buildBookBatch(inv,copy,manifest,BOOK_CONFIGS.eclipses));
 }
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('three complete chapters are browsable, saved sessions stay finite and new source notes are offline',()=>{
 validateChapters(book);assert.deepEqual(book.chapters.slice(0,3).map(c=>c.entryNumbers),[[993,994,995,996],[997],[998]]);
 assert.equal(chapterForNumber(book,998).id,'chapter-03');
 for(const c of book.chapters.slice(0,3))assert.equal(c.sourceContext.introduction.arabicParagraphs,0);
 const saved={numbers:[991,992],cursor:992,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,993),saved);
 const next=startSession(source.entries,993,10);assert.equal(next.numbers[0],993);assert(next.numbers.every(n=>source.entries.some(e=>e.number===n)));
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='eclipses');
 const route=notes.routes.find(r=>r.id==='hadith-997');assert(release.files.some(f=>f.path===route.path));
 const html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8');assert(html.includes('ghayrah'));assert(html.includes('1044'));assert(html.includes('damaged'));
});
