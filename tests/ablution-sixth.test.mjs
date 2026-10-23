import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {searchEntries} from '../reader/search.mjs';
import {sourceContextHTML} from '../reader/source-references.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-sixth-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('sixth batch preserves all 180 existing entries and every new Arabic source span',()=>{
 const args=input(),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();
 const previous=['opening-revelation-5912c7128a18d9c9','faith-0083b6d6fb2f9a7e','knowledge-9e2c952eba9b7bf3','ablution-d0e576609a3d05d4'].flatMap(p=>read('reader/books/'+p+'.json').entries);
 assert.deepEqual(source.entries.slice(0,180),previous);assert.equal(source.entries.length,297);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:11},(_,i)=>181+i));assert.equal(batch.chapters.length,10);
 for(const e of batch.entries){const r=args[1].entries.find(r=>r.number===e.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),r.segments.map(s=>s.english));assert(!r.arabicCorrections&&!r.arabicSupplements);}
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.entryNumbers.length,110);assert.equal(book.chapters.length,77);
 const inputs=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(inputs.selectedBlocks.length,256);assert.equal(inputs.sourceLayout.originalBlocks.length,251);
});
test('181 retains six separate pairs, timing alternatives and witr without inventing its count',()=>{
 const{source}=collectionFiles(),e=source.entries.find(e=>e.number===181),text=e.english_blocks.join(' '),script=narrationPlan(source).entries.find(e=>e.number===181).script;
 assert.equal((text.match(/two rak‘ahs/g)||[]).length,6);assert.match(text,/a little before it, or a little after it/);assert.match(text,/his face with his hand\./);assert.match(text,/Then he performed witr\./);assert(!text.includes('one rak‘ah'));assert.equal(script,e.english_blocks.join('\n\n'));
});
test('182 preserves three source uncertainty notes at their distinct source positions',()=>{
 const{source}=collectionFiles(),e=source.entries.find(e=>e.number===182),segments=sourceSegments(e,'english');
 assert.equal(segments.filter(s=>s.kind==='transmission-note').length,3);assert(segments.filter(s=>s.kind==='transmission-note').every(s=>s.text==='I do not know which of those Asma’ said.'));
 assert.match(segments[1].text,/false messiah\.$/);assert.match(segments[3].text,/believer—or the one who is certain/);assert.match(segments[5].text,/hypocrite—or the one who doubts/);assert(!e.english_blocks.join(' ').includes('angels'));assert(!e.english_blocks.join(' ').includes('three times'));
 const bad=input(),r=bad[1].entries.find(e=>e.number===182);r.segments.splice(4,1);rehash(r);assert.throws(()=>buildBookBatch(...bad));
});
test('grouped reports, variant wording and closing transmission remain complete in reading, search and scripts',()=>{
 const{source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),plan=narrationPlan(source);
 assert.match(get(185).english_blocks.at(-1),/^And Abu Musa said:/);assert.match(get(186).english_blocks.at(-1),/^And ‘Urwah related from al-Miswar and another/);assert.match(get(188).english_blocks.at(-1),/washed—or rinsed his mouth/);
 assert.deepEqual(sourceSegments(get(189),'english').map(s=>s.kind),['chain','report','transmission-note']);assert.equal(get(189).english_blocks.at(-1),'And Musa related to us. He said: Wuhayb related to us. He said: He wiped his head once.');
 for(const n of [185,186,188,189])assert.equal(plan.entries.find(e=>e.number===n).script,get(n).english_blocks.join('\n\n'));
 assert(searchEntries(source.entries,'He wiped his head once').results.some(r=>r.entry.number===189));
});
test('unresolved translation and the absent English comparison remain explicitly disclosed',()=>{
 const{source,ledger}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),bundle=ledger.sourceReferences,r=input()[1].entries.find(e=>e.number===190),c=r.comparisons[1];
 assert.match(get(187).english_blocks.at(-1),/like a zirr al-hajalah\.$/);assert(!get(187).english_blocks.at(-1).includes('legs'));assert.match(sourceContextHTML(bundle,187),/English rendering remains unresolved/);
 assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['1.4.192','1.4.193']);assert.match(get(190).english_status,/second English comparison is absent/);assert.match(sourceContextHTML(bundle,190,{inDialog:true}),/https:\/\/sunnah.com\/bukhari:193/);
 for(const mutate of [c=>c.checkedReferenceEvidence[0].recordSha256='0'.repeat(64),c=>c.checkedReferenceEvidence.reverse(),c=>c.checkedReferenceEvidence.pop(),c=>c.reference='1.4.192']){const a=input(),row=a[1].entries.find(e=>e.number===190);mutate(row.comparisons[1]);rehash(row);assert.throws(()=>buildBookBatch(...a));}
});
test('chapter introductions and embedded heading statements stay out of sessions and narration',()=>{
 const args=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ablution');assert.deepEqual(args[1].chapters.map(c=>c.id),Array.from({length:10},(_,i)=>'chapter-'+(35+i)));assert.equal(book.chapters.find(c=>c.id==='chapter-40').title,'Chapter');
 for(const id of ['mwzg','mw2Q','mw4g']){const text=args[0].blocks.find(b=>b.htmlId===id).text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));}
 assert.match(book.chapters.find(c=>c.id==='chapter-43').title,/‘Umar performed ablution/);assert(!source.entries.find(e=>e.number===190).english_blocks.join(' ').includes('Christian woman'));
 const saved={numbers:[180],cursor:180,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,191),saved);assert.equal(nextSession(source.entries,saved,5).cursor,181);assert(planSession(source.entries,180,5).numbers.includes(181));assert.deepEqual(planSession(source.entries,297,5).numbers,[297]);assert.equal(nextSession(source.entries,{numbers:[297],cursor:297,ended:true},5),null);
});
test('the first real schema-two expansion keeps all three unaffected book files and existing audio coverage',()=>{
 const{source,ledger}=collectionFiles(),result=buildBooks(source,ledger);
 const paths=['books/opening-revelation-0a534f10d205292c.json','books/faith-ad873aab8759ca02.json','books/knowledge-e3d5ef7956421322.json'];
 for(const path of paths){assert(result.catalog.books.some(b=>b.path===path));assert.equal(result.files.get(path),readFileSync(new URL('../reader/'+path,import.meta.url),'utf8'));}
 assert.notEqual(result.catalog.books.find(b=>b.id==='ablution').path,'books/ablution-bbd47f3cd65faa06.json');assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
