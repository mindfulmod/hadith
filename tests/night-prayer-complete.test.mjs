import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateSourceHolds} from '../scripts/source-holds.mjs';
import {validateChapterDifferences,chapterDifferenceDetails} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {pendingForNumber,pendingBefore,pendingBetween,sessionPending} from '../reader/navigation.mjs';
import {narrationHTML} from '../reader/source-structure.mjs';
import {release} from '../reader/release.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/night-prayer-complete-review.json'),inv=read('content/staging/bukhari-night-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-night-prayer/manifest.json'),config=BOOK_CONFIGS['night-prayer'];
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),catalog=read('reader/books/catalog.json'),expected=Array.from({length:33},(_,i)=>1086+i).filter(n=>![1104,1115].includes(n));
const get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n'),rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('remaining Night Prayer accounts for every source report with 31 complete entries and two held identities',()=>{
 assert.deepEqual(review().entries.map(e=>e.number),expected);assert.equal(review().entries.reduce((s,e)=>s+e.segments.length,0),72);
 assert.equal(book.sourceEntryCount,50);assert.equal(book.entryNumbers.length,48);assert.deepEqual(book.pendingEntries.map(e=>e.number),[1104,1115]);
 assert.deepEqual([...book.entryNumbers,...book.pendingEntries.map(e=>e.number)].sort((a,b)=>a-b),inv.records.map(r=>r.number));
 const plan=narrationPlan(source);
 for(const row of review().entries){const e=get(row.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));assert.equal(row.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===row.number).script,text(row.number));assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');}
 for(const n of [1104,1115]){assert.equal(get(n),undefined);assert(!plan.entries.some(e=>e.number===n));}
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('material attribution and narrator-chain holds cannot be silently admitted, removed, remapped or resolved',()=>{
 const reg=read('content/review/source-holds.json');assert.equal(validateSourceHolds(inv,review(),config).length,2);
 for(const n of [1104,1115]){
  const r=review(),row=inv.records.find(e=>e.number===n);r.entries.push({number:n,sourceRecordId:row.id});assert.throws(()=>validateSourceHolds(inv,r,config),/Unresolved source wording hold/);
  for(const mutate of [h=>h.reference++,h=>h.sourceSha256='0'.repeat(64),h=>h.arabicSha256='0'.repeat(64),h=>h.paragraphIds=[],h=>h.status='resolved',h=>h.evidence.sha256='0'.repeat(64)]){const copy=structuredClone(reg);mutate(copy.holds.find(h=>h.reference===n));assert.throws(()=>validateSourceHolds(inv,review(),config,copy));}
 }
 for(const mutate of [r=>delete r.pendingReferences,r=>r.pendingReferences=[1115],r=>r.pendingReferences=[1104],r=>r.pendingReferences.push(1105)]){const r=review();mutate(r);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});

test('the poem, its six verse lines and closing routes remain complete source evidence without invented English',()=>{
 const row=inv.records.find(r=>r.number===1104),hold=read('content/review/source-holds.json').holds.find(h=>h.reference===1104),notes=read('reader/source-notes.json').books.find(b=>b.id==='night-prayer'),route=notes.routes.find(r=>r.id==='hadith-1104');
 assert.equal(row.paragraphIds.length,8);assert.deepEqual(row.paragraphIds,['mweA','mweg','mwew','mwfA','mwfQ','mwfg','mwfw','mwgA']);
 const body=row.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text);assert.equal(hold.arabicSha256,sha(body.join('')));
 const html=readFileSync(new URL('reader/'+route.path,root),'utf8');for(const p of body)assert(html.includes(p));assert(html.includes('No English translation or recording is supplied'));assert(html.includes('Al-Ayni'));assert(html.includes('/303/4755/'));assert(html.includes('printed reference 1155'));
 assert(release.files.some(f=>f.path===route.path));assert.equal(read('research/night-prayer-1104-wording-review.json').decision.status,'withhold-translation-and-narration');
});

test('new pending references allow continuous sessions while keeping saved session membership stable',()=>{
 for(const [before,held,after] of [[1103,1104,1105],[1114,1115,1116]]){
  assert.equal(pendingForNumber(catalog,held).status,'source-review-pending');assert.deepEqual(pendingBetween(catalog,before,after).map(e=>e.number),[held]);assert.deepEqual(pendingBefore(catalog,after).map(e=>e.number),[held]);
  const plan=startSession(source.entries,before,10);assert(plan.numbers.includes(before));assert(plan.numbers.includes(after));assert(!plan.numbers.includes(held));assert(sessionPending(catalog,plan.numbers).some(e=>e.number===held));
 }
 const saved={numbers:[1084,1085],cursor:1085,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,1086),saved);
 assert.deepEqual(catalog.books.flatMap(b=>b.pendingEntries||[]).map(e=>e.number),[926,957,1104,1115]);
});

