import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {validatePrintedReportRows} from '../scripts/printed-reports.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/funerals-second-review.json'),inv=read('content/staging/bukhari-funerals-wikisource/catalog.json'),manifest=read('content/sources/wikisource-funerals/manifest.json'),config=BOOK_CONFIGS.funerals;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='funerals'),numbers=[1194,1195,1196,1197,1198,1199,1200,'1200b',1202,1203,1204,1205,1206,1207,1208,1209],get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};
test('second Funerals batch adds exactly sixteen reports in fifteen complete chapters',()=>{
 assert.deepEqual(review().entries.map(e=>e.number),numbers);assert.deepEqual(book.entryNumbers.slice(14),numbers);assert.equal(book.sourceEntryCount,151);assert.equal(book.chapters.length,21);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),42);assert.deepEqual(review().chapters.flatMap(c=>c.contextIds),['mwNg','mwSg','mwTA']);assert.equal(get(1210),undefined);assert.equal(get(1201),undefined);
});
test('every selected digital Arabic character and mapped source boundary is preserved',()=>{
 for(const e of review().entries.filter(e=>!e.printedReport)){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);assert.equal(e.segments.map(s=>s.arabic).join(''),original.join(''));assert.deepEqual(get(e.number).arabic_blocks,original);assert.equal(e.arabicCorrections,undefined);}
 const r=review(),e=r.entries.at(-1);e.sourceLayout.paragraphs[0].origin.start++;rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));
 const originals=read('content/staging/bukhari-funerals-wikisource/layout-audit.json');assert(originals);
});
test('the newly transcribed report has a distinct origin and exact original empty chapter',()=>{
 const e=review().entries.find(e=>e.number==='1200b'),p=e.printedReport,c=review().chapters.find(c=>c.id==='chapter-14');assert.equal(e.sourceRecordId,'dar-ibn-kathir-2002:1260');assert.equal(p.printReference,'1260');assert.equal(e.comparisons[0].reference,'1201');assert.equal(e.comparisons[1].reference,'2.23.350');assert.deepEqual(c.entryNumbers,['1200b']);assert.deepEqual(c.contextIds,['mwSg']);assert.deepEqual(inv.chapters.find(c=>c.id==='chapter-14').entryNumbers,[]);assert.equal(e.sourceLayout,undefined);assert.match(text('1200b'),/And I heard Hafsah bint Sirin/);assert.equal((text('1200b').match(/three braids/g)||[]).length,2);assert.match(text('1200b'),/They undid it, then washed it/);assert.doesNotMatch(text('1200b'),/Most High/);
});
test('empty-chapter placement rejects missing, stale or redirected evidence even after resealing',()=>{
 const mutations=[(r,e)=>delete e.printedReport.emptyDigitalChapter,(r,e)=>e.printedReport.emptyDigitalChapter.headingSha256='0'.repeat(64),(r,e)=>e.printedReport.emptyDigitalChapter.context=[],(r,e)=>e.printedReport.witnesses[0].chapterHeading='changed',(r,e)=>e.printedReport.witnesses[1].chapterHeadingSha256='0'.repeat(64),(r,e)=>r.chapters.find(c=>c.id==='chapter-14').contextIds=[],(r,e)=>r.chapters.find(c=>c.id==='chapter-14').entryNumbers.push(1200),(r,e)=>e.chapterId=e.printedReport.chapterId='chapter-13',(r,e)=>e.chapterId=e.printedReport.chapterId='chapter-16'];
 for(const mutate of mutations){const r=review(),e=r.entries.find(e=>e.number==='1200b');mutate(r,e);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('a nonempty or nonadjacent source chapter cannot receive the empty-chapter exception',()=>{
 for(const mutate of [i=>i.chapters.find(c=>c.id==='chapter-14').entryNumbers=[1200],i=>i.chapters.splice(13,0,{...i.chapters[13],id:'interposed'})]){const i=structuredClone(inv),r=review(),e=r.entries.find(e=>e.number==='1200b');mutate(i);r.inventorySha256=hash(i);e.printedReport.digitalInventorySha256=hash(i);rehash(e);assert.throws(()=>validatePrintedReportRows(i,r),/displace a digital report|immediately follow/);}
});
test('all selected honorifics retain their counts and the print does not gain an extra epithet',()=>{
 for(const e of review().entries){const a=e.segments.map(s=>s.arabic).join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);}
 assert.match(text(1206),/pleased with them,/);assert.match(text(1207),/pleased with them both,/);
});
test('1196 does not import the disproven conditional or parallel camphor wording',()=>{
 const t=text(1196);assert.doesNotMatch(t,/if you see fit|some camphor|al-Ansariyyah/);assert.match(t,/He cast his waist-wrapper/);assert.match(t,/Three or five or seven/);assert.equal((t.match(/It included/g)||[]).length,3);
 const a=read('research/funerals-second-wording-addendum.json'),c=a.priorEvidenceClarifications[0];assert.equal(c.supersedes.sha256,hash(read(c.supersedes.path)));assert.equal(c.supersedes.differenceId,'1196-conditional');assert(c.witnesses.every(w=>w.reading===c.selectedReading));assert(!a.unresolvedTextualDifferences.some(v=>v.id==='1196-conditional'));assert(readFileSync(new URL('../research/funerals-source-review.html',import.meta.url),'utf8').includes('Subsequent wording review and correction'));
});
test('1195 preserves its final attributed gloss and 1199 preserves removal from the waist',()=>{
 assert.equal(get(1195).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(1195).english_blocks.at(-1),'She means his waist-wrapper.');assert.match(text(1199),/removed his waist-wrapper from his waist/);assert.doesNotMatch(text(1199),/may Allah Most High be pleased/);
});
test('1200 keeps both printed occurrences and the complete alternate route with seven',()=>{
 const e=review().entries.find(e=>e.number===1200);assert(e.additionalCitations.some(c=>c.locator.includes('1258 / 1259')));assert.match(text(1200),/And from Ayyub, from Hafsah, from Umm ‘Atiyyah/);assert.match(get(1200).english_blocks.at(-1),/three or five or seven/);assert.equal((text(1200).match(/may Allah Most High be pleased with her/g)||[]).length,2);
});
test('1202 keeps the arrival outside the hidden chain and preserves every closing narrator remark',()=>{
 const e=get(1202);assert.equal(e.presentation.english[1].kind,'report');assert.match(e.english_blocks[1],/hastening to reach a son of hers, but she did not reach him/);assert.equal(e.presentation.english.at(-1).kind,'transmission-note');assert.match(text(1202),/I do not know which of his daughters/);assert.match(text(1202),/not have it tied around her waist/);assert.doesNotMatch(text(1202),/we let him know|pledged allegiance to/);assert(ledger.sourceReferences.entries.find(e=>e.number===1202).contextNotes.some(n=>n.citations.includes('lexical')));
});
test('1203 retains both narrator glosses and 1204 does not import a wrapping command',()=>{
 assert.deepEqual(get(1203).presentation.english.map(p=>p.kind),['chain','report','transmission-note','transmission-note']);assert.equal(get(1203).english_blocks[2],'She means three braids.');assert.match(get(1203).english_blocks[3],/Waki‘ said: Sufyan said/);assert.doesNotMatch(text(1204),/Place it next|with water/);assert.match(text(1204),/placed them behind her/);
});
test('1205 retains all fabric descriptions without importing a garment',()=>{
 assert.match(text(1205),/three white Yemeni Suhuli cloths of cotton/);assert.match(text(1205),/neither a shirt nor a turban/);
});
test('1206 to 1209 preserve covering, alternative verbs, subjects and talbiyah without added phrases',()=>{
 for(const n of [1206,1207,1208,1209]){assert.match(text(n),/do not cover his head/i);assert.doesNotMatch(text(n),/shav|Labbaik|Hajj/);}
 assert.match(text(1206),/broke his neck—or he said, caused his neck to break/);assert.match(text(1207),/crushed him—or he said, killed him on the spot/);assert.match(text(1207),/Allah will raise him/);assert.match(text(1208),/camel broke his neck/);assert.match(text(1209),/Ayyub said: “It broke his neck.” ‘Amr said: “It crushed him.”/);assert.equal(get(1209).presentation.english.at(-1).kind,'transmission-note');assert.match(get(1209).english_blocks.at(-1),/Ayyub said: “He recites the talbiyah.” ‘Amr said: “Reciting the talbiyah.”/);
});
test('known English comparison limits and chapter variants remain exact-bound',()=>{
 for(const e of review().entries)if(e.comparisons[0].status){assert(validateDamagedBewleyComparison(e.comparisons[0],e,config,review().sources));const c=structuredClone(e.comparisons[0]);c.damageEvidence.bodySha256='0'.repeat(64);assert.throws(()=>validateDamagedBewleyComparison(c,e,config,review().sources));}
 const r=review();assert.equal(r.chapters.reduce((n,c)=>n+validateChapterDifferences(c,inv,r).length,0),3);delete r.chapters[1].contextDifferences;assert.throws(()=>validateChapterDifferences(r.chapters[1],inv,r));assert.equal(read('research/funerals-second-wording-review.json').reviewSha256,hash(review()));
});
