import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOpeningPrototype,prototypeFiles} from '../scripts/build-opening-prototype.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {sourceContextHTML} from '../reader/source-references.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {recordedChapter} from '../reader/recording.mjs';
import {planSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const args=()=>[read('research/bukhari-opening-review.json'),read('content/review/opening-next-drafts.json'),read('content/review/opening-prototype-decisions.json'),read('content/review/opening-ledger.json')];
test('the personal edition preserves original inputs and makes only its declared text changes',()=>{
 const inputs=args(),before=structuredClone(inputs),result=buildOpeningPrototype(...inputs);
 assert.deepEqual(inputs,before);assert.deepEqual(result.source.entries.slice(0,2),inputs[0].entries);
 for(const entry of result.source.entries.slice(2)){
  const draft=inputs[1].entries.find(e=>e.number===entry.number);
  const original=draft.arabicParagraphIds.map(id=>draft.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''));
  if(entry.number===5){const p=draft.proposedCorrections[0],index=draft.arabicParagraphIds.indexOf(p.paragraphId),chars=Array.from(original[index]);assert.equal(chars.slice(p.start,p.end).join(''),p.original);chars.splice(p.start,p.end-p.start,...Array.from(p.replacement));original[index]=chars.join('');}
  assert.deepEqual(entry.arabic_blocks,original);
  const expected=draft.segments.map(s=>s.english);
  for(const d of entry.review.decisions)for(const edit of d.englishEdits){const i=draft.segments.findIndex(s=>s.id===edit.segmentId);expected[i]=expected[i].replace(edit.before,edit.after);}
  assert.deepEqual(entry.english_blocks,expected);
  assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),expected);
  assert.equal(sourceSegments(entry,'arabic').map(s=>s.text).join(''),original.join(''));
 }
});
test('stale decisions, omitted wording questions and invented review approval cannot generate an edition',()=>{
 for(const change of [a=>a[1].entries[0].segments[1].english+=' altered',a=>a[2].decisions.pop(),a=>a[2].decisions[0].reviewerKind='human',a=>a[2].decisions[0].englishEdits[0].before='missing phrase',a=>a[2].arabicCorrections[0].proposalId='invented']){
  const inputs=args();change(inputs);assert.throws(()=>buildOpeningPrototype(...inputs));
 }
});
test('seven-entry prototype cannot become production, silently expand, or admit changed wording by rebinding its ledger',()=>{
 const {source,ledger}=prototypeFiles();assert.equal(buildBooks(source,ledger).catalog.entries.length,7);
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
 const promotion=structuredClone(ledger);promotion.publication='production';assert.throws(()=>buildBooks(source,promotion),/Reuse rights/);
 const changed=structuredClone(source),review=structuredClone(ledger);changed.entries[2].english_blocks[1]+=' altered';review.sourceRecordSha256=objectHash(changed);assert.throws(()=>buildBooks(changed,review),/not admitted/);
});
test('continued chains and the declared correction have entry-specific evidence and offline notes',()=>{
 const {source,ledger,files}=prototypeFiles();const html=sourceContextHTML(ledger.sourceReferences,4);
 assert.match(html,/#read\/3\/chain/);assert.match(html,/separate from the narration/);
 assert.match(sourceContextHTML(ledger.sourceReferences,5),/recorded source correction/);
 const notes=files.get('reader/prototype-review.html');
 for(const n of [3,4,5,6,7])assert.equal(notes.split(`id="hadith-${n}"`).length,2);
 const original=JSON.parse(files.get('reader/prototype-inputs.json')).originalDraft.entries.find(e=>e.number===5);
 assert(original.segments.find(s=>s.id==='5-3').arabic.includes('جمعه له في صدرك'));
 assert(source.entries.find(e=>e.number===5).arabic_blocks.join('').includes('جمعه لك في صدرك'));
});
test('the expanded library loads all seven exact texts while recordings remain limited to their real coverage',async()=>{
 const {source,ledger,files:derived}=prototypeFiles(),published=buildBooks(source,ledger),responses=new Map(published.files);
 for(const [path,body] of derived)if(path.startsWith('reader/'))responses.set(path.slice(7),body);
 responses.set('source-review.html','Original comparison notes');
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async url=>new Response(responses.get(url.pathname.slice(8)))});
 assert.deepEqual(await library.loadAllEntries(),source.entries);
 for(const n of [1,2,3,4,5,6])assert.equal(recordedChapter(n).number,n);
 assert.equal(recordedChapter(7),null);
 const plan=planSession(published.catalog.entries,3,5);assert.equal(plan.numbers[0],3);assert(plan.numbers.every(n=>n>=3&&n<=7));
 const long=planSession(published.catalog.entries,7,5);assert.deepEqual(long.numbers,[7]);
});
