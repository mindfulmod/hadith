import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch} from '../scripts/build-collection.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-fourth-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};
const batch=()=>buildBookBatch(...input());
const get=(b,n)=>b.entries.find(e=>e.number===n);
const text=(b,n)=>get(b,n).english_blocks.join('\n');
test('candidate 632–650 contains complete chapters and exact source and narration coverage',()=>{
 const a=input(),b=buildBookBatch(...a),p=narrationPlan(b);
 assert.deepEqual(b.entries.map(e=>e.number),Array.from({length:19},(_,i)=>632+i));assert.equal(b.chapters.length,9);assert.equal(a[1].entries.reduce((n,r)=>n+r.segments.length,0),53);
 for(const row of a[1].entries){const e=get(b,row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(x=>x.htmlId===id).text);assert.deepEqual(e.arabic_blocks,deriveArabicBlocks(row,original,a[1].sources));assert.deepEqual(row.paragraphIds.map(id=>row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),e.arabic_blocks);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(p.entries.find(x=>x.number===row.number).script,e.english_blocks.join('\n\n'));assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join('').match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(row.comparisons[1].reference,`1.11.${row.number}`);}
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),1);const c=b.chapters.find(c=>c.id==='chapter-42');assert.deepEqual(c.entryNumbers,[640,641,642]);assert.equal(c.sourceContext.introduction.englishStatus,'pending');
 assert(!p.entries.some(e=>e.script.includes('Abu al-Darda')));assert(b.entries.every(e=>e.audio_status==='No recording yet.'));
});
test('632 retains both routes, their distinct names and all closing transmission notices',()=>{
 const b=batch(),t=text(b,632);assert.deepEqual(sourceSegments(get(b,632),'english').map(s=>s.kind),['chain','report','chain','report','transmission-note']);
 for(const s of ['‘Abd Allah ibn Malik ibn Buhaynah','‘Abd al-Rahman related to me','I heard a man from al-Azd called Malik ibn Buhaynah','Ghundar and Mu‘adh','Ibn Ishaq said: From Sa‘d, from Hafs, from ‘Abd Allah ibn Buhaynah','Hammad said: Sa‘d informed us, from Hafs, from Malik'])assert(t.includes(s),s);
 assert.equal((t.match(/The dawn prayer as four\?/g)||[]).length,2);assert(t.includes('people gathered around him'));assert(!t.includes('people gathered around the Prophet'));
});
test('633–639 keep questions and secondary reports visible, without inserting later identifications',()=>{
 const b=batch();assert(narrationHTML(get(b,633)).includes('Al-A‘mash was asked'));assert(text(b,633).includes('He nodded yes'));assert(text(b,633).includes('Abu Dawud related part of it from Shu‘bah, from al-A‘mash'));assert(text(b,633).includes('Abu Mu‘awiyah added'));
 const s=sourceSegments(get(b,634),'english');assert(!s.find(x=>x.kind==='report').text.includes('‘Ali'));assert(s.find(x=>x.kind==='transmission-note').text.includes('‘Ali ibn Abi Talib'));
 assert(text(b,635).includes('cold, windy night'));assert(text(b,635).includes('cold, rainy night'));assert(text(b,637).includes('putting you in hardship'));assert(text(b,637).includes('causing you to incur sin'));assert(narrationHTML(get(b,638)).includes('I asked Abu Sa‘id al-Khudri'));assert(narrationHTML(get(b,639)).includes('family of al-Jarud'));
});
test('638 correction requires exact dual print evidence and a visible notice, preserving the original',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===638),e=get(buildBookBatch(...a),638),original=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
 assert(original.includes('سأل السقف'));assert.equal(e.arabic_blocks[0],original.replace('سأل السقف','سال السقف'));assert.deepEqual(r.arabicCorrections[0].witnesses.map(w=>w.pdfPage),[174,167]);assert(e.english_blocks[2].includes('the roof leaked'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.contextNotes=[],r=>r.arabicCorrections[0].witnesses[0].reading='سأل السقف',r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].englishRendering='the roof fell']){const z=input(),row=z[1].entries.find(e=>e.number===638);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...z));}
});
test('642 and 650 preserve supplementary chains; lexical choices and repetitions stay explicit',()=>{
 const b=batch(),t=text(b,642);assert.deepEqual(sourceSegments(get(b,642),'english').map(s=>s.kind),['chain','report','transmission-note','chain','report','transmission-note']);assert(t.includes('while he could hear the imam'));assert(!t.includes('even if he heard'));assert(t.includes('Zuhayr and Wahb ibn ‘Uthman'));assert(t.includes('Ibrahim ibn al-Mundhir related it from Wahb ibn ‘Uthman, and Wahb is from Madinah'));
 assert(text(b,643).includes('foreleg'));assert(!text(b,643).includes('sheep'));assert(text(b,645).includes('prayer is not my purpose'));assert(input()[1].entries.find(e=>e.number===645).contextNotes.length);assert(text(b,646).includes('The messenger came to him'));assert.equal((text(b,647).match(/he will not make the people hear because of his weeping/g)||[]).length,2);assert(text(b,648).includes('He died that day'));assert(text(b,649).includes('he could not be reached until he died'));
 const last=sourceSegments(get(b,650),'english').at(-1);assert.equal(last.kind,'transmission-note');assert(last.text.includes('Al-Zubaydi, the nephew of al-Zuhri, and Ishaq ibn Yahya al-Kalbi'));assert(last.text.includes('from Hamzah, from the Prophet'));assert(!last.text.includes('his father'));
});
test('candidate validation rejects changed source/comparison identities and incomplete chapter coverage',()=>{
 for(const mutate of [r=>r.sourceLayout.paragraphs[0].origin.start++,r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.segments[0].arabic+=' ',r=>r.segments[0].english=r.segments[0].english.replace('related to us','related to me')]){const a=input(),r=a[1].entries[0];mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const a=input();a[1].entries.splice(1,1);assert.throws(()=>buildBookBatch(...a));const z=input();z[1].chapters[1].entryNumbers=[633];assert.throws(()=>buildBookBatch(...z));
});
