import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBookBatch,BOOK_CONFIGS,collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const input=()=>[read('content/staging/bukhari-two-eids-wikisource/catalog.json'),read('content/review/two-eids-final-candidate.json'),read('content/sources/wikisource-two-eids/manifest.json'),BOOK_CONFIGS['two-eids']];
const review=()=>input()[1],row=n=>review().entries.find(r=>r.number===n),english=n=>row(n).segments.map(s=>s.english).join(' ');

test('candidate preserves nineteen complete exact Arabic bodies and all fifty-five English spans in scripts',()=>{
 const [inv,r]=input(),batch=buildBookBatch(...input()),plan=narrationPlan({entries:batch.entries});
 assert.deepEqual(r.entries.map(e=>e.number),Array.from({length:19},(_,i)=>927+i));assert.equal(r.entries.flatMap(e=>e.segments).length,55);
 for(const e of r.entries){
  const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text).join(''),built=batch.entries.find(b=>b.number===e.number),en=e.segments.map(s=>s.english).join('\n\n');
  assert.equal(e.segments.map(s=>s.arabic).join(''),original);assert.equal(e.arabicSha256,sha(original));assert.equal(built.arabic_blocks.join(''),original);
  assert.equal(built.english_blocks.join('\n\n'),en);assert.equal(plan.entries.find(p=>p.number===e.number).script,en);assert.equal(e.arabicCorrections,undefined);
  assert.equal((original.match(/ﷺ/g)||[]).length,(en.match(/may Allah bless him and grant him peace/g)||[]).length);assert.equal(built.audio_status,'No recording yet.');
 }
});

test('shared English occurrence remains two entries with the exact continued-chain relationship',()=>{
 const a=row(935),b=row(936),ca=a.comparisons[1],cb=b.comparisons[1];
 assert.equal(ca.reference,'2.15.95');assert.equal(cb.reference,ca.reference);assert.deepEqual(ca.part,{index:1,count:2});assert.deepEqual(cb.part,{index:2,count:2});assert.deepEqual(ca.referenceEvidence,cb.referenceEvidence);
 assert.equal(b.contextNotes[0].related[0].number,935);assert.equal(b.segments[0].english.startsWith('Ibn Jurayj said:'),true);assert(!b.segments[0].english.includes('Ishaq'));
 const invalid=input();invalid[1].entries=invalid[1].entries.filter(e=>e.number!==936);assert.throws(()=>buildBookBatch(...invalid));
 const inflated=input();inflated[1].entries.filter(e=>[935,936].includes(e.number)).forEach(e=>e.comparisons[1].part.count=3);assert.throws(()=>buildBookBatch(...inflated),/all declared report parts/);
});

test('gender uncertainty, conjunction alternatives and repeated unknown places remain explicit',()=>{
 assert(english(931).includes('he said, or she said'));assert.equal(row(931).segments[2].kind,'chain');assert(english(932).includes('Fitr or Adha'));
 const r=english(937);assert(r.includes('twelve expeditions'));assert(r.includes('six expeditions'));assert(r.includes('Ayyub was uncertain'));assert(r.includes('seldom mentioned'));assert.equal(r.split('attend such-and-such').length-1,2);assert.equal(r.split('May my father be ransomed for him').length-1,1);assert(r.includes('may my father be ransomed for him'));
 assert(english(938).includes('Ibn ‘Awn said: Or the young women in seclusion.'));assert(english(941).includes('either he said'));assert(english(941).includes('or he said'));
 assert(english(941).includes('dearer to me than two sheep for meat'));assert(!english(941).includes('better than'));
});

test('complete narrator comments and selected quotation length stay distinct from the report',()=>{
 assert(row(935).segments.at(-1).english.includes('The zakat of the day of Fitr?'));assert.equal(row(935).segments.at(-1).kind,'transmission-note');
 const r=row(936);assert.equal(r.segments[2].english,'Hasan did not know who she was.');assert.equal(r.segments[2].kind,'transmission-note');assert(r.segments[1].english.includes('—the verse.'));assert(!r.segments[1].english.includes('not steal'));
 assert(r.segments.at(-1).english.includes('‘Abd al-Razzaq said:'));assert.equal(r.segments.at(-1).kind,'transmission-note');
 const closing=row(943).segments.at(-1);assert.equal(closing.kind,'transmission-note');assert(closing.english.includes('from Fulayh, from Sa‘id, from Abu Hurayrah'));assert(closing.english.endsWith('Jabir’s report is sounder.'));
});

test('both printed Aishah occurrences and their two explanatory notes remain one complete candidate',()=>{
 const r=row(944),audit=read('research/two-eids-final-candidate-audit.json');
 assert.deepEqual(audit.printedMappings.find(e=>e.appReference===944).darIbnKathirReferences,[987,988]);assert.equal(r.comparisons[1].reference,'2.15.103');
 assert.deepEqual(r.segments.filter(s=>s.kind==='transmission-note').map(s=>s.english),['Those days were the days of Mina.','Meaning, in the sense of safety.']);
 const text=english(944);assert(text.includes('playing the duff and beating it'));assert(text.includes('‘Umar rebuked them'));assert(text.includes('may Allah Most High be pleased with him'));assert(!text.includes('slave'));
});

test('fifteen complete chapters and four unchanged introductions stay outside the numbered scripts',()=>{
 const [inv,r]=input(),batch=buildBookBatch(...input()),ids=r.chapters.flatMap(c=>c.contextIds);
 assert.equal(r.chapters.length,15);assert.deepEqual(ids,['mwRQ','mwVQ','mwdw','mwfw']);assert.deepEqual(r.chapters.map(c=>c.id),inv.chapters.slice(11).map(c=>c.id));
 assert.equal(batch.chapters.filter(c=>c.sourceContext.introduction.englishStatus==='pending').length,4);
 assert.deepEqual(batch.chapters.flatMap(c=>c.entryNumbers),batch.entries.map(e=>e.number));
 for(const id of ids)assert(!batch.entries.some(e=>e.arabic_blocks.includes(inv.blocks.find(b=>b.htmlId===id).text)));
 assert(inv.blocks.find(b=>b.htmlId==='mwdw').text.includes('مولاهم'));
});

test('candidate preparation leaves the active reader and unresolved source hold unchanged',()=>{
 const r=review(),registry=read('content/review/two-eids-batches.json'),{source}=collectionFiles(),audit=read('research/two-eids-final-candidate-audit.json');
 assert.equal(r.candidateStatus,'prepared-not-admitted');assert(!registry.batches.some(b=>b.path.endsWith('two-eids-final-candidate.json')));assert.equal(source.entries.length,929);assert(!source.entries.some(e=>e.number>=926));
 assert.equal(audit.candidateSha256,sha(JSON.stringify(r)));assert.equal(audit.admission.registered,false);assert.equal(read('content/review/source-holds.json').holds[0].status,'unresolved');
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
