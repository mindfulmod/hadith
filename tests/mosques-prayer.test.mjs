import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {release} from '../reader/release.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/mosques-prayer-complete-review.json'),inv=read('content/staging/bukhari-mosques-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-mosques-prayer/manifest.json'),config=BOOK_CONFIGS['mosques-prayer'];
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),numbers=Array.from({length:8},(_,i)=>1132+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('Mosques section covers every selected report and chapter without splitting already complete printed divisions',()=>{
 assert.deepEqual(book.entryNumbers,numbers);assert.equal(book.sourceEntryCount,8);assert.equal(book.chapters.length,6);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),21);
 for(const n of [1132,1134])assert.equal(source.entries.filter(e=>String(e.number).startsWith(String(n))).length,1);
 assert.deepEqual(read('research/mosques-prayer-wording-review.json').printedMapping.flatMap(r=>r.printedReferences),Array.from({length:10},(_,i)=>1188+i));
 assert.equal(read('research/mosques-prayer-source-audit.json').readerAdmission,false);
});

test('complete Arabic spans equal the selected source except the single declared duplicate-word correction',()=>{
 const r=review();for(const e of r.entries){const originals=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text),derived=deriveArabicBlocks(e,originals,r.sources);assert.equal(e.segments.map(s=>s.arabic).join(''),derived.join(''));assert.deepEqual(get(e.number).arabic_blocks,derived);if(e.number!==1132)assert.deepEqual(derived,originals);}
 for(const mutate of [e=>e.segments.pop(),e=>e.segments[1].start++,e=>e.segments[1].arabic+=' ']){const bad=review();mutate(bad.entries[0]);rehash(bad.entries[0]);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});

test('the 1132 correction requires the unchanged original, two matching print witnesses, a visible notice and its English span',()=>{
 const r=review(),e=r.entries[0],original=inv.blocks.find(b=>b.htmlId===e.paragraphIds[0]).text;assert(original.includes('قال: قال:'));assert.equal(e.originalArabicSha256,sha(original));assert.equal(e.arabicCorrections.length,1);assert.equal(e.arabicCorrections[0].before,'قال: قال');assert.equal(e.arabicCorrections[0].after,'قال');assert(!get(1132).arabic_blocks[0].includes('قال: قال:'));assert.doesNotMatch(text(1132),/He said: He said:/);
 for(const mutate of [e=>e.arabicCorrections[0].witnesses.pop(),e=>e.arabicCorrections[0].witnesses[0].reading='قال قال',e=>e.originalArabicSha256='0'.repeat(64),e=>e.contextNotes=e.contextNotes.filter(n=>n.id!=='1132-repeated-said'),e=>e.arabicCorrections[0].englishSegmentId='1132-4']){const bad=review();mutate(bad.entries[0]);rehash(bad.entries[0]);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});

test('two complete routes retain the unfinished Abu Said introduction and point separately to his later four statements',()=>{
 assert.deepEqual(get(1132).presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.match(get(1132).english_blocks[1],/relate four things.*twelve expeditions/s);assert.doesNotMatch(get(1132).english_blocks[1],/woman|fasting|holy battles|following narrative/);
 assert.match(get(1132).english_blocks[2],/^Another route: ‘Ali.*Sufyan.*al-Zuhri.*Sa‘id.*Abu Hurayrah/s);assert.equal(review().entries[0].contextNotes[0].related[0].id,'bukhari:1139');
});

test('every source honorific remains represented and paired transmitters and selected attributions remain intact',()=>{
 for(const e of review().entries){const ar=e.segments.map(s=>s.arabic).join(''),en=text(e.number);assert.equal((en.match(/may Allah bless him and grant him peace/g)||[]).length,(ar.match(/ﷺ/g)||[]).length,e.number);assert.equal((en.match(/may Allah Most High be pleased/g)||[]).length,(ar.match(/رضى الله تعالى/g)||[]).length,e.number);}
 assert.match(text(1133),/Zayd ibn Rabah and ‘Ubaydullah ibn Abi ‘Abdullah al-Agharr, from Abu ‘Abdullah al-Agharr/);assert.match(text(1133),/the Prophet/);assert.doesNotMatch(text(1133),/the Messenger/);
});

test('the damaged 1132/1133 English boundary cannot be promoted to a complete comparison or lose its exact evidence',()=>{
 for(const n of [1132,1133,1136,1138]){const row=review().entries.find(e=>e.number===n),c=row.comparisons[0];assert.equal(validateDamagedBewleyComparison(c,row,config,review().sources),true);const bad=structuredClone(c);delete bad.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,review().sources));}
 const bad=review(),row=bad.entries[0];row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config),/pinned record/);
 assert(review().entries[0].additionalCitations.some(c=>c.id==='web-continuation'&&c.locator.includes('1133')));
});

test('Quba reports retain the closing restriction, order differences and complete Ibn Numayr transmission',()=>{
 assert.match(get(1134).english_blocks.at(-1),/my companions.*night or day.*you should not deliberately seek out sunrise or sunset/s);assert.match(text(1134),/behind the Maqam/);assert.doesNotMatch(get(1134).english_blocks[1],/Ibrahim/);assert.doesNotMatch(text(1134),/Dawraqi/);
 assert.match(text(1135),/every Saturday, on foot and riding.*‘Abdullah.*used to do it/s);assert.match(text(1136),/Quba riding and on foot/);assert.equal(get(1136).presentation.english.at(-1).kind,'transmission-note');assert.match(get(1136).english_blocks.at(-1),/^Ibn Numayr added: ‘Ubaydullah related to us, from Nafi‘:.*two rak‘ahs/s);
});

test('grave chapter heading remains distinct from house reports and no basin explanation is inserted',()=>{
 assert.equal(book.chapters.find(c=>c.id==='chapter-05').title,'The merit of the space between the grave and the pulpit');for(const n of [1137,1138])assert.match(text(n),/Between my house and my pulpit/);assert.doesNotMatch(text(1138),/Kawthar|grave|room/);assert.match(text(1138),/my pulpit is upon my basin/);assert.match(text(1138),/^Musaddad related to us, from Yahya, from/);
 const r=review(),c=r.chapters.find(c=>c.id==='chapter-04');assert.equal(validateChapterDifferences(c,inv,r).length,1);delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));
});

test('the final four-statement report retains both hearings, both prayer limits and all three mosque names',()=>{
 assert.equal((text(1139).match(/I heard/g)||[]).length,2);assert.match(text(1139),/mawla of Ziyad/);assert.match(text(1139),/pleased and delighted/);assert.match(text(1139),/for two days.*husband or a mahram.*al-Fitr and al-Adha.*morning prayer until the sun rises.*‘Asr until it sets.*Sacred Mosque, al-Aqsa Mosque and my mosque/s);assert.doesNotMatch(text(1139),/slave|unmarriageable|legal|religious journey/);
});

test('new source notes are saved offline while recorded coverage and unresolved holds remain unchanged',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='mosques-prayer');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957,1104,1115]);assert.equal(read('research/mosques-prayer-wording-review.json').reviewSha256,hash(review()));
});
