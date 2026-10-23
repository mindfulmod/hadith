import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession} from '../reader/session.mjs';
import {bookView} from '../reader/library.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-menstruation-wikisource/catalog.json'),read('content/review/menstruation-second-review.json'),read('content/sources/wikisource-menstruation/manifest.json'),BOOK_CONFIGS.menstruation];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('second Menstruation batch preserves the previous 297 entries and all five other packs',()=>{
 const {source,ledger}=collectionFiles(),published=buildBooks(source,ledger),stable=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-4012bd796dae0e95','ghusl-1382b7bd3720f4ff'];
 assert.deepEqual(source.entries.slice(0,297),[...stable,'menstruation-5c9d001c4f3d2ff0'].flatMap(n=>read('reader/books/'+n+'.json').entries));assert.equal(source.entries.length,326);
 for(const n of stable)assert.equal(published.files.get('books/'+n+'.json'),readFileSync(new URL('../reader/books/'+n+'.json',import.meta.url),'utf8'));
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('all twelve full reports and thirty segments preserve exact source coverage and narration order',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),plan=narrationPlan(collectionFiles().source);assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:12},(_,i)=>298+i));assert.equal(a[1].entries.flatMap(r=>r.segments).length,30);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),b=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]);assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks[0]);assert.equal(e.arabic_blocks[0],r.number===300?b.text.replace('أنها قال','أنها قالت'):b.text);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,e.english_blocks.join('\n\n'));}
});
test('feminine reporting-verb correction retains the original and refuses stale or incomplete evidence',()=>{
 const a=input(),row=a[1].entries.find(r=>r.number===300),c=row.arabicCorrections[0],original=a[0].blocks.find(b=>b.htmlId===c.paragraphId).text,{source,files,ledger}=collectionFiles();assert.equal(row.originalArabicSha256,digest(original));assert.equal(c.before,'أنها قال');assert.equal(c.after,'أنها قالت');assert.match(source.entries[299].arabic_blocks[0],/أنها قالت\s*:\s*قالت فاطمة/);assert(files.get('reader/menstruation-review.html').includes(original));assert(ledger.sourceReferences.entries.find(r=>r.number===300).contextNotes.some(n=>n.id===c.contextNoteId));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].witnesses[0].reading='أنها قال',r=>r.originalArabicSha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='that he said']){const bad=input(),r=bad[1].entries.find(r=>r.number===300);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...bad));}
});
test('chapter seven introduction is browsable but cannot enter numbered sessions or scripts',()=>{
 const a=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='menstruation'),chapter=book.chapters.find(c=>c.id==='chapter-07'),intro=a[0].blocks.find(b=>b.htmlId==='mwPQ'),plan=narrationPlan(source),state=normalizeState({session:{numbers:[297],cursor:297,ended:false},last:297}),before=structuredClone(state);
 assert.equal(book.chapters.length,30);assert.equal(book.entryNumbers.length,37);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');assert(files.get('reader/menstruation-review.html').includes(intro.text));assert.equal(JSON.parse(files.get('reader/menstruation-inputs.json')).selectedBlocks.length,74);assert(source.entries.every(e=>!e.arabic_blocks.includes(intro.text)));assert(plan.entries.every(e=>!e.script.includes(intro.text)));
 assert(bookView(buildBooks(source,ledger).catalog,state,{mode:'book',book,chapter,page:1}).includes('menstruation-review.html#chapter-07'));assert.deepEqual(state,before);assert.deepEqual(resolveSession(source.entries,state.session,5,309),state.session);assert(planSession(source.entries,298,5).numbers.every(n=>Number.isSafeInteger(n)&&source.entries.some(e=>e.number===n)));
});
test('alternate chains and closing observations retain their source positions and attribution limits',()=>{
 const a=input(),{source}=collectionFiles(),r=a[1].entries.find(r=>r.number===307);assert.deepEqual(r.segments.map(s=>s.kind),['chain','transmission-note','chain','report','transmission-note']);assert.match(r.segments[1].english,/Abu ‘Abd Allah said: “Or Hisham ibn Hassan, from Hafsah/);assert.match(r.segments[2].english,/Umm ‘Atiyyah, from the Prophet/);assert.match(r.segments[4].english,/Hisham ibn Hassan.*Hafsah.*Umm ‘Atiyyah.*Prophet/);
 assert.equal(source.entries[302].presentation.english.at(-1).kind,'transmission-note');assert.match(source.entries[302].english_blocks.at(-1),/^And he stated that.*safflower water/);assert.doesNotMatch(source.entries[302].english_blocks.at(-1),/‘Ikrimah/);assert.equal(source.entries[304].number,305);assert.match(source.entries[304].english_blocks[1],/Mothers of the Believers/);
});
test('repeated dialogue and alternate wording survive while explanatory notes stay outside audio',()=>{
 const {source,ledger}=collectionFiles(),plan=narrationPlan(source),r=source.entries[307].english_blocks[1];assert.equal((r.match(/She said:/g)||[]).length,2);assert.equal((r.match(/He said:/g)||[]).length,3);assert.match(r,/She said: “How\?”/);assert.equal(source.entries[308].presentation.english[2].kind,'transmission-note');assert.equal(source.entries[308].english_blocks[2],'Or he said: “Clean yourself with it.”');
 for(const n of [307,308,309]){const notes=ledger.sourceReferences.entries.find(r=>r.number===n).contextNotes;assert(notes.length);for(const note of notes){assert.match(note.text,/Independent review remains pending/);assert(!plan.entries[n-1].script.includes(note.text));}}
 assert.match(source.entries[306].english_blocks[3],/‘asb garment.*kust azfar/);assert.match(source.entries[297].english_blocks[1],/half a man’s testimony/);
});
test('each English comparison retains its individually checked pinned reference evidence',()=>{
 const a=input();assert.deepEqual(a[1].entries.map(r=>r.comparisons[1].reference),['1.6.301','1.6.302','1.6.303','1.6.304','1.6.305','1.6.306','1.6.307','1.6.308','1.6.309','1.6.310','1.6.311','1.6.312']);
 const bad=input(),r=bad[1].entries[0];r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...bad),/pinned-inventory evidence/);
});
