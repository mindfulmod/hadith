import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {buildBooks} from '../scripts/publish-books.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/shortening-first-review.json'),inv=read('content/staging/bukhari-shortening-wikisource/catalog.json'),manifest=read('content/sources/wikisource-shortening/manifest.json'),config=BOOK_CONFIGS.shortening;
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book===config.title),book=ledger.books.find(b=>b.id==='shortening');
const get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('sixteen full reports retain exact original Arabic and forty complete translated spans',()=>{
 assert.deepEqual(entries.map(e=>e.number),Array.from({length:16},(_,i)=>1030+i));
 assert.equal(review().entries.reduce((s,r)=>s+r.segments.length,0),40);
 const plan=narrationPlan(source);
 for(const r of review().entries){const e=get(r.number);assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,text(r.number));assert.equal(e.review.independentReview,'pending');assert.equal(e.audio_status,'No recording yet.');}
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});

test('duration reports keep distinct numbers, visible narrator framing and declared English ellipsis',()=>{
 assert.match(text(1030),/nineteen days.*nineteen days.*if we exceeded that/s);
 assert.doesNotMatch(text(1030),/Mecca|two rak/);
 assert.match(get(1031).english_blocks[1],/^I heard Anas say/);
 assert.match(text(1031),/two rak‘ahs at a time.*I asked.*ten days/s);
 const r=review();assert(r.entries[0].contextNotes[0].text.includes('leaves days understood'));
 const a=read('research/shortening-source-audit.json');assert.deepEqual(a.records[1].englishComparisons.bewley.limitations,[]);assert(a.intakeFindingCorrections[0].correctedFinding.includes('not a publisher typo'));
});

test('Mina accounts retain selected narrator names, superlative security and all repeated prayer clauses',()=>{
 assert.match(text(1032),/from ‘Abdullah, may Allah Most High be pleased with him/);assert.doesNotMatch(text(1032),/‘Abdullah ibn ‘Umar/);
 assert.match(text(1033),/greatest security/);assert.doesNotMatch(text(1033),/Prophet I|number of people/);
 assert.equal(text(1034).split('may Allah Most High be pleased with him').length-1,4);
 assert.equal(text(1034).split('two rak‘ahs at Mina').length-1,3);
 assert.match(text(1034),/uttered the declaration of return to Allah.*two accepted rak‘ahs/s);
 assert.doesNotMatch(text(1034),/said sadly|Truly to Allah|Qutaybah ibn Sa/);
});

test('the fourth-morning report keeps its closing route without the comparison parenthesis',()=>{
 assert.match(text(1035),/morning of the fourth.*talbiyah for Hajj/s);
 assert.equal(get(1035).english_blocks.at(-1),'‘Ata’ corroborated it from Jabir.');
 assert.deepEqual(get(1035).presentation.english.map(p=>p.kind),['chain','report','transmission-note']);
 assert.doesNotMatch(text(1035),/Dhul|Mecca|respond 4|obedient to your orders/);
});

test('travel accounts retain three days and each complete corroborating route without adding more than',()=>{
 assert.match(text(1036),/I said to Abu Usamah: ‘Ubayd Allah related to you/);
 for(const n of [1036,1037]){assert.match(text(n),/for three days except with a mahram/);assert.doesNotMatch(text(n),/more than|her brother|her husband/);}
 assert.match(get(1037).english_blocks.at(-1),/^Ahmad.*Ibn al-Mubarak.*‘Ubayd Allah.*Nafi‘.*Ibn ‘Umar.*Prophet.*grant him peace/s);
 assert.match(text(1038),/a journey of a day and a night/);
 assert.match(get(1038).english_blocks.at(-1),/^Yahya ibn Abi Kathir, Suhayl and Malik.*al-Maqburi.*Abu Hurayrah.*pleased with him/s);
 assert.notEqual(get(1036).arabic_sha256,get(1037).arabic_sha256);
});

