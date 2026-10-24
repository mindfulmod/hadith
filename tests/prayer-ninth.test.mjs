import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-ninth-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const entry=n=>buildBookBatch(...input()).entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 454–468 preserves all fifteen Arabic reports, complete scripts and older content',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:15},(_,i)=>454+i));assert.equal(batch.chapters.length,9);assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=453),read('reader/books/prayer-49360d19d1f411d6.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),original[index]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('459 keeps the repeated call and identifies its abbreviated English comparison',()=>{
 const a=input(),e=entry(459),row=a[1].entries.find(e=>e.number===459);assert.match(e.english_blocks[1],/Ka‘b ibn Malik! Ka‘b!/);assert.equal((e.english_blocks[1].match(/may Allah bless him and grant him peace/g)||[]).length,4);assert.equal(row.comparisons[0].status,'abbreviated-report');assert.equal(row.comparisons[0].referencedReference,'445');
 const english=read('content/staging/bukhari-en-islamhouse/catalog.json');for(const r of a[1].entries){const c=r.comparisons[1],record=english.records.find(e=>e.id===c.referenceEvidence.sourceRecordId);assert.equal(c.referenceEvidence.sourceSha256,english.sourceSha256);assert.equal(c.referenceEvidence.recordSha256,objectHash(record));assert.equal(record.id,english.namespace+':'+c.reference);}
 row.comparisons[1].reference='1.8.459';rehash(row);assert.throws(()=>buildBookBatch(...a));
});
test('460, 461 and 463 retain closing transmissions outside the collapsed opening chain',()=>{
 for(const n of [460,461,463]){const e=entry(n);assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');const html=narrationHTML(e),afterChain=html.slice(html.indexOf('</details>')+10);assert.match(afterChain,new RegExp(n===460?'He used to say':n===461?'Al-Walid ibn Kathir':'And from Ibn Shihab'));}
 assert.match(entry(460).english_blocks[1],/If he fears the dawn, he prays one/);assert.match(entry(461).english_blocks[1],/If you fear the dawn/);assert.match(entry(461).english_blocks.at(-1),/‘Ubayd Allah ibn ‘Abd Allah.*Ibn ‘Umar related to them/);
});
test('466 keeps narrator uncertainty, the complete memory correction and the separate abbreviated pointer',()=>{
 const e=entry(466);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);assert.match(e.english_blocks[0],/Ibn ‘Umar or Ibn ‘Amr/);assert.match(e.english_blocks[2],/I heard this report from my father, but I did not remember it/);assert.match(e.english_blocks[2],/Waqid set it right for me, from his father/);assert.match(e.english_blocks[2],/I heard my father saying/);assert.equal(e.english_blocks.at(-1),'With this.');assert.doesNotMatch(e.english_blocks.join(' '),/covenants|trusts|keep to your house/);
 const a=input(),row=a[1].entries.find(r=>r.number===466);row.segments.splice(2,1);rehash(row);assert.throws(()=>buildBookBatch(...a));
});
test('465 retains its selected documented variant and embedded clarification',()=>{
 const a=input(),e=entry(465),row=a[1].entries.find(r=>r.number===465);assert.match(e.english_blocks[1],/performs ablution well/);assert.match(e.english_blocks[1],/meaning, for him/);assert.match(e.english_blocks[1],/Allah, forgive him. Allah, have mercy on him/);assert.doesNotMatch(e.arabic_blocks[0],/يؤذ/);assert(row.notes.some(n=>n.includes('copies omitting يؤذ')));assert.equal(row.additionalCitations[0].sourceId,'ayni-market-465');assert.match(e.english_blocks[1],/twenty-five degrees/);
});
test('468 retains the forgotten prayer, four takbirs, two alternatives and indirect final attribution',()=>{
 const e=entry(468);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);assert.match(e.english_blocks[1],/one of the two afternoon prayers/);assert.equal(e.english_blocks[2],'Ibn Sirin said: Abu Hurayrah named it, but I forgot.');assert.equal((e.english_blocks[3].match(/said the takbir/g)||[]).length,4);assert.equal((e.english_blocks[3].match(/or longer/g)||[]).length,2);assert.match(e.english_blocks[3],/The prayer has been shortened/);assert.match(e.english_blocks[4],/Sometimes they would ask him/);assert.match(e.english_blocks[4],/I was informed that ‘Imran ibn Husayn said/);assert.doesNotMatch(e.english_blocks.join(' '),/Dhuhr|‘Asr|I heard ‘Imran/);
});
test('454, 464 and 467 preserve the selected honorific, recollection and disputed name',()=>{
 assert.match(entry(454).english_blocks[1],/may Allah Most High be pleased with him/);assert.match(entry(454).english_blocks[0],/from ‘Ubayd ibn Hunayn, from Busr ibn Sa‘id/);assert.match(entry(464).english_blocks[1],/^I never knew my parents except as followers of the religion/);assert.doesNotMatch(entry(464).english_blocks.join(' '),/puberty|converted/);assert.match(entry(467).english_blocks[0],/Abu Burdah ibn ‘Abd Allah ibn Abi Burdah/);assert(input()[1].entries.find(e=>e.number===467).notes.some(n=>n.includes('historical print has Burayd')));
});
test('all three new chapter introductions remain browse-only while daily sessions use numbered reports',()=>{
 const a=input(),{source,files}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(a[1].chapters.filter(c=>c.contextIds.length).map(c=>c.id),['chapter-80','chapter-85','chapter-86']);assert.equal(a[1].chapters.reduce((n,c)=>n+c.contextIds.length,0),3);
 for(const c of a[1].chapters)for(const id of c.contextIds){const t=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(t)));assert(plan.entries.every(e=>!e.script.includes(t)));assert(files.get('reader/prayer-review.html').includes(t));}
 const saved={numbers:[452,453],cursor:453,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,468),saved);assert.equal(nextSession(source.entries,saved,5).cursor,454);for(const minutes of [5,10])for(let n=454;n<=468;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));
});
