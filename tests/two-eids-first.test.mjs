import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBookBatch,BOOK_CONFIGS,collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inputs=()=>[read('content/staging/bukhari-two-eids-wikisource/catalog.json'),read('content/review/two-eids-first-review.json'),read('content/sources/wikisource-two-eids/manifest.json'),BOOK_CONFIGS['two-eids']];
const entry=n=>inputs()[1].entries.find(e=>e.number===n);
const english=n=>entry(n).segments.map(s=>s.english).join(' ');

test('first Two Eids batch preserves all thirteen source bodies, complete scripts and both honorific forms',()=>{
 const [inv,review]=inputs(),{source}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(review.entries.map(e=>e.number),Array.from({length:13},(_,i)=>906+i));
 assert.equal(review.entries.flatMap(e=>e.segments).length,33);
 for(const r of review.entries){
  const text=inv.blocks.find(b=>b.htmlId===r.paragraphIds[0]).text,e=source.entries.find(e=>e.number===r.number),en=e.english_blocks.join('\n\n');
  assert.equal(e.arabic_blocks.join(''),text);assert.equal(r.segments.map(s=>s.arabic).join(''),text);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.equal(plan.entries.find(e=>e.number===r.number).script,en);
  assert.equal((text.match(/ﷺ/g)||[]).length,(en.match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal((text.match(/عليه السلام/g)||[]).length,(en.match(/peace be upon him/g)||[]).length);
  assert.equal(r.arabicCorrections,undefined);assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});

test('Eid, took and ibn Niyar follow the Arabic rather than comparison errors or expansions',()=>{
 const first=english(906);assert(first.includes('for Eid and for delegations'));assert(!first.includes('Jumu‘a'));assert(first.includes('‘Umar took a robe'));assert(first.includes('He took it'));
 assert.equal((first.match(/clothing of one who has no share/g)||[]).length,2);assert(!first.includes('Hereafter'));
 const sacrifice=english(912);assert(sacrifice.includes('Abu Burdah ibn Niyar'));assert(sacrifice.includes('maternal uncle'));assert(!sacrifice.includes('Dinar'));
 assert(sacrifice.includes('before the prayer, and has no sacrifice'));assert(sacrifice.includes('will not suffice for anyone after you'));
});

test('joined account 907 retains two bodies, uncertainty, both replies and the shorter written honorific',()=>{
 const r=entry(907),text=english(907);
 assert.deepEqual(r.segments.map(s=>s.kind),['chain','report','report']);assert(r.segments[2].arabic.startsWith('وكان يوم عيد'));
 assert(text.includes('Either I asked the Prophet'));assert(text.includes('or he said'));assert.equal((text.match(/I said, ‘Yes.’/g)||[]).length,2);
 assert(text.includes('my cheek against his cheek'));assert(text.includes('peace be upon him'));
 assert(r.notes.some(n=>n.includes('949 and 950')));assert(r.additionalCitations.some(c=>c.id==='joined-accounts'));
 assert.equal(r.comparisons[1].reference,'2.15.70');assert(!text.includes('ibn ‘Isa'));
});

test('the interposed Aisha comment and complete Murajja closing chain are never dropped from narration',()=>{
 const r=entry(909);assert.equal(r.segments[2].kind,'transmission-note');assert.equal(r.segments[2].english,'She said: They were not singers.');assert(r.segments[3].english.startsWith('Abu Bakr said'));
 const closing=entry(910).segments.at(-1);assert.equal(closing.kind,'transmission-note');assert(closing.english.includes('Murajja’ ibn Raja’ said'));
 assert.equal((closing.english.match(/related to me/g)||[]).length,2);assert(closing.english.endsWith('He would eat them in an odd number.'));
 assert(english(910).includes('Sa‘id ibn Sulayman related to us'));assert(!english(910).includes('Sa‘id ibn Sulayman informed us'));
});

test('uncertainty, the full Marwan exchange and both oaths survive without harmonization',()=>{
 assert(english(911).includes('It was as though'));assert.equal(entry(911).segments.at(-1).english,'I do not know whether the permission extended to anyone other than him or not.');
 const r=entry(913),text=english(913);assert.equal(r.segments.length,3);assert(r.segments[2].english.startsWith('Abu Sa‘id said'));
 assert(text.includes('on Adha or Fitr'));assert(text.includes('I pulled at his garment, and he pulled me'));
 assert.equal((text.match(/By Allah/g)||[]).length,2);assert(text.includes('so I placed it before the prayer'));
});

test('four selected occurrences share exactly identified parts of one pinned comparison without merging',()=>{
 const a=inputs(),rows=a[1].entries.filter(r=>r.number>=915);
 assert.deepEqual(rows.map(r=>r.comparisons[1].reference),Array(4).fill('2.15.78'));
 assert.deepEqual(rows.map(r=>r.comparisons[1].part),[1,2,3,4].map(index=>({index,count:4})));
 assert.deepEqual(rows.map(r=>r.comparisons[0].reference),['915','916','917','918']);
 assert.equal(new Set(rows.map(r=>r.comparisons[1].referenceEvidence.recordSha256)).size,1);
 for(const change of [r=>r.comparisons[1].part.index=1,r=>r.comparisons[1].part.count=3,r=>delete r.comparisons[1].part,r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64)]){
  const b=inputs(),r=b[1].entries.find(e=>e.number===918);change(r);delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);assert.throws(()=>buildBookBatch(...b));
 }
});

test('continued chains link back separately without inserting another entry’s chain or losing the final dialogue',()=>{
 for(const n of [916,917,918]){
  const r=entry(n);assert.equal(r.contextNotes.length,1);assert.deepEqual(r.contextNotes[0].related.map(x=>x.number),[915]);assert(!english(n).includes('Ibrahim ibn Musa'));
 }
 assert(english(915).includes('Ibn Jurayj informed them'));assert(english(915).includes('‘Ata’ informed me'));assert(english(917).includes('They both said'));
 const last=entry(918).segments.at(-1);assert.equal(last.kind,'transmission-note');assert(last.english.startsWith('I said to ‘Ata’'));assert(last.english.endsWith('Why should they not do it?’'));
 assert(!english(917).includes('ï¿½'));assert(!english(916).includes('life time'));
});

test('shared reference validation rejects jointly inflated totals, missing members and reversed part identities',()=>{
 for(const mutate of [
  rows=>rows.forEach(r=>r.comparisons[1].part.count=5),
  rows=>rows.forEach((r,i)=>r.comparisons[1].part.index=4-i)
 ]){
  const a=inputs(),rows=a[1].entries.filter(r=>r.number>=915);mutate(rows);
  for(const r of rows){delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);}
  assert.throws(()=>buildBookBatch(...a),/all declared report parts|complete, unique and in source order/);
 }
 const missing=inputs();missing[1].entries.pop();assert.throws(()=>buildBookBatch(...missing),/all declared report parts/);
 const orphan=inputs();orphan[1].entries=[entry(915)];assert.throws(()=>buildBookBatch(...orphan),/all declared report parts/);
});

test('complete chapters, pending later reports and source-only context keep distinct publication scopes',()=>{
 const [inv,review]=inputs(),batch=buildBookBatch(...inputs()),{source,ledger}=collectionFiles();
 assert.equal(inv.records.length,40);assert.equal(inv.chapters.length,26);assert.equal(review.chapters.length,7);
 assert.equal(review.chapters.flatMap(c=>c.contextIds).length,0);assert.equal(inv.chapters.flatMap(c=>c.contextIds).length,7);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:13},(_,i)=>906+i));
 assert(!source.entries.some(e=>e.number===919));assert.deepEqual(ledger.books.find(b=>b.id==='two-eids').chapters.map(c=>c.id),review.chapters.map(c=>c.id));
});
