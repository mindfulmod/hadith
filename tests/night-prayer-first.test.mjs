import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {validateChapterDifferences,chapterDifferenceContext,chapterDifferenceDetails} from '../scripts/chapter-source-differences.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {chapterMaterialView} from '../reader/library.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/night-prayer-first-review.json'),inv=read('content/staging/bukhari-night-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-night-prayer/manifest.json'),config=BOOK_CONFIGS['night-prayer'];
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book===config.title&&e.number<=1085),book=ledger.books.find(b=>b.id==='night-prayer');
const get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('Night Prayer admits seventeen complete unchanged Arabic reports and thirty-eight translated spans',()=>{
 assert.deepEqual(entries.map(e=>e.number),Array.from({length:17},(_,i)=>1069+i));
 assert.equal(review().entries.reduce((s,r)=>s+r.segments.length,0),38);
 const plan=narrationPlan(source);
 for(const r of review().entries){const e=get(r.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,text(r.number));assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');}
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('the complete opening invocation retains five praises, both alternatives and its two attributed closing notes',()=>{
 const e=get(1069),body=e.english_blocks[1];assert.equal((body.match(/to You belongs praise/gi)||[]).length,5);assert.equal((body.match(/those within them/g)||[]).length,3);
 assert.match(body,/You are the King of the heavens and the earth/);assert.match(body,/There is no god except You,” or, “There is no god other than You/);
 assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','transmission-note','transmission-note']);
 assert.match(e.english_blocks[2],/^Sufyan said: ‘Abd al-Karim Abu Umayyah added/);assert.match(e.english_blocks[3],/Sulayman ibn Abi Muslim said that he heard it from Tawus/);
 assert.doesNotMatch(body,/power and no strength|unbeliever|sins/);
 assert(review().entries[0].contextNotes[0].text.includes('separate King clause'));
});

test('1070 keeps both opening routes, the other angel and both printed occurrences in one complete entry',()=>{
 const e=get(1070);assert.match(e.english_blocks[0],/Hisham.*Ma‘mar.*Mahmud related to me.*‘Abd al-Razzaq.*Ma‘mar/s);
 assert.match(text(1070),/young man.*lining of a well.*two uprights.*another angel/s);
 assert.match(e.english_blocks.at(-1),/^I recounted it to Hafsah.*Hafsah recounted it.*If only he prayed.*slept only a little/s);
 assert(review().entries.find(r=>r.number===1070).contextNotes[0].text.includes('1121 and 1122'));
 assert(!source.entries.some(e=>e.number==='1070b'));assert.doesNotMatch(text(1070),/wooden|stone pillars|Salim said/);
});

test('illness, revelation and waking reports preserve uncertainty, both blessings and interrogative wording',()=>{
 assert.match(text(1071),/eleven rak‘ahs.*fifty verses.*two rak‘ahs.*right side.*caller/s);
 assert.match(text(1072),/one night or two/);
 assert.match(text(1073),/Jibril, may Allah bless him and grant him peace.*Prophet, may Allah bless him and grant him peace/s);
 assert.match(text(1073),/A woman of Quraysh.*slow in coming/s);assert.doesNotMatch(text(1073),/deserted him|Umm Jamil/);
 assert.match(text(1074),/Who will wake the women of the chambers\?/);assert.doesNotMatch(text(1074),/Go and wake|for prayers|wives/);
});

test('1075–1079 keep the selected pronouns, full lineage, source alternatives and complete night fractions',()=>{
 assert.match(text(1075),/‘Ali ibn Husayn.*Husayn ibn ‘Ali.*‘Ali ibn Abi Talib/s);
 assert.match(text(1075),/came to him and Fatimah.*Prophet, peace be upon him.*Will you two not pray.*I said.*we said.*gave me no reply.*striking his thigh/s);
 assert.match(text(1076),/never offered the Duha prayer, but I do offer it/);
 assert.match(text(1077),/third or fourth night/);assert(text(1077).endsWith('That was in Ramadan.'));
 assert.match(text(1078),/stand to pray until his feet or his lower legs swelled/);assert(review().entries.find(r=>r.number===1078).contextNotes[0].text.includes('both inspected prints have stand or pray'));
 assert.match(text(1079),/half the night.*third of it.*sixth of it.*fast one day and not fast the next/s);
 assert.equal((text(1079).match(/peace be upon him/g)||[]).length,1);
});

test('1080 and 1081 remain distinct with both father links and a separate pointer to the preceding chain',()=>{
 assert.match(get(1080).english_blocks[0],/My father informed me.*Ash‘ath.*I heard my father.*Masruq/s);
 assert.match(get(1080).english_blocks[1],/^I asked ‘A’ishah/);
 assert.equal(get(1081).english_blocks[1],'When he heard the rooster, he rose and prayed.');
 assert.doesNotMatch(get(1081).english_blocks[0],/Masruq|‘A’ishah/);
 const r=review().entries.find(r=>r.number===1081);assert.deepEqual(r.contextNotes[0].related,[{id:'bukhari:1080',number:1080,target:'chain',label:'View the preceding chain · 1080'}]);
 const audit=read('research/night-prayer-source-audit.json');for(const n of [1080,1081])assert.deepEqual(audit.records.find(r=>r.reference===n).printedReferences,[1132]);
 assert.notEqual(get(1080).arabic_sha256,get(1081).arabic_sha256);
});

test('1082–1085 preserve the closing attribution, plural question, narrator name scope and mouth wording',()=>{
 assert.match(get(1082).english_blocks[0],/My father mentioned/);assert.equal(get(1082).english_blocks[1],'The time before dawn never found him with me except asleep.');
 assert.equal(get(1082).presentation.english.at(-1).kind,'transmission-note');assert.match(get(1082).english_blocks.at(-1),/^She means the Prophet, may Allah bless him and grant him peace\.$/);
 assert.match(text(1083),/We asked Anas.*their finishing suhur.*their entering the prayer.*fifty verses/s);assert.doesNotMatch(text(1083),/Qatadah said|Fajr|Quran/);
 assert.match(text(1084),/from ‘Abdullah, may Allah Most High/);assert.doesNotMatch(text(1084),/ibn Masud/);assert.match(text(1084),/We asked/);
 assert.match(text(1085),/from Husayn, from Abu Wa’il/);assert.match(text(1085),/clean his mouth with the siwak/);assert.doesNotMatch(text(1085),/teeth/);
});

test('known damaged English comparisons cannot lose their inspected evidence or claim complete coverage',()=>{
 for(const n of [1069,1070,1074,1082]){const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];assert.equal(validateDamagedBewleyComparison(c,row,config,r.sources),true);for(const change of [x=>{delete x.status;delete x.damageEvidence;},x=>x.damageEvidence.bodySha256='0'.repeat(64),x=>x.reference='1085']){const bad=structuredClone(c);change(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,r.sources));}}
 for(const n of [1069,1073,1074,1077,1078]){const r=review(),row=r.entries.find(e=>e.number===n);row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);}
});

