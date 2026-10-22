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
 const registry=read('content/review/knowledge-batches.json');assert.equal(combineBookReviews(registry,BOOK_CONFIGS.knowledge).entries.length,52);assert.throws(()=>combineBookReviews(registry,BOOK_CONFIGS.faith));
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
 assert.equal(book.sourceEntryCount,76);assert.equal(book.chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,12);
 for(const c of book.chapters){assert.equal(c.sourceContext.notes.path,'knowledge-review.html');assert.equal((html.match(new RegExp('id="'+c.id+'"','g'))||[]).length,1);assert.equal(c.sourceContext.numberedReports,c.entryNumbers.length?'present':'none-in-source');}
 const [inventory]=input(),review=combineBookReviews(read('content/review/knowledge-batches.json'),BOOK_CONFIGS.knowledge),ids=new Set(review.chapters.flatMap(c=>[c.headingId,...c.contextIds]).concat(review.entries.flatMap(e=>e.paragraphIds)));assert.deepEqual(inputs.selectedBlocks,inventory.blocks.filter(b=>ids.has(b.htmlId)));assert(html.includes('Book of Knowledge'));assert(!html.includes('#book/faith'));
});
test('expansion preserves a saved session and starts a new one across Faith to Knowledge without synthetic entries',()=>{
 const {source}=collectionFiles(),saved={numbers:[58],cursor:58,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,58),saved);const next=nextSession(source.entries,saved,5);assert.equal(next.cursor,59);assert(next.numbers.every(n=>Number.isSafeInteger(n)&&n>=59));assert.equal(nextSession(source.entries,{numbers:[67],cursor:67,ended:true},5).cursor,68);assert.equal(nextSession(source.entries,{numbers:[110],cursor:110,ended:true},5),null);
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

test('third Knowledge batch preserves all 81 earlier entries and adds 15 exact reports in nine complete chapters',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-third-review.json'),batch=buildBookBatch(inventory,review,manifest,config),{source}=collectionFiles();
 const prior=['opening-revelation-a11fae3a007251a7','faith-c30f000be15f5c20','knowledge-e31e1a367afa3a33'].flatMap(name=>read('reader/books/'+name+'.json').entries);assert.deepEqual(source.entries.slice(0,81),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:15},(_,i)=>82+i));assert.deepEqual(batch.chapters.map(c=>c.id),inventory.chapters.slice(22,31).map(c=>c.id));
 for(const e of batch.entries){const row=review.entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('embedded uncertainty and the alternate chain stay explicit without silently replacing source wording',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n);
 const notes=sourceSegments(get(86),'english').filter(s=>s.kind==='transmission-note');assert.equal(notes.length,3);assert(notes.every(s=>s.text.includes('Asma’')));assert.equal(sourceSegments(get(89),'english').filter(s=>s.kind==='chain').length,2);assert.match(get(89).english_blocks[1],/Abu ‘Abdullah said/);
 assert(get(84).arabic_blocks.at(-1).includes('}}'));assert.match(get(91).english_blocks[0],/Rabi‘ah ibn Abi ‘Abd,/);assert(!get(91).arabic_blocks[0].includes('ربيعة بن أبي عبد الرحمن'));assert.match(ledger.sourceReferences.entries.find(r=>r.number===91).contextNotes[0].text,/al-Rahman/);
 assert.equal(sourceSegments(get(91),'english').filter(s=>s.kind==='transmission-note').length,2);assert.equal(sourceSegments(get(87),'english').filter(s=>s.kind==='transmission-note').length,1);assert.match(get(87).english_blocks.at(-1),/convey it/);
});
test('an inspected absence is identified as absence in both the reader status and historical citation',()=>{
 const {source,ledger}=collectionFiles(),entry=source.entries.find(e=>e.number===94),row=ledger.sourceReferences.entries.find(e=>e.number===94),citation=row.citations.find(c=>c.id==='brill-1862');
 assert.match(entry.english_status,/does not separately contain/);assert.match(citation.locator,/no separate match/);assert.match(citation.scope,/not an exact printed match/);assert.equal(row.contextNotes[0].related[0].number,95);
 const next=source.entries.find(e=>e.number===95);assert.notDeepEqual(entry.english_blocks,next.english_blocks);assert.match(entry.english_blocks[1],/^Whenever he gave a greeting/);assert.match(next.english_blocks[1],/so that it would be understood/);assert.doesNotMatch(entry.english_blocks[1]+next.english_blocks[1],/knock|permission/);
});
test('printed witness evidence rejects invented status, duplicate sources and empty checked locations',()=>{
 const [inventory,,manifest,config]=input();
 for(const change of [w=>w.status='approved',w=>w.note='',w=>w.pdfPages=[],w=>w.pdfPages=[36,36],w=>w.id='dar-ibn-kathir-2002']){
  const review=read('content/review/knowledge-third-review.json'),row=review.entries.find(e=>e.number===94);change(row.printedWitnesses[0]);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(inventory,review,manifest,config));
 }
});
test('historical absence cannot be silently attributed to the modern print',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-third-review.json'),row=review.entries.find(e=>e.number===94);
 row.printedWitnesses[0].id='dar-ibn-kathir-2002';row.printedWitnesses[1].id='brill-1862';delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);
 assert.throws(()=>buildBookBatch(inventory,review,manifest,config),/historical witness only/);
});
test('the repeated warning retains the named prayer and new chapter context stays outside numbered sessions',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),book=ledger.books.find(b=>b.id==='knowledge');assert.match(get(96).english_blocks[1],/‘Asr/);assert.doesNotMatch(get(60).english_blocks[1],/‘Asr/);assert.notDeepEqual(get(60).english_blocks,get(96).english_blocks);
 assert.equal(book.chapters.find(c=>c.id==='chapter-26').sourceContext.introduction.arabicParagraphs,1);assert.equal(book.chapters.find(c=>c.id==='chapter-31').sourceContext.introduction.arabicParagraphs,1);assert.equal(book.chapters.length,39);const saved={numbers:[81],cursor:81,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,81),saved);assert.equal(nextSession(source.entries,saved,5).cursor,82);
});

