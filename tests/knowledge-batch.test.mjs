import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,combineBookReviews,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {nextSession,resolveSession,planSession} from '../reader/session.mjs';
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
 const registry=read('content/review/knowledge-batches.json');assert.equal(combineBookReviews(registry,BOOK_CONFIGS.knowledge).entries.length,76);assert.throws(()=>combineBookReviews(registry,BOOK_CONFIGS.faith));
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
 assert.equal(book.sourceEntryCount,76);assert.equal(book.chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,13);
 for(const c of book.chapters){assert.equal(c.sourceContext.notes.path,'knowledge-review.html');assert.equal((html.match(new RegExp('id="'+c.id+'"','g'))||[]).length,1);assert.equal(c.sourceContext.numberedReports,c.entryNumbers.length?'present':'none-in-source');}
 const [inventory]=input(),review=combineBookReviews(read('content/review/knowledge-batches.json'),BOOK_CONFIGS.knowledge),ids=new Set(review.chapters.flatMap(c=>[c.headingId,...c.contextIds]).concat(review.entries.flatMap(e=>e.paragraphIds)));assert.deepEqual(inputs.selectedBlocks,inventory.blocks.filter(b=>ids.has(b.htmlId)));assert(html.includes('Book of Knowledge'));assert(!html.includes('#book/faith'));
});
test('expansion preserves a saved session and starts a new one across Faith to Knowledge without synthetic entries',()=>{
 const {source}=collectionFiles(),saved={numbers:[58],cursor:58,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,58),saved);const next=nextSession(source.entries,saved,5);assert.equal(next.cursor,59);assert(next.numbers.every(n=>Number.isSafeInteger(n)&&n>=59));assert.equal(nextSession(source.entries,{numbers:[67],cursor:67,ended:true},5).cursor,68);assert.equal(nextSession(source.entries,{numbers:[134],cursor:134,ended:true},5),null);
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
 assert.equal(book.chapters.find(c=>c.id==='chapter-26').sourceContext.introduction.arabicParagraphs,1);assert.equal(book.chapters.find(c=>c.id==='chapter-31').sourceContext.introduction.arabicParagraphs,1);assert.equal(book.chapters.length,54);const saved={numbers:[81],cursor:81,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,81),saved);assert.equal(nextSession(source.entries,saved,5).cursor,82);
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

