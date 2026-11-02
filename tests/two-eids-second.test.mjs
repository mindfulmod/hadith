import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBookBatch,BOOK_CONFIGS,collectionFiles} from '../scripts/build-collection.mjs';
import {validateSourceHolds} from '../scripts/source-holds.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const inv=()=>read('content/staging/bukhari-two-eids-wikisource/catalog.json');
const review=()=>read('content/review/two-eids-second-review.json');
const config=BOOK_CONFIGS['two-eids'];
const inputs=()=>[inv(),review(),read('content/sources/wikisource-two-eids/manifest.json'),config];
const english=n=>review().entries.find(r=>r.number===n).segments.map(s=>s.english).join(' ');

test('second Two Eids batch preserves seven exact bodies and all fifteen translated spans in narration',()=>{
 const r=review(),inventory=inv(),{source}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(r.entries.map(e=>e.number),[919,920,921,922,923,924,925]);assert.equal(r.entries.flatMap(e=>e.segments).length,15);
 for(const row of r.entries){
  const ar=inventory.blocks.find(b=>b.htmlId===row.paragraphIds[0]).text,e=source.entries.find(e=>e.number===row.number),en=row.segments.map(s=>s.english).join('\n\n');
  assert.equal(row.segments.map(s=>s.arabic).join(''),ar);assert.equal(e.arabic_blocks.join(''),ar);
  assert.equal(e.english_blocks.join('\n\n'),en);assert.equal(plan.entries.find(e=>e.number===row.number).script,en);
  assert.equal((ar.match(/ﷺ/g)||[]).length,(en.match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(row.arabicCorrections,undefined);assert.equal(e.audio_status,'No recording yet.');
 }
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});

test('repeated reports retain their distinct full chains, honorifics, counts and conjunctions',()=>{
 assert(english(919).includes('Ibn Jurayj informed us'));assert(english(919).includes('Al-Hasan ibn Muslim informed me'));
 assert(english(919).includes('may Allah Most High be pleased with them.'));
 assert(english(920).includes('may Allah Most High be pleased with them both'));assert(english(920).includes('the two Eids'));
 const e=english(921);assert(e.includes('two rak‘ahs'));assert(e.includes('before it or after it'));assert(e.includes('her earring and her necklace'));assert(!e.includes('earring or'));
});

test('sacrifice reports retain different uncertain clauses without importing ages or identities',()=>{
 const a=english(922),b=english(925);
 assert(a.includes('I heard al-Sha‘bi'));assert(a.includes('fulfil—or suffice'));assert(!a.includes('maternal uncle'));
 assert(b.includes('My maternal uncle'));assert(b.includes('I slaughtered before praying'));assert(b.includes('or he said, ‘Slaughter it’'));
 for(const text of [a,b]){assert(!text.includes('year'));assert(!text.includes('hajj rite'));assert(text.includes('better than a mature animal'));}
 assert(!review().entries.find(e=>e.number===925).segments[0].english.includes('ibn ‘Azib'));
});

test('injury reports keep prior-practice wording, the third-person question and separate closing explanation',()=>{
 const a=english(923);assert(a.includes('arch of his foot'));assert(a.includes('stirrup'));assert(a.includes('he began visiting him'));assert(a.includes('You carried weapons'));assert(!a.includes('forbidden'));
 const r=review().entries.find(r=>r.number===924);assert(r.segments[0].english.includes('related to me, from his father'));
 assert(r.segments[1].english.includes('How is he?'));assert(!r.segments[1].english.includes('How are you?'));
 assert(r.segments[1].english.includes('not lawful'));assert.equal(r.segments.at(-1).kind,'transmission-note');assert.equal(r.segments.at(-1).english,'Meaning al-Hajjaj.');
});

test('complete chapter contexts remain Arabic-only and outside report scripts',()=>{
 const [inventory,r]=inputs(),batch=buildBookBatch(...inputs()),{ledger,source}=collectionFiles();
 assert.equal(r.chapters.length,3);assert.deepEqual(r.chapters.flatMap(c=>c.contextIds),['mwOQ','mwPQ']);
 const notesBook=read('reader/source-notes.json').books.find(b=>b.index.path==='two-eids-review.html'),notePath=notesBook.routes.find(r=>r.id==='chapter-09').path;
 const notes=readFileSync(new URL('../reader/'+notePath,import.meta.url),'utf8');
 for(const id of ['mwOQ','mwPQ'])assert(notes.includes(inventory.blocks.find(b=>b.htmlId===id).text));
 const chapters=ledger.books.find(b=>b.id==='two-eids').chapters.slice(0,10);
 assert.equal(chapters.length,10);assert.equal(chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,2);
 assert.equal(batch.entries.length,7);assert(!source.entries.some(e=>e.number===926));
 assert(!narrationPlan(source).entries.filter(e=>e.number>=919).some(e=>e.script.includes('ibn Busr')));
});

test('documented material variant cannot enter an ordinary batch, even as a rehashed review',()=>{
 const a=inputs(),original=a[0].records.find(r=>r.number===926),row={...structuredClone(a[1].entries.at(-1)),number:926,id:'bukhari:926',sourceRecordId:original.id,paragraphIds:original.paragraphIds};
 delete row.reviewRecordSha256;row.reviewRecordSha256=createHash('sha256').update(JSON.stringify(row)).digest('hex');a[1].entries.push(row);
 assert.throws(()=>buildBookBatch(...a),/Unresolved source wording hold: bukhari:926/);
 assert.throws(()=>validateSourceHolds(inv(),{entries:[{number:927,sourceRecordId:original.id}]},config),/Unresolved source wording hold/);
});

test('hold evidence and source identity cannot be silently changed or marked resolved',()=>{
 const check=(i=inv(),h=read('content/review/source-holds.json'))=>validateSourceHolds(i,review(),config,h);
 check();
 for(const mutate of [
  h=>h.holds[0].status='resolved',
  h=>h.holds[0].sourceId='new-source',
  h=>h.holds[0].sourceSha256='0'.repeat(64),
  h=>h.holds[0].arabicSha256='0'.repeat(64),
  h=>h.holds[0].evidence.sha256='0'.repeat(64),
  h=>h.holds.push(structuredClone(h.holds[0]))
 ]){const h=read('content/review/source-holds.json');mutate(h);assert.throws(()=>check(inv(),h));}
 const i=inv();i.records=i.records.filter(r=>r.number!==926);assert.throws(()=>check(i),/missing or remapped/);
 const evidence=read('research/two-eids-926-wording-review.json');assert.equal(evidence.decision.readerEligible,false);assert.equal(evidence.decision.englishTranslationSupplied,false);assert.equal(evidence.printedEvidence.length,2);
});
