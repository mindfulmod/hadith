import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {chapterForNumber} from '../reader/navigation.mjs';
import {searchEntries} from '../reader/search.mjs';
import {validateSourceReferences,sourceContextHTML} from '../reader/source-references.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-fourth-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};

test('fourth Ablution batch retains all previous 155 entries and completes eleven chapters',()=>{
 const args=input(),snapshot=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();assert.deepEqual(args.slice(0,3),snapshot);
 const prior=['opening-revelation-f98429f28fa5027b','faith-87785c8f866db16d','knowledge-684bf917a94a9f9d','ablution-ab5393604863ed2f'].flatMap(p=>read('reader/books/'+p+'.json').entries);assert.deepEqual(source.entries.slice(0,155),prior);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>156+i));assert.equal(batch.chapters.length,11);assert.equal(source.entries.length,180);
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.entryNumbers.length,46);assert.equal(book.chapters.length,35);assert.deepEqual(book.entryNumbers,Array.from({length:46},(_,i)=>135+i));
 const inputs=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(inputs.selectedBlocks.length,133);assert.equal(inputs.sourceLayout.originalBlocks.length,132);
 for(const e of batch.entries)assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),args[1].entries.find(r=>r.number===e.number).segments.map(s=>s.english));
});
test('original Arabic-digit 162 and later 162 remain distinct and independently traceable',()=>{
 const args=input(),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles(),mapped=batch.entries.find(e=>e.number===160),later=batch.entries.find(e=>e.number===162);
 assert(mapped.arabic_blocks[0].startsWith('[١٦٢]'));assert(later.arabic_blocks[0].startsWith('[162]'));assert.notEqual(mapped.review.sourceRecordId,later.review.sourceRecordId);
 assert.equal(mapped.review.sourceLayout.referenceMapping.modernPrintReference,'162');assert.equal(later.review.sourceLayout.sourceReference.occurrence,2);
 const refs=ledger.sourceReferences;validateSourceReferences(refs,source.entries,{sourceRecordSha256:objectHash(source)});
 assert.match(sourceContextHTML(refs,160),/source prints \[١٦٢\].*reader uses 160/s);assert.match(files.get('reader/ablution-review.html'),/===باب الاستجمار وترا===\[١٦٢\]/);
 for(const [q,n]of [['160',160],['162',162],['[١٦٢]',160]])assert.equal(searchEntries(source.entries,q).results[0].entry.number,n);
 for(const change of [r=>r.sourceLayout.sourceReference.label='160',r=>delete r.sourceLayout.referenceMapping,r=>r.comparisons[1].reference='1.4.165',r=>r.printedWitnesses[0].pdfPages=[54]]){const a=input(),r=a[1].entries.find(e=>e.number===160);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('158 retains both linked narrations, the intervening chain and the exact verse fragment',()=>{
 const{source}=collectionFiles(),e=source.entries.find(e=>e.number===158),segments=sourceSegments(e,'english');assert.deepEqual(segments.map(s=>s.kind),['chain','report','chain','report','transmission-note']);
 assert.match(segments[2].text,/Ibrahim.*Salih ibn Kaysan.*Ibn Shihab.*‘Urwah.*Humran/s);assert.match(segments[3].text,/were it not for a verse.*\[next\].*until he offers it/s);assert.match(segments[4].text,/‘Urwah.*clear proofs/);
 assert(!segments[1].text.includes('blew it out'));assert(!e.english_blocks.join(' ').includes('congregational'));assert.equal(narrationPlan(source).entries.find(r=>r.number===158).script,e.english_blocks.join('\n\n'));
});
test('159 retains its omitted comparison clause and provides working evidence links',()=>{
 const{source,ledger}=collectionFiles(),e=source.entries.find(e=>e.number===159),row=ledger.sourceReferences.entries.find(r=>r.number===159);
 assert.match(e.english_blocks.at(-1),/nose.*stones.*odd number/);assert.match(narrationPlan(source).entries.find(r=>r.number===159).script,/odd number/);assert.match(sourceContextHTML(ledger.sourceReferences,159,{inDialog:true}),/checked Bewley.*omits.*final clause/s);
 assert(row.contextNotes[0].citations.every(id=>row.citations.some(c=>c.id===id)));assert(!e.english_blocks.join(' ').includes('comparison'));
 const broken=structuredClone(ledger.sourceReferences);broken.entries.find(r=>r.number===159).contextNotes[0].citations=['bewley-ablution'];assert.throws(()=>validateSourceReferences(broken,source.entries,{sourceRecordSha256:objectHash(source)}));
});
test('165 correction preserves its original paragraph and cannot lose witness or notice evidence',()=>{
 const args=input(),row=args[1].entries.find(e=>e.number===165),{source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===165),original=args[0].blocks.find(b=>b.htmlId==='mwkg').text;
 assert(original.endsWith('عن أم عطية قال:'));assert(e.arabic_blocks[0].endsWith('عن أم عطية قالت:'));assert.equal(row.arabicCorrections[0].after,'قالت');assert(files.get('reader/ablution-review.html').includes(original));assert(ledger.sourceReferences.entries.find(r=>r.number===165).contextNotes.some(n=>n.id==='165-source-correction'));
 for(const change of [r=>r.arabicCorrections[0].start--,r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].englishSegmentId='165-2',r=>r.contextNotes=[]]){const a=input(),r=a[1].entries.find(e=>e.number===165);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('four chapter introductions stay outside numbered sessions and full narration',()=>{
 const args=input(),{source,ledger,files}=collectionFiles(),plan=narrationPlan(source),book=ledger.books.find(b=>b.id==='ablution');assert.equal(chapterForNumber(book,155).id,'chapter-20-print-21');assert.equal(chapterForNumber(book,160).id,'chapter-25');
 const contexts=args[1].chapters.flatMap(c=>c.contextIds);assert.deepEqual(contexts,['mwcw','mwgA','mwhg','mwmQ']);for(const id of contexts){const text=args[0].blocks.find(b=>b.htmlId===id).text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));}
 const saved={numbers:[155],cursor:155,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,167),saved);assert.equal(nextSession(source.entries,saved,5).cursor,156);assert(planSession(source.entries,155,5).numbers.includes(156));assert.deepEqual(planSession(source.entries,180,5).numbers,[180]);
 for(const n of [159,162,163,167]){const e=source.entries.find(e=>e.number===n);assert.equal(plan.entries.find(e=>e.number===n).script,e.english_blocks.join('\n\n'));}
 assert(!plan.entries.find(e=>e.number===163).script.includes('ring'));assert(!plan.entries.find(e=>e.number===167).script.includes('tayammum'));
});
test('narrator alternatives and complete observations remain; prototype status does not grant production approval',()=>{
 const{source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n).english_blocks.join(' ');assert.match(get(161),/Two or three times/);assert.match(get(164),/four things.*four|four things/);assert.match(get(164),/Yemeni.*sandals.*yellow.*crescent.*Tarwiyah.*mount rose with him/s);assert(!get(164).includes('henna'));assert.match(get(166),/I heard my father.*Masruq.*all his affairs/s);assert.match(get(167),/every last one/);
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
