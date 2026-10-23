import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-second-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 352–363 preserves every source character, complete English script and prior entries',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>352+i));assert.equal(batch.chapters.length,7);
 const old=read('reader/books/prayer-0d58479fa07383ad.json');assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=351),old.entries);
 for(const row of a[1].entries){const entry=batch.entries.find(e=>e.number===row.number),arabic=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;assert.equal(row.segments.map(s=>s.arabic).join(''),arabic);assert.equal(entry.arabic_blocks.join(''),arabic);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===row.number).script,entry.english_blocks.join('\n\n'));}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('uncertainty, passive speech, list scope and closing chains survive comparison omissions',()=>{
 const {source}=collectionFiles(),text=n=>source.entries.find(e=>e.number===n).english_blocks.join(' ');
 assert.match(text(353),/I heard him, or I had asked him/);assert.match(text(353),/I testify that I heard/);assert.doesNotMatch(text(353),/on his shoulders|wrote to me/);
 assert.match(text(354),/We asked Jabir/);assert.match(text(354),/out at night/);assert.match(text(354),/meaning it was too narrow/);
 assert.match(text(355),/The women were told/);assert.doesNotMatch(text(355),/Prophet.*told the women/);
 assert.match(text(356),/his hand out/);assert.doesNotMatch(text(356),/his hands/);
 const pairs=[...text(358).matchAll(/[Ii]n (?:an izar|trousers|a tubban) and a (?:rida|shirt|qaba)/g)].map(m=>m[0].toLowerCase());assert.deepEqual(pairs,['in an izar and a rida','in an izar and a shirt','in an izar and a qaba','in trousers and a rida','in trousers and a shirt','in trousers and a qaba','in a tubban and a qaba','in a tubban and a shirt','in a tubban and a rida']);assert.match(text(358),/I think he said/);assert.doesNotMatch(text(358),/otherwise/i);
 assert.match(text(359),/And from Nafi‘, from Ibn ‘Umar, from the Prophet/);assert.match(text(360),/none of it covering his private parts/);assert.doesNotMatch(text(361),/private parts/);
 assert.match(text(362),/Humayd ibn ‘Abd al-Rahman said/);assert.match(text(362),/Abu Hurayrah said: ‘Ali/);assert.equal((text(362).match(/after this year/g)||[]).length,2);assert.match(text(363),/we said: “Abu ‘Abd Allah/);
});
test('new chapter introduction remains separate from complete numbered sessions and scripts',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer'),plan=narrationPlan(source),chapter=a[1].chapters.find(c=>c.id==='chapter-07');assert.deepEqual(chapter.contextIds,['mwNw']);
 assert.equal(book.chapters.find(c=>c.id==='chapter-07').sourceContext.introduction.englishStatus,'pending');
 const intro=a[0].blocks.find(b=>b.htmlId==='mwNw').text;assert(source.entries.every(e=>e.arabic_blocks.every(t=>!t.includes(intro))));assert(plan.entries.every(e=>!e.script.includes(intro)));
 const saved={numbers:[350,351],cursor:351,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,363),saved);assert.equal(nextSession(source.entries,saved,5).cursor,352);
 for(const minutes of [5,10])for(let n=352;n<=363;n++){const session=planSession(source.entries,n,minutes);assert.equal(session.numbers[0],n);assert(session.numbers.every(number=>source.entries.some(e=>e.number===number)));}
});
test('missing uncertainty, truncated ending, reordered segments and wrong reference evidence fail closed',()=>{
 for(const change of [r=>r.entries[1].segments[0].arabic=r.entries[1].segments[0].arabic.replace('أو كنت سألته',''),r=>r.entries[7].segments.pop(),r=>r.entries[6].segments.reverse(),r=>r.entries[10].comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.entries[0].paragraphIds.push('mwNw')]){const a=input();change(a[1]);a[1].entries.forEach(rehash);assert.throws(()=>buildBookBatch(...a));}
});
