import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';import {buildBooks,objectHash} from '../scripts/publish-books.mjs';import {narrationPlan} from '../scripts/build-audio.mjs';import {sourceSegments} from '../reader/source-structure.mjs';import {startSession,visitSession} from '../reader/session.mjs';import {ENTRY_COUNT,RECORDED_NUMBERS} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=t=>createHash('sha256').update(t).digest('hex');
const input=()=>[read('content/staging/bukhari-friday-prayer-wikisource/catalog.json'),read('content/review/friday-prayer-final-review.json'),read('content/sources/wikisource-friday-prayer/manifest.json'),BOOK_CONFIGS['friday-prayer']];const row=(a,n)=>a[1].entries.find(e=>e.number===n);const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=objectHash(e);};

test('Friday final preserves all 46 source spans, full scripts and honorifics',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:20},(_,i)=>880+i));assert.equal(a[1].entries.flatMap(e=>e.segments).length,46);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),original=r.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text),derived=deriveArabicBlocks(r,original,a[1].sources);assert.deepEqual(e.arabic_blocks,derived);assert.deepEqual(r.paragraphIds.map(id=>r.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),derived);if(![880,885,891].includes(r.number))assert.deepEqual(derived,original);assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(plan.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));}
 assert.equal(source.entries.length,ENTRY_COUNT);assert.deepEqual(RECORDED_NUMBERS,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('all three Arabic corrections retain originals and require both printed witnesses plus matching English',()=>{
 const a=input(),batch=buildBookBatch(...a);for(const [n,before,after,pages] of [[880,'قال','قالت',[234,223]],[885,'أمه','أمة',[235,224]],[891,'الماء','المال',[237,225]]]){
  const r=row(a,n),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text,c=r.arabicCorrections[0],e=batch.entries.find(e=>e.number===n);assert.equal(r.arabicCorrections.length,1);assert.equal(c.before,before);assert.equal(c.after,after);assert.deepEqual(c.witnesses.map(w=>w.pdfPage),pages);assert.equal(r.originalArabicSha256,sha(raw));assert.equal(e.review.originalArabicSha256,sha(raw));const points=Array.from(raw);points.splice(c.start,c.end-c.start,c.after);assert.equal(e.arabic_blocks[0],points.join(''));
  for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].witnesses[0].sourceSha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='invented wording']){const b=input(),r=row(b,n);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...b));}
 }
});

test('880 distinguishes the missing EPUB occurrence from the modern web body despite their shared legacy label',()=>{
 const a=input(),r=row(a,880),gap=r.comparisons[1],{ledger}=collectionFiles();assert.equal(gap.status,'not-present-in-checked-sequence');assert.equal(gap.reference,null);assert.deepEqual(gap.checkedReferences,['2.13.44','2.13.45']);assert.deepEqual(gap.checkedReferenceEvidence.map(x=>x.sourceRecordId),['islamhouse-bukhari-epub-2010:2.13.44','islamhouse-bukhari-epub-2010:2.13.45']);
 const ref=ledger.sourceReferences.entries.find(e=>e.number===880);assert(ref.citations.find(c=>c.id==='khan').scope.includes('Neither is this complete Asma’ report'));assert.equal(ref.citations.find(c=>c.id==='modern-922').sourceId,'sunnah-friday-922');assert.equal(a[1].sources.find(s=>s.id==='sunnah-friday-922').url,'https://sunnah.com/bukhari:922');
 for(const mutate of [c=>c.reference='2.13.44',c=>c.checkedReferences=['2.13.43','2.13.45'],c=>c.checkedReferenceEvidence.reverse(),c=>delete c.checkedReferenceEvidence]){const b=input(),r=row(b,880);mutate(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...b));}
});

