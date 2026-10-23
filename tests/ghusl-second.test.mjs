import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles,combineBookReviews} from '../scripts/build-collection.mjs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
import {bookView} from '../reader/library.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ghusl-wikisource/catalog.json'),read('content/review/ghusl-second-review.json'),read('content/sources/wikisource-ghusl/manifest.json'),BOOK_CONFIGS.ghusl];
const rehash=row=>{row.englishSha256=digest(row.segments.map(s=>s.english).join('\n\n'));delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);};
test('Ghusl second batch preserves the first 250 entries and four stable book files exactly',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args);
 const stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95'];
 const previous=[...stable,'ghusl-63bd0e04e12cecc5'].flatMap(n=>read('reader/books/'+n+'.json').entries);
 assert.deepEqual(source.entries.slice(0,250),previous);assert.equal(source.entries.length,341);
 for(const n of stable)assert.equal(published.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.deepEqual(args.slice(0,3),before);assert.equal(batch.chapters.length,6);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:11},(_,i)=>251+i));
 for(const row of args[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=args[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;assert.deepEqual(e.arabic_blocks,[original]);assert.equal(row.segments.map(s=>s.arabic).join(''),original);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('feminine plural narration is counted and cannot be omitted or changed to singular after rehashing',()=>{
 const valid=input(),row=valid[1].entries.find(r=>r.number===256);assert.match(row.segments[0].arabic,/حدثتنا ميمونة/);assert.equal((row.segments[0].english.match(/related to us/g)||[]).length,4);buildBookBatch(...valid);
 for(const replacement of ['Maymunah said','Maymunah related to me']){const args=input(),r=args[1].entries.find(r=>r.number===256),s=r.segments[0];s.english=s.english.replace('Maymunah related to us',replacement);s.englishSha256=digest(s.english);rehash(r);assert.throws(()=>buildBookBatch(...args),/Reporting verb mismatch in 256-1/);}
});
test('different reporting verbs and the short hand account follow their selected source, not comparison wording',()=>{
 const {entries}=buildBookBatch(...input()),get=n=>entries.find(e=>e.number===n);
 assert.match(get(252).english_blocks[0],/^Muhammad ibn Bashshar related to us/);assert.match(get(258).english_blocks[0],/Aflah informed us/);
 assert.match(get(254).english_blocks[0],/^Musa related to us/);assert.doesNotMatch(get(254).english_blocks[0],/Ismail|Isma‘il/);assert.match(get(257).english_blocks[0],/^Al-Humaydi related to us/);
 assert.match(get(259).english_blocks[1],/washed his hand\.$/);assert.doesNotMatch(get(259).english_blocks[1],/hands|first/);
 assert.doesNotMatch(get(254).english_blocks[1]+' '+get(256).english_blocks[1],/blowing|blew/);
});
test('hilab uncertainty and lexical evidence stay outside source wording and complete scripts',()=>{
 const {source,ledger,files}=collectionFiles(),entry=source.entries.find(e=>e.number===255),refs=ledger.sourceReferences.entries.find(e=>e.number===255),plan=narrationPlan(source),row=input()[1].entries.find(e=>e.number===255);
 assert.match(entry.english_blocks[1],/something like a hilab/);assert.doesNotMatch(entry.english_blocks[1],/scent|milk-pot|middle|under review/);
 assert(refs.contextNotes.some(n=>n.id==='255-hilab-wording'));assert(refs.citations.some(c=>c.sourceId==='fath-hilab'));
 assert.match(files.get('reader/ghusl-review.html'),/Fath al-Bari/);assert(row.notes.some(n=>n.includes('historical print adds وسط')));
 assert.equal(plan.entries.find(e=>e.number===255).script,entry.english_blocks.join('\n\n'));
});
test('both closing chains remain distinct complete narration segments instead of repeated or dropped bodies',()=>{
 const {source}=collectionFiles(),plan=narrationPlan(source);
 for(const n of [260,261]){const e=source.entries.find(e=>e.number===n);assert.deepEqual(e.presentation.english.map(s=>s.kind),['chain','report','transmission-note']);assert.equal(plan.entries.find(p=>p.number===n).script,e.english_blocks.join('\n\n'));}
 const a=source.entries.find(e=>e.number===260),b=source.entries.find(e=>e.number===261);assert.match(a.english_blocks.at(-1),/‘Abd al-Rahman ibn al-Qasim, from his father, from ‘A’ishah, the same/);assert.match(b.english_blocks.at(-1),/^Muslim and Wahb added, from Shu‘bah/);assert.match(b.english_blocks[0],/I heard Anas ibn Malik/);
 for(const e of source.entries.slice(250))assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));
});
test('chapter 9 material remains offline, separately browsable and outside numbered sessions',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ghusl'),chapter=book.chapters.find(c=>c.id==='chapter-09'),inputData=JSON.parse(files.get('reader/ghusl-inputs.json')),original=input()[0].blocks.find(b=>b.htmlId==='mwSg');
 assert.equal(book.entryNumbers.length,45);assert.equal(book.chapters.length,29);assert.deepEqual(chapter.entryNumbers,[258,259,260,261]);assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');
 assert.deepEqual(inputData.selectedBlocks.find(b=>b.htmlId==='mwSg'),original);assert.equal(inputData.selectedBlocks.length,79);assert(files.get('reader/ghusl-review.html').includes(original.text));assert(source.entries.every(e=>!e.arabic_blocks.includes(original.text)));
 const saved={numbers:[250],cursor:250,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,261),saved);assert.equal(nextSession(source.entries,saved,5).cursor,251);assert.deepEqual(planSession(source.entries,341,5).numbers,[341]);
 const state=normalizeState({session:saved,last:250}),before=structuredClone(state),html=bookView(buildBooks(source,ledger).catalog,state,{mode:'book',book,chapter,page:1});assert.deepEqual(state,before);assert.match(html,/ghusl-review.html#chapter-09/);
});
test('second-batch evidence refuses reordered references, split chapters and changed preserved introductions',()=>{
 const registry=read('content/review/ghusl-batches.json'),reviews=new Map(registry.batches.map(b=>[b.path,read(b.path)]));combineBookReviews(registry,BOOK_CONFIGS.ghusl,p=>reviews.get(p));
 const altered=structuredClone(registry);altered.batches[1].first=252;assert.throws(()=>combineBookReviews(altered,BOOK_CONFIGS.ghusl,p=>reviews.get(p)),/consecutive/);
 const args=input();args[1].chapters.at(-1).contextIds=[];assert.throws(()=>buildBookBatch(...args));
 const changed=structuredClone(registry),review=structuredClone(reviews.get(changed.batches[1].path));review.bookIntroduction.englishStatus='approved';changed.batches[1].sha256=objectHash(review);assert.throws(()=>combineBookReviews(changed,BOOK_CONFIGS.ghusl,p=>p===changed.batches[1].path?review:reviews.get(p)),/Conflicting book batch source/);
});
