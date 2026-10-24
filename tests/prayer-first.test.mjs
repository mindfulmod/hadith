import {assertHistoricalBook} from './helpers/stable-book.mjs';
import {ENTRY_COUNT,BOOK_COUNT} from './published-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession,readingSeconds} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-first-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const mutate=fn=>{const a=input();fn(a[1]);a[1].entries.forEach(rehash);return()=>buildBookBatch(...a);};
test('Prayer admission preserves all selected Arabic, complete segment order and prototype limits',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.equal(batch.entries.length,10);
 for(const row of a[1].entries){const entry=batch.entries.find(e=>e.number===row.number),arabic=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;assert.equal(row.segments.map(s=>s.arabic).join(''),arabic);assert.equal(entry.arabic_blocks.join(''),arabic);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===row.number).script,entry.english_blocks.join('\n\n'));}
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);assert.throws(()=>buildBooks(source,ledger,{production:true}));
 const published=buildBooks(source,ledger);for(const path of ['books/opening-revelation-0a534f10d205292c.json','books/faith-ad873aab8759ca02.json','books/knowledge-e3d5ef7956421322.json','books/ablution-4012bd796dae0e95.json','books/ghusl-1382b7bd3720f4ff.json','books/menstruation-95605644e549c484.json','books/tayammum-d329407c8ce82c99.json'])assertHistoricalBook(published,path);
});
test('shared Bewley reference distinguishes the Night Journey continuation from the Aisha report',()=>{
 const {ledger}=collectionFiles();const cite=n=>ledger.sourceReferences.entries.find(e=>e.number===n).citations.find(c=>c.id==='bewley');
 assert.equal(cite(342).locator,'Book of Prayer · entries 342, 343 (part 1 of 2)');assert.equal(cite(343).locator,'Book of Prayer · entry 343 (part 2 of 2)');assert.match(cite(343).scope,/unnumbered Aisha paragraph/);
 for(const change of [r=>delete r.entries[1].comparisons[0].part,r=>r.entries[1].comparisons[0].part.index=1,r=>r.entries[1].comparisons[0].part.count=3,r=>r.entries[1].comparisons[0].note='',r=>r.entries[0].comparisons[0].splitReferences[1].part.index=0,r=>r.entries[0].comparisons[0].part={index:1,count:2},r=>r.entries[0].comparisons[0].splitReferences[1].segmentIds.pop(),r=>r.entries[0].comparisons[0].splitReferences[0].segmentIds.reverse(),r=>r.entries[1].comparisons[0].part.extra=true])assert.throws(mutate(change));
});
test('complete chains, variant wording and closing transmission survive the English comparison omissions',()=>{
 const {source}=collectionFiles(),entry=n=>source.entries.find(e=>e.number===n),text=n=>entry(n).english_blocks.join(' ');
 assert.match(text(342),/Ibn Shihab said: Then Ibn Hazm informed me that Ibn ‘Abbas and Abu Habbah al-Ansari/);assert.match(text(342),/sixth heaven/);assert.match(text(342),/he sent me back/);assert.match(text(342),/removed part of them/);assert.match(text(342),/strings of pearls/);assert.doesNotMatch(text(342),/seventh heaven|in reward|domes/);
 assert.match(text(344),/‘Abd Allah ibn Raja’ said: ‘Imran related to us; Muhammad ibn Sirin related to us/);assert.match(text(344),/their supplication/);assert.doesNotMatch(text(344),/their feasts/);
 assert.match(text(346),/praying in a garment/);assert.doesNotMatch(text(347),/shoulders/);assert.doesNotMatch(text(348),/crossed/);assert.match(text(350),/my mother’s son/);assert.match(text(350),/That was in the forenoon/);
});
test('four chapter introductions are separately browsable and cannot enter sessions or narration',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer'),plan=narrationPlan(source);assert.deepEqual(book.chapters.slice(0,4).map(c=>c.id),a[1].chapters.map(c=>c.id));assert.deepEqual(book.entryNumbers.slice(0,10),Array.from({length:10},(_,i)=>342+i));
 for(const c of a[1].chapters){assert.equal(c.contextIds.length,1);assert.equal(book.chapters.find(b=>b.id===c.id).sourceContext.introduction.englishStatus,'pending');for(const id of c.contextIds){const original=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>e.arabic_blocks.every(t=>!t.includes(original))));assert(plan.entries.every(e=>!e.script.includes(original)));}}
 const saved={numbers:[340,341],cursor:341,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,351),saved);assert.equal(nextSession(source.entries,saved,5).cursor,342);const long=source.entries.find(e=>e.number===342);assert.deepEqual(planSession(source.entries,342,5).numbers,[342,343,344]);assert(readingSeconds(long,100)>300);assert.deepEqual(planSession(source.entries,342,5,100).numbers,[342]);
});
test('changed original spans, stale inventory bindings and chapter text in a report are rejected',()=>{
 for(const change of [a=>a[0].blocks[0].text+='x',a=>a[1].entries[0].sourceLayout.paragraphs[0].origin.start++,a=>a[1].sourceLayout.layoutReviewSha256='0'.repeat(64),a=>a[1].entries[0].paragraphIds.push('mwBg'),a=>a[1].entries[0].comparisons[1].referenceEvidence.recordSha256='0'.repeat(64)]){const a=input();change(a);a[1].entries.forEach(rehash);assert.throws(()=>buildBookBatch(...a));}
});