test('fifth Knowledge batch preserves all 110 earlier entries and every new Arabic paragraph',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-fifth-review.json'),batch=buildBookBatch(inventory,review,manifest,config),{source}=collectionFiles();
 const prior=['opening-revelation-bab9b31fb72ea828','faith-c3c654a87ebd6404','knowledge-12912788e9a235d5'].flatMap(name=>read('reader/books/'+name+'.json').entries);assert.deepEqual(source.entries.slice(0,110),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>111+i));assert.deepEqual(batch.chapters.map(c=>c.id),inventory.chapters.slice(39,45).map(c=>c.id));
 for(const e of batch.entries){const row=review.entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('separately numbered English comparison parts remain one selected reader report',()=>{
 const {source,ledger,files}=collectionFiles(),ref=n=>ledger.sourceReferences.entries.find(e=>e.number===n).citations.find(c=>c.id==='khan');
 assert.equal(ref(119).locator,'Volume 1, Book 3, Numbers 119, 120 · separately numbered comparison parts');assert.equal(ref(122).locator,'Volume 1, Book 3, Numbers 123, 124 · separately numbered comparison parts');assert.equal(ref(120).locator,'Volume 1, Book 3, Number 121');assert.equal(ref(121).locator,'Volume 1, Book 3, Number 122');
 assert.equal(source.entries.filter(e=>e.number===119).length,1);assert.equal(source.entries.filter(e=>e.number===122).length,1);assert.match(files.get('reader/knowledge-review.html'),/Numbers 123, 124/);
 const saved={numbers:[110],cursor:110,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,122),saved);assert.equal(nextSession(source.entries,saved,5).cursor,111);
});
test('split references reject stale inventory evidence, missing or duplicate spans and mixed comparison modes',()=>{
 const [inventory,,manifest,config]=input();
 for(const mutate of [c=>c.splitReferences[1].referenceEvidence.recordSha256='0'.repeat(64),c=>c.splitReferences[1].reference='1.3.99999',c=>c.splitReferences[1].reference=c.reference,c=>c.splitReferences[1].segmentIds=[],c=>c.splitReferences[1].segmentIds=['119-2','119-3'],c=>c.splitReferences.reverse(),c=>c.splitReferences.pop(),c=>c.note='',c=>c.part={index:1,count:2},c=>c.status='not-present-in-checked-sequence']){
  const review=read('content/review/knowledge-fifth-review.json'),row=review.entries.find(e=>e.number===119);mutate(row.comparisons[1]);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(inventory,review,manifest,config));
 }
});
test('fifth batch retains narrator uncertainty, phonetic notes and both alternate chains',()=>{
 const {source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),segments=n=>sourceSegments(get(n),'english');
 assert.equal(segments(112).filter(s=>s.kind==='transmission-note').length,2);assert.match(get(112).english_blocks[2],/Abu ‘Abdullah was uncertain/);assert.match(get(112).english_blocks.at(-1),/letter qaf/);assert.match(get(112).english_blocks.at(-2),/Except idhkhir, except idhkhir/);
 assert.match(get(113).english_blocks.at(-1),/Ma‘mar.*Hammam.*Abu Hurayrah/);assert.match(get(115).english_blocks[0],/‘Amr and Yahya ibn Sa‘id/);assert.match(get(117).english_blocks[1],/ghatit, or khatit/);
 assert.match(get(119).english_blocks[1],/both his hands/);assert.match(get(119).english_blocks.at(-1),/or he said.*his hand/);assert.equal(segments(119).at(-1).kind,'transmission-note');
});
test('the complete long report retains its frame, embedded chain and commentary without expanding quotations',()=>{
 const {source}=collectionFiles(),e=source.entries.find(e=>e.number===122),parts=sourceSegments(e,'english');assert.equal(parts.length,12);assert.deepEqual(parts.filter(s=>s.kind==='chain').map(s=>s.block),[0,2]);assert.equal(parts[9].kind,'transmission-note');assert.match(parts[9].text,/more emphatic/);assert.match(parts[1].text,/Nawf/);assert.match(parts.at(-1).text,/May Allah have mercy on Musa/);assert.doesNotMatch(e.english_blocks.join(' '),/do not burden me|hardship in my affair/);
 assert.deepEqual(planSession(source.entries,122,5).numbers,[122,123]);assert.deepEqual(planSession(source.entries,122,10).numbers[0],122);const stored={numbers:[121],cursor:121,ended:false};assert.deepEqual(resolveSession(source.entries,stored,5,122),stored);
 assert.doesNotMatch(source.entries.find(e=>e.number===118).english_blocks[2],/and guidance/);assert.match(source.entries.find(e=>e.number===118).english_blocks[2],/up to His words/);
});

