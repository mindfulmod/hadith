import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-seventh-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 425–445 preserves all 24 Arabic paragraphs and every complete narration script',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(a.slice(0,3),before);assert.equal(batch.chapters.length,17);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:21},(_,i)=>425+i));assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=424),read('reader/books/prayer-e27bc4d42f5992fb.json').entries);assert.equal(a[1].entries.reduce((n,e)=>n+e.paragraphIds.length,0),24);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),original[index]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('428 retains the poem, closing exchange and narrator alternatives as separate original spans',()=>{
 const a=input(),e=buildBookBatch(...a).entries.find(e=>e.number===428);assert.equal(e.arabic_blocks.length,4);assert.deepEqual(e.english_blocks.slice(-3),['“The day of the wishah is among the wonders of our Lord;','indeed, He rescued me from the town of unbelief.”','‘A’ishah said: I said to her: “Why is it that you never sit with me without saying this?” She said: She told me this account.']);assert.match(e.english_blocks[1],/put it down, or it fell/);assert.match(e.english_blocks[1],/her private parts/);assert.match(e.english_blocks[3],/tent in the mosque, or a small hut/);assert.doesNotMatch(e.english_blocks.join(' '),/jewels/);
 const r=a[1].entries.find(e=>e.number===428);r.segments.splice(-2,1);rehash(r);assert.throws(()=>buildBookBatch(...a));
});
test('427 distinguishes an explicit earlier comparison pointer from the selected complete report',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===427),c=r.comparisons[0],{source,files}=collectionFiles(),e=source.entries.find(e=>e.number===427);assert.equal(c.status,'abbreviated-report');assert.equal(c.referencedReference,'328');assert(r.additionalCitations.some(c=>c.sourceId==='bewley-tayammum-pointer-328'));assert(files.get('reader/prayer-review.html').includes('https://aishabewley.org/bukhari4'));assert.match(e.english_blocks[1],/sent to all people\. I have been given intercession/);assert.notDeepEqual(e.english_blocks,source.entries.find(e=>e.number===328).english_blocks);
 delete c.status;rehash(r);assert.throws(()=>buildBookBatch(...a));
});
test('the complete 436 clause and 440 question are not replaced by compressed English comparisons',()=>{
 const {source}=collectionFiles(),t=n=>source.entries.find(e=>e.number===n).english_blocks.join(' ');assert.match(t(436),/The rebellious group will kill him/);assert.match(t(436),/He calls them to Paradise, and they call him to the Fire/);assert.doesNotMatch(t(436),/Muawiya|Mu‘awiyah/);assert.match(t(440),/I said to ‘Amr: “Did you hear Jabir/);assert.match(t(440),/Hold them by their heads/);assert.doesNotMatch(t(440),/Yes/);assert.match(t(441),/Abu Burdah ibn ‘Abd Allah.*I heard Abu Burdah, from his father/);assert.doesNotMatch(t(442),/Gabriel/);
});
test('uncertainty and every embedded or closing transmission remain visible and in order',()=>{
 const {source}=collectionFiles(),e=n=>source.entries.find(e=>e.number===n),k=n=>sourceSegments(e(n),'english').map(s=>s.kind);
 assert.deepEqual(k(432),['chain','report','transmission-note','report']);assert.match(narrationHTML(e(432)),/I think he said/);assert.deepEqual(k(439),['chain','report','transmission-note','report']);assert.match(e(439).english_blocks[2],/Bukayr said: I think he said/);assert.deepEqual(k(443),['chain','report','chain','report']);assert.doesNotMatch(e(443).english_blocks[1],/spears/);assert.match(e(443).english_blocks[2],/Ibrahim ibn al-Mundhir.*Ibn Wahb.*Yunus/);assert.match(e(443).english_blocks[3],/spears/);
 assert.deepEqual(k(444),['chain','report','transmission-note','report','transmission-note','report','transmission-note']);assert.equal((e(444).english_blocks.join(' ').match(/Sufyan once said/g)||[]).length,2);assert.match(e(444).english_blocks[3],/the one who sets free/);assert.match(e(444).english_blocks[5],/a hundred times/);assert.match(e(444).english_blocks.at(-1),/‘Ali said: Yahya and ‘Abd al-Wahhab.*Ja‘far ibn ‘Awn.*Malik related/);assert.match(narrationHTML(e(444)),/He did not mention/);assert.doesNotMatch(e(444).english_blocks.join(' '),/for the manumitted|a hundred conditions/);
});
test('the untitled chapter and four introductions remain separate from numbered sessions',()=>{
 const a=input(),{source,files}=collectionFiles(),plan=narrationPlan(source);assert.equal(a[1].chapters[0].title,'Untitled chapter');assert.match(a[1].chapters[0].titleArabic,/^باب\s*$/);assert.equal(a[1].chapters.reduce((n,c)=>n+c.contextIds.length,0),4);assert.deepEqual(a[1].chapters.filter(c=>c.contextIds.length).map(c=>c.id),['chapter-58','chapter-59','chapter-62','chapter-63']);
 for(const c of a[1].chapters)for(const id of c.contextIds){const t=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(t)));assert(plan.entries.every(e=>!e.script.includes(t)));assert(files.get('reader/prayer-review.html').includes(t));}
 const saved={numbers:[423,424],cursor:424,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,445),saved);assert.equal(nextSession(source.entries,saved,5).cursor,425);for(const minutes of [5,10])for(let n=425;n<=445;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));
});
test('every added English comparison is bound to its individual pinned record',()=>{
 const a=input(),english=read('content/staging/bukhari-en-islamhouse/catalog.json');for(const r of a[1].entries){const c=r.comparisons[1],record=english.records.find(e=>e.id===c.referenceEvidence.sourceRecordId);assert.equal(c.referenceEvidence.sourceSha256,english.sourceSha256);assert.equal(c.referenceEvidence.recordSha256,objectHash(record));assert.equal(record.id,english.namespace+':'+c.reference);}
 const b=input(),r=b[1].entries.find(e=>e.number===444);r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64);rehash(r);assert.throws(()=>buildBookBatch(...b));
});
