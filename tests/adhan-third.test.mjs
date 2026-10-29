import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {startSession,visitSession,nextSession,resolveSession} from '../reader/session.mjs';
import {makeBackup,parseBackup} from '../reader/backup.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
import {ENTRY_COUNT} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-third-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const numbers=[619,'619b',620,621,622,623,624,625,626,627,628,629,630,631];
const {source,ledger}=collectionFiles(),plan=narrationPlan(source);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Adhan 619–631 preserves the suffixed report, full wording and every source segment',()=>{
 const a=input(),batch=buildBookBatch(...a);
 assert.deepEqual(batch.entries.map(e=>e.number),numbers);assert.equal(batch.chapters.length,8);assert.equal(a[1].entries.reduce((n,r)=>n+r.segments.length,0),35);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),original=r.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text),ar=deriveArabicBlocks(r,original,a[1].sources);assert.deepEqual(e.arabic_blocks,ar);assert.deepEqual(r.paragraphIds.map(id=>r.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),ar);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));assert.equal(r.comparisons[1].reference,'1.11.'+(r.number===619?618:r.number==='619b'?619:r.number));}
 assert.equal(source.entries.length,ENTRY_COUNT);assert.throws(()=>buildBooks(source,ledger,{production:true}));
 const first=batch.entries[0],second=batch.entries[1];assert(first.arabic_blocks[0].startsWith('[619] '));assert(second.arabic_blocks[0].startsWith('[619] '));assert.notEqual(first.review.sourceRecordId,second.review.sourceRecordId);assert.equal(second.review.sourceLayout.sourceReference.occurrence,2);assert.equal(second.review.sourceLayout.referenceMapping.modernPrintReference,'646');assert(first.english_blocks[1].includes('twenty-seven'));assert(second.english_blocks[1].includes('twenty-five'));
});
test('live collection sessions and backups keep 619 and 619b distinct and in order',()=>{
 const s=startSession(source.entries,619,5);assert.deepEqual(s.numbers.slice(0,3),[619,'619b',620]);const moved=visitSession(s,'619b');assert.equal(moved.cursor,'619b');assert.deepEqual(visitSession(moved,1),moved);assert.deepEqual(resolveSession(source.entries,moved,5),moved);assert.equal(nextSession(source.entries,{numbers:[619],cursor:619,ended:true},5).cursor,'619b');assert.equal(nextSession(source.entries,{numbers:['619b'],cursor:'619b',ended:true},5).cursor,620);
 const state=normalizeState({last:'619b',saved:[619,'619b'],finished:['619b'],positions:{619:17,'619b':234},session:moved});assert.deepEqual(parseBackup(JSON.stringify(makeBackup(state))).state,state);assert(read('reader/books/catalog.json').entries.some(e=>e.number==='619b'));assert(!read('reader/audio/catalog.json').coverage.recorded.includes('619b'));
});
test('Madinah restoration has two exact witnesses, visible provenance and unchanged original evidence',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===625),e=buildBookBatch(...a).entries.find(e=>e.number===625),original=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
 assert(!original.includes('المدينة'));assert.equal(e.arabic_blocks[0],original.replace('أن يعروا،','أن يعروا المدينة،'));assert.deepEqual(r.arabicCorrections[0].witnesses.map(w=>w.pdfPage),[170,164]);assert(e.english_blocks[4].includes('leaving Madinah deserted'));assert(ledger.sourceReferences.entries.find(e=>e.number===625).contextNotes.some(n=>n.id==='625-source-correction'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.contextNotes=[],r=>r.arabicCorrections[0].witnesses[0].reading='أن يعروا',r=>r.arabicCorrections[0].englishRendering='an invented place',r=>r.arabicCorrections[0].start++]){const b=input(),row=b[1].entries.find(e=>e.number===625);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...b));}
});
test('attributed comments, secondary chains and chapter material retain their own presentation',()=>{
 const a=input(),b=buildBookBatch(...a),get=n=>b.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n');
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),1);assert.equal(b.chapters[0].sourceContext.introduction.englishStatus,'pending');assert.deepEqual(b.chapters[0].entryNumbers,[619,'619b',620]);assert(!plan.entries.find(e=>e.number===619).script.includes('al-Aswad'));
 assert(text(620).includes('O Allah, bless him.'));assert(!text(620).includes('O Allah, forgive him.'));assert(text(628).includes('O Allah, forgive him.'));assert(text(621).includes('Shu‘ayb said: And Nafi‘ related to me'));assert.deepEqual(sourceSegments(get(625),'english').map(s=>s.kind),['chain','report','transmission-note','chain','report','transmission-note']);assert.equal((text(625).match(/will you not seek reward|Will you not seek reward/g)||[]).length,2);assert.equal((text(625).match(/Mujahid said/g)||[]).length,2);
 assert(text(626).includes('not yet gone out'));assert(!text(626).includes('houses'));assert(text(629).includes('His shade'));assert(!text(629).includes('Throne'));assert(!text(629).includes('intercourse'));assert(text(629).includes('mosques'));assert.deepEqual(sourceSegments(get(630),'english').map(s=>s.kind),['chain','transmission-note','report']);assert(narrationHTML(get(630)).includes('And Anas was asked'));assert(text(631).includes('morning and in the evening'));assert(text(631).includes('morning or the evening'));
});
test('publication refuses missing suffix evidence, changed source origins and incomplete chapter coverage',()=>{
 for(const mutate of [r=>delete r.sourceLayout.referenceMapping,r=>r.sourceLayout.sourceReference.occurrence=1,r=>r.comparisons[0].reference='619',r=>r.printedWitnesses[1].pdfPages=[162],r=>r.segments[1].arabic+=' ',r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64)]){const a=input(),r=a[1].entries.find(e=>e.number==='619b');mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const a=input();a[1].entries.splice(1,1);assert.throws(()=>buildBookBatch(...a));const b=input();b[1].chapters[0].entryNumbers=[619,620];assert.throws(()=>buildBookBatch(...b));
});