test('untitled printed chapter 20 stays separate from report 1102 and its bounded absent English comparison',()=>{
 const r=review(),row=r.entries.find(e=>e.number===1102),division=book.chapters.find(c=>c.id==='chapter-19-print-20');
 assert.equal(row.printedHeading.arabic,'باب');assert.equal(row.printedHeading.english,'Untitled chapter');assert.deepEqual(division.entryNumbers,[1102]);assert.deepEqual(book.chapters.find(c=>c.id==='chapter-19').entryNumbers,[1101]);assert(!row.segments.some(s=>s.paragraphId===row.printedHeading.id));
 const c=row.comparisons[1];assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['2.21.252','2.21.253']);assert.match(get(1102).english_status,/second English comparison is absent/);
 for(const mutate of [x=>x.comparisons[1].checkedReferences[1]='2.21.254',x=>x.printedHeading.witnesses[0].reading='invented',x=>x.printedHeading.beforeEntry=1101,x=>x.contextNotes=[]]){const bad=review(),e=bad.entries.find(e=>e.number===1102);mutate(e);rehash(e);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});

test('four new Arabic introductions and the pending-only chapter stay outside numbered sessions',()=>{
 assert.equal(book.chapters.length,28);assert.equal(book.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),7);
 assert.deepEqual(book.chapters.find(c=>c.id==='chapter-25').entryNumbers,[]);assert.equal(book.chapters.find(c=>c.id==='chapter-25').sourceContext.numberedReports,'pending-review');
 for(const pid of ['mwTA','mwWA','mwXA','mwkw']){const p=inv.blocks.find(b=>b.htmlId===pid).text;assert(!source.entries.some(e=>e.arabic_blocks.includes(p)));}
 for(const mutate of [r=>r.chapters.splice(2,1),r=>r.chapters.find(c=>c.id==='chapter-14').contextIds=[],r=>r.chapters.find(c=>c.id==='chapter-25').entryNumbers=[1115]]){const bad=review();mutate(bad);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});

test('a missing chapter quotation is labelled as absent context and remains bound to both inspected pages',()=>{
 const r=review(),c=r.chapters.find(c=>c.id==='chapter-14'),items=validateChapterDifferences(c,inv,r);assert.equal(items.length,1);assert.equal(items[0].sourceRole,undefined);assert.equal(items[0].witnesses[0].reading,null);
 const html=chapterDifferenceDetails(items,r.sources);assert(html.includes('Absent from this inspected chapter introduction.'));assert(!html.includes('Absent from this inspected heading.'));assert(!html.includes('>null<'));
 for(const mutate of [x=>delete x.contextDifferences,x=>x.contextIds=[],x=>x.contextDifferences[0].auditSha256='0'.repeat(64)]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateChapterDifferences(bad,inv,r));}
 const supplied=read('research/night-prayer-source-audit.json');supplied.unresolvedTextualDifferences.find(d=>d.id==='chapter-14-dawn-quotation').witnesses[0].reading='invented';assert.throws(()=>validateChapterDifferences(c,inv,r,()=>supplied),/Changed chapter difference audit/);
});

test('known English comparison limitations retain exact evidence instead of claiming full coverage',()=>{
 for(const n of [1090,1097,1101,1103,1105,1108,1114,1118]){const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];assert.equal(validateDamagedBewleyComparison(c,row,config,r.sources),true);const bad=structuredClone(c);delete bad.status;delete bad.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,r.sources));}
 for(const n of [1090,1091,1093,1098,1100,1101,1105,1106,1108,1112,1118]){const r=review(),row=r.entries.find(e=>e.number===n);row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);}
});

test('night-prayer counts, clarification, repeated clauses and paired routes are not normalized across reports',()=>{
 assert.match(text(1088),/Seven, and nine, and eleven, apart from the two/);assert.match(text(1089),/thirteen.*including Witr and the two/s);assert.equal(get(1087).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(1087).english_blocks.at(-1),'He means at night.');
 assert.match(text(1090),/Sulayman and Abu Khalid al-Ahmar corroborated it from Humayd/);assert.doesNotMatch(text(1090),/nothing but|all night/);
 assert.equal((text(1091).match(/a knot is undone/g)||[]).length,3);assert.doesNotMatch(text(1091),/reads and exhales/);assert.match(text(1093),/his ear\./);
 assert.match(text(1094),/Abu Salamah and Abu ‘Abdullah al-Agharr/);assert.match(text(1094),/Our Lord, blessed and exalted is He.*last third/s);assert.equal((get(1094).english_blocks[1].match(/\?/g)||[]).length,3);
 assert.match(text(1095),/Abu al-Walid.*Shu‘bah.*Sulayman related to me.*Shu‘bah/s);assert.equal((text(1096).match(/do not ask about their beauty and length/g)||[]).length,2);assert.match(text(1097),/grew old; then he recited while seated.*thirty or forty.*recited them, and then bowed/s);
});

