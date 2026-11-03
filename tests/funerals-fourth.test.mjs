import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/funerals-fourth-review.json'),inv=read('content/staging/bukhari-funerals-wikisource/catalog.json'),manifest=read('content/sources/wikisource-funerals/manifest.json'),config=BOOK_CONFIGS.funerals;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='funerals'),numbers=Array.from({length:15},(_,i)=>1224+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};
test('fourth Funerals batch covers fifteen complete entries and eight complete chapters',()=>{
 const r=review();assert.deepEqual(r.entries.map(e=>e.number),numbers);assert.deepEqual(book.entryNumbers.slice(44,59),numbers);assert.equal(book.sourceEntryCount,151);assert(book.chapters.length>=39);assert.equal(r.entries.reduce((n,e)=>n+e.segments.length,0),45);assert.deepEqual(r.chapters.flatMap(c=>c.contextIds),['mwkw','mwpw']);assert.deepEqual(r.chapters.flatMap(c=>c.entryNumbers),numbers);assert.equal(r.chapters.length,8);assert(!r.entries.some(e=>e.number===1239));
});
test('every selected Arabic character and honorific remains without imported names or corrections',()=>{
 for(const e of review().entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);assert.deepEqual(get(e.number).arabic_blocks,original);assert.equal(e.segments.map(s=>s.arabic).join(''),original.join(''));assert.equal(e.arabicCorrections,undefined);const a=original.join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);assert.equal(e.segments[0].kind,'chain');}
 const r=review(),e=r.entries[0];e.sourceLayout.paragraphs[0].origin.start++;rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));
});
test('1224 retains the qualified waterskin simile and restrictive mercy saying',()=>{
 const e=get(1224);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','report']);assert.equal(e.english_blocks[2],'He said: I think he said, “As though it were a worn waterskin.”');assert.match(text(1224),/breath rattling/);assert.match(text(1224),/mercy only on the merciful/);assert.doesNotMatch(text(1224),/Zaynab|Umamah|daughter of mine/);
});
test('1225 keeps qiraf lexical limits outside the quotation and the brief descent command',()=>{
 const t=text(1225);assert.match(t,/did not have intercourse last night/);assert.match(t,/Abu Talhah said, “I.”/);assert.match(t,/“Then go down.” He said: He went down into her grave/);assert.doesNotMatch(t,/with his wife|Umm Kulthum/);assert(review().entries.find(e=>e.number===1225).notes.some(n=>n.includes('sin-related')));
});
test('1226 keeps all three printed accounts, twelve honorifics, three oaths and speaker boundaries',()=>{
 const e=get(1226),t=text(1226);assert.equal(e.english_blocks.length,8);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,12);assert.equal((t.match(/By Allah/g)||[]).length,3);assert.match(t,/used to say some of that/);assert.match(t,/because of some of his family’s weeping/);assert.match(t,/No bearer of a burden bears the burden of another/);assert.match(t,/He makes laugh and makes weep/);assert.match(e.english_blocks[7],/^Ibn Abi Mulaykah said:/);assert.equal(e.presentation.english[2].kind,'transmission-note');assert(review().entries.find(e=>e.number===1226).additionalCitations.some(c=>c.locator.includes('1286 / 1287 / 1288')));assert.doesNotMatch(t,/stabbed/);
});
test('1227 accepts indirect she-heard attribution while rejecting its removal',()=>{
 const t=text(1227);assert.match(t,/who informed him that she heard/);assert.match(t,/wife of the Prophet/);assert.match(t,/had only passed a Jewish woman/);assert.doesNotMatch(t,/grave of a Jewish/);
 const r=review(),e=r.entries.find(e=>e.number===1227),s=e.segments[0];s.english=s.english.replace('she heard','she knew');s.englishSha256=sha(s.english);e.englishSha256=sha(e.segments.map(s=>s.english).join('\n\n'));rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/Reporting verb mismatch/);
});
test('1228 and 1229 retain narrator names, separate sayings and their precise verbs',()=>{
 assert.match(text(1228),/‘Ali ibn Mus-hir/);assert.match(text(1228),/who is al-Shaybani/);assert.match(text(1228),/from Abu Burdah, from his father/);assert.doesNotMatch(text(1228),/stabbed/);assert.equal((text(1229).match(/I heard the Prophet/g)||[]).length,2);assert.match(text(1229),/let him take his seat in the Fire/);
});
test('1230 keeps both full corroborating routes and the wailing versus weeping distinction',()=>{
 const e=get(1230);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','transmission-note']);assert.match(e.english_blocks[2],/‘Abd al-A‘la corroborated him: Yazid ibn Zuray‘ related to us: Sa‘id related to us: Qatadah related to us/);assert.match(e.english_blocks[3],/^And Adam said, from Shu‘bah:/);assert.match(e.english_blocks[1],/wailing/);assert.match(e.english_blocks[3],/weeping/);assert.match(e.english_status,/Both English comparisons contain errors or omissions/);
});
test('split incomplete comparisons reject altered bodies, invented pointers and incomplete or reordered coverage',()=>{
 const mutations=[p=>p[0].checkedBody[1]+=' changed',p=>p[0].damagedExcerpt='not in the checked body',p=>p[0].note='',p=>p[0].referenceEvidence.recordSha256='0'.repeat(64),p=>p[0].referencedReference='2.23.378',p=>p[0].part={index:1,count:2},p=>p[0].segmentIds.pop(),p=>p[1].segmentIds.push(p[0].segmentIds[0]),p=>p.reverse(),p=>p[1].reference='2.23.379',p=>delete p[1].status];
 for(const mutate of mutations){const r=review(),e=r.entries.find(e=>e.number===1230);mutate(e.comparisons[1].splitReferences);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
 const k=review().entries.find(e=>e.number===1230).comparisons[1];assert.deepEqual(k.splitReferences.map(p=>p.reference),['2.23.379','2.23.380']);assert(k.splitReferences.every(p=>p.status==='damaged-comparison'));
});
test('1231 preserves both actions, both alternatives and the complete angel-shading ending',()=>{
 const t=text(1231);assert.equal((t.match(/my people forbade me/g)||[]).length,2);assert.match(t,/daughter of ‘Amr—or the sister of ‘Amr/);assert.match(t,/“Why is she weeping\?”—or, “Let her not weep.”/);assert(t.endsWith('“The angels continued to shade him with their wings until he was lifted away.”'));assert.equal(get(1231).review.sourceLayout!==undefined,true);assert.equal(review().entries.find(e=>e.number===1231).chapterId,'chapter-33');assert.doesNotMatch(t,/martyred/);
});
test('1232, 1235 and 1236 retain the distinct slaps and strikes words with their own full chains',()=>{
 assert.match(text(1232),/who slaps the cheeks/);for(const n of [1235,1236])assert.match(text(n),/who strikes the cheeks/);for(const n of [1232,1235,1236]){assert.match(text(n),/neck openings of garments/);assert.match(text(n),/cry of the Jahiliyyah/);assert.doesNotMatch(text(n),/follows.*customs/);}assert.match(text(1235),/Muhammad ibn Bashshar/);assert.match(text(1236),/‘Umar ibn Hafs/);
});
test('1233 retains the actual narrator, negative-plus-exception construction and closing narrator comment',()=>{
 const e=get(1233),t=text(1233);assert.match(t,/‘Amir ibn Sa‘d ibn Abi Waqqas, from his father/);assert.match(t,/great—or much/);assert.match(t,/seeking thereby the Face of Allah/);assert.match(t,/You will not be left behind and do a righteous deed without thereby increasing in degree and elevation/);assert.equal(e.presentation.english[2].kind,'transmission-note');assert.equal(e.english_blocks[2],'The Messenger of Allah, may Allah bless him and grant him peace, grieved for him because he died in Makkah.');assert.doesNotMatch(t,/‘A’ishah|morsel|long life/);
});
test('1234 discloses the absent pinned comparison and keeps the separate online source distinct',()=>{
 const e=review().entries.find(e=>e.number===1234),k=e.comparisons[1],t=text(1234);assert.equal(k.reference,null);assert.equal(k.status,'not-present-in-checked-sequence');assert.deepEqual(k.checkedReferences,['2.23.383','2.23.384']);assert.match(get(1234).english_status,/One pinned English sequence omits this report/);assert.doesNotMatch(get(1234).english_status,/two English comparison families were inspected|complete English comparison/);assert(e.additionalCitations.some(c=>c.sourceId==='sunnah-funerals-1296'));assert.match(t,/^And al-Hakam ibn Musa said:/);assert.match(t,/woman of his family/);assert.match(t,/respond to her at all/);assert.doesNotMatch(t,/wife|severely|ibn Yazid/);
 for(const mutate of [k=>k.checkedReferences[1]='2.23.385',k=>k.checkedReferenceEvidence[1].recordSha256='0'.repeat(64),k=>k.reference='2.23.384']){const r=review(),e=r.entries.find(e=>e.number===1234);mutate(e.comparisons[1]);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('1234 lexical qualification preserves the historical audit and makes the later correction prominent',()=>{
 const a=read('research/funerals-fourth-wording-addendum.json'),c=a.priorEvidenceClarifications[0];assert.equal(c.id,'1234-lexical-alternative-clarification');assert.equal(c.supersedes.sha256,hash(read(c.supersedes.path)));assert.match(c.finding,/lexical alternative, not proof of an unequivocal transcription error/);const html=readFileSync(new URL('../research/funerals-second-source-review.html',import.meta.url),'utf8');assert(html.includes('id="later-lexical-clarification"'));assert(html.indexOf('id="later-lexical-clarification"')<html.indexOf('<article id="report-1210"'));assert.match(html,/classical commentary records that meaning alongside wailing/);assert.equal(read('research/funerals-fourth-wording-review.json').addendumSha256,hash(a));
});
test('1237 keeps the door gloss and attribution separate without importing doubt or a name',()=>{
 const e=get(1237),t=text(1237);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','report','transmission-note','report']);assert.equal(e.english_blocks[2],'The crack in the door.');assert.equal(e.english_blocks[4],'She stated that he said:');assert.match(t,/Ibn Harithah/);assert.match(t,/they have overcome us/);assert.match(t,/Then cast dust into their mouths/);assert.doesNotMatch(t,/Zayd|she thought|she doubted/);assert.match(text(1238),/reciters were killed/);assert.doesNotMatch(text(1238),/martyred|Qur’an/);
});
test('new chapter differences and wording review remain bound to exact source evidence',()=>{
 const r=review();assert.equal(r.chapters.reduce((n,c)=>n+validateChapterDifferences(c,inv,r).length,0),3);const c=r.chapters.find(c=>c.id==='chapter-32');delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));assert.equal(read('research/funerals-fourth-wording-review.json').reviewSha256,hash(review()));assert.equal(read('research/funerals-fourth-wording-addendum.json').proposedCorrections.length,0);
});