test('the selected Asr wording and attributed interpretation exchange stay explicit',()=>{
 assert.match(get(1039).english_blocks[1],/^I prayed Dhuhr.*‘Asr at Dhu al-Hulayfah/s);
 assert(review().entries.find(r=>r.number===1039).contextNotes[0].text.includes('modern print does not'));
 assert.equal(get(1040).presentation.english.at(-1).kind,'transmission-note');
 assert.match(get(1040).english_blocks.at(-1),/^Al-Zuhri said: I asked ‘Urwah.*adopted the interpretation that ‘Uthman adopted/s);
});

test('1041 keeps both printed occurrences, two chains, repeated dialogue and the complete closing prayer sequence',()=>{
 const r=review().entries.find(r=>r.number===1041),e=get(1041);
 assert.deepEqual(e.presentation.english.map(p=>p.kind),['chain','report','chain','report','report','report']);
 assert.match(text(1041),/Al-Layth added.*Yunus related to me.*Ibn Shihab.*Salim/s);
 assert.equal(text(1041).split('“The prayer!”').length-1,2);assert.equal(text(1041).split('“Go on').length-1,2);
 assert.match(text(1041),/urgently called to help concerning his wife, Safiyyah.*two or three miles/s);
 assert.doesNotMatch(text(1041),/had died|was dying|news of the death/);
 assert.match(e.english_blocks.at(-1),/three rak‘ahs.*taslim.*iqamah.*two rak‘ahs.*taslim.*not pray voluntary.*middle of the night/s);
 assert(r.contextNotes[0].text.includes('1091 and 1092'));assert(!source.entries.some(e=>e.number==='1041b'));
});

test('mounted-prayer occurrences remain distinct and do not borrow later exceptions or expanded names',()=>{
 for(const n of [1042,1043,1044,1045])assert.doesNotMatch(text(n),/except.*obligatory|head/);
 assert.match(text(1042),/‘Abdullah ibn ‘Amir ibn Rabi‘ah, from his father/);
 assert.match(text(1043),/voluntary prayers.*direction other than the qiblah/s);
 assert.match(text(1044),/perform Witr on it/);
 assert.match(text(1045),/^Musa related to us/);assert.doesNotMatch(text(1045),/^Musa ibn Isma/);
 assert.equal(new Set([1042,1043,1044,1045].map(n=>get(n).arabic_sha256)).size,4);
});

test('known English limitations require the exact inspected evidence and cannot claim complete coverage',()=>{
 for(const n of [1035,1037,1038,1039,1041]){const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];assert.equal(validateDamagedBewleyComparison(c,row,config,r.sources),true);for(const change of [x=>{delete x.status;delete x.damageEvidence;},x=>x.damageEvidence.bodySha256='0'.repeat(64),x=>x.reference='1042']){const bad=structuredClone(c);change(bad);assert.throws(()=>validateDamagedBewleyComparison(bad,row,config,r.sources));}}
 for(const n of [1033,1035,1036,1037,1038,1039,1041]){const r=review(),row=r.entries.find(e=>e.number===n);row.comparisons[1].checkedBody[1]+=' changed';rehash(row);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/pinned record/);}
});

test('all eight complete chapters and their two Arabic contexts remain separate from hadith narration',()=>{
 assert.equal(book.chapters.length,8);assert.deepEqual(book.chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number));
 assert.equal(book.chapters.reduce((s,c)=>s+c.sourceContext.introduction.arabicParagraphs,0),2);
 for(const id of ['mwFg','mwIA']){const b=inv.blocks.find(b=>b.htmlId===id);assert(!entries.some(e=>e.arabic_blocks.some(p=>p.includes(b.text))));}
 for(const change of [r=>r.chapters.splice(3,1),r=>r.chapters[4].contextIds=[],r=>r.entries.pop()]){const r=review();change(r);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});

test('saved sessions remain intact and all new reports and chapter source routes are saved offline',()=>{
 const saved={numbers:[1028,1029],cursor:1029,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,1030),saved);
 const next=startSession(source.entries,1030,5);assert.equal(next.numbers[0],1030);assert(next.numbers.every(n=>source.entries.some(e=>e.number===n)));
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='shortening');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));
 const route=notes.routes.find(r=>r.id==='hadith-1041'),html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8');assert(html.includes('1091 and 1092')&&html.includes('urgently called to help'));
 assert(!source.entries.some(e=>e.number===1046||e.number===1064));
});
