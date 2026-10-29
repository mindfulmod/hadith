import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-first-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};

test('Adhan opening keeps every original Arabic character, complete English segment and honorific',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:18},(_,i)=>578+i));assert.equal(batch.chapters.length,12);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);assert.deepEqual(row.paragraphIds.map(id=>row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),original);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(plan.entries.find(e=>e.number===row.number).script,e.english_blocks.join('\n\n'));assert.equal(row.comparisons[1].reference,'1.11.'+(row.number-1));assert.equal(row.sourceLayout.sourceRecordId,row.sourceRecordId);}
 assert.equal(source.entries.length,595);assert.equal(ledger.books.length,10);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('Adhan chapter introductions are separately browseable and excluded from numbered sessions and narration',()=>{
 const a=input(),b=buildBookBatch(...a),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='adhan');
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),4);
 for(const c of a[1].chapters){const original=a[0].chapters.find(x=>x.id===c.id);assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.titleArabic,a[0].blocks.find(b=>b.htmlId===c.headingId).text);const context=book.chapters.find(x=>x.id===c.id).sourceContext;assert.equal(context.introduction.englishStatus,c.contextIds.length?'pending':'not-applicable');}
 const s=startSession(source.entries,588,5);assert.equal(s.numbers[0],588);assert.deepEqual(visitSession(s,580),s);assert(s.numbers.every(n=>Number.isInteger(n)&&n>=588));
 assert(!narrationPlan(source).entries.find(e=>e.number===578).script.includes('mockery'));
});
test('the continued 588 account preserves its short reference and links to the earlier chain separately',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===588),b=buildBookBatch(...a).entries.find(e=>e.number===588),{ledger}=collectionFiles();
 assert.deepEqual(sourceSegments(b,'english').map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(b.english_blocks[1],'Something similar.');assert.match(b.english_blocks[2],/some of our brothers related to me/);assert(!b.english_blocks.join(' ').includes('I bear witness'));
 const context=ledger.sourceReferences.entries.find(e=>e.number===588).contextNotes[0];assert.equal(context.related[0].number,587);assert.equal(context.related[0].target,'chain');assert(r.notes[0].includes('612'));
});
test('material comparison disagreements and printed variants remain explicit without modifying Arabic',()=>{
 const a=input(),rows=a[1].entries,get=n=>rows.find(r=>r.number===n),{ledger}=collectionFiles();
 assert(get(591).segments[1].english.endsWith('and it is an obligation.”'));assert(get(591).segments[1].english.includes('better than him'));assert(get(591).notes[0].includes('dispensation/license'));assert(get(591).additionalCitations.some(c=>c.sourceId==='fath-adhan-591'));
 assert(get(593).segments[1].english.includes('remained in place'));assert(get(593).segments[1].english.includes('would pray two'));assert(!get(593).segments[1].english.includes('ordered'));assert(get(593).segments[1].arabic.includes('اعتكف المؤذن'));assert(get(593).notes[0].includes('أذن المؤذن'));
 for(const n of [591,593])assert(ledger.sourceReferences.entries.find(r=>r.number===n).contextNotes.some(c=>c.citations.some(id=>id.startsWith('commentary-'))));
 assert.equal(get(581).segments[0].arabic.includes('محمد بن سلام'),false);assert(get(581).notes[0].includes('Muhammad ibn Salam'));assert.equal(get(585).segments.at(-1).arabic.includes('{ فساء صباح المنذرين'),true);
});
test('repetition, exceptions and narrator speech stay at their own source boundaries',()=>{
 const rows=buildBookBatch(...input()).entries,get=n=>rows.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n');
 assert(text(580).endsWith('except the iqamah.'));assert.equal(sourceSegments(get(582),'english').at(-1).kind,'transmission-note');assert.match(text(582),/Isma‘il said: I mentioned this to Ayyub/);assert.equal(sourceSegments(get(584),'english').at(-1).kind,'transmission-note');assert.match(text(584),/I heard this from the Messenger/);assert.match(text(585),/Allah is greatest! Allah is greatest!/);assert(text(592).endsWith('“Morning has come. Morning has come.”'));assert(text(589).includes('al-Wasilah'));assert(!text(589).includes('Paradise'));
});
test('admission rejects altered source spans, omitted chapters, incomplete ranges and stale comparison provenance',()=>{
 for(const mutate of [a=>a[1].entries.splice(3,1),a=>a[1].chapters.splice(4,1),a=>{const r=a[1].entries[0];r.sourceLayout.paragraphs[0].origin.end--;rehash(r);},a=>{const r=a[1].entries[0];r.segments[0].arabic+=' ';rehash(r);},a=>{const r=a[1].entries[0];r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);},a=>a[1].chapters[0].contextIds=[]]){const a=input();mutate(a);assert.throws(()=>buildBookBatch(...a));}
 const {source,ledger}=collectionFiles(),changed=structuredClone(source);changed.entries.at(-1).english_blocks[1]+=' Added text.';assert.throws(()=>buildBooks(changed,ledger));
});
