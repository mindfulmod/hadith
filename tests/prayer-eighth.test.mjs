import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-eighth-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 446–453 preserves all eight complete Arabic reports and full speech scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),[446,447,448,449,450,451,452,453]);assert.equal(batch.chapters.length,7);assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=445),read('reader/books/prayer-22c4e6375c21864b.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),original[index]);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('448 remains abbreviated and its transmission notes stay visible when the chain is closed',()=>{
 const e=buildBookBatch(...input()).entries.find(e=>e.number===448);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','transmission-note']);const html=narrationHTML(e),afterChain=html.slice(html.indexOf('</details>')+10);assert.match(afterChain,/I do not think it was anyone but a woman/);assert.match(afterChain,/that he prayed at his grave/);assert.doesNotMatch(e.english_blocks.join(' '),/Show me|Why did you not/);
 const a=input(),row=a[1].entries.find(e=>e.number===448);row.segments.pop();rehash(row);assert.throws(()=>buildBookBatch(...a));
});
test('literal 450f and 450m comparison labels stay bound to different pinned bodies',()=>{
 const a=input(),english=read('content/staging/bukhari-en-islamhouse/catalog.json');for(const r of a[1].entries){const c=r.comparisons[1],record=english.records.find(e=>e.id===c.referenceEvidence.sourceRecordId);assert.equal(c.referenceEvidence.sourceSha256,english.sourceSha256);assert.equal(c.referenceEvidence.recordSha256,objectHash(record));assert.equal(record.id,english.namespace+':'+c.reference);}
 assert.equal(a[1].entries.find(e=>e.number===448).comparisons[1].reference,'1.8.450f');assert.equal(a[1].entries.find(e=>e.number===449).comparisons[1].reference,'1.8.450m');
 const row=a[1].entries.find(e=>e.number===448);row.comparisons[1].reference='1.8.450m';rehash(row);assert.throws(()=>buildBookBatch(...a));
});
test('449 retains the inserted uncertainty, complete quotation and closing Rawh attribution',()=>{
 const e=buildBookBatch(...input()).entries.find(e=>e.number===449);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','report','transmission-note']);assert.match(e.english_blocks[0],/Rawh and Muhammad ibn Ja‘far informed us/);assert.equal(e.english_blocks[2],'or words like that—');assert.match(e.english_blocks[3],/My Lord, forgive me and grant me a kingdom/);assert.equal(e.english_blocks.at(-1),'Rawh said: He sent him away in disgrace.');assert.match(narrationHTML(e),/Rawh said/);
});
test('453 preserves its independent chain, mapped spacing and disclosed printed heading difference',()=>{
 const a=input(),row=a[1].entries.find(e=>e.number===453),batch=buildBookBatch(...a),e=batch.entries.at(-1);assert.deepEqual(row.paragraphIds,['mwAaI@2-243']);assert.equal(row.sourceLayout.paragraphs[0].origin.start,2);assert.equal(row.sourceLayout.paragraphs[0].layoutDecisionId,'layout-mwAaI');assert.match(e.english_blocks[0],/Muhammad ibn al-Muthanna.*Mu‘adh ibn Hisham.*My father related to me.*Qatadah.*Anas/);assert.doesNotMatch(e.english_blocks.join(' '),/‘Abbad|Usayd|miracle/);assert(row.notes.some(n=>n.includes('untitled chapter 79')));assert.deepEqual(batch.chapters.at(-1).entryNumbers,[452,453]);
 delete row.sourceLayout.paragraphs[0].layoutDecisionId;rehash(row);assert.throws(()=>buildBookBatch(...a));
});
test('all three chapter introductions are browseable but excluded from sessions and speech',()=>{
 const a=input(),{source,files}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(a[1].chapters.filter(c=>c.contextIds.length).map(c=>c.id),['chapter-74','chapter-76','chapter-78']);assert.equal(a[1].chapters.reduce((n,c)=>n+c.contextIds.length,0),3);
 for(const c of a[1].chapters)for(const id of c.contextIds){const t=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>!e.arabic_blocks.includes(t)));assert(plan.entries.every(e=>!e.script.includes(t)));assert(files.get('reader/prayer-review.html').includes(t));}
 const saved={numbers:[444,445],cursor:445,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,453),saved);assert.equal(nextSession(source.entries,saved,5).cursor,446);for(const minutes of [5,10])for(let n=446;n<=453;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));
});
