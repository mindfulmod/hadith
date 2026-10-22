import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,combineBookReviews,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {nextSession,resolveSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-knowledge-wikisource/catalog.json'),read('content/review/knowledge-first-review.json'),read('content/sources/wikisource-knowledge/manifest.json'),BOOK_CONFIGS.knowledge];
test('Knowledge admits nine full reports and all ten source chapters including both chapter-only sections',()=>{
 const args=input(),original=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args);
 assert.deepEqual(args.slice(0,3),original);assert.deepEqual(batch.entries.map(e=>e.number),[59,60,61,62,63,64,65,66,67]);
 assert.deepEqual(batch.chapters.map(c=>c.id),args[0].chapters.slice(0,10).map(c=>c.id));assert.deepEqual(batch.chapters.filter(c=>!c.entryNumbers.length).map(c=>c.id),['chapter-01','chapter-06']);
 for(const e of batch.entries){const row=args[1].entries.find(r=>r.number===e.number);assert.equal(e.book,'Knowledge');assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('dropping, reordering or borrowing source-only chapters is rejected even though report coverage is unchanged',()=>{
 for(const mutate of [r=>r.chapters.shift(),r=>r.chapters.splice(5,1),r=>[r.chapters[0],r.chapters[1]]=[r.chapters[1],r.chapters[0]],r=>r.chapters[5].contextIds=['mwCA']]){const args=input();mutate(args[1]);assert.throws(()=>buildBookBatch(...args));}
});
test('book configuration and comparison namespace cannot silently reuse a different book',()=>{
 const args=input();assert.throws(()=>buildBookBatch(...args.slice(0,3),BOOK_CONFIGS.faith));assert.throws(()=>buildBookBatch(...args.slice(0,3),{...BOOK_CONFIGS.knowledge}));
 for(const mutate of [r=>r.comparisons[0].id='bewley',r=>r.comparisons[1].reference='1.2.56']){const a=input(),row=a[1].entries[0];mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(...a));}
 const registry=read('content/review/knowledge-batches.json');assert.equal(combineBookReviews(registry,BOOK_CONFIGS.knowledge).entries.length,23);assert.throws(()=>combineBookReviews(registry,BOOK_CONFIGS.faith));
});
test('individual English mappings account for the comparator’s same-as-above gap',()=>{
 const {ledger}=collectionFiles(),rows=ledger.sourceReferences.entries.filter(e=>e.number>=59&&e.number<=67);
 assert.deepEqual(rows.map(r=>r.citations.find(c=>c.id==='khan').locator),[56,57,58,59,63,64,65,66,67].map(n=>'Volume 1, Book 3, Number '+n));
 for(const row of rows)assert.equal(row.citations.find(c=>c.id==='bewley').sourceId,'bewley-knowledge');
 assert.equal(ledger.sourceReferences.sources.find(s=>s.id==='bewley').url,'https://aishabewley.org/bukhari1');assert.equal(ledger.sourceReferences.sources.find(s=>s.id==='bewley-knowledge').url,'https://aishabewley.org/bukhari2');
});
test('the selected uncertainty, alternate chain and closing transmission notes remain complete',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n);
 assert.deepEqual(sourceSegments(get(59),'english').map(s=>s.kind),['chain','chain','report']);assert(get(59).arabic_blocks[1].includes('أين أراه السائل'));assert(get(59).english_blocks[2].includes('Where—I think—is'));
 const context=ledger.sourceReferences.entries.find(r=>r.number===59).contextNotes[0];assert.deepEqual(context.citations,['base','brill-1862','dar-ibn-kathir-2002']);assert.match(context.text,/provisional/);
 for(const n of [63,65])assert.equal(sourceSegments(get(n),'english').at(-1).kind,'transmission-note');
 assert.equal(get(63).english_blocks.join(' ').split('O Allah, yes.').length-1,4);assert.match(get(65).english_blocks.at(-1),/Qatadah/);assert.match(get(64).english_blocks[1],/I think Ibn al-Musayyab/);assert.match(get(67).english_blocks[1],/halter or its bridle/);
 assert.match(get(61).english_blocks[1],/felt shy/);assert.doesNotMatch(get(62).english_blocks[1],/shy/);
});
test('Knowledge source notes retain exact headings and introductions with separate offline anchors',()=>{
 const {ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='knowledge'),inputs=JSON.parse(files.get('reader/knowledge-inputs.json')),html=files.get('reader/knowledge-review.html');
 assert.equal(book.sourceEntryCount,76);assert.equal(book.chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,9);
 for(const c of book.chapters){assert.equal(c.sourceContext.notes.path,'knowledge-review.html');assert.equal((html.match(new RegExp('id="'+c.id+'"','g'))||[]).length,1);assert.equal(c.sourceContext.numberedReports,c.entryNumbers.length?'present':'none-in-source');}
 const [inventory]=input(),review=combineBookReviews(read('content/review/knowledge-batches.json'),BOOK_CONFIGS.knowledge),ids=new Set(review.chapters.flatMap(c=>[c.headingId,...c.contextIds]).concat(review.entries.flatMap(e=>e.paragraphIds)));assert.deepEqual(inputs.selectedBlocks,inventory.blocks.filter(b=>ids.has(b.htmlId)));assert(html.includes('Book of Knowledge'));assert(!html.includes('#book/faith'));
});
test('expansion preserves a saved session and starts a new one across Faith to Knowledge without synthetic entries',()=>{
 const {source}=collectionFiles(),saved={numbers:[58],cursor:58,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,58),saved);const next=nextSession(source.entries,saved,5);assert.equal(next.cursor,59);assert(next.numbers.every(n=>Number.isSafeInteger(n)&&n>=59));assert.equal(nextSession(source.entries,{numbers:[67],cursor:67,ended:true},5).cursor,68);assert.equal(nextSession(source.entries,{numbers:[81],cursor:81,ended:true},5),null);
});

