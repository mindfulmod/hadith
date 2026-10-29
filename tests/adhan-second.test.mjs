import {ENTRY_COUNT} from './published-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-second-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('next Adhan chapters retain every digital character and all complete narration segments',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:23},(_,i)=>596+i));assert.equal(batch.chapters.length,17);
 assert.equal(a[1].entries.reduce((n,r)=>n+r.segments.length,0),53);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),ar=r.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks.slice(0,ar.length),ar);assert.deepEqual(r.paragraphIds.map(id=>r.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),ar);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));assert.equal(r.comparisons[1].reference,'1.11.'+(r.number-1));}
 assert.equal(source.entries.length,ENTRY_COUNT);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('chapter quotations remain separate, and ordinary browsing preserves the session',()=>{
 const a=input(),b=buildBookBatch(...a),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='adhan');
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),4);
 for(const c of a[1].chapters){const original=a[0].chapters.find(x=>x.id===c.id);assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.titleArabic,a[0].blocks.find(b=>b.htmlId===c.headingId).text);assert.equal(book.chapters.find(x=>x.id===c.id).sourceContext.introduction.englishStatus,c.contextIds.length?'pending':'not-applicable');}
 const s=startSession(source.entries,600,5);assert.deepEqual(visitSession(s,618),s);assert(!narrationPlan(source).entries.find(e=>e.number===618).script.includes('his mother'));
});
test('the missing 612 closing note has two witnesses, complete narration and visible provenance',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===612),e=buildBookBatch(...a).entries.find(e=>e.number===612),{ledger}=collectionFiles();
 assert.equal(e.arabic_blocks.at(-1),'تابعه علي بن المبارك');assert.equal(e.english_blocks.at(-1),'‘Ali ibn al-Mubarak followed him in transmitting this.');assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');assert.equal(r.arabicSupplements[0].englishComparisons.every(c=>c.status==='omits-note'),true);assert.deepEqual(r.arabicSupplements[0].witnesses.map(w=>w.pdfPage),[167,161]);assert(ledger.sourceReferences.entries.find(x=>x.number===612).contextNotes.some(n=>n.id==='612-printed-note'));assert(!a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text.includes('ابن المبارك'));
});
test('chain switching, written transmission and the narrated question are not flattened',()=>{
 const entries=buildBookBatch(...input()).entries,get=n=>entries.find(e=>e.number===n);
 assert.deepEqual(sourceSegments(get(597),'english').map(s=>s.kind),['chain','chain','report']);assert(get(597).english_blocks[0].includes('from Nafi‘, from Ibn ‘Umar'));assert(get(597).english_blocks[1].startsWith('Another chain: And Yusuf'));assert(get(610).english_blocks[0].includes('Sa‘id ibn al-Musayyab'));assert(get(610).english_blocks[0].includes('and from al-Zuhri, from Abu Salamah'));assert(get(611).english_blocks[0].includes('Yahya wrote to me'));assert.deepEqual(sourceSegments(get(617),'english').map(s=>s.kind),['chain','transmission-note','report']);assert(get(617).english_blocks[1].includes('I asked Thabit al-Bunani'));
});
test('repetition, doubt and conflicting comparison details remain explicit',()=>{
 const rows=input()[1].entries,get=n=>rows.find(r=>r.number===n),text=n=>get(n).segments.map(s=>s.english).join('\n');
 assert.equal((text(603).match(/Wait until it is cooler/g)||[]).length,3);assert.equal((text(601).match(/Between every two calls there is a prayer/g)||[]).length,2);assert(text(598).includes('three times'));assert(text(599).includes('There was no interval'));assert(text(599).includes('There was only a little'));assert(text(599).includes('‘Uthman ibn Jabalah and Abu Dawud'));assert(text(605).includes('I remember—or do not remember'));assert(text(608).includes('I began following his mouth'));assert(text(607).includes('informed him of the prayer'));assert(!text(615).includes('cursing'));assert(text(615).includes('“By Allah, I have not prayed it.”'));assert.equal((text(618).match(/By Him in whose hand is my soul/g)||[]).length,2);assert(get(618).contextNotes[0].citations.includes('commentary-fath-adhan-618'));assert(get(618).notes[0].includes('arrows'));
});
test('admission rejects missing printed evidence, broken boundaries and stale comparisons',()=>{
 for(const mutate of [a=>a[1].entries.pop(),a=>a[1].chapters.splice(2,1),a=>a[1].chapters.find(c=>c.id==='chapter-19').contextIds=[],a=>{const r=a[1].entries[0];r.segments[1].arabic+=' ';rehash(r);},a=>{const r=a[1].entries.find(e=>e.number===612);r.arabicSupplements[0].witnesses.pop();rehash(r);},a=>{const r=a[1].entries.find(e=>e.number===612);r.contextNotes=[];rehash(r);},a=>{const r=a[1].entries.find(e=>e.number===612);r.segments.pop();rehash(r);},a=>{const r=a[1].entries[0];r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);},a=>{const r=a[1].entries[0];r.sourceLayout.paragraphs[0].origin.end--;rehash(r); }]){const a=input();mutate(a);assert.throws(()=>buildBookBatch(...a));}
 const {source,ledger}=collectionFiles(),altered=structuredClone(source);altered.entries.at(-1).english_blocks[1]+=' Extra wording.';assert.throws(()=>buildBooks(altered,ledger));
});