test('Bilal, Asad-woman and abandonment reports retain exact source scope and full closing transmissions',()=>{
 assert.match(text(1098),/most hope/);assert.equal(get(1098).presentation.english.at(-1).kind,'transmission-note');assert.match(get(1098).english_blocks.at(-1),/^Abu ‘Abdullah said:/);
 assert.match(text(1100),/^He said: And ‘Abdullah ibn Maslamah said/);assert.match(text(1100),/night”—she was mentioning her prayer/);assert.doesNotMatch(text(1100),/giving rewards|good deeds/);
 const closing=get(1101).english_blocks.at(-1);assert.match(closing,/Hisham.*Ibn Abi al-‘Ishrin.*Al-Awza‘i.*Yahya.*‘Umar ibn al-Hakam ibn Thawban.*Abu Salamah.*‘Amr ibn Abi Salamah/s);assert.equal(get(1101).presentation.english.at(-1).kind,'transmission-note');
 assert.match(text(1102),/your eye sinks.*your family has a right.*fast and break your fast, stand in prayer and sleep/s);
});

test('complete remembrance and three combined dream occurrences keep conditions and calendar wording',()=>{
 assert.match(text(1103),/forgive me,” or makes a supplication/);assert.match(text(1103),/performs ablution and prays/);
 assert.equal(get(1105).english_blocks.length,4);assert.match(text(1105),/An angel met the two of them/);assert.match(text(1105),/You two, leave him/);assert.match(text(1105),/seventh night of the last ten/);assert.doesNotMatch(text(1105),/27th|twenty-seventh|Ramadan|Laylat|two angels/);
 assert(review().entries.find(e=>e.number===1105).contextNotes[0].text.includes('1156, 1157 and 1158'));assert(!source.entries.some(e=>String(e.number).startsWith('1105')&&e.number!==1105));
 assert.match(text(1106),/eight rak‘ahs.*two rak‘ahs seated.*two rak‘ahs between the two calls/s);assert.doesNotMatch(text(1106),/Tahajjud time/);assert.doesNotMatch(get(1108).english_blocks[1],/Fajr|iqamah|two rak‘ahs/);
});

test('istikharah and concluding reports retain both alternatives, all five prayer pairs and appended attributions',()=>{
 const body=get(1109).english_blocks[1];assert.equal((body.match(/or he said:/g)||[]).length,2);assert.match(body,/turn it away from me and turn me away from it/);assert(body.endsWith('then make me content with it.”'));assert.equal(get(1109).english_blocks.at(-1),'He said: And he names his need.');
 assert.match(text(1110),/Abu Qatadah ibn Rib‘i al-Ansari/);assert.equal((get(1112).english_blocks[1].match(/two rak‘ahs/g)||[]).length,5);assert.doesNotMatch(text(1112),/‘Umar Abu/);
 assert.match(text(1113),/imam is delivering the sermon, or has come out/);assert.match(get(1114).english_blocks.at(-1),/^Abu ‘Abdullah said: Abu Hurayrah/);assert.match(get(1114).english_blocks.at(-1),/‘Itban said.*Abu Bakr.*stood in rows/s);assert.doesNotMatch(get(1114).english_blocks.at(-1),/‘Umar|ibn Malik/);
});

test('1118 preserves the unfinished first report and both expandable narrator chains with original honorifics',()=>{
 const e=get(1118);assert.deepEqual(e.presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.equal(e.english_blocks[1],'The Prophet, may Allah bless him and grant him peace, used to—');assert.match(e.english_blocks[2],/^Another route: Ahmad ibn Yunus.*Zuhayr.*Yahya—he is Ibn Sa‘id/s);
 assert.equal((text(1118).match(/may Allah bless him and grant him peace/g)||[]).length,2);assert.equal((text(1118).match(/may Allah Most High be pleased with her/g)||[]).length,2);assert.match(text(1118),/Mother of the Book/);assert.doesNotMatch(text(1118),/Al-Fatiha|Mother of the Quran/);
 assert.equal((narrationHTML(e).match(/<details class="chain"/g)||[]).length,2);assert(narrationHTML(e).includes('used to—'));
});

test('all new notes, pending evidence and chapter divisions belong to the checked offline release',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='night-prayer');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));
 for(const n of [1104,1115]){const route=notes.routes.find(r=>r.id==='hadith-'+n),html=readFileSync(new URL('reader/'+route.path,root),'utf8');assert(html.includes('It is not a judgment that the hadith itself is inauthentic'));assert(html.includes('Reading continues to the next available report'));}
 assert.equal(read('research/night-prayer-complete-wording-review.json').reviewSha256,hash(review()));assert.equal(read('research/night-prayer-source-audit.json').readerAdmission,false);
});