test('fourth Knowledge batch preserves the earlier 96 entries and admits eight complete chapters',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-fourth-review.json'),batch=buildBookBatch(inventory,review,manifest,config),{source}=collectionFiles();
 const prior=['opening-revelation-0838666424fc2680','faith-4b603172bba4b1d1','knowledge-fd5bb655e84c121d'].flatMap(name=>read('reader/books/'+name+'.json').entries);assert.deepEqual(source.entries.slice(0,96),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:14},(_,i)=>97+i));assert.deepEqual(batch.chapters.map(c=>c.id),inventory.chapters.slice(31,39).map(c=>c.id));
 for(const e of batch.entries){const row=review.entries.find(r=>r.number===e.number);if(e.number!==99)assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('a declared chain correction changes only its recorded span and preserves the pinned original',()=>{
 const args=input();args[1]=read('content/review/knowledge-fourth-review.json');const snapshot=structuredClone(args),batch=buildBookBatch(...args),entry=batch.entries.find(e=>e.number===99),row=args[1].entries.find(e=>e.number===99),c=row.arabicCorrections[0],raw=args[0].blocks.find(b=>b.htmlId===c.paragraphId).text;
 assert.deepEqual(args,snapshot);assert.equal(entry.arabic_blocks[0],Array.from(raw).slice(0,c.start).join('')+c.after+Array.from(raw).slice(c.end).join(''));assert.notEqual(entry.arabic_sha256,entry.review.originalArabicSha256);assert.deepEqual(entry.review.arabicCorrections,row.arabicCorrections);assert.match(entry.english_blocks[0],/from ‘Amr ibn Abi ‘Amr, from Sa‘id ibn Abi Sa‘id al-Maqburi/);assert.match(entry.english_status,/recorded Arabic correction/);
 const {source,ledger,files}=collectionFiles(),html=files.get('reader/knowledge-review.html'),inputs=JSON.parse(files.get('reader/knowledge-inputs.json'));assert.equal(inputs.selectedBlocks.find(b=>b.htmlId===c.paragraphId).text,raw);assert(html.includes('Unchanged original digital report')&&html.includes(c.before)&&html.includes(c.after));assert.match(source.license.changes,/only 99 have declared Arabic corrections/);assert.match(ledger.sourceReferences.entries.find(e=>e.number===99).citations[0].scope,/Derived Arabic/);
});
test('correction evidence cannot hide changed originals, uninspected witnesses or fabricated approval',()=>{
 const mutators=[
  r=>r.originalArabicSha256='0'.repeat(64),r=>r.arabicCorrections[0].originalParagraphSha256='0'.repeat(64),r=>r.arabicCorrections[0].correctedParagraphSha256='0'.repeat(64),r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].after+=' نعم',r=>r.arabicCorrections[0].witnesses[0].sourceSha256='0'.repeat(64),r=>r.arabicCorrections[0].witnesses[0].pdfPage=1,r=>r.arabicCorrections[0].witnesses[0].sourceId='dar-ibn-kathir-2002',r=>r.arabicCorrections[0].witnesses[0].reading='different',r=>r.arabicCorrections[0].independentReview='approved',r=>r.arabicCorrections[0].englishRendering='untranslated name',r=>r.arabicCorrections[0].englishSegmentId='99-2',r=>r.contextNotes=[],r=>r.arabicCorrections.push(structuredClone(r.arabicCorrections[0])),r=>{delete r.arabicCorrections;delete r.originalArabicSha256;}
 ];
 for(const mutate of mutators){const args=input();args[1]=read('content/review/knowledge-fourth-review.json');const row=args[1].entries.find(e=>e.number===99);mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(...args));}
});
test('the actual suffixed English reference stays distinct from the following report and chapter letter',()=>{
 const {ledger}=collectionFiles(),get=n=>ledger.sourceReferences.entries.find(e=>e.number===n).citations.find(c=>c.id==='khan').locator;assert.equal(get(97),'Volume 1, Book 3, Number 97');assert.equal(get(98),'Volume 1, Book 3, Number 97g');assert.equal(get(99),'Volume 1, Book 3, Number 98');assert.equal(get(100),'Volume 1, Book 3, Number 100');
 for(const mutate of [r=>delete r.comparisons[1].referenceEvidence,r=>r.comparisons[1].reference='1.3.97h',r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.comparisons[1].referenceEvidence.sourceSha256='0'.repeat(64),r=>r.comparisons[1].reference='1.2.97g']){const args=input();args[1]=read('content/review/knowledge-fourth-review.json');const row=args[1].entries.find(e=>e.number===98);mutate(row);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(...args));}
});
test('source variants, witness uncertainty and the closing transmission chains remain complete',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),segments=n=>sourceSegments(get(n),'english');assert.match(get(97).english_blocks[1],/with whom he had intercourse/);assert.equal(segments(97).at(-1).kind,'transmission-note');assert.match(get(97).english_blocks.at(-1),/‘Amir/);
 assert.equal(segments(98).filter(s=>s.kind==='transmission-note').length,2);assert.match(get(98).english_blocks[1],/or ‘Ata’/);assert.match(get(98).english_blocks.at(-1),/Isma‘il/);assert.match(get(100).english_blocks.at(-1),/Al-Firabri/);assert.equal(segments(100).at(-1).kind,'transmission-note');assert.equal(segments(105).filter(s=>s.kind==='transmission-note').length,2);assert.doesNotMatch(get(105).english_blocks.join(' '),/this city/);assert.match(get(105).english_blocks.at(-1),/twice/);
 const chapter=ledger.books.find(b=>b.id==='knowledge').chapters.find(c=>c.id==='chapter-35');assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');
});
test('an abbreviated report links back without copying another report or losing its second chain',()=>{
 const {source,ledger}=collectionFiles(),entry=source.entries.find(e=>e.number===102),context=ledger.sourceReferences.entries.find(e=>e.number===102).contextNotes[0];assert.deepEqual(sourceSegments(entry,'english').map(s=>s.kind),['chain','report','chain','report']);assert.equal(entry.english_blocks[1],'With this same report.');assert.match(entry.english_blocks.at(-1),/Three who have not reached/);assert.equal(context.related[0].number,101);assert.doesNotMatch(entry.english_blocks.join(' '),/And two/);
});
test('nearby warnings keep the different verbs and explicit qualifiers of each selected report',()=>{
 const {source}=collectionFiles(),body=n=>source.entries.find(e=>e.number===n).english_blocks.slice(1).join(' ');for(const n of [106,107,109])assert.doesNotMatch(body(n),/deliberately/);for(const n of [108,110])assert.match(body(n),/deliberately/);assert.match(body(106),/enter the Fire/);assert.doesNotMatch(body(106),/seat/);assert.match(body(109),/what I did not say/);assert.match(body(110),/kunyah/);assert.doesNotMatch(body(110),/Abu al-Qasim/);
 const saved={numbers:[96],cursor:96,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,96),saved);assert.equal(nextSession(source.entries,saved,5).cursor,97);
});
