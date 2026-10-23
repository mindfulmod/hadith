import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ghusl-wikisource/catalog.json'),read('content/review/ghusl-third-review.json'),read('content/sources/wikisource-ghusl/manifest.json'),BOOK_CONFIGS.ghusl];
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);};
test('Ghusl third batch preserves all prior 261 entries, four stable packs and exact source-role coverage',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),args=input(),original=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args);
 const stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95'];
 const previous=[...stable,'ghusl-9ac831861e9b4847'].flatMap(n=>read('reader/books/'+n+'.json').entries);
 assert.deepEqual(source.entries.slice(0,261),previous);assert.equal(source.entries.length,297);assert.deepEqual(args.slice(0,3),original);
 for(const n of stable)assert.equal(published.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.equal(batch.chapters.length,10);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>262+i));
 for(const row of args[1].entries){const entry=batch.entries.find(e=>e.number===row.number);assert.equal(row.segments.map(s=>s.arabic).join(''),entry.arabic_blocks[0]);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('two declared corrections retain their exact original, witnesses and visible source notices',()=>{
 const args=input(),{entries}=buildBookBatch(...args),{files,ledger}=collectionFiles(),inputs=JSON.parse(files.get('reader/ghusl-inputs.json'));
 for(const n of [262,272]){const row=args[1].entries.find(e=>e.number===n),c=row.arabicCorrections[0],original=args[0].blocks.find(b=>b.htmlId===c.paragraphId),entry=entries.find(e=>e.number===n);
  assert.equal(row.originalArabicSha256,digest(original.text));assert.deepEqual(inputs.selectedBlocks.find(b=>b.htmlId===c.paragraphId),original);
  assert(original.text.includes(c.before));assert.equal(entry.arabic_blocks[0],original.text.slice(0,c.start)+c.after+original.text.slice(c.end));assert.equal(c.witnesses.length,2);
  assert(ledger.sourceReferences.entries.find(e=>e.number===n).contextNotes.some(note=>note.id===c.contextNoteId));assert(files.get('reader/ghusl-review.html').includes(c.before));
 }
});
test('corrections refuse lost original evidence, altered print readings and missing notices after rehashing',()=>{
 for(const change of [r=>r.originalArabicSha256='0'.repeat(64),r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].witnesses[0].reading='changed',r=>r.arabicCorrections[0].witnesses[1].pdfPage=1,r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='not in the translation']){const a=input(),row=a[1].entries[0];change(row);rehash(row);assert.throws(()=>buildBookBatch(...a));}
});
test('abbreviated English comparisons disclose their omissions without shortening the Arabic or full English',()=>{
 const {source,ledger}=collectionFiles(),a=input();
 for(const n of [267,272]){const entry=source.entries[n-1],row=a[1].entries.find(e=>e.number===n),ref=ledger.sourceReferences.entries.find(e=>e.number===n);assert.equal(row.comparisons[0].status,'abbreviated-report');assert.match(entry.english_status,/abbreviates/);assert.equal(ref.citations.find(c=>c.id==='bewley').scope,row.comparisons[0].note);}
 assert.match(source.entries[266].english_blocks[1],/then was in ihram in the morning/);assert.match(source.entries[271].english_blocks[1],/handed him a cloth, but he did not take it/);
 for(const change of [c=>c.note='',c=>c.status='approved',c=>c.referencedReference='270']){const args=input(),r=args[1].entries.find(e=>e.number===267);change(r.comparisons[0]);rehash(r);assert.throws(()=>buildBookBatch(...args));}
});
test('interleaved narrator doubt and both closing chains stay in order and in complete narration scripts',()=>{
 const {source}=collectionFiles(),plan=narrationPlan(source),a=source.entries[262],b=source.entries[270];
 assert.deepEqual(a.presentation.english.map(s=>s.kind),['chain','report','transmission-note','report']);assert.match(a.english_blocks[2],/Sulayman said: I do not know/);assert.match(a.english_blocks[3],/^Then he poured/);
 assert.deepEqual(b.presentation.english.map(s=>s.kind),['chain','report','transmission-note','transmission-note']);assert.match(b.english_blocks[2],/‘Abd al-A‘la.*Ma‘mar.*al-Zuhri/);assert.match(b.english_blocks[3],/al-Awza‘i.*al-Zuhri/);
 for(const e of source.entries.slice(261))assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));
});
test('modern print numbering changes do not split selected entry 269 or shift the individually matched EPUB references',()=>{
 const {source}=collectionFiles(),rows=input()[1].entries,e=source.entries[268];
 assert.deepEqual(e.presentation.english.map(s=>s.kind),['chain','report','report']);assert.match(e.english_blocks[2],/one vessel/);
 for(const [number,reference]of [[269,'1.5.272'],[270,'1.5.273'],[271,'1.5.274'],[272,'1.5.275'],[273,'1.5.276']])assert.equal(rows.find(r=>r.number===number).comparisons[1].reference,reference);
 const args=input(),r=args[1].entries.find(e=>e.number===270);r.comparisons[1].reference='1.5.274';rehash(r);assert.throws(()=>buildBookBatch(...args),/pinned-inventory evidence/);
});
test('chapter 10 introduction is separately preserved and excluded from sessions and audio scripts',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ghusl'),chapter=book.chapters.find(c=>c.id==='chapter-10'),original=input()[0].blocks.find(b=>b.htmlId==='mwWA'),inputs=JSON.parse(files.get('reader/ghusl-inputs.json'));
 assert.equal(book.entryNumbers.length,45);assert.equal(book.chapters.length,29);assert.deepEqual(chapter.entryNumbers,[262]);assert.equal(chapter.sourceContext.introduction.arabicParagraphs,1);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');
 assert.deepEqual(inputs.selectedBlocks.find(b=>b.htmlId==='mwWA'),original);assert.equal(inputs.selectedBlocks.length,79);assert(files.get('reader/ghusl-review.html').includes(original.text));assert(source.entries.every(e=>!e.arabic_blocks.includes(original.text)));
 const saved={numbers:[261],cursor:261,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,273),saved);assert.equal(nextSession(source.entries,saved,5).cursor,262);assert.deepEqual(planSession(source.entries,297,5).numbers,[297]);assert.equal(nextSession(source.entries,{numbers:[297],cursor:297,ended:true},5),null);
});
test('context links and lexical uncertainty remain separate from hadith text and scripts',()=>{
 const {source,ledger}=collectionFiles(),plan=narrationPlan(source),refs=ledger.sourceReferences.entries;
 for(const [n,target]of [[264,267],[267,264]]){const note=refs.find(r=>r.number===n).contextNotes[0];assert.deepEqual(note.related,[{id:'bukhari:'+target,number:target,label:'Read Hadith '+target,target:'entry'}]);assert(!plan.entries.find(p=>p.number===n).script.includes(note.text));}
 const row=input()[1].entries.find(e=>e.number===273),original=input()[0].blocks.find(b=>b.htmlId==='mwkw').text;assert.equal(source.entries[272].arabic_blocks[0],original);assert(!row.arabicCorrections);assert(refs.find(r=>r.number===273).citations.some(c=>c.sourceId==='fath-ghusl-right-side'));assert.match(source.entries[272].english_blocks[1],/her right side/);assert.doesNotMatch(source.entries[272].english_blocks[1],/rub|right side of her head/);
});