test('880 keeps its uncertainty, corrected reply and separate first-person Hisham ending',()=>{
 const e=buildBookBatch(...input()).entries.find(e=>e.number===880),p=sourceSegments(e,'english');assert.deepEqual(p.map(s=>s.kind),['chain','report','transmission-note']);assert(p[0].text.startsWith('And Mahmud said:'));assert(!p[0].text.includes('Mahmud related to us'));assert.equal((p[1].text.match(/Hisham was unsure/g)||[]).length,2);assert(p[1].text.includes('She said: He said'));assert(p[1].text.includes('believed, responded, followed and affirmed'));assert(p[2].text.includes('Hisham said: Fatimah did indeed tell it to me, and I retained it'));assert(!p[2].text.includes('she retained'));assert(!p[1].text.includes('angels'));
 const b=input(),r=row(b,880);r.segments.pop();r.englishSha256=sha(r.segments.map(s=>s.english).join('\n\n'));rehash(r);assert.throws(()=>buildBookBatch(...b));
});

test('881–884 retain every corroborating route and the repeated transition formula',()=>{
 const entries=buildBookBatch(...input()).entries,text=n=>entries.find(e=>e.number===n).english_blocks;
 for(const n of [881,882])assert.equal(text(n).at(-1),'Yunus corroborated this.');
 assert(text(881)[1].includes('wealth or captives'));assert(text(881)[1].includes('red camels in exchange'));
 const p=sourceSegments(entries.find(e=>e.number===883),'english');assert.deepEqual(p.map(s=>s.kind),['chain','report','transmission-note','transmission-note']);for(const name of ['Abu Mu‘awiyah','Abu Usamah','Hisham','his father','Abu Humayd'])assert(p[2].text.includes(name));assert(p[3].text.includes('Al-‘Adani'));assert.equal((p.map(s=>s.text).join(' ').match(/Now then/g)||[]).length,3);assert.equal(text(884).at(-1),'Al-Zubaydi corroborated this, from al-Zuhri.');
});

test('the negative answer, two temporal negatives and precise Quran quotation are preserved',()=>{
 const entries=buildBookBatch(...input()).entries,text=n=>entries.find(e=>e.number===n).english_blocks[1];assert(text(888).includes('pray two units'));assert(text(889).includes('‘No.’'));assert(!text(889).includes('‘Yes.’'));const t=text(891);for(const phrase of ['had not lowered them before','had not come down from his pulpit before','or he said, someone else','the day following','Qanat flowed for a month'])assert(t.includes(phrase),phrase);
 assert(text(894).endsWith('‘When they see trade or diversion, they disperse towards it and leave you standing.’'));assert(!text(894).includes('Syria'));assert(!text(894).includes('camels'));assert.equal((text(895).match(/two units/g)||[]).length,5);assert(!text(895).endsWith('at home.'));
});

test('897 links its earlier account without inserting that body into reading or narration',()=>{
 const a=input(),r=row(a,897),entry=buildBookBatch(...a).entries.find(e=>e.number===897),p=sourceSegments(entry,'english'),{source}=collectionFiles();assert(p[1].text.startsWith('With this account'));assert(p[1].text.includes('neither take our midday rest nor eat lunch'));assert(!p[1].text.includes('chard'));assert.deepEqual(r.contextNotes[0].related,[{id:'bukhari:896',number:896,target:'entry',label:'Read the preceding account · 896'}]);assert.equal(narrationPlan(source).entries.find(e=>e.number===897).script,entry.english_blocks.join('\n\n'));
});

test('the complete Friday section contains every numbered record and separate chapter context',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='friday-prayer');assert.deepEqual(source.entries.filter(e=>e.book==='Friday Prayer').map(e=>e.number),a[0].records.map(e=>e.number));assert.equal(book.chapters.length,41);assert.equal(book.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),12);const batch=buildBookBatch(...a);assert.equal(batch.chapters.length,13);assert.equal(a[1].chapters.flatMap(c=>c.contextIds).length,2);
 for(const id of a[1].chapters.flatMap(c=>c.contextIds)){const text=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(text)));}
 const session=startSession(source.entries,879,10);assert.deepEqual(session.numbers.slice(0,2),[879,880]);assert.deepEqual(visitSession(session,1),session);
});