test('final Knowledge batch preserves 122 earlier entries and all new selected Arabic',()=>{
 const [inventory,,manifest,config]=input(),review=read('content/review/knowledge-final-review.json'),batch=buildBookBatch(inventory,review,manifest,config),{source}=collectionFiles();
 const prior=['opening-revelation-da8e44ea84bd3f99','faith-29490c856aa0dad2','knowledge-c1cfa0fcd0611e3f'].flatMap(name=>read('reader/books/'+name+'.json').entries);assert.deepEqual(source.entries.slice(0,122),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>123+i));assert.deepEqual(batch.chapters.map(c=>c.id),inventory.chapters.slice(45).map(c=>c.id));
 for(const e of batch.entries){const row=review.entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('the completed Knowledge book contains every source report and chapter without turning introductions into session stops',()=>{
 const [inventory]=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='knowledge');assert.deepEqual(book.entryNumbers,inventory.records.map(e=>e.number));assert.deepEqual(book.chapters.map(c=>c.id),inventory.chapters.map(c=>c.id));
 assert.equal(book.entryNumbers.length,76);assert.equal(book.chapters.length,54);assert.equal(book.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),13);assert.deepEqual(book.chapters.filter(c=>!c.entryNumbers.length).map(c=>c.id),['chapter-01','chapter-06','chapter-11']);
 const inputs=JSON.parse(files.get('reader/knowledge-inputs.json')),ids=new Set(inventory.chapters.flatMap(c=>[c.headingId,...c.contextIds]).concat(inventory.records.flatMap(e=>e.paragraphIds)));assert.deepEqual(inputs.selectedBlocks,inventory.blocks.filter(b=>ids.has(b.htmlId)));assert.equal(inputs.selectedBlocks.length,177);
 assert.deepEqual(planSession(source.entries,134,5).numbers,[134]);assert.equal(nextSession(source.entries,{numbers:[134],cursor:134,ended:true},5),null);assert(planSession(source.entries,129,5).numbers.includes(130));assert(source.entries.every(e=>Number.isSafeInteger(e.number)));
});
test('a reference-only English record is disclosed without claiming a second complete body comparison',()=>{
 const {source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===127),ref=ledger.sourceReferences.entries.find(e=>e.number===127),c=ref.citations.find(c=>c.id==='khan');assert.match(e.english_status,/one complete English comparison body/);assert.match(e.english_status,/only a backward pointer/);assert.match(c.locator,/Number 129 · reference only; statement body absent/);assert.match(c.scope,/not a second completed/);assert.match(files.get('reader/knowledge-review.html'),/reference only; statement body absent/);assert.match(ref.contextNotes[0].text,/‘Ali’s words/);
});
test('reference-only classification requires exact checked text and cannot be used for a full or fabricated record',()=>{
 const [inventory,,manifest,config]=input();
 for(const mutate of [c=>c.checkedBody[1]+=' extra',c=>c.checkedBody=[],c=>c.referenceEvidence.recordSha256='0'.repeat(64),c=>c.reference='1.3.128',c=>c.note='',c=>c.splitReferences=[],c=>c.part={index:1,count:2},c=>delete c.status]){
  const review=read('content/review/knowledge-final-review.json'),row=review.entries.find(e=>e.number===127);mutate(row.comparisons[1]);delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);assert.throws(()=>buildBookBatch(inventory,review,manifest,config));
 }
});
test('the reading variant, interrupted quotation and Companion statement retain their distinct source roles',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n);assert.match(get(125).english_blocks[1],/they have been given only a little knowledge/);assert.match(get(125).english_blocks.at(-1),/our reading/);assert.equal(sourceSegments(get(125),'english').at(-1).kind,'transmission-note');assert.match(ledger.books.find(b=>b.id==='knowledge').chapters.find(c=>c.id==='chapter-48').title,/You have been given/);assert(ledger.sourceReferences.entries.find(e=>e.number===125).citations.some(c=>c.id==='ibn-hajar-knowledge-125'));
 assert.deepEqual(sourceSegments(get(126),'english').map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);assert.deepEqual(sourceSegments(get(127),'english').map(s=>s.kind),['report','chain']);assert.match(get(127).english_blocks[0],/^‘Ali said:/);assert.doesNotMatch(get(127).english_blocks.join(' '),/Prophet.*said/);
 assert.equal((get(128).english_blocks[1].match(/At your service/g)||[]).length,2);assert.match(get(128).english_blocks[1],/three times/);assert.match(get(129).english_blocks[1],/^It was mentioned to me/);
});
test('the final reports preserve conditional wording, narrator qualifications and both closing chains',()=>{
 const {source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n);assert.match(get(130).english_blocks[1],/said: “If she sees the fluid.”/);assert.equal(sourceSegments(get(130),'english')[2].kind,'transmission-note');assert.match(get(130).english_blocks.at(-1),/right hand/);
 assert.match(get(133).english_blocks[0],/^Qutaybah ibn Sa‘id related to me/);assert.equal(sourceSegments(get(133),'english').at(-1).kind,'transmission-note');assert.match(get(133).english_blocks.at(-1),/I did not grasp this/);assert.match(get(134).english_blocks[0],/Nafi‘.*and from al-Zuhri, from Salim/);assert.match(get(134).english_blocks.at(-1),/below the ankles/);
});
