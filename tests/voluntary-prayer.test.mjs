import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {release} from '../reader/release.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8')),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const review=()=>read('content/review/voluntary-prayer-complete-review.json'),inv=read('content/staging/bukhari-voluntary-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-voluntary-prayer/manifest.json'),config=BOOK_CONFIGS['voluntary-prayer'];
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),numbers=Array.from({length:13},(_,i)=>1119+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('Voluntary Prayer accounts for every selected report and chapter without inventing suffix entries',()=>{
 assert.deepEqual(book.entryNumbers,numbers);assert.equal(book.sourceEntryCount,13);assert.equal(book.chapters.length,9);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),39);
 for(const n of [1119,1126,1130])assert.equal(source.entries.filter(e=>String(e.number).startsWith(String(n))).length,1);
 assert.deepEqual(read('research/voluntary-prayer-wording-review.json').printedMapping.flatMap(r=>r.printedReferences),Array.from({length:16},(_,i)=>1172+i));
 assert.equal(read('research/voluntary-prayer-source-audit.json').readerAdmission,false);
});

test('all selected Arabic spans remain complete and altered source spans fail even after rehashing the review record',()=>{
 for(const e of review().entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text).join('');assert.equal(e.segments.map(s=>s.arabic).join(''),original);assert.equal(get(e.number).arabic_blocks.join(''),original);}
 for(const mutate of [e=>e.segments.pop(),e=>e.segments[1].start++,e=>e.segments[1].arabic+=' ']){const bad=review();mutate(bad.entries[0]);rehash(bad.entries[0]);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});

test('source honorifics retain their counts in every complete English report',()=>{
 for(const e of review().entries){const ar=e.segments.map(s=>s.arabic).join(''),en=text(e.number);assert.equal((en.match(/may Allah bless him and grant him peace/g)||[]).length,(ar.match(/ﷺ/g)||[]).length,e.number);assert.equal((en.match(/may Allah Most High be pleased/g)||[]).length,(ar.match(/رضى الله تعالى/g)||[]).length,e.number);}
});

test('the 275t EPUB occurrence cannot be silently replaced by adjacent 275',()=>{
 const row=review().entries.find(e=>e.number===1125),comparison=row.comparisons[1];assert.equal(comparison.reference,'2.21.275t');assert(comparison.referenceEvidence.sourceRecordId.endsWith(':2.21.275t'));
 const bad=review(),e=bad.entries.find(e=>e.number===1125);e.comparisons[1].reference='2.21.275';rehash(e);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));
 assert.match(text(1125),/edge of a mat.*two rak‘ahs.*So-and-so, son of so-and-so, son of Jarud/s);
});

test('documented damaged comparisons stay bound to their exact evidence',()=>{
 for(const row of review().entries){const c=row.comparisons[0];if(c.status!=='damaged-comparison')continue;assert.equal(validateDamagedBewleyComparison(c,row,config,review().sources),true);const bad=structuredClone(c);delete bad.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,review().sources));}
 const bad=review(),row=bad.entries[0];row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config),/pinned record/);
});

test('unnumbered Arabic contexts remain separate and the chapter honorific difference cannot lose its evidence',()=>{
 for(const [id,pid] of [['chapter-05','mwFw'],['chapter-08','mwKg']]){const c=book.chapters.find(c=>c.id===id);assert(c.sourceContext);const p=inv.blocks.find(b=>b.htmlId===pid).text;assert(!source.entries.some(e=>e.arabic_blocks.includes(p)));}
 const r=review(),c=r.chapters.find(c=>c.id==='chapter-08');assert.equal(validateChapterDifferences(c,inv,r).length,1);delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));
});

test('prayer counts, anonymous question, uncertainty and complete closing routes remain distinct',()=>{
 assert.equal((get(1119).english_blocks[1].match(/two rak‘ahs/g)||[]).length,5);assert.match(text(1119),/Musa ibn ‘Uqbah.*with his family.*Kathir ibn Farqad and Ayyub/s);assert.equal(get(1119).presentation.english.at(-1).kind,'transmission-note');
 assert.equal(get(1120).english_blocks[1],'I prayed with the Messenger of Allah, may Allah bless him and grant him peace, eight together and seven together.');assert.match(get(1120).english_blocks[2],/^I said.*delayed Dhuhr.*‘Asr forward.*‘Isha’ forward.*delayed Maghrib.*I think so too/s);
 assert.equal((text(1121).match(/“No.”/g)||[]).length,3);assert.match(text(1121),/I do not think so/);assert.doesNotMatch(text(1123),/always/);assert.match(text(1124),/he is Ibn Farrukh.*until I die/s);
 assert.match(text(1126),/no one would enter.*Hafsah related to me/s);assert.match(text(1127),/Ibn Abi ‘Adi and ‘Amr corroborated/);
});

test('before-Maghrib text retains one written command, the third-time qualifier and separate concluding explanation',()=>{
 assert.equal(get(1128).english_blocks[1],'“Pray before the Maghrib prayer.” On the third time he said, “For whoever wishes.”');assert.equal(get(1128).english_blocks[2],'Out of dislike that people should take it as a sunnah.');assert.equal(get(1128).presentation.english.at(-1).kind,'transmission-note');assert.doesNotMatch(text(1128),/two rak‘ahs/);
 assert.match(text(1129),/‘Uqbah ibn ‘Amir.*Shall I not.*What prevents you now.*Being occupied/s);assert.doesNotMatch(text(1129),/business|trade/);
});

test('the complete Itban account retains its later objection, conditional vow, return and repeated verification',()=>{
 const e=get(1130);assert.equal(e.english_blocks.length,8);assert.match(text(1130),/^Ishaq related to me.*My father related to us/s);assert.match(text(1130),/Mahmud related that/);assert.doesNotMatch(text(1130),/Mahmud claimed|Malik ibn/);
 assert.match(text(1130),/where I liked to pray.*khazir.*people of the neighbourhood/s);assert.equal((text(1130).match(/seeking by that the face of Allah/g)||[]).length,2);assert.match(text(1130),/Abu Ayyub objected.*weighed heavily.*if He kept me safe.*if I found him alive/s);
 assert.match(e.english_blocks.at(-1),/^I returned and entered ihram for a Hajj or an ‘Umrah.*old blind man.*told him who I was.*as he had related it to me the first time\.$/s);
 assert.match(text(1131),/Ayyub and ‘Ubaydullah.*do not make them graves.*‘Abd al-Wahhab corroborated it from Ayyub/s);
});

test('new text and full source notes are offline while recordings and unresolved holds remain unchanged',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='voluntary-prayer');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957,1104,1115]);
 assert.equal(read('research/voluntary-prayer-wording-review.json').reviewSha256,hash(review()));
});
