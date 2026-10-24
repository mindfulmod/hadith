import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-tenth-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const entry=n=>buildBookBatch(...input()).entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const mutate=(n,fn)=>{const a=input(),r=a[1].entries.find(r=>r.number===n);fn(r);rehash(r);return a;};
test('Prayer 469–484 preserves every source span, full script and preceding entry',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:16},(_,i)=>469+i));assert.equal(batch.chapters.length,9);assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=468),read('reader/books/prayer-5665fb2bd50256d9.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),original[index]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('470 retains all nine accounts and discloses its second source as an omission notice',()=>{
 const e=entry(470);assert.equal(e.english_blocks.length,10);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain',...Array(9).fill('report')]);assert.match(e.english_status,/omission notice, not a translation/);assert.equal((e.english_blocks.join(' ').match(/And (?:‘Abd Allah(?: ibn ‘Umar)? related to him|Ibn ‘Umar used)/g)||[]).length,8);for(const word of ['samurah','sarhah','al-‘Irq','al-Safrawat','two or three graves','ten cubits'])assert(e.english_blocks.join(' ').includes(word));
 const {ledger}=collectionFiles();assert.match(ledger.sourceReferences.entries.find(e=>e.number===470).citations.find(c=>c.id==='khan').locator,/translation omitted/);
});
test('omission evidence cannot be erased, forged or used for an ordinary translated body',()=>{
 for(const fn of [r=>{delete r.comparisons[1].status;delete r.comparisons[1].checkedBody;},r=>r.comparisons[1].checkedBody[0]+=' changed',r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.comparisons[1].part={index:1,count:2}])assert.throws(()=>buildBookBatch(...mutate(470,fn)));
 const omission=input()[1].entries.find(e=>e.number===470).comparisons[1];assert.throws(()=>buildBookBatch(...mutate(469,r=>Object.assign(r.comparisons[1],{status:'translation-omitted',checkedBody:omission.checkedBody,note:'Claimed omission.'}))));
});
test('edition book changes require an allowed book and exact individually pinned evidence',()=>{
 const a=input();assert.deepEqual(BOOK_CONFIGS.prayer.khanBooks,[8,9]);for(const r of a[1].entries.filter(r=>r.number>=471&&r.number<=483)){assert.match(r.comparisons[1].reference,/^1\.9\./);assert(r.comparisons[1].referenceEvidence);}
 for(const fn of [r=>delete r.comparisons[1].referenceEvidence,r=>r.comparisons[1].reference='1.10.472',r=>r.comparisons[1].reference='1.9.473'])assert.throws(()=>buildBookBatch(...mutate(471,fn)));
});
test('the new English comparison page resolves per report without replacing previous citations',()=>{
 const {ledger}=collectionFiles(),refs=ledger.sourceReferences;for(const n of [469,470,471,484]){const c=refs.entries.find(e=>e.number===n).citations.find(c=>c.id==='bewley'),s=refs.sources.find(s=>s.id===c.sourceId);assert.equal(s.url,'https://aishabewley.org/bukhari'+(n<471?'5':'6'));}
 for(const id of ['unknown','brill-1862'])assert.throws(()=>buildBookBatch(...mutate(471,r=>r.comparisons[0].sourceId=id)));
});
test('484 declares its absent comparison with adjacent pinned records in Book 9',()=>{
 const e=entry(484),a=input(),c=a[1].entries.at(-1).comparisons[1];assert.match(e.english_status,/absent from the checked sequence/);assert.deepEqual(c.checkedReferences,['1.9.484','1.9.485']);assert.match(e.english_blocks[1],/about three cubits/);assert.match(e.english_blocks.at(-1),/^He said: There is no harm/);assert(a[1].entries.at(-1).notes.some(n=>n.includes('untitled chapter')));
 for(const fn of [r=>delete r.comparisons[1].checkedReferenceEvidence,r=>r.comparisons[1].checkedReferences[1]='1.9.486'])assert.throws(()=>buildBookBatch(...mutate(484,fn)));
});
test('closing transmissions remain visible and pillar variants are not harmonized',()=>{
 for(const n of [469,472,481,483,484]){const e=entry(n);assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');const html=narrationHTML(e);assert(html.slice(html.indexOf('</details>')+10).includes(e.english_blocks.at(-1).slice(0,14)));}
 assert.match(entry(481).english_blocks.at(-1),/from ‘Amr, from Anas/);assert.match(entry(483).english_blocks[1],/one pillar to his left, one pillar to his right and three pillars behind/);assert.match(entry(483).english_blocks.at(-1),/Malik related to me.*Two pillars to his right/);
});
test('report-specific distinctions survive comparison against similar accounts',()=>{
 assert.match(entry(471).english_blocks[1],/nearing puberty/);assert.match(entry(471).english_blocks[1],/without facing a wall/);assert.match(entry(473).english_blocks[1],/passing in front of him/);assert.match(entry(477).english_blocks[1],/passing beyond it/);assert.doesNotMatch(entry(477).english_blocks[1],/two rak‘ahs/);assert.match(entry(478).english_blocks[1],/staff, or a stick, or a short spear/);assert.doesNotMatch(entry(474).english_blocks[1],/head|prostration/);assert.match(entry(475).english_blocks[0],/^Al-Makki related/);assert.match(entry(476).english_blocks[0],/Nafi‘ informed me/);
});
test('standalone headings and chapter introductions are browseable without becoming session items',()=>{
 const a=input(),b=buildBookBatch(...a),{source,files}=collectionFiles(),plan=narrationPlan(source),empty=b.chapters.find(c=>c.id==='chapter-89');assert.deepEqual(empty.entryNumbers,[]);assert.equal(empty.sourceContext.numberedReports,'none-in-source');assert.equal(a[1].chapters.reduce((n,c)=>n+c.contextIds.length,0),1);
 for(const c of a[1].chapters)for(const id of c.contextIds){const t=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(t)));assert(plan.entries.every(e=>!e.script.includes(t)));assert(files.get('reader/prayer-review.html').includes(t));}
 const saved={numbers:[467,468],cursor:468,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,484),saved);assert.equal(nextSession(source.entries,saved,5).cursor,469);for(const minutes of [5,10])for(let n=469;n<=484;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));
 const long=planSession(source.entries,470,5);assert(long.numbers.includes(470));assert(long.numbers.every(Number.isSafeInteger));
});
