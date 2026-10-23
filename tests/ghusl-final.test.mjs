import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {sourceParts,sourceHTML} from '../reader/source-format.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ghusl-wikisource/catalog.json'),read('content/review/ghusl-final-review.json'),read('content/sources/wikisource-ghusl/manifest.json'),BOOK_CONFIGS.ghusl];
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=objectHash(row);};
test('completed Ghusl retains all previous 273 entries and four stable book packs',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a);
 const stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95'];
 const previous=[...stable,'ghusl-b69cf6e20716bdec'].flatMap(n=>read('reader/books/'+n+'.json').entries);
 assert.deepEqual(source.entries.slice(0,273),previous);assert.equal(source.entries.length,351);assert.deepEqual(a.slice(0,3),before);
 for(const n of stable)assert.equal(published.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.equal(batch.chapters.length,10);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:16},(_,i)=>274+i));
 const plan=narrationPlan(source);for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number);assert.equal(row.segments.map(s=>s.arabic).join(''),e.arabic_blocks[0]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('all original source blocks are retained with book/chapter introductions outside numbered sessions',()=>{
 const {source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ghusl'),a=input(),inputs=JSON.parse(files.get('reader/ghusl-inputs.json'));
 assert.equal(book.entryNumbers.length,45);assert.equal(book.chapters.length,29);assert.deepEqual(inputs.selectedBlocks,a[0].blocks);assert.equal(inputs.selectedBlocks.length,79);
 for(const [chapterId,bid]of [['chapter-20','mwlg'],['chapter-24','mwuA']]){const c=book.chapters.find(c=>c.id===chapterId),b=a[0].blocks.find(b=>b.htmlId===bid);assert.equal(c.sourceContext.introduction.arabicParagraphs,1);assert.equal(c.sourceContext.introduction.englishStatus,'pending');assert(files.get('reader/ghusl-review.html').includes(b.text));assert(source.entries.every(e=>!e.arabic_blocks.includes(b.text)));}
 const saved={numbers:[273],cursor:273,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,289),saved);assert.equal(nextSession(source.entries,saved,5).cursor,274);assert.deepEqual(planSession(source.entries,351,5).numbers,[351]);assert.equal(nextSession(source.entries,{numbers:[351],cursor:351,ended:true},5),null);
});
test('missing-narrator corrections retain original wording and require matching printed witnesses',()=>{
 const a=input(),{entries}=buildBookBatch(...a),{ledger,files}=collectionFiles();
 for(const n of [287,288]){const row=a[1].entries.find(r=>r.number===n),c=row.arabicCorrections[0],original=a[0].blocks.find(b=>b.htmlId===c.paragraphId),e=entries.find(e=>e.number===n);assert.equal(row.originalArabicSha256,digest(original.text));assert.equal(e.arabic_blocks[0],original.text.slice(0,c.start)+c.after+original.text.slice(c.end));assert.equal(c.witnesses.length,2);assert(ledger.sourceReferences.entries.find(e=>e.number===n).contextNotes.some(note=>note.id===c.contextNoteId));assert(files.get('reader/ghusl-review.html').includes(original.text));}
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.originalArabicSha256='0'.repeat(64),r=>r.arabicCorrections[0].witnesses[0].reading='other',r=>r.arabicCorrections[0].englishRendering='Abu Other',r=>r.contextNotes=[]]){const args=input(),r=args[1].entries.find(r=>r.number===288);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...args));}
});
test('shared EPUB 277 retains two reports and the continuing chain remains a separate link',()=>{
 const a=input(),{source,ledger}=collectionFiles(),rows=a[1].entries.slice(0,2),note=ledger.sourceReferences.entries.find(r=>r.number===275).contextNotes[0];
 assert.deepEqual(rows.map(r=>r.comparisons[1].part),[{index:1,count:2},{index:2,count:2}]);assert(rows.every(r=>r.comparisons[1].reference==='1.5.277'));
 assert.deepEqual(note.related,[{id:'bukhari:274',number:274,label:'See the preceding chain',target:'chain'}]);assert.match(source.entries[274].english_blocks[0],/^And from Abu Hurayrah/);assert.doesNotMatch(source.entries[274].english_blocks[0],/Ishaq/);assert.match(source.entries[274].english_blocks[2],/Ibrahim.*Musa ibn ‘Uqbah.*Safwan.*‘Ata’ ibn Yasar.*Abu Hurayrah/);
 assert(!narrationPlan(source).entries[274].script.includes(note.text));
 const args=input();args[1].entries[1].comparisons[1].part.index=1;rehash(args[1].entries[1]);assert.throws(()=>buildBookBatch(...args),/assigned twice/);
});
test('EPUB forward-only part is pinned and cannot pretend to contain report wording',()=>{
 const a=input(),r=a[1].entries.find(r=>r.number===287),parts=r.comparisons[1].splitReferences;assert.equal(parts[0].status,'forward-reference-only');assert.deepEqual(parts[0].checkedBody,['Narrated Hisham: ','as the following Hadith 290. ']);assert.deepEqual(parts[0].segmentIds,['287-1']);assert.equal(parts[0].continuedByReference,parts[1].reference);
 for(const change of [p=>p[0].checkedBody[1]='as the following Hadith 291. ',p=>p[0].continuedByReference='1.5.291',p=>p[0].segmentIds=['287-3'],p=>p[0].referencedReference='1.5.288',p=>p[0].note='',p=>p[0].status='full-report',p=>p[0].referenceEvidence.recordSha256='0'.repeat(64)]){const args=input(),row=args[1].entries.find(r=>r.number===287);change(row.comparisons[1].splitReferences);rehash(row);assert.throws(()=>buildBookBatch(...args));}
});
test('chains, closing attributions and compiler speech retain their proper roles',()=>{
 const {source}=collectionFiles();assert.deepEqual(source.entries[286].presentation.english.map(s=>s.kind),['chain','chain','report','transmission-note','transmission-note']);assert.match(source.entries[286].english_blocks[1],/al-Hasan, from Abu Rafi‘, from Abu Hurayrah/);assert.match(source.entries[286].english_blocks[4],/Musa.*Aban related to us.*Qatadah related to us.*Al-Hasan informed us/);
 assert.match(source.entries[287].english_blocks[2],/‘Urwah ibn al-Zubayr informed him that Abu Ayyub informed him/);
 assert.match(source.entries[288].english_blocks[0],/My father informed me.*Abu Ayyub informed me.*Ubayy ibn Ka‘b informed me/);assert.equal(source.entries[288].presentation.english.at(-1).kind,'transmission-note');assert.match(source.entries[288].english_blocks.at(-1),/^Abu ‘Abd Allah said:.*disagreement/);assert.match(source.entries[276].english_blocks[2],/Abu ‘Awanah and Ibn Fudayl/);
});
test('witness differences and compiler ambiguity stay disclosed without automatic source changes',()=>{
 const a=input(),{source,ledger}=collectionFiles();for(const n of [279,281,284]){const r=a[1].entries.find(r=>r.number===n),b=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]);assert.equal(source.entries[n-1].arabic_blocks[0],b.text);assert.equal(r.arabicCorrections,undefined);}
 assert.match(source.entries[283].english_blocks[0],/‘Ubayd Allah ibn Abi Ja‘far/);assert.match(source.entries[278].english_blocks[1],/A Muslim/);assert.equal(source.entries[280].english_blocks[1].split('Abu Hirr').length-1,2);
 const note=ledger.sourceReferences.entries.find(r=>r.number===289).contextNotes[0];assert.match(note.text,/another reading/);assert(!narrationPlan(source).entries[288].script.includes(note.text));
});
test('plural honorific gets smaller presentation without changing source or narration words',()=>{
 const e=collectionFiles().source.entries[287],text=e.english_blocks[1],parts=sourceParts(text);assert.equal(parts.map(p=>p.text).join(''),text);assert(parts.some(p=>p.honorific&&p.text==='may Allah Most High be pleased with them'));assert(sourceHTML(text).includes('<span class="honorific">may Allah Most High be pleased with them</span>'));assert(narrationPlan(collectionFiles().source).entries[287].script.includes('may Allah Most High be pleased with them'));
});
