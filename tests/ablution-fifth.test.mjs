import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {searchEntries} from '../reader/search.mjs';
import {validateSourceReferences,sourceContextHTML} from '../reader/source-references.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-fifth-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};

test('fifth batch retains every prior entry and all exact new source paragraphs',()=>{
 const args=input(),snapshot=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();assert.deepEqual(args.slice(0,3),snapshot);
 const prior=['opening-revelation-5e0fa92072afc757','faith-9b3863a16f3114b6','knowledge-dcfdc4c22041885b','ablution-1c3632f8d20804db'].flatMap(p=>read('reader/books/'+p+'.json').entries);assert.deepEqual(source.entries.slice(0,167),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:13},(_,i)=>168+i));assert.equal(source.entries.length,309);assert.equal(batch.chapters.length,3);
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.entryNumbers.length,110);assert.equal(book.chapters.length,77);
 for(const e of batch.entries){const r=args[1].entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),r.segments.map(s=>s.english));}
 const inputs=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(inputs.selectedBlocks.length,256);assert.equal(inputs.sourceLayout.originalBlocks.length,251);
});
test('171 and 172 share a comparison reference without merging identities or shifting later references',()=>{
 const args=input(),batch=buildBookBatch(...args),rows=args[1].entries;for(const n of [171,172]){const c=rows.find(r=>r.number===n).comparisons[1];assert.equal(c.reference,'1.4.174');assert.deepEqual(c.part,{index:n-170,count:2});}
 assert.equal(rows.find(r=>r.number===173).comparisons[1].reference,'1.4.175');assert.equal(rows.find(r=>r.number===180).comparisons[1].reference,'1.4.182');assert.notEqual(batch.entries[3].review.sourceRecordId,batch.entries[4].review.sourceRecordId);
 assert.match(batch.entries[4].english_blocks[0],/^And Ahmad ibn Shabib said: My father related to us/);
 for(const change of [r=>delete r.comparisons[1].part,r=>r.comparisons[1].part.index=1,r=>r.comparisons[1].reference='1.4.175']){const a=input(),r=a[1].entries.find(r=>r.number===172);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('complete closing transmissions survive presentation, search and narration',()=>{
 const{source}=collectionFiles(),plan=narrationPlan(source),get=n=>source.entries.find(e=>e.number===n);
 assert.deepEqual(sourceSegments(get(174),'english').map(s=>s.kind),['chain','report','transmission-note']);assert.match(get(174).english_blocks.at(-1),/passing of wind/);
 assert.deepEqual(sourceSegments(get(178),'english').map(s=>s.kind),['chain','report','transmission-note','transmission-note']);assert.match(get(176).english_blocks.at(-1),/Shu‘bah related it from al-A‘mash/);assert.match(get(178).english_blocks.at(-1),/Abu ‘Abdullah.*Ghundar and Yahya.*did not say “ablution\.”/);
 for(const n of [174,176,178])assert.equal(plan.entries.find(e=>e.number===n).script,get(n).english_blocks.join('\n\n'));
 assert(searchEntries(source.entries,'Ghundar and Yahya').results.some(r=>r.entry.number===178));
});
test('chapter introductions remain browse-only while sessions cross the old collection boundary',()=>{
 const args=input(),{source,ledger,files}=collectionFiles(),plan=narrationPlan(source),book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.chapters[0].entryNumbers.length,0);
 assert.deepEqual(args[1].chapters.map(c=>c.entryNumbers),[[168,169,170,171,172,173],[174,175,176,177,178],[179,180]]);
 for(const id of ['mwoA','mwtQ']){const text=args[0].blocks.find(b=>b.htmlId===id).text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));}
 const saved={numbers:[167],cursor:167,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,180),saved);assert.equal(nextSession(source.entries,saved,5).cursor,168);assert(planSession(source.entries,167,5).numbers.includes(168));assert.deepEqual(planSession(source.entries,309,5).numbers,[309]);assert.equal(nextSession(source.entries,{numbers:[309],cursor:309,ended:true},5),null);
 for(const e of source.entries.slice(167))assert.equal(plan.entries.find(r=>r.number===e.number).script,e.english_blocks.join('\n\n'));assert(!plan.entries.find(r=>r.number===174).script.includes('Dhat'));
});
test('related bathing context and witness variants stay visibly separate from source wording',()=>{
 const{source,ledger}=collectionFiles(),bundle=ledger.sourceReferences;validateSourceReferences(bundle,source.entries,{sourceRecordSha256:objectHash(source)});
 for(const n of [177,178]){const e=source.entries.find(e=>e.number===n),html=sourceContextHTML(bundle,n,{inDialog:true});assert.match(html,/Source context · separate from the narration/);assert.match(html,/https:\/\/sunnah.com\/bukhari:293/);assert.match(html,/independent context review is pending/);assert(!e.english_blocks.join(' ').includes('cancel'));assert(!e.english_blocks.join(' ').includes('Book of Bathing'));}
 const e=source.entries.find(e=>e.number===172);assert(e.arabic_blocks.at(-1).includes('تبول'));assert(e.english_blocks.at(-1).includes('urinate'));assert.match(sourceContextHTML(bundle,172),/historical print omits/);
 const bad=structuredClone(bundle);bad.entries.find(e=>e.number===177).citations=bad.entries.find(e=>e.number===177).citations.filter(c=>c.id!=='bathing-293');assert.throws(()=>validateSourceReferences(bad,source.entries,{sourceRecordSha256:objectHash(source)}));
});
test('single-paragraph chain boundaries and existing recordings stay complete',()=>{
 const args=input(),{source,ledger}=collectionFiles();for(const n of [179,180]){const r=args[1].entries.find(e=>e.number===n),e=source.entries.find(e=>e.number===n);assert.equal(e.arabic_blocks.length,1);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report']);assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks[0]);}
 assert.match(source.entries.find(e=>e.number===179).english_blocks[0],/^Muhammad ibn Salam related to me/);assert.match(source.entries.find(e=>e.number===180).english_blocks[0],/informed him that he heard.*relating from/);
 const bad=input(),r=bad[1].entries.at(-1);r.segments[1].start++;rehash(r);assert.throws(()=>buildBookBatch(...bad));
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
