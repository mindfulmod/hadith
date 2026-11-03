import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences,chapterDifferenceDetails} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
import {validateChapters,chapterForNumber} from '../reader/navigation.mjs';
import {chapterMaterialView} from '../reader/library.mjs';
import {sourceParts,sourceHTML} from '../reader/source-format.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/prostration-complete-review.json'),inv=read('content/staging/bukhari-prostration-wikisource/catalog.json'),manifest=read('content/sources/wikisource-prostration/manifest.json'),audit=()=>read('research/prostration-source-audit.json'),config=BOOK_CONFIGS.prostration;
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book===config.title),book=ledger.books.find(b=>b.id==='prostration');
const get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=row=>{delete row.reviewRecordSha256;row.reviewRecordSha256=hash(row);};

test('all thirteen Prostration occurrences retain exact Arabic, full chains and all thirty translated spans',()=>{
 assert.deepEqual(entries.map(e=>e.number),Array.from({length:13},(_,i)=>1017+i));
 assert.equal(review().entries.reduce((s,r)=>s+r.segments.length,0),30);
 const plan=narrationPlan(source);
 for(const r of review().entries){const e=get(r.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,text(r.number));assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');}
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('parallel al-Najm reports retain their separate chains and forehead versus face wording',()=>{
 assert.match(text(1017),/Ghundar.*Shu‘bah.*I heard al-Aswad/s);assert.match(text(1017),/in Mecca.*pebbles or earth.*his forehead/s);
 assert.match(text(1020),/Hafs ibn ‘Umar.*Shu‘bah/s);assert.match(text(1020),/pebbles or earth.*his face.*certainly/s);
 assert.notEqual(get(1017).arabic_sha256,get(1020).arabic_sha256);
 for(const n of [1017,1020])assert.doesNotMatch(text(n),/\b103\b|\b53\b|Umayyah/);
});

test('Quran opening words and the Sad term do not silently inherit comparison additions',()=>{
 assert.match(text(1018),/Alif Lam Mim Tanzil.*Hal ata.*dawn prayer on Friday/s);
 assert.doesNotMatch(text(1018),/al-Sajdah|first.*rak|second.*rak|\b74\b|\b76\b/i);
 assert.match(text(1019),/Ṣād is not among the firmly enjoined prostrations/);
 const r=review();assert(r.entries.find(e=>e.number===1018).contextNotes[0].text.includes('does not'));
 assert.equal(r.entries.find(e=>e.number===1019).additionalCitations[0].sourceId,'fath-prostration-sad');
});

test('the Ibn Tahman comment remains distinct, complete and included in any future narration',()=>{
 assert.deepEqual(get(1021).presentation.english.map(p=>p.kind),['chain','report','transmission-note']);
 assert.match(text(1021),/Muslims, the polytheists, the jinn and human beings/);
 assert.equal(get(1021).english_blocks.at(-1),'Ibn Tahman also related it from Ayyub.');
 assert.doesNotMatch(get(1021).english_blocks.at(-1),/Ibrahim/);
});

test('both Zayd accounts retain their different speakers and unsupplied question subject',()=>{
 assert.match(text(1022),/Yazid ibn Khusayfah.*Ibn Qusayt.*‘Ata’ ibn Yasar/s);
 assert.match(text(1022),/He informed him that he had asked Zayd ibn Thabit.*who stated/s);
 assert.doesNotMatch(text(1022),/asked.*about prostration|claimed falsely/);
 assert.match(text(1023),/Adam ibn Abi Iyas.*Ibn Abi Dhi’b/s);assert.match(get(1023).english_blocks[1],/^I recited/);
 assert.notEqual(get(1022).arabic_sha256,get(1023).arabic_sha256);
});

test('the three crowding occurrences retain all negatives and source-specific honorifics',()=>{
 for(const n of [1025,1026,1029])assert.match(text(n),/could find no (place|space)/);
 assert.doesNotMatch(text(1025),/provided we could find/);
 assert.doesNotMatch(text(1026),/Surat As-Sajda|may Allah Most High be pleased with them both/);
 assert.match(text(1029),/Ibn ‘Umar, may Allah Most High be pleased with them both/);
 assert.equal(new Set([1025,1026,1029].map(n=>get(n).arabic_sha256)).size,3);
 assert(audit().records.find(r=>r.reference===1029).finding.includes('both retain'));
});

test('Umar attribution, Abu Bakr appraisal, two Fridays and closing Nafi route remain at their source positions',()=>{
 const e=get(1027);assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','transmission-note','report','report','transmission-note']);
 assert.match(e.english_blocks[1],/^Abu Bakr said: Rabi‘ah was among the best of people/);
 assert.match(e.english_blocks[2],/Rabi‘ah witnessed of ‘Umar ibn al-Khattab/);
 assert.match(e.english_blocks[3],/On the following Friday/);assert.match(e.english_blocks[3],/whoever does not prostrate incurs no sin/);
 assert.match(e.english_blocks.at(-1),/^Nafi‘ added, from Ibn ‘Umar, may Allah be pleased with them both/);
 assert.match(e.english_blocks.at(-1),/except if we wish/);assert.doesNotMatch(text(1027),/The Prophet|‘Ubayd al-Rahman|wishing to recite|on us/);
});

test('Abu Hurayrah accounts retain the negative question, with versus behind, and ending',()=>{
 assert.match(text(1024),/did I not see you prostrate/);assert.match(text(1024),/Had I not seen.*I would not have prostrated/s);
 assert.match(text(1028),/late-evening prayer with Abu Hurayrah/);assert.match(text(1028),/behind Abu al-Qasim.*until I meet him/s);
 assert.doesNotMatch(text(1028),/prayer behind Abu Hurayrah/);
});

test('shorter companion honorifics get quieter presentation without changing source or audio text',()=>{
 const plan=narrationPlan(source);
 for(const [n,phrase] of [['724b','may Allah be pleased with him'],[1027,'may Allah be pleased with them both']]){
  const original=source.entries.find(e=>e.number===n).english_blocks.join('\n\n');
  const parts=sourceParts(original);assert.equal(parts.map(p=>p.text).join(''),original);
  assert(parts.some(p=>p.honorific&&p.text===phrase));assert(sourceHTML(original).includes('<span class="honorific">'+phrase+'</span>'));
  assert.equal(plan.entries.find(p=>p.number===n).script,original);
 }
});

test('known English defects cannot be promoted or rebound to adjacent occurrences',()=>{
 for(const n of [1017,1018,1025,1027]){const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];for(const change of [x=>{delete x.status;delete x.damageEvidence;},x=>x.damageEvidence.bodySha256='0'.repeat(64),x=>x.reference='1020']){const bad=structuredClone(c);change(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,r.sources));}}
 for(const n of [1017,1021,1026,1027]){const r=review(),row=r.entries.find(e=>e.number===n);assert.equal(row.comparisons[1].status,'damaged-comparison');row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);}
});

