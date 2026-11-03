import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/forgetfulness-complete-review.json');
const inv=read('content/staging/bukhari-forgetfulness-wikisource/catalog.json'),manifest=read('content/sources/wikisource-forgetfulness/manifest.json'),config=BOOK_CONFIGS.forgetfulness;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),numbers=Array.from({length:14},(_,i)=>1166+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const refs=n=>ledger.sourceReferences.entries.find(e=>e.number===n);
const rehash=e=>{for(const s of e.segments){s.arabicSha256=sha(s.arabic);s.englishSha256=sha(s.english);}e.englishSha256=sha(e.segments.map(s=>s.english).join('\n\n'));delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('Forgetfulness includes all fourteen selected entries, nine chapters and three separate context paragraphs',()=>{
 assert.deepEqual(book.entryNumbers,numbers);assert.equal(book.sourceEntryCount,14);assert.equal(book.chapters.length,9);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),38);assert.deepEqual(review().chapters.flatMap(c=>c.contextIds),['mwEw','mwIw','mwKw']);assert.equal(read('research/forgetfulness-source-audit.json').readerAdmission,false);
});
test('every Arabic span is complete and unchanged, and resealing a truncated or shifted span cannot admit it',()=>{
 for(const e of review().entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);assert.equal(e.segments.map(s=>s.arabic).join(''),original.join(''));assert.deepEqual(get(e.number).arabic_blocks,original);assert.equal(e.arabicCorrections,undefined);}
 for(const mutate of [e=>e.segments.pop(),e=>e.segments[1].start++,e=>e.segments[1].arabic+=' ']){const r=review();mutate(r.entries[0]);rehash(r.entries[0]);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('all explicit honorifics survive the English working translation',()=>{
 for(const e of review().entries){const a=e.segments.map(s=>s.arabic).join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);}
});
test('the shared printed number preserves two identities and explicit narrator attribution',()=>{
 for(const [n,other,part]of[[1170,1171,1],[1171,1170,2]]){const e=review().entries.find(e=>e.number===n);assert(e.additionalCitations.some(c=>c.locator.includes(`Printed reference 1228 · part ${part} of 2`)));assert(refs(n).contextNotes.some(c=>c.related?.some(r=>r.id==='bukhari:'+other)));}
 assert.match(text(1171),/^Sulayman ibn Harb related to us\. Hammad related to us, from Salamah ibn ‘Alqamah/);assert.match(text(1171),/I said to Muhammad/);assert.match(text(1171),/in the two prostrations/);assert.match(text(1171),/not in the hadith of Abu Hurayrah/);assert.doesNotMatch(text(1171),/Prophet|may Allah/);assert(refs(1171).contextNotes.some(c=>c.text.includes('does not present it as a direct saying of the Prophet')));
});
test('1169 retains the complete Sad and Urwah closing account as a separate transmission note',()=>{
 assert.equal(get(1169).presentation.english.at(-1).kind,'transmission-note');assert.match(text(1169),/Is what he says true.*They said, “Yes.”/s);assert.match(get(1169).english_blocks.at(-1),/Sa‘d said.*‘Urwah ibn al-Zubayr.*two rak‘ahs of Maghrib.*speak.*what remained.*two prostrations.*This is what the Prophet/s);
});
test('1170 retains its singular prostration ending without importing the longer account',()=>{
 assert.match(text(1170),/prostrated as he usually prostrated, or longer, then rose\.$/);assert.doesNotMatch(text(1170),/two prostrations|raised his head|little longer/);
});
test('1172 preserves Muhammads named uncertainty and all four closing takbirs',()=>{
 assert.match(text(1172),/two afternoon prayers—Muhammad said: I think it was most likely ‘Asr/);assert.doesNotMatch(text(1172),/‘Isha|price of wood/);assert.equal((get(1172).english_blocks.at(-1).match(/pronounced the takbir/g)||[]).length,4);assert.equal((get(1172).english_blocks.at(-1).match(/or longer/g)||[]).length,2);assert.match(text(1172),/piece of wood.*placed his hand/s);
});
test('1173 retains the alliance and the closing Ibn Jurayj corroboration omitted by the comparison',()=>{
 assert.match(text(1173),/al-Asdi, the ally of Banu ‘Abd al-Muttalib/);assert.equal(get(1173).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(1173).english_blocks.at(-1),'Ibn Jurayj corroborated it, from Ibn Shihab, concerning the takbir.');
});
test('1176 keeps both visits, the actual address and both withdrawal instructions',()=>{
 const t=text(1176);for(const phrase of ['Ibn Wahb related to me','‘Amr informed me','I used to strike people','They sent me back to Umm Salamah','O daughter of Abu Umayyah','‘Abd al-Qays','draw back from him','she drew back from him'])assert(t.includes(phrase),phrase);assert.doesNotMatch(t,/wait for him|daughter of Banu|my house/);
});
test('1177 retains the companions, unnumbered row, plural hands, repeated glorification and final reply',()=>{
 const t=text(1177);assert.match(t,/with some people to reconcile them/);assert.match(t,/raised his hands/);assert.doesNotMatch(t,/first row|How dare/);assert.equal((t.match(/Glory be to Allah/g)||[]).length,2);assert.match(t,/son of Abu Quhafah.*in front of the Messenger/s);
});
test('1178 keeps the original dotted spelling with its notice and 1179 keeps singular transmission',()=>{
 assert(get(1178).arabic_blocks[0].includes('دخلت علي عائشة'));assert(refs(1178).contextNotes.some(c=>c.label==='An original spelling retained'));assert.match(text(1178),/She said with her head—that is, “Yes.”/);assert.match(text(1179),/Malik related to me/);assert.match(text(1179),/When he bows, bow, and when he rises, rise/);assert.doesNotMatch(text(1179),/head|verdict|\*/);
});
test('damaged comparisons remain bound to inspected bodies and cannot be promoted by resealing',()=>{
 for(const n of [1168,1170,1171,1172,1176,1177,1179]){const e=review().entries.find(e=>e.number===n),c=e.comparisons[0];assert(validateDamagedBewleyComparison(c,e,config,review().sources));const bad=structuredClone(c);delete bad.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(bad,e,config,review().sources));}
 const r=review(),e=r.entries.find(e=>e.number===1173);e.comparisons[1].checkedBody[1]+=' altered';rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);
});
test('chapter heading differences stay bound to the unchanged historical audit',()=>{
 const r=review(),c=r.chapters.find(c=>c.id==='chapter-03');assert.equal(validateChapterDifferences(c,inv,r).length,1);delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));
});
test('full source notes are available offline while all prior holds and audio coverage remain intact',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='forgetfulness');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957,1104,1115]);assert.equal(read('research/forgetfulness-wording-review.json').reviewSha256,hash(review()));
});
