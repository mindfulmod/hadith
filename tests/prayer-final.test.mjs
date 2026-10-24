import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-final-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const entry=n=>buildBookBatch(...input()).entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const mutate=(n,fn)=>{const a=input(),r=a[1].entries.find(r=>r.number===n);fn(r);rehash(r);return a;};
test('final Prayer batch preserves fourteen full Arabic reports, scripts and all previous Prayer entries',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:14},(_,i)=>485+i));assert.equal(batch.chapters.length,12);assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=484),read('reader/books/prayer-d69790d503546964.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),original[index]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('Prayer has complete selected inventory and chapter coverage without claiming independent approval',()=>{
 const a=input(),{source,ledger}=collectionFiles(),prayer=source.entries.filter(e=>e.book==='Prayer');assert.equal(prayer.length,157);assert.deepEqual(prayer.map(e=>e.number),a[0].records.map(r=>r.number));const registry=read('content/review/prayer-batches.json'),reviews=registry.batches.map(b=>read(b.path)),chapters=reviews.flatMap(r=>r.chapters);assert.deepEqual(chapters.map(c=>c.id),a[0].chapters.map(c=>c.id));assert.equal(chapters.length,108);assert.equal(chapters.reduce((n,c)=>n+c.contextIds.length,0),34);assert(prayer.every(e=>e.review.independentReview==='pending'));assert.deepEqual(reviews.flatMap(r=>r.entries).filter(e=>e.arabicCorrections).map(e=>e.number),[401,415]);
});
test('487 retains two full chains and an exactly bound Book 9 forward-only comparison',()=>{
 const a=input(),row=a[1].entries.find(r=>r.number===487),c=row.comparisons[1],e=entry(487);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','chain','report','transmission-note','report']);assert(e.arabic_blocks[0].includes('ﷺ ح وحدثنا'));assert.deepEqual(c.splitReferences[0].checkedBody,['Narrated Abu Sa\'id: ','The Prophet said, (what is ascribed to him in the following Hadith 488): ']);assert.equal(c.splitReferences[0].continuedByReference,'1.9.488');assert.deepEqual(c.splitReferences.flatMap(p=>p.segmentIds),row.segments.map(s=>s.id));assert.match(e.english_blocks[3],/^He said: I heard the Prophet/);assert.match(e.english_blocks[4],/resist him with force/);
});
test('forward comparisons cannot lose evidence, change books or point to another body',()=>{
 const changes=[c=>delete c.splitReferences[0].referenceEvidence,c=>delete c.splitReferences[1].referenceEvidence,c=>c.splitReferences[0].checkedBody[1]+=' changed',c=>c.splitReferences[0].continuedByReference='1.8.488',c=>c.splitReferences[0].continuedByReference='1.9.489',c=>c.splitReferences[0].segmentIds=['487-3'],c=>c.splitReferences[0].status='complete',c=>c.splitReferences[0].referenceEvidence.recordSha256='0'.repeat(64)];for(const change of changes)assert.throws(()=>buildBookBatch(...mutate(487,r=>change(r.comparisons[1]))));
});
test('488 leaves forty without a unit and preserves all three uncertain alternatives',()=>{
 const e=entry(488);assert.match(e.english_blocks[1],/standing for forty would/);assert.doesNotMatch(e.english_blocks[1],/forty (days|months|years)|of sin/);assert.equal(e.english_blocks[2],'Abu al-Nadr said: I do not know whether he said forty days, or months, or years.');assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');assert(narrationHTML(e).includes('I do not know whether'));
});
test('489, 492, 493 and 496 preserve internal attributions and differing report details',()=>{
 assert.match(entry(489).english_blocks[0],/Muslim—meaning Ibn Subayh/);assert.equal(entry(489).english_blocks.at(-1),'And from al-A‘mash, from Ibrahim, from al-Aswad, from ‘A’ishah: something similar.');assert.match(entry(492).english_blocks[1],/Muslim related to me/);assert.match(entry(492).english_blocks[2],/from beside his feet/);assert.doesNotMatch(entry(492).english_blocks[2],/relieve myself|foot of the bed/);assert.equal(sourceSegments(entry(493),'english')[1].kind,'transmission-note');assert.match(entry(493).english_blocks[1],/Does anything interrupt it/);assert.match(entry(493).english_blocks[1],/‘Urwah ibn al-Zubayr informed me/);assert.match(entry(496).english_blocks.at(-1),/Musaddad added, from Khalid.*Sulayman al-Shaybani related to us/);assert.equal((entry(496).english_blocks.join(' ').match(/I was menstruating/g)||[]).length,2);
});
test('485–486, 494–495 and 497 retain distinct words without importing comparison additions',()=>{
 assert.match(entry(485).english_blocks[2],/rear end—or he said, its back/);assert.match(entry(485).english_blocks[2],/may Allah Most High be pleased with him/);assert.match(entry(486).english_blocks[1],/foot of the bed/);assert.match(entry(494).english_blocks[1],/Abu al-‘As ibn al-Rabi‘ ibn ‘Abd Shams/);assert.doesNotMatch(entry(494).english_blocks[1],/neck/);assert.match(entry(495).english_blocks[0],/My maternal aunt/);assert.doesNotMatch(entry(495).english_blocks[1],/menstruat/);const r=input()[1].entries.find(r=>r.number===497);assert.equal(r.comparisons[0].status,'abbreviated-report');assert.equal(r.comparisons[0].referencedReference,'486');assert.match(entry(497).english_blocks[0],/may Allah Most High be pleased with her/);
});
test('498 preserves all repeated supplications, seven names, Fatimah honorific and the final account',()=>{
 const e=entry(498),text=e.english_blocks.join(' ');assert.equal((text.match(/O Allah, deal with Quraysh/g)||[]).length,3);for(const name of ['‘Amr ibn Hisham','‘Utbah ibn Rabi‘ah','Shaybah ibn Rabi‘ah','al-Walid ibn ‘Utbah','Umayyah ibn Khalaf','‘Uqbah ibn Abi Mu‘ayt','‘Umarah ibn al-Walid'])assert(text.includes(name));assert.match(text,/stomach contents, blood and afterbirth/);assert.match(text,/Fatimah, peace be upon her/);assert.match(e.english_blocks[2],/well—the well of Badr/);assert.match(e.english_blocks[3],/people of the well were followed by a curse/);assert.doesNotMatch(text,/all of them|except ‘Umarah|ibn Mas‘ud/);assert.throws(()=>buildBookBatch(...mutate(498,r=>r.segments.pop())));
});
test('final chapter introductions remain browse-only and completed sessions do not restart at the book end',()=>{
 const a=input(),{source,files}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(a[1].chapters.filter(c=>c.contextIds.length).map(c=>c.id),['chapter-99','chapter-101']);for(const c of a[1].chapters)for(const id of c.contextIds){const t=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(t)));assert(plan.entries.every(e=>!e.script.includes(t)));assert(files.get('reader/prayer-review.html').includes(t));}
 const saved={numbers:[483,484],cursor:484,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,498),saved);assert.equal(nextSession(source.entries,saved,5).cursor,485);for(const minutes of [5,10])for(let n=485;n<=498;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));assert.equal(nextSession(source.entries,{numbers:[498],cursor:498,ended:true},5),null);
});
