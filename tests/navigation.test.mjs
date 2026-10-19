import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChapters,bookForNumber,chapterForNumber,pageItems,libraryRoute} from '../reader/navigation.mjs';
import {startSession,resolveSession,nextSession,visitSession} from '../reader/session.mjs';
import {collectionView,bookView,savedView} from '../reader/library.mjs';
import {searchEntries} from '../reader/search.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
const entries=Array.from({length:95},(_,i)=>({number:10+i*3,englishWords:180,bookId:i<32?'first':'second',book:i<32?'First fixture':'Second fixture',english_blocks:['Only a synthetic search phrase.']}));
const catalog={publication:'evaluation',books:[{id:'first',number:3,title:'First fixture',entryNumbers:entries.slice(0,32).map(e=>e.number)},{id:'second',number:8,title:'Second fixture',entryNumbers:entries.slice(32).map(e=>e.number)}],entries};
catalog.books[0].chapters=[{id:'alpha',title:'A source heading',entryNumbers:catalog.books[0].entryNumbers.slice(0,12)},{id:'beta',title:'Another source heading',entryNumbers:catalog.books[0].entryNumbers.slice(12)}];
test('book and chapter references preserve source order without assuming contiguous numbers',()=>{
 assert.equal(bookForNumber(catalog,106).id,'second');
 assert.equal(chapterForNumber(catalog.books[0],46).id,'beta');
 assert.equal(chapterForNumber(catalog.books[1],106),undefined);
 assert.deepEqual(libraryRoute('#book/first/chapter/beta/page/2',catalog),{mode:'book',book:catalog.books[0],chapter:catalog.books[0].chapters[1],page:2});
 assert.equal(libraryRoute('#book/first/chapter/missing',catalog).mode,'missing');
 assert.equal(libraryRoute('#book/missing',catalog).mode,'missing');
 assert.equal(libraryRoute('#read/10',catalog),null);
});
test('chapter context refuses omission, overlap, reordering and duplicate identities',()=>{
 validateChapters(catalog.books[0]);validateChapters(catalog.books[1]);
 for(const change of [b=>b.chapters[0].entryNumbers.pop(),b=>b.chapters[1].entryNumbers.unshift(10),b=>b.chapters.reverse(),b=>b.chapters[1].id='alpha',b=>b.chapters[0].title='',b=>b.chapters=[]]){
  const bad=structuredClone(catalog.books[0]);change(bad);assert.throws(()=>validateChapters(bad));
 }
});
test('paged browsing and search reach every result without duplicates or invented reports',()=>{
 const all=[];for(let page=1;page<=4;page++)all.push(...pageItems(entries,page).items);
 assert.deepEqual(all,entries);assert.equal(pageItems(entries,999).page,4);assert.equal(pageItems(entries,-1).page,1);
 assert.equal(pageItems([],1).start,0);
 const found=[];for(let offset=0;offset<95;offset+=30){const result=searchEntries(entries,'search phrase',30,offset);assert.equal(result.total,95);found.push(...result.results.map(r=>r.entry.number));}
 assert.deepEqual(found,entries.map(e=>e.number));assert.equal(new Set(found).size,95);
});
test('browsing outside a session preserves it and next sessions start after its real boundary',()=>{
 const plan=startSession(entries,10,5);assert.deepEqual(plan.numbers,[10,13,16,19,22]);
 assert.strictEqual(visitSession(plan,106),plan);assert.equal(visitSession(plan,19).cursor,19);
 const next=nextSession(entries,{...plan,ended:true},10);assert.equal(next.cursor,25);assert.equal(next.numbers.length,9);
 assert.equal(nextSession(entries,startSession(entries,entries.at(-1).number,5)),null);
 const acrossBook=startSession(entries,100,5);assert.deepEqual(acrossBook.numbers,[100,103,106,109,112]);
});
test('invalid or legacy sessions recover at the actual saved place; valid sessions never grow',()=>{
 const recovered=resolveSession(entries,{numbers:[10,999]},10,106);assert.equal(recovered.cursor,106);assert.equal(recovered.numbers[0],106);
 const plan=startSession(entries,10,5);const before=structuredClone(plan);
 assert.deepEqual(resolveSession([...entries,{number:900,englishWords:1}],plan,10,106),before);
 assert.deepEqual(plan,before);
 assert.equal(resolveSession(entries,null,5,9999).cursor,10);
});
test('book pages show only available metadata, escaped source headings and bounded lists',()=>{
 const copy=structuredClone(catalog);copy.books[0].title='<script>source heading</script>';copy.books[0].chapters[0].title='Words & <markup>';
 const state=normalizeState({saved:[10,9999],finished:[10],last:10,positions:{10:100}});
 const home=collectionView(copy,state);assert.match(home,/95 hadith available/);assert.match(home,/&lt;script&gt;source heading/);assert.doesNotMatch(home,/<script>/);
 const book=bookView(copy,state,{book:copy.books[0],chapter:null,page:2});assert.match(book,/31–32 of 32/);assert.match(book,/&amp; &lt;markup&gt;/);assert.equal((book.match(/class="entry-link"/g)||[]).length,2);
 const noChapters=bookView(copy,state,{book:copy.books[1],chapter:null,page:1});assert.match(noChapters,/Chapter headings are not yet available/);assert.doesNotMatch(noChapters,/class="chapter-index"/);
 assert.match(savedView(copy,state),/1 saved reference is not available/);assert.deepEqual(state.saved,[10,9999]);
});
