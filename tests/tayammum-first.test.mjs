import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {chapterLayoutDetails} from '../scripts/mapped-source.mjs';
import {escapeHTML} from '../reader/source-format.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-tayammum-wikisource/catalog.json'),read('content/review/tayammum-first-review.json'),read('content/sources/wikisource-tayammum/manifest.json'),BOOK_CONFIGS.tayammum];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Tayammum admission leaves all 326 previous entries and six packs unchanged',()=>{
 const {source,ledger}=collectionFiles(),built=buildBooks(source,ledger),stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95','ghusl-1382b7bd3720f4ff','menstruation-95605644e549c484'];
 assert.deepEqual(source.entries.slice(0,326),stable.flatMap(n=>read('reader/books/'+n+'.json').entries));assert.equal(source.entries.length,341);assert.equal(ledger.books.length,7);
 for(const n of stable)assert.equal(built.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('all five complete reports preserve their exact Arabic, full chains and narration order',()=>{
 const a=input(),original=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),plan=narrationPlan(collectionFiles().source);assert.deepEqual(a.slice(0,3),original);assert.deepEqual(batch.entries.map(e=>e.number),[327,328,329,330,331]);assert.equal(a[1].entries.flatMap(r=>r.segments).length,15);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),b=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]);assert.equal(r.segments.map(s=>s.arabic).join(''),b.text);assert.equal(e.arabic_blocks[0],b.text);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries[r.number-1].script,e.english_blocks.join('\n\n'));}
 assert.deepEqual(batch.entries[1].presentation.english.map(s=>s.kind),['chain','chain','report']);assert.match(batch.entries[1].english_blocks[1],/^Another chain:.*related to me.*informed us.*al-Faqir/);
 assert.deepEqual(batch.entries[3].presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.equal(batch.entries[3].english_blocks[2],'Then Abu al-Juhaym said:');assert.match(batch.entries[4].english_blocks[0],/Sa‘id ibn ‘Abd al-Rahman ibn Abza, from his father/);
});
test('editor artifact and chapter introduction remain browsable but never enter numbered reports or audio',()=>{
 const a=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='tayammum'),chapter=a[1].chapters[2],original=a[0].originalBlocks.find(b=>b.htmlId==='mwHw'),html=files.get('reader/tayammum-review.html'),plan=narrationPlan(source),details=chapterLayoutDetails(a[0],chapter);
 assert.equal(book.chapters.length,9);assert.equal(book.sourceEntryCount,15);assert.deepEqual(book.entryNumbers,Array.from({length:15},(_,i)=>327+i));assert.equal(book.chapters[2].sourceContext.introduction.englishStatus,'pending');assert(html.includes(details));assert(details.includes(escapeHTML(original.text)));assert(details.includes('Original chapter layout'));assert(details.includes('#page=94'));assert(details.includes('#page=93'));
 assert.equal(chapterLayoutDetails(a[0],a[1].chapters[1]),'');assert.equal(chapterLayoutDetails(read('content/staging/bukhari-ablution-wikisource/catalog.json'),{headingId:'mweA@3-21',contextIds:[]}), '');
 for(const id of [chapter.headingId,...chapter.contextIds,...a[0].editorialArtifactIds]){const text=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.some(b=>b.includes(text))));assert(plan.entries.every(e=>!e.script.includes(text)));}
 const inputs=JSON.parse(files.get('reader/tayammum-inputs.json'));assert.deepEqual(inputs.sourceLayout.originalBlocks.find(b=>b.htmlId==='mwHw'),original);assert.deepEqual(inputs.sourceLayout.completeLayoutReview,a[0].layoutReview);
});
test('chapter boundaries and pinned evidence cannot be silently changed at admission',()=>{
 for(const mutate of [a=>a[0].blocks.find(b=>b.htmlId==='mwHw@67-233').text+=' changed',a=>a[1].sourceLayout.layoutReviewSha256='0'.repeat(64),a=>a[1].entries[2].paragraphIds.push('mwHw@67-233'),a=>a[1].entries[0].sourceLayout.paragraphs[0].origin.start++,a=>a[1].entries[0].comparisons[1].referenceEvidence.recordSha256='0'.repeat(64)]){const a=input();mutate(a);for(const r of a[1].entries)rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('comparison additions and attribution differences do not replace selected narration',()=>{
 const {source}=collectionFiles(),e=n=>source.entries[n-1];assert.match(e(327).english_blocks[0],/Malik informed us/);assert.match(e(327).english_blocks.at(-1),/Usayd ibn al-Hudayr/);assert.doesNotMatch(e(328).english_blocks.at(-1),/enemies|Day of Resurrection|al-Faqir/);assert.match(e(329).english_blocks[1],/sent a man.*came upon them/);assert.doesNotMatch(e(329).english_blocks[1],/Ibn ‘Umar|al-Jurf|without ablution/);assert.doesNotMatch(e(330).english_blocks.at(-1),/mud|dust/);assert.match(e(331).english_blocks[1],/This alone would have been enough for you/);assert.doesNotMatch(e(331).english_blocks[1],/blew off the dust/);
});
test('existing sessions remain fixed while new sessions can continue into Tayammum',()=>{
 const {source}=collectionFiles(),saved={numbers:[326],cursor:326,ended:true},before=structuredClone(saved);assert.deepEqual(resolveSession(source.entries,saved,5,331),before);assert.equal(nextSession(source.entries,saved,5).cursor,327);assert.deepEqual(saved,before);assert.deepEqual(planSession(source.entries,341,10).numbers,[341]);assert.equal(nextSession(source.entries,{numbers:[341],cursor:341,ended:true},5),null);assert(source.entries.every(e=>Number.isSafeInteger(e.number)));
});