test('the next Knowledge batch preserves exact paragraphs, report parts and individual references',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-next-review.json'),batch=buildBookBatch(inventory,review,manifest,config),{source,ledger}=collectionFiles();
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:14},(_,i)=>68+i));
 assert.deepEqual(batch.chapters.map(c=>c.id),inventory.chapters.slice(10,22).map(c=>c.id));
 for(const e of batch.entries){const row=review.entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));const citations=ledger.sourceReferences.entries.find(r=>r.number===e.number).citations;assert.equal(citations.find(c=>c.id==='khan').locator,'Volume 1, Book 3, Number '+e.number);}
 const previous=['opening-revelation-9ed87a5c5c3029ed','faith-54e79fe881e8447a','knowledge-b0a400b872b56edc'].flatMap(name=>read('reader/books/'+name+'.json').entries);assert.deepEqual(source.entries.slice(0,67),previous);
});
test('chapter eleven stays separately browseable and never creates an empty daily-session stop',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='knowledge'),chapter=book.chapters.find(c=>c.id==='chapter-11');
 assert.deepEqual(chapter.entryNumbers,[]);assert.equal(chapter.sourceContext.numberedReports,'none-in-source');assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');assert(files.get('reader/knowledge-review.html').includes('id="chapter-11"'));
 const saved={numbers:[67],cursor:67,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,67),saved);const next=nextSession(source.entries,saved,5);assert.equal(next.numbers[0],68);assert(next.numbers.every(n=>Number.isSafeInteger(n)&&n>=68));
 const args=input();args[1]=read('content/review/knowledge-next-review.json');args[1].chapters.shift();const registry=read('content/review/knowledge-batches.json');registry.batches[1].sha256=objectHash(args[1]);const combined=combineBookReviews(registry,BOOK_CONFIGS.knowledge,p=>p===registry.batches[1].path?args[1]:read(p));assert.throws(()=>buildBookBatch(args[0],combined,args[2],args[3]),/chapter span/);
});
test('markup residue, repeated narratives, memory frame and disputed closing note stay explicit',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),ref=n=>ledger.sourceReferences.entries.find(e=>e.number===n);
 for(const n of [72,75]){assert(get(n).arabic_blocks.at(-1).includes('}}'));assert.match(ref(n).contextNotes[0].text,/closing braces/);}
 assert.notDeepEqual(get(74).arabic_blocks,get(78).arabic_blocks);for(const n of [74,78]){const segments=sourceSegments(get(n),'english');assert.equal(segments[0].kind,'chain');assert(segments.slice(1).every(s=>s.kind==='report'));assert.match(segments.slice(1).map(s=>s.text).join(' '),/Ubayy/);}
 assert.deepEqual(sourceSegments(get(77),'english').map(s=>s.kind),['chain','report','report']);assert.equal(get(77).english_blocks[1],'I remember:');
 assert.equal(sourceSegments(get(79),'english').at(-1).kind,'transmission-note');assert.match(get(79).english_blocks.at(-1),/Ishaq/);assert.match(get(79).english_blocks.at(-1),/al-safsaf/);assert(ref(79).citations.some(c=>c.sourceId==='ibn-hajar-knowledge-79'));assert(ref(79).contextNotes[0].citations.includes('ibn-hajar-knowledge-79'));assert.match(ref(79).contextNotes[0].text,/provisionally/);
});
test('supplemental comparison sources may be added but conflicting identities fail closed',()=>{
 const registry=read('content/review/knowledge-batches.json'),review=read(registry.batches[1].path);assert(combineBookReviews(registry,BOOK_CONFIGS.knowledge).sources.some(s=>s.id==='ibn-hajar-knowledge-79'));
 review.sources.find(s=>s.id==='brill-1862').url='https://example.com/different.pdf';registry.batches[1].sha256=objectHash(review);assert.throws(()=>combineBookReviews(registry,BOOK_CONFIGS.knowledge,p=>p===registry.batches[1].path?review:read(p)),/Conflicting book batch source/);
});