test('nine complete chapters retain their three introductions outside numbered reports and narration',()=>{
 assert.equal(book.chapters.length,9);assert.deepEqual(book.chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number));
 assert.equal(book.chapters.reduce((s,c)=>s+c.sourceContext.introduction.arabicParagraphs,0),3);
 for(const id of ['mwBg','mwHQ','mwKw']){const b=inv.blocks.find(b=>b.htmlId===id);assert(!entries.some(e=>e.arabic_blocks.some(p=>p.includes(b.text))));}
 for(const change of [r=>r.chapters.splice(3,1),r=>r.chapters[5].contextIds=[],r=>r.entries.pop()]){const r=review();change(r);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});

test('heading and introduction differences keep exact evidence and an explicitly absent printed excerpt',()=>{
 const r=review(),chapter=r.chapters[5],items=validateChapterDifferences(chapter,inv,r);assert.equal(items.length,2);
 assert.equal(items[0].sourceRole,'heading');assert.equal(items[0].witnesses.find(w=>w.sourceId==='dar-ibn-kathir-2002').reading,null);
 assert.equal(items[1].sourceRole,undefined);assert.equal(chapterDifferenceContext(items).textualDifferences.includesHeading,true);
 const html=chapterDifferenceDetails(items,r.sources);assert(html.includes('Absent from this inspected heading.'));assert(!html.includes('>null<'));
 for(const mutate of [c=>delete c.contextDifferences,c=>c.contextDifferences.pop(),c=>c.contextDifferences[0].auditSha256='0'.repeat(64),c=>c.headingId='mwBg']){const c=structuredClone(chapter);mutate(c);assert.throws(()=>validateChapterDifferences(c,inv,r));}
 for(const mutate of [a=>a.unresolvedTextualDifferences.find(d=>d.id==='chapter-06-heading-extent').witnesses[1].reading='invented',a=>a.unresolvedTextualDifferences.find(d=>d.id==='chapter-06-heading-extent').witnesses.forEach(w=>{w.reading=null;w.readingSha256=null;})])assert.throws(()=>validateChapterDifferences(chapter,inv,r,path=>{const a=read(path);if(path.endsWith('night-prayer-source-audit.json'))mutate(a);return a;}),/Changed chapter difference audit/);
});

test('heading-only differences are valid without inventing introductory text or a pending English heading',()=>{
 const b=structuredClone(book),c=b.chapters[5];c.sourceContext.introduction={arabicParagraphs:0,englishStatus:'not-applicable'};assert.doesNotThrow(()=>validateChapters(b));
 const view=chapterMaterialView(c);assert(view.includes('heading or introductory wording'));assert(view.includes('working translation'));assert(view.includes('no separate introductory paragraph'));assert(!view.includes('English remains pending'));
 for(const value of [false,'true',1]){const bad=structuredClone(b);bad.chapters[5].sourceContext.textualDifferences.includesHeading=value;assert.throws(()=>validateChapters(bad),/unresolved chapter wording/);}
 const bad=structuredClone(b);delete bad.chapters[5].sourceContext.textualDifferences.includesHeading;assert.throws(()=>validateChapters(bad),/unresolved chapter wording/);
});

test('saved sessions and source holds stay intact while the new book and its complete notes are available offline',()=>{
 const saved={numbers:[1067,1068],cursor:1068,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,1069),saved);
 const next=startSession(source.entries,1069,5);assert.equal(next.numbers[0],1069);assert(next.numbers.every(n=>source.entries.some(e=>e.number===n)));
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='night-prayer');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));
 const route=notes.routes.find(r=>r.id==='hadith-1081'),html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8');assert(html.includes('1132'));assert(html.includes('A separate context link opens 1080’s chain'));
 assert.deepEqual(ledger.books.flatMap(b=>b.pendingEntries||[]).map(p=>p.number),[926,957]);
 assert.equal(read('research/night-prayer-first-wording-review.json').reviewSha256,hash(review()));
});
