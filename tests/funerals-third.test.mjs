import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/funerals-third-review.json'),inv=read('content/staging/bukhari-funerals-wikisource/catalog.json'),manifest=read('content/sources/wikisource-funerals/manifest.json'),config=BOOK_CONFIGS.funerals;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='funerals'),numbers=Array.from({length:14},(_,i)=>1210+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};
test('third Funerals batch binds fourteen reports to ten complete source chapters',()=>{
 const r=review();assert.deepEqual(r.entries.map(e=>e.number),numbers);assert.deepEqual(book.entryNumbers.slice(30,44),numbers);assert.equal(book.sourceEntryCount,151);assert(book.chapters.length>=31);assert.equal(r.entries.reduce((n,e)=>n+e.segments.length,0),36);assert.deepEqual(r.chapters.flatMap(c=>c.contextIds),['mwdA']);assert.deepEqual(r.chapters.flatMap(c=>c.entryNumbers),numbers);assert.equal(r.chapters.length,10);assert(!r.entries.some(e=>e.number===1224));
});
test('all Arabic is exact except the disclosed derived 1214 chain link',()=>{
 for(const e of review().entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text),derived=e.number===1214?original.map(t=>t.replace('هشام عن عروة','هشام بن عروة')):original;assert.deepEqual(get(e.number).arabic_blocks,derived);assert.equal(e.segments.map(s=>s.arabic).join(''),derived.join(''));if(e.number!==1214)assert.equal(e.arabicCorrections,undefined);else assert.equal(e.originalArabicSha256,sha(original.join('\n\n')));}
 const r=review(),e=r.entries[0];e.sourceLayout.paragraphs[0].origin.start++;rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));
});
test('1214 correction rejects missing, stale, redirected or silently changed evidence',()=>{
 const mutations=[e=>delete e.originalArabicSha256,e=>e.arabicCorrections[0].originalParagraphSha256='0'.repeat(64),e=>e.arabicCorrections[0].start++,e=>e.arabicCorrections[0].before='عروة',e=>e.arabicCorrections[0].witnesses.pop(),e=>e.arabicCorrections[0].witnesses[0].pdfPage=319,e=>e.arabicCorrections[0].witnesses[1].reading='هشام عن عروة',e=>delete e.contextNotes,e=>e.contextNotes[0].citations=['base'],e=>e.arabicCorrections[0].englishRendering='Hisham from Urwah'];
 for(const mutate of mutations){const r=review(),e=r.entries.find(e=>e.number===1214);mutate(e);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
 const c=review().entries.find(e=>e.number===1214).arabicCorrections[0];assert.equal(c.before,'هشام عن عروة');assert.equal(c.after,'هشام بن عروة');assert.match(text(1214),/Hisham ibn ‘Urwah, from his father/);assert.doesNotMatch(text(1214),/cotton|Yemeni/);
});
test('honorific counts and complete narrator introductions remain exact',()=>{
 for(const e of review().entries){const a=e.segments.map(s=>s.arabic).join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);assert.equal(e.segments[0].kind,'chain');}
 assert.match(text(1210),/Ibn ‘Umar, may Allah Most High be pleased with them both/);assert.match(text(1213),/My father related to me/);assert.match(text(1222),/ibn Muhammad ibn ‘Amr ibn Hazm/);assert.match(text(1222),/who informed him/);
});
test('1210 retains the selected narrator, actions and Quran excerpt endings',()=>{
 const t=text(1210);assert.doesNotMatch(t,/Ibn ‘Abbas|his hand|stand at his grave/);assert.match(t,/‘Umar, may Allah Most High be pleased with him, pulled him/);assert.match(t,/seventy times/);assert(t.endsWith('“And never pray over any of them who dies.”'));
});
test('1211 preserves active removal and light blowing without importing another honorific',()=>{
 const t=text(1211);assert.match(t,/He brought him out, blew lightly onto him with some of his saliva/);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,1);
});
test('1212 distinguishes white cloths and cotton without importing another occurrence',()=>{
 assert.match(text(1212),/three white cotton cloths/);assert.doesNotMatch(text(1212),/Yemeni|Suhuli/);assert.match(text(1213),/three cloths/);assert.doesNotMatch(text(1213),/cotton|Abu ‘Abd Allah said/);
});
test('1215 keeps the alternative man and good things distinct from 1216 good deeds',()=>{
 const t=text(1215);assert.match(t,/Hamzah—or another man better than I/);assert.equal((t.match(/nothing was found in which to shroud him except a burdah/gi)||[]).length,2);assert.match(t,/our good things/);assert.doesNotMatch(t,/good deeds|martyred/);assert.match(text(1216),/our good deeds/);assert.doesNotMatch(text(1216),/another man|I saw him/);
});
test('1216 keeps both narrator asides at the exact role boundaries',()=>{
 const e=get(1216);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','report','transmission-note','report']);assert.equal(e.english_blocks[2],'And I think he said:');assert.equal(e.english_blocks[4],'Or he said:');assert.match(e.english_blocks[3],/this world was opened up to us as it was opened up/);assert.match(e.english_blocks[5],/We were given of this world what we were given/);assert.match(e.english_blocks[5],/until he left the food/);assert.match(e.english_blocks[0],/Ibn Muqatil/);assert.doesNotMatch(e.english_blocks[0],/Muhammad ibn Muqatil/);
});
test('1217 preserves the complete fruit image and both covering clauses',()=>{
 const t=text(1217);assert.match(t,/seeking the Face of Allah/);assert.match(t,/one whose fruit has ripened, and he is plucking it/);assert.match(t,/When we covered his head with it, his feet showed, and when we covered his feet, his head showed/);assert.match(t,/some idhkhir on his feet/);assert.doesNotMatch(t,/vice versa|martyr|lemon grass/);
});
test('1218 keeps its definition, the woman’s singular hand and Sahl’s closing attribution',()=>{
 const e=get(1218);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','report','transmission-note']);assert.equal(e.english_blocks[2],'“Do you know what a burdah is?” They said, “A wrap.” He said, “Yes.”');assert.match(text(1218),/I wove it with my hand and have come to clothe you in it/);assert.equal(e.english_blocks[4],'Sahl said: It became his shroud.');
});
test('1219–1222 preserve qualifications, location and both complete repeated accounts',()=>{
 assert.match(text(1219),/but it was not firmly imposed on us/);assert.match(text(1220),/third day/);assert.match(text(1221),/news of Abu Sufyan’s death came from al-Sham/);assert.match(text(1221),/cheeks and forearms/);const e=get(1222);assert.equal(e.english_blocks.length,3);assert.equal((text(1222).match(/It is not lawful for a woman who believes in Allah and the Last Day/g)||[]).length,2);assert.equal((text(1222).match(/four months and ten days/g)||[]).length,2);assert.match(e.english_blocks[2],/on the pulpit:/);assert.doesNotMatch(e.english_blocks[2],/on the pulpit say/);assert(review().entries.find(e=>e.number===1222).additionalCitations.some(c=>c.locator.includes('1281 / 1282')));
});
test('1223 preserves the recognition note, door and plural doorkeepers',()=>{
 const t=text(1223);assert.match(t,/my calamity.” She did not recognize him/);assert.match(t,/door of the Prophet/);assert.match(t,/found no doorkeepers there/);assert.match(t,/“I did not recognize you.”/);assert(t.endsWith('“Patience is only at the first shock.”'));
});
test('comparison limits, chapter differences and review hashes are independently bound',()=>{
 const r=review();for(const e of r.entries)if(e.comparisons[0].status){assert(validateDamagedBewleyComparison(e.comparisons[0],e,config,r.sources));const c=structuredClone(e.comparisons[0]);c.damageEvidence.bodySha256='0'.repeat(64);assert.throws(()=>validateDamagedBewleyComparison(c,e,config,r.sources));}
 assert.equal(r.chapters.reduce((n,c)=>n+validateChapterDifferences(c,inv,r).length,0),2);const c=r.chapters.find(c=>c.id==='chapter-24');delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));assert.equal(read('research/funerals-third-wording-review.json').reviewSha256,hash(review()));
});
