import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles}from'../scripts/build-collection.mjs';
import {validateAbsentBewleyComparison}from'../scripts/absent-english-comparisons.mjs';
import {narrationPlan}from'../scripts/build-audio.mjs';
import {buildBooks}from'../scripts/publish-books.mjs';
import {resolveSession,startSession}from'../reader/session.mjs';
import {validateChapters,chapterForNumber}from'../reader/navigation.mjs';
import {release}from'../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inv=read('content/staging/bukhari-rain-prayer-wikisource/catalog.json'),manifest=read('content/sources/wikisource-rain-prayer/manifest.json'),review=()=>read('content/review/rain-prayer-final-review.json'),cfg=BOOK_CONFIGS['rain-prayer'];
const {source,ledger,files}=collectionFiles(),batch=buildBookBatch(inv,review(),manifest,cfg),plan=narrationPlan(source),get=n=>batch.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const newNumbers=['983b',984,985,986,987,988,989,990,991,992];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('final Rain Prayer batch preserves the old entries and completes every distinct selected occurrence',()=>{
 const prior=read('reader/books/rain-prayer-6426971769eaf917.json');assert.deepEqual(source.entries.filter(e=>prior.entries.some(p=>p.id===e.id)),prior.entries);
 assert.deepEqual(review().entries.slice(0,8),read('content/review/rain-prayer-third-review.json').entries);
 assert.deepEqual(batch.entries.map(e=>e.number),[976,977,978,979,980,981,982,983,...newNumbers]);
 const book=ledger.books.find(b=>b.id==='rain-prayer');assert.equal(book.entryNumbers.length,34);assert.equal(book.sourceEntryCount,34);assert.equal(book.chapters.length,29);assert.equal(book.entryNumbers.at(-1),992);
 assert.deepEqual(source.entries.filter(e=>e.book===cfg.title).slice(-10).map(e=>e.number),newNumbers);assert.throws(()=>buildBooks(source,ledger,{production:true}),/production collection/);
});
test('each new script covers the complete chain and body with every selected honorific',()=>{
 for(const n of newNumbers){const e=get(n),r=review().entries.find(e=>e.number===n);assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));
  assert.equal(plan.entries.find(p=>p.number===n).script,text(n));assert.equal(text(n).split('may Allah bless him and grant him peace').length-1,e.arabic_blocks.join('').split('ﷺ').length-1);assert.equal(e.audio_status,'No recording yet.');assert.equal(e.review.independentReview,'pending');
  if(typeof n==='number'&&n!==986)assert.equal(e.arabic_blocks[0],inv.blocks.find(b=>b.htmlId===r.paragraphIds[0]).text);
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
test('983b has its own printed origin, stable references, corrected witness and visible limits',()=>{
 const e=get('983b'),p=e.review.printedReport;assert.equal(e.review.sourceRecordId,'dar-ibn-kathir-2002:1030');assert.equal(p.printReference,'1030');assert.equal(p.referenceDecision.status,'user-confirmed');assert.equal(p.selectedWitnessId,'dar-ibn-kathir-2002');
 assert.match(p.arabic,/أنه رفع/);assert.doesNotMatch(p.witnesses[0].reading,/أنه رفع/);assert.match(p.witnesses[0].differenceNote,/without annahu/);
 assert.match(text('983b'),/who both heard Anas/);assert.match(text('983b'),/until I saw/);assert.match(e.english_status,/Both selected English sequences omit/);assert.doesNotMatch(e.english_status,/two English witnesses/);
 const refs=ledger.sourceReferences.entries.find(e=>e.number==='983b');for(const id of ['bewley','khan'])assert.match(refs.citations.find(c=>c.id===id).locator,/No corresponding report/);assert(refs.citations.some(c=>c.sourceId==='sunnah-com-1030'));assert.match(files.get('reader/rain-prayer-review.html'),/App reference 983b corresponds to printed reference 1030/);
});
test('an absent English occurrence cannot borrow a label, substitute a source or hide comparison limits',()=>{
 const mutations=[r=>r.comparisons[0].reference='983',r=>{delete r.comparisons[0].status;r.comparisons[0].reference='983';},r=>r.comparisons[0].checkedReferences.reverse(),r=>r.comparisons[0].absenceEvidence.sha256='0'.repeat(64),r=>delete r.comparisons[0].absenceEvidence,r=>r.comparisons[0].note='',r=>r.comparisons[1].status=undefined,r=>r.printedReport.printReference='1031',r=>r.printedReport.referenceDecision.status='pending',r=>r.additionalCitations.shift(),r=>r.additionalCitations[0].scope='Full verified translation'];
 for(const mutate of mutations){const r=review(),row=r.entries.find(e=>e.number==='983b');mutate(row);assert.throws(()=>validateAbsentBewleyComparison(row.comparisons[0],row,cfg,r.sources));}
 const r=review(),row=r.entries.find(e=>e.number==='983b');r.sources.find(s=>s.id==='bewley-rain-prayer').url='https://example.com';assert.throws(()=>validateAbsentBewleyComparison(row.comparisons[0],row,cfg,r.sources));
});
test('the missing printed occurrence cannot be merged, moved or silently renumbered',()=>{
 for(const mutate of [r=>r.entries.splice(8,1),r=>r.entries[8].printedReport.beforeReference=985,r=>r.entries[8].printedReport.witnesses[0].reading+=' changed',r=>r.entries[8].number='983c',r=>r.chapters.find(c=>c.id==='chapter-20').entryNumbers.pop()]){const r=review();mutate(r);r.entries.forEach(rehash);assert.throws(()=>buildBookBatch(inv,r,manifest,cfg));}
});
test('986 applies only the declared two-print correction and retains its unmodified input',()=>{
 const row=review().entries.find(e=>e.number===986),original=inv.blocks.find(b=>b.htmlId==='mwcA').text;assert.match(original,/حتى سأل الوادي/);assert.equal(get(986).arabic_blocks[0],original.replace('حتى سأل الوادي','حتى سال الوادي'));assert.match(text(986),/flowed for a month/);
 for(const mutate of [r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].englishRendering='asked',r=>r.contextNotes=[]]){const r=review(),e=r.entries.find(e=>e.number===986);mutate(e);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,cfg));}
 assert.equal(row.arabicCorrections.length,1);
});
test('short prayers, chains and closing transmissions are neither expanded nor abbreviated',()=>{
 assert.match(text(984),/Yahya and Ibn Abi ‘Adi/);assert.doesNotMatch(text(984),/It may be|other invocations/);
 assert.match(text(985),/Abu al-Hasan al-Marwazi/);assert.match(text(985),/‘Abdullah informed us.*‘Ubaydullah informed us/s);assert.doesNotMatch(text(985),/O Allah/);assert.match(text(985),/Al-Qasim ibn Yahya corroborated it, from ‘Ubaydullah/);assert.match(text(985),/Al-Awza‘i and ‘Uqayl/);assert.equal(get(985).presentation.english.at(-1).kind,'transmission-note');
 assert.match(text(986),/That Bedouin, or another man/);assert.match(text(986),/the next day, the day after that and the following day/);
 assert.doesNotMatch(text(987),/anxiety|wrath|fearing/);
});
test('source glosses and repeated exchanges do not invent speakers or source wording',()=>{
 assert.match(text(989),/harj increases”—and it is killing, killing—“until wealth/);assert.doesNotMatch(text(989),/death of scholars/);
 assert.equal(text(990).split('O Allah, bless us in our Sham and in our Yemen.').length-1,2);assert.equal(text(990).split('And in our Najd.').length-1,2);assert.doesNotMatch(text(990),/Prophet|Messenger|may Allah bless/);
 assert.match(text(991),/By the naw’ of such-and-such/);assert.match(text(992),/The key to the unseen is five things/);assert.doesNotMatch(text(992),/keys to|sex of/);
 for(const n of [988,991,992])assert(ledger.sourceReferences.entries.find(e=>e.number===n).contextNotes.length);
});
test('chapter Arabic and the deferred Quran-quotation heading remain separate from numbered narration',()=>{
 const book=ledger.books.find(b=>b.id==='rain-prayer');validateChapters(book);assert.equal(chapterForNumber(book,'983b').id,'chapter-20');
 const chapter=book.chapters.find(c=>c.id==='chapter-27');assert.equal(chapter.title,'Chapter heading translation pending');assert.match(chapter.sourceContext.pendingHeading.reason,/Quran 56:82/);assert.equal(chapter.sourceContext.introduction.englishStatus,'pending');
 for(const id of ['mwbA','mwgQ','mwhg']){const original=inv.blocks.find(b=>b.htmlId===id);assert(original);assert(review().chapters.some(c=>c.contextIds.includes(id)));assert(!review().entries.some(e=>e.paragraphIds.includes(id)));}
 for(const change of [b=>delete b.chapters.find(c=>c.id==='chapter-27').sourceContext.pendingHeading,b=>b.chapters.find(c=>c.id==='chapter-27').sourceContext.pendingHeading.reason='',b=>b.chapters.find(c=>c.id==='chapter-27').sourceContext.headingStatus='reviewed-translation']){const b=structuredClone(book);change(b);assert.throws(()=>validateChapters(b));}
});
test('saved session membership is stable across the inserted suffix and source notes are offline',()=>{
 for(const saved of [{numbers:[982,983],cursor:983,ended:false},{numbers:[983,984],cursor:983,ended:false}])assert.deepEqual(resolveSession(source.entries,saved,5,984),saved);
 const fresh=startSession(source.entries,983,10);assert(fresh.numbers.includes('983b'));assert(fresh.numbers.indexOf('983b')<fresh.numbers.indexOf(984));
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='rain-prayer');for(const n of newNumbers){const route=notes.routes.find(r=>r.id==='hadith-'+n);assert(release.files.some(f=>f.path===route.path));}
 assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(e=>e.number)).filter(n=>n<=957),[926,957]);
});
