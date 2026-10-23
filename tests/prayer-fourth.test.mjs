import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {sourceParts,sourceHTML} from '../reader/source-format.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-fourth-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 378–392 preserves exact Arabic, complete narration and prior Prayer records',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:15},(_,i)=>378+i));assert.equal(batch.chapters.length,9);
 const old=read('reader/books/prayer-681f08c2c44f7513.json');assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=377),old.entries);
 for(const row of a[1].entries){const entry=batch.entries.find(e=>e.number===row.number),arabic=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;assert.equal(row.segments.map(s=>s.arabic).join(''),arabic);assert.equal(entry.arabic_blocks.join(''),arabic);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===row.number).script,entry.english_blocks.join('\n\n'));assert.equal((arabic.match(/ﷺ/g)||[]).length,(entry.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('literal suffix references and an absent comparison are disclosed without inventing a match',()=>{
 const a=input(),{source,ledger}=collectionFiles(),rows=a[1].entries;
 assert.equal(rows.find(e=>e.number===381).comparisons[1].reference,'1.8.385l');assert.equal(rows.find(e=>e.number===383).comparisons[1].reference,'1.8.385u');
 const absent=rows.find(e=>e.number===382).comparisons[1];assert.equal(absent.reference,null);assert.deepEqual(absent.checkedReferences,['1.8.385l','1.8.385u']);assert.equal(absent.status,'not-present-in-checked-sequence');
 const entry=source.entries.find(e=>e.number===382);assert.match(entry.english_status,/one English translation family/);assert.match(entry.english_blocks.at(-1),/I think he said/);
 const refs=ledger.sourceReferences.entries.find(e=>e.number===382);assert.match(refs.citations.find(c=>c.id==='khan').locator,/385l → 1.8.385u/);assert(refs.citations.some(c=>c.id==='modern-389'));assert.equal(refs.contextNotes[0].label,'An English source gap');
});
test('comparison absence requires actual adjacent source records and pinned suffix evidence',()=>{
 const inventory=read('content/staging/bukhari-en-islamhouse/catalog.json');const ev=ref=>{const r=inventory.records.find(r=>r.id===inventory.namespace+':'+ref);return {sourceSha256:inventory.sourceSha256,sourceRecordId:r.id,recordSha256:objectHash(r)};};
 for(const change of [c=>delete c.checkedReferenceEvidence,c=>c.checkedReferenceEvidence[0].recordSha256='0'.repeat(64),c=>{c.checkedReferences=['1.8.385u','1.8.385l'];c.checkedReferenceEvidence=c.checkedReferences.map(ev);},c=>{c.checkedReferences=['1.8.384','1.8.385u'];c.checkedReferenceEvidence=c.checkedReferences.map(ev);},c=>{c.checkedReferences=['1.8.385l','1.8.386'];c.checkedReferenceEvidence=c.checkedReferences.map(ev);},c=>c.checkedReferences=['1.8.385','1.8.386']]){const a=input(),r=a[1].entries.find(r=>r.number===382);change(r.comparisons[1]);rehash(r);assert.throws(()=>buildBookBatch(...a));}
});
test('all chains, uncertainty, quoted scope and report perspectives remain distinct',()=>{
 const {source}=collectionFiles(),e=n=>source.entries.find(e=>e.number===n),t=n=>e(n).english_blocks.join(' ');
 assert.equal(e(380).presentation.english.at(-1).kind,'transmission-note');assert.equal(e(382).presentation.english.at(-1).kind,'transmission-note');assert.match(t(383),/al-Layth said: Ja‘far ibn Rabi‘ah related to me something similar/);
 assert.equal(e(385).presentation.english.filter(s=>s.kind==='chain').length,3);assert.match(t(385),/Ibn Abi Maryam said: Yahya informed us; Humayd related to us; Anas related to us/);assert.match(t(385),/slaughter as we slaughter/);assert.match(t(385),/eats what we slaughter/);
 assert.match(t(386),/east or west/);assert.match(t(386),/I heard Abu Ayyub/);assert.equal((t(387).match(/We asked/g)||[]).length,2);assert.equal((t(388).match(/two rak‘ahs/g)||[]).length,2);assert.match(t(389),/did not pray until he came out/);
 assert.match(t(390),/sixteen or seventeen/);assert.match(t(390),/He said that he testified/);assert.doesNotMatch(t(391),/optional|non-obligatory/);
 assert.deepEqual(e(392).presentation.english.map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(e(392).english_blocks[2],'Ibrahim said: I do not know whether he added or omitted.');assert.doesNotMatch(t(392),/five|Dhuhr/);
});
test('dual honorifics stay complete within smaller spans, including earlier entries',()=>{
 const {source}=collectionFiles();for(const n of [8,10,12,390]){const entry=source.entries.find(e=>e.number===n),text=entry.english_blocks[0],phrase='may Allah Most High be pleased with them both';assert(text.includes(phrase));assert(sourceParts(text).some(p=>p.honorific&&p.text===phrase));assert.equal(sourceParts(text).map(p=>p.text).join(''),text);assert(sourceHTML(text).includes('<span class="honorific">'+phrase+'</span>'));assert(narrationPlan(source).entries.find(e=>e.number===n).script.includes(phrase));}
});
test('four chapter introductions stay outside sessions and full narration scripts',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer'),plan=narrationPlan(source),chapters=a[1].chapters.filter(c=>c.contextIds.length);assert.deepEqual(chapters.map(c=>c.id),['chapter-23','chapter-28','chapter-29','chapter-31']);
 for(const c of chapters){assert.equal(book.chapters.find(b=>b.id===c.id).sourceContext.introduction.englishStatus,'pending');for(const id of c.contextIds){const intro=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>e.arabic_blocks.every(t=>!t.includes(intro))));assert(plan.entries.every(e=>!e.script.includes(intro)));}}
 const saved={numbers:[376,377],cursor:377,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,392),saved);assert.equal(nextSession(source.entries,saved,5).cursor,378);
 for(const minutes of [5,10])for(let n=378;n<=392;n++){const session=planSession(source.entries,n,minutes);assert.equal(session.numbers[0],n);assert(session.numbers.every(number=>source.entries.some(e=>e.number===number)));}
});