test('chapter 5 difference is evidence-bound and cannot be dropped, moved, altered or approved',()=>{
 const r=review(),chapter=r.chapters[4],items=validateChapterDifferences(chapter,inv,r);assert.equal(items.length,1);assert.equal(items[0].sourceReading,'على غير وضوء');assert.equal(items[0].witnesses[1].reading,'على وضوء');
 for(const change of [c=>delete c.contextDifferences,c=>c.contextDifferences[0].auditSha256='0'.repeat(64),c=>c.contextIds=[]]){const c=structuredClone(chapter);change(c);assert.throws(()=>validateChapterDifferences(c,inv,r));}
 for(const change of [a=>a.unresolvedTextualDifferences[0].status='approved',a=>a.unresolvedTextualDifferences[0].witnesses.pop(),a=>a.unresolvedTextualDifferences[0].witnesses[1].reading='على غير وضوء']){const a=audit();change(a);assert.throws(()=>validateChapterDifferences(chapter,inv,r,()=>a));}
 const html=chapterDifferenceDetails(items,r.sources);assert(html.includes('على غير وضوء')&&html.includes('على وضوء'));assert(html.includes('#page=273')&&html.includes('#page=262'));
});

test('all chapter context stays outside narration and unresolved wording is visible in browsing',()=>{
 validateChapters(book);assert.equal(book.chapters.length,12);assert.equal(book.chapters.reduce((s,c)=>s+c.sourceContext.introduction.arabicParagraphs,0),4);
 assert.equal(chapterForNumber(book,1021).id,'chapter-05');assert.match(chapterMaterialView(book.chapters[4]),/Arabic prints differ.*English remains pending/s);
 const context=book.chapters[4].sourceContext;assert.equal(context.textualDifferences.status,'unresolved');
 for(const change of [x=>x.status='approved',x=>x.count=0,x=>x.englishStatus='reviewed-translation',x=>x.evidenceSha256='bad']){const b=structuredClone(book);change(b.chapters[4].sourceContext.textualDifferences);assert.throws(()=>validateChapters(b));}
 const blocks=inv.blocks.filter(b=>['mwDw','mwFA','mwIA','mwJw'].includes(b.htmlId));for(const b of blocks)assert(!entries.some(e=>e.arabic_blocks.some(p=>p.includes(b.text))));
});

test('saved sessions stay intact, new sessions end at whole reports and every new source route is offline',()=>{
 const saved={numbers:[1015,1016],cursor:1016,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,1017),saved);
 const next=startSession(source.entries,1017,5);assert.equal(next.numbers[0],1017);assert(next.numbers.every(n=>source.entries.some(e=>e.number===n)));
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='prostration');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));
 const route=notes.routes.find(r=>r.id==='chapter-05'),html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8');assert(html.includes('data-chapter-difference="chapter-05-ablution"'));assert(html.includes('على غير وضوء')&&html.includes('على وضوء'));
});
