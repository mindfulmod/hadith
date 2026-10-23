import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML,validateSourceStructure} from '../reader/source-structure.mjs';
import {validateSourceReferences,sourceContextHTML} from '../reader/source-references.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {searchEntries} from '../reader/search.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-eighth-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('eighth batch keeps all 208 prior entries and every new Arabic source character',()=>{
 const args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();
 const prior=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-aea3416eeca1c736'].flatMap(p=>read('reader/books/'+p+'.json').entries);assert.deepEqual(source.entries.slice(0,208),prior);assert.equal(source.entries.length,244);assert.deepEqual(args.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:16},(_,i)=>209+i));assert.equal(batch.chapters.length,11);
 for(const e of batch.entries){const r=args[1].entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),r.segments.map(s=>s.english));assert(!r.arabicCorrections&&!r.arabicSupplements);}
 const b=ledger.books.find(b=>b.id==='ablution');assert.equal(b.entryNumbers.length,110);assert.equal(b.chapters.length,77);const x=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(x.selectedBlocks.length,256);assert.equal(x.sourceLayout.originalBlocks.length,251);
});
test('218 is an expanded complete chain with separate related accounts and no invented narration',()=>{
 const {source,ledger}=collectionFiles(),e=source.entries.find(e=>e.number===218),html=narrationHTML(e);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain']);assert.deepEqual(sourceSegments(e,'arabic').map(s=>s.kind),['chain']);assert.match(html,/<details class="chain" open>/);assert.match(html,/Complete source entry/);assert(!html.includes('class="narration'));
 assert.equal(e.english_blocks.length,1);assert(!e.english_blocks[0].includes('as above'));assert(!e.english_blocks[0].includes('Bedouin'));assert.match(e.english_status,/without repeating the report body/);
 const context=sourceContextHTML(ledger.sourceReferences,218);assert.match(context,/no report text has been added/);assert.match(context,/#read\/217/);assert.match(context,/#read\/219/);
 assert.equal(narrationPlan(source).entries.find(e=>e.number===218).script,e.english_blocks[0]);assert(searchEntries(source.entries,'I heard Anas ibn Malik').results.some(r=>r.entry.number===218));
});
test('chain-only source declarations cannot bypass original text, printed evidence or visible context requirements',()=>{
 for(const change of [r=>delete r.sourceForm,r=>r.sourceForm.kind='summary',r=>r.sourceForm.arabicSha256='0'.repeat(64),r=>r.sourceForm.sourceRecordId='another',r=>r.sourceForm.witnesses.pop(),r=>r.sourceForm.witnesses[0].sourceSha256='0'.repeat(64),r=>r.sourceForm.witnesses[0].pdfPage=66,r=>r.contextNotes=[],r=>r.contextNotes[0].related=[],r=>r.segments[0].kind='report']){const a=input(),r=a[1].entries.find(e=>e.number===218);change(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const {source}=collectionFiles();for(const change of [e=>delete e.review.sourceForm,e=>delete e.review.sourceForm.arabicSha256,e=>delete e.review.sourceForm.sourceRecordId,e=>e.review.sourceForm.witnesses=[],e=>e.presentation.english[0].kind='report']){const e=structuredClone(source.entries.find(e=>e.number===218));change(e);assert.throws(()=>validateSourceStructure(e));}
 const regular=structuredClone(source.entries.find(e=>e.number===217));for(const lang of ['english','arabic'])regular.presentation[lang].forEach(s=>s.kind='chain');assert.throws(()=>validateSourceStructure(regular),/no narration/);
});
test('source-reference validation refuses a chain-only entry with its explanation or related links removed',()=>{
 const {source,ledger}=collectionFiles();for(const change of [r=>r.contextNotes=[],r=>r.contextNotes[0].related=[],r=>r.contextNotes[0].citations=['base']]){const refs=structuredClone(ledger.sourceReferences);change(refs.entries.find(r=>r.number===218));assert.throws(()=>validateSourceReferences(refs,source.entries,{sourceRecordSha256:objectHash(source)}),/visible evidence note/);}
});
test('the abbreviated English reference is pinned as a backward pointer rather than a complete body',()=>{
 const a=input(),row=a[1].entries.find(e=>e.number===218),c=row.comparisons[1],{ledger}=collectionFiles();assert.equal(c.status,'back-reference-only');assert.equal(c.reference,'1.4.220');assert.equal(c.referencedReference,'1.4.219');assert.match(ledger.sourceReferences.entries.find(r=>r.number===218).citations.find(c=>c.id==='khan').locator,/backward reference only/);
 for(const change of [c=>c.checkedBody[1]='A substituted report.',c=>c.referenceEvidence.recordSha256='0'.repeat(64),c=>c.referencedReference='1.4.221',c=>c.referencedReference='1.4.218',c=>delete c.status,c=>c.checkedBody.pop(),c=>c.part={index:1,count:2}]){const args=input(),r=args[1].entries.find(e=>e.number===218);change(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...args));}
});
test('dual chains, full closing notes and source alternatives remain in reading and scripts',()=>{
 const {source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),plan=narrationPlan(source);
 assert.deepEqual(sourceSegments(get(211),'english').map(s=>s.kind),['chain','chain','report']);assert.match(get(211).english_blocks[1],/^Another chain: He said: And Musaddad/);assert.match(get(213).english_blocks.at(-1),/Madinah or Makkah/);assert.match(get(213).english_blocks.at(-1),/do not dry out—or until they dry out/);assert(!get(213).english_blocks.at(-1).includes('fresh'));
 assert.deepEqual(sourceSegments(get(215),'english').map(s=>s.kind),['chain','report','transmission-note']);assert.match(get(215).english_blocks.at(-1),/Ibn al-Muthanna.*Waki‘.*I heard Mujahid.*guard himself from his urine/s);assert.match(get(217).english_blocks.at(-1),/bucket of water—or a pail of water/);assert.match(get(219).english_blocks.at(-1),/one part of the mosque/);assert(!get(219).english_blocks.at(-1).includes('corner'));
 for(const n of [211,213,215,217,218,219])assert.equal(plan.entries.find(e=>e.number===n).script,get(n).english_blocks.join('\n\n'));
});
test('220 and 221 retain separate exact spans of their shared original and distinct water wording',()=>{
 const args=input(),rows=args[1].entries.filter(e=>[220,221].includes(e.number)),blocks=rows.map(r=>args[0].blocks.find(b=>b.htmlId===r.paragraphIds[0])),{source,files}=collectionFiles();assert.deepEqual(rows.map(r=>r.paragraphIds[0]),['mwAVQ@0-159','mwAVQ@159-390']);assert.equal(blocks[0].origin.end,blocks[1].origin.start);assert.equal(blocks[0].origin.blockId,blocks[1].origin.blockId);assert.equal(blocks.map(b=>b.text).join(''),JSON.parse(files.get('reader/ablution-inputs.json')).sourceLayout.originalBlocks.find(b=>b.htmlId==='mwAVQ').text);
 assert.match(source.entries.find(e=>e.number===220).english_blocks[0],/Mother of the Believers/);assert.match(source.entries.find(e=>e.number===221).english_blocks.at(-1),/sprinkled it, without washing it/);
});
test('numbered sessions retain the abbreviated entry while chapter material, stable books and audio stay separate',()=>{
 const args=input(),{source,ledger,files}=collectionFiles(),saved={numbers:[208],cursor:208,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,224),saved);assert.equal(nextSession(source.entries,saved,5).cursor,209);assert(planSession(source.entries,217,5).numbers.includes(218));assert.equal(planSession(source.entries,218,5).numbers[0],218);assert.deepEqual(planSession(source.entries,244,5).numbers,[244]);assert.equal(nextSession(source.entries,{numbers:[244],cursor:244,ended:true},5),null);
 const chapter=args[1].chapters.find(c=>c.id==='chapter-56'),text=args[0].blocks.find(b=>b.htmlId===chapter.contextIds[0]).text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));
 const built=buildBooks(source,ledger);for(const path of ['books/opening-revelation-0a534f10d205292c.json','books/faith-ad873aab8759ca02.json','books/knowledge-e3d5ef7956421322.json'])assert.equal(built.files.get(path),readFileSync(new URL('../reader/'+path,import.meta.url),'utf8'));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
