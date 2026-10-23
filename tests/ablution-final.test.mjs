import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {sourceContextHTML} from '../reader/source-references.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-final-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('final Ablution batch preserves all prior 224 entries and every new Arabic character',()=>{
 const args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source}=collectionFiles();
 const prior=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-39a86de9d0261811'].flatMap(p=>read('reader/books/'+p+'.json').entries);
 assert.deepEqual(source.entries.slice(0,224),prior);assert.equal(source.entries.length,250);assert.deepEqual(args.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:20},(_,i)=>225+i));assert.equal(batch.chapters.length,13);
 for(const e of batch.entries){const row=args[1].entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert(!row.arabicCorrections&&!row.arabicSupplements);assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),row.segments.map(s=>s.english));}
});
test('all selected Ablution chapters, source spans and separate introductions are accounted for',()=>{
 const [inventory]=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ablution'),inputs=JSON.parse(files.get('reader/ablution-inputs.json'));
 assert.deepEqual(book.entryNumbers,inventory.records.map(r=>r.number));assert.equal(book.entryNumbers.length,110);assert.equal(book.chapters.length,77);assert.equal(inventory.chapters.length,76);
 const excluded=inventory.blocks.filter(b=>['blank','formatting'].includes(b.role));assert.equal(excluded.length,5);assert(excluded.every(b=>/^(?:\s+|===)$/.test(b.text)));assert.deepEqual(inputs.selectedBlocks.map(b=>b.htmlId),inventory.blocks.filter(b=>!['blank','formatting'].includes(b.role)).map(b=>b.htmlId));assert.equal(inputs.selectedBlocks.length,256);assert.equal(inputs.sourceLayout.originalBlocks.length,251);
 assert.equal(inventory.chapters.flatMap(c=>c.contextIds).length,22);
 for(const c of inventory.chapters){assert(book.chapters.some(v=>v.id===c.id));for(const id of c.contextIds){const text=inventory.blocks.find(b=>b.htmlId===id).text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));}}
});
test('the feminine reporting verb in 225 is preserved and omission remains rejected',()=>{
 const args=input(),row=args[1].entries.find(r=>r.number===225);assert.match(row.segments[0].arabic,/حدثتني فاطمة/);assert.match(row.segments[0].english,/Fatimah related to me/);buildBookBatch(...args);
 row.segments[0].english=row.segments[0].english.replace('Fatimah related to me','Fatimah said');row.segments[0].englishSha256=sha(row.segments[0].english);row.englishSha256=sha(row.segments.map(s=>s.english).join('\n\n'));rehash(row);assert.throws(()=>buildBookBatch(...args),/Reporting verb mismatch/);
});
test('abbreviated split comparisons cannot become full-body claims or lose their exact evidence',()=>{
 const {ledger}=collectionFiles();for(const n of [228,237])assert.match(ledger.sourceReferences.entries.find(r=>r.number===n).citations.find(c=>c.id==='khan').locator,/includes an abbreviated part/);
 for(const [n,change]of [[228,p=>delete p.status],[228,p=>p.checkedBody[1]='A different body.'],[228,p=>p.referencedReference='1.4.231'],[228,p=>p.referencedReferenceEvidence.recordSha256='0'.repeat(64)],[228,p=>p.segmentIds.push('228-2')],[237,p=>delete p.status],[237,p=>p.continuedByReference='1.4.242'],[237,p=>p.status='complete'],[237,p=>p.checkedBody[1]='A full reconstructed report.']]){const a=input(),r=a[1].entries.find(r=>r.number===n);change(r.comparisons[1].splitReferences[0]);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('243 retains its complete source entry while the missing English interval stays explicit',()=>{
 const a=input(),row=a[1].entries.find(r=>r.number===243),{source,ledger}=collectionFiles(),e=source.entries.find(e=>e.number===243);assert.equal(row.comparisons[1].reference,null);assert.deepEqual(row.comparisons[1].checkedReferences,['1.4.246','1.4.247']);assert.match(e.english_status,/absent from the checked sequence/);assert.match(sourceContextHTML(ledger.sourceReferences,243),/An English comparison gap/);assert.match(e.english_blocks[0],/^And ‘Affan said: Sakhr/);assert.match(e.english_blocks.at(-1),/Nu‘aym.*Ibn al-Mubarak.*Usamah.*Nafi‘.*Ibn ‘Umar/);
 row.comparisons[1].checkedReferenceEvidence[0].recordSha256='0'.repeat(64);rehash(row);assert.throws(()=>buildBookBatch(...a),/pinned-inventory evidence/);
});
test('repeated entries keep their own limits, narrator notes and source alternatives',()=>{
 const {source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n);
 assert.deepEqual(sourceSegments(get(226),'english').map(s=>s.kind),['chain','report','transmission-note']);assert.match(get(226).english_blocks.at(-1),/^He said: And my father said:/);assert(!get(226).english_blocks.at(-1).includes('Prophet'));
 assert.match(get(229).english_blocks.at(-1),/^I asked Sulayman/);assert.match(get(230).english_blocks.at(-1),/Then I would see a spot or spots/);
 assert.match(get(233).english_blocks.at(-1),/eat your clarified butter/);assert(!get(234).english_blocks.join(' ').includes('eat your'));assert.match(get(234).english_blocks.at(-1),/Ma‘n said: Malik related to us/);assert.match(ledger.sourceReferences.entries.find(r=>r.number===234).citations.find(c=>c.id==='bewley').scope,/does not repeat the full body/);
 assert.match(get(238).english_blocks.at(-1),/Ibn Abi Maryam related it at greater length/);assert(!get(238).english_blocks[1].includes('praying'));
 const a=input(),r=a[1].entries.find(r=>r.number===234);delete r.comparisons[0].status;rehash(r);assert.throws(()=>buildBookBatch(...a),/explicit status/);
});
test('combined chains, short incipits and the final correction survive both rendering and complete scripts',()=>{
 const {source}=collectionFiles(),plan=narrationPlan(source),get=n=>source.entries.find(e=>e.number===n);
 assert.deepEqual(sourceSegments(get(228),'english').map(s=>s.kind),['chain','chain','report']);assert(!get(228).english_blocks[0].includes('as above'));
 assert.deepEqual(sourceSegments(get(236),'english').map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(get(236).english_blocks[1],'“We are the last, the foremost.”');assert.equal(get(236).english_blocks[2],'And with the same chain, he said:');
 assert.deepEqual(sourceSegments(get(237),'english').map(s=>s.kind),['chain','report','chain','report']);assert.match(get(237).english_blocks[1],/was prostrating…$/);assert.match(get(237).english_blocks.at(-1),/a seventh, but we did not remember him/);assert.match(narrationHTML(get(237)),/Another chain/);
 assert.match(get(244).english_blocks.at(-1),/“And Your Messenger.”.*“No: ‘And Your Prophet whom You sent.’”/);
 for(let n=225;n<=244;n++)assert.equal(plan.entries.find(e=>e.number===n).script,get(n).english_blocks.join('\n\n'));
});
test('chapter/report and shared-report boundaries reconstruct their exact unchanged original paragraphs',()=>{
 const [inventory]=input(),{files}=collectionFiles(),original=JSON.parse(files.get('reader/ablution-inputs.json')).sourceLayout.originalBlocks;
 for(const [id,ids]of [['mwAZM',['mwAZM@0-77','mwAZM@77-198']],['mwAZw',['mwAZw@0-162','mwAZw@162-277']]]){const blocks=ids.map(id=>inventory.blocks.find(b=>b.htmlId===id));assert.equal(blocks[0].origin.end,blocks[1].origin.start);assert.equal(blocks.map(b=>b.text).join(''),original.find(b=>b.htmlId===id).text);}
});
test('completed selected book keeps numbered sessions, stable other books, audio and production gates separate',()=>{
 const {source,ledger}=collectionFiles(),saved={numbers:[224],cursor:224,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,243),saved);assert.equal(nextSession(source.entries,saved,5).cursor,225);assert.deepEqual(planSession(source.entries,250,5).numbers,[250]);assert.equal(nextSession(source.entries,{numbers:[250],cursor:250,ended:true},5),null);
 const built=buildBooks(source,ledger);for(const path of ['books/opening-revelation-0a534f10d205292c.json','books/faith-ad873aab8759ca02.json','books/knowledge-e3d5ef7956421322.json'])assert.equal(built.files.get(path),readFileSync(new URL('../reader/'+path,import.meta.url),'utf8'));
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
