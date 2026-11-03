import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/actions-prayer-complete-review.json'),inv=read('content/staging/bukhari-actions-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-actions-prayer/manifest.json'),config=BOOK_CONFIGS['actions-prayer'];
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),numbers=Array.from({length:26},(_,i)=>1140+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{for(const s of e.segments){s.arabicSha256=sha(s.arabic);s.englishSha256=sha(s.english);}e.englishSha256=sha(e.segments.map(s=>s.english).join('\n\n'));delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('Actions during Prayer covers all selected reports and keeps six comments and its context-only chapter separate',()=>{
 assert.deepEqual(book.entryNumbers,numbers);assert.equal(book.sourceEntryCount,26);assert.equal(book.chapters.length,18);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),70);
 assert.deepEqual(book.chapters.find(c=>c.id==='chapter-13').entryNumbers,[]);assert.equal(review().chapters.flatMap(c=>c.contextIds).length,6);
 assert.deepEqual(read('research/actions-prayer-wording-review.json').printedMapping.flatMap(r=>r.printedReferences),Array.from({length:26},(_,i)=>1198+i));assert.equal(read('research/actions-prayer-source-audit.json').readerAdmission,false);
});
test('all complete Arabic spans match the pinned source apart from the single declared conjunction choice',()=>{
 for(const e of review().entries){const originals=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text),derived=deriveArabicBlocks(e,originals,review().sources);assert.equal(e.segments.map(s=>s.arabic).join(''),derived.join(''));assert.deepEqual(get(e.number).arabic_blocks,derived);if(e.number!==1153)assert.deepEqual(derived,originals);}
 for(const mutate of [e=>e.segments.pop(),e=>e.segments[1].start++,e=>e.segments[1].arabic+=' ']){const r=review();mutate(r.entries[0]);rehash(r.entries[0]);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('the 1153 reading choice needs both prints, an unchanged original, visible notice and matching English',()=>{
 const e=review().entries.find(e=>e.number===1153),c=e.arabicCorrections[0],original=inv.blocks.find(b=>b.htmlId===e.paragraphIds[0]).text;
 assert.equal(c.before,'أو سبع غزوات و');assert.equal(c.after,'أو سبع غزوات أو ');assert.equal(e.originalArabicSha256,sha(original));assert.match(text(1153),/six expeditions or seven expeditions or eight/);assert(get(1153).arabic_blocks[0].includes('أو سبع غزوات أو ثمان'));
 for(const mutate of [e=>e.arabicCorrections[0].witnesses.pop(),e=>e.arabicCorrections[0].witnesses[0].reading='و',e=>e.originalArabicSha256='0'.repeat(64),e=>e.contextNotes=[],e=>e.arabicCorrections[0].englishSegmentId='1153-1']){const r=review(),x=r.entries.find(e=>e.number===1153);mutate(x);rehash(x);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('every honorific and the repeated night-prayer pairs remain complete without an invented Witr count',()=>{
 for(const e of review().entries){const a=e.segments.map(s=>s.arabic).join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);}
 assert.equal((text(1140).match(/two rak‘ahs/g)||[]).length,6);assert.match(text(1140),/midnight, or a little before it, or a little after it/);assert.match(text(1140),/right ear/);assert.match(text(1140),/two light rak‘ahs/);assert.doesNotMatch(text(1140),/one rak‘ah|\(2\)/);
});
test('the second 1141 route stays complete and its exact same-as English pointer cannot claim a report body',()=>{
 assert.deepEqual(get(1141).presentation.english.map(s=>s.kind),['chain','report','chain']);assert.match(get(1141).english_blocks[2],/Ibn Numayr.*Ishaq ibn Mansur al-Saluli.*Huraym ibn Sufyan.*something similar to it/s);
 const p=review().entries[1].comparisons[1].splitReferences[1];assert.equal(p.status,'same-as-reference-only');assert.equal(p.referencedReference,'2.22.290');assert.deepEqual(p.segmentIds,['1141-3']);
 for(const mutate of [p=>p.referencedReference='2.22.292',p=>p.referencedReferenceEvidence.recordSha256='0'.repeat(64),p=>p.checkedBody[1]='the same as No. 292. from the Prophet ',p=>p.segmentIds=['1141-2'],p=>p.continuedByReference='2.22.292',p=>delete p.status]){const r=review(),e=r.entries[1];mutate(e.comparisons[1].splitReferences[1]);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('known English omissions and new wording differences remain bound to their exact inspected source bodies',()=>{
 for(const n of [1140,1141,1144,1147,1148,1152,1153,1154,1155,1156,1158,1160,1161,1164]){const e=review().entries.find(e=>e.number===n),c=e.comparisons[0];assert(validateDamagedBewleyComparison(c,e,config,review().sources));const bad=structuredClone(c);delete bad.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(bad,e,config,review().sources));}
 const r=review(),e=r.entries.find(e=>e.number===1152);e.comparisons[1].checkedBody[1]+=' altered';rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);
});
test('Jurayj retains all three calls and replies, the selected opening attribution and the separate descent',()=>{
 assert.match(text(1148),/^And al-Layth said: Ja‘far related to me/);assert.equal((text(1148).match(/O Jurayj!/g)||[]).length,3);assert.equal((text(1148).match(/O Allah, my mother and my prayer!/g)||[]).length,3);assert.match(text(1148),/faces of prostitutes/);assert.match(text(1148),/She said, “By Jurayj.” He came down from his hermitage/);assert.match(text(1148),/O baby, who is your father/);
});
test('the complete al-Nadr note and forgiveness request remain separate without unreviewed vocalization',()=>{
 assert.match(text(1152),/My Lord, forgive me and grant me/);assert.match(text(1152),/Sulayman, peace be upon him/);assert.equal(get(1152).presentation.english.at(-1).kind,'transmission-note');const note=get(1152).english_blocks.at(-1);assert.match(note,/al-Nadr ibn Shumayl/);assert.match(note,/“فذعته”, with the letter dhal/);assert.match(note,/correct form is “فدعته”/);assert.match(note,/‘ayn and the ta doubled/);
});
test('the unabridged 1155 sentence and both directional prohibitions in 1156 remain',()=>{
 assert.match(text(1155),/Allah is before each of you/);assert.match(text(1155),/must not spit.*or he said.*must not expectorate/s);assert.match(get(1155).english_blocks.at(-1),/^Ibn ‘Umar.*When one of you spits/s);assert.match(text(1156),/not spit in front of him or to his right, but to his left, beneath his left foot/);
});
test('the two Sahl reports preserve their different row and hand wording and keep his aside identifiable',()=>{
 assert.match(text(1143),/first row/);assert.match(text(1143),/raised his hands/);assert.match(text(1160),/pronounced the takbir for the people/);assert.doesNotMatch(text(1160),/the people said Takbir|first row|raised his hands/);assert.match(text(1160),/raised his hand/);for(const n of [1143,1160])assert(get(n).presentation.english.some(s=>s.kind==='transmission-note'));assert.match(text(1160),/son of Abu Quhafah.*in front of the Messenger/s);
});
test('closing routes, singular transmission and evening/night alternatives are not standardized away',()=>{
 assert.match(get(1161).english_blocks.at(-1),/^Hisham and Abu Hilal said, from Ibn Sirin, from Abu Hurayrah, from the Prophet/);assert.match(text(1162),/^‘Amr ibn ‘Ali related to me/);assert.equal(review().entries.find(e=>e.number===1162).arabicCorrections,undefined);assert.match(text(1163),/‘Umar—he is Ibn Sa‘id/);assert.match(text(1163),/until evening or overnight/);
 assert.match(text(1164),/prostrate twice while seated/);assert.match(get(1164).english_blocks.at(-1),/^Abu Salamah heard it from Abu Hurayrah/);assert.match(text(1165),/last night in the ‘Atamah prayer/);
});
test('all three chapter differences stay bound to their source evidence',()=>{
 for(const id of ['chapter-01','chapter-02','chapter-09']){const r=review(),c=r.chapters.find(c=>c.id===id);assert.equal(validateChapterDifferences(c,inv,r).length,1);delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));}
});
test('new full source notes are saved offline without changing recorded coverage or pending holds',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='actions-prayer');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957,1104,1115]);assert.equal(read('research/actions-prayer-wording-review.json').reviewSha256,hash(review()));
});
