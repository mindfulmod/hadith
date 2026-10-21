import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFaithBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {prototypeFiles} from '../scripts/build-opening-prototype.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {startSession,resolveSession,planSession,nextSession} from '../reader/session.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {recordedChapter} from '../reader/recording.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-faith-wikisource/catalog.json'),read('content/review/faith-first-review.json'),read('content/sources/wikisource-faith/manifest.json')];
test('the Faith batch retains exact Arabic, complete English and all declared source roles',()=>{
 const args=input(),original=structuredClone(args),{entries}=buildFaithBatch(...args);assert.deepEqual(args,original);
 for(const entry of entries){const row=args[1].entries.find(r=>r.number===entry.number);
  assert.deepEqual(entry.arabic_blocks,row.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));
  assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),row.segments.map(s=>s.english));
 }
 assert.deepEqual(sourceSegments(entries.find(e=>e.number===10),'english').map(s=>s.kind),['chain','report','transmission-note']);
 for(const n of [13,15])assert.deepEqual(sourceSegments(entries.find(e=>e.number===n),'english').map(s=>s.kind),['chain','chain','report']);
});
test('stale wording, Arabic replacements, missing chains and reassigned chapters cannot enter a batch',()=>{
 for(const change of [a=>a[1].entries[0].segments[1].english+=' changed',a=>a[1].entries[0].segments[0].arabic+=' changed',a=>{const s=a[1].entries[0].segments[0];s.english=s.english.replace('related to us','informed us');s.englishSha256=digest(s.english);a[1].entries[0].englishSha256=digest(a[1].entries[0].segments.map(s=>s.english).join('\n\n'));},a=>a[1].entries[0].segments.shift(),a=>a[1].chapters[0].entryNumbers=[9],a=>a[1].entries[0].independentReview='approved']){
  const a=input();change(a);const r=a[1].entries[0];delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);assert.throws(()=>buildFaithBatch(...a));
 }
});
test('assembly preserves the seven existing entries and admits only the explicit two-book version',()=>{
 const opening=prototypeFiles(),{source,ledger}=collectionFiles();assert.deepEqual(source.entries.slice(0,7),opening.source.entries);
 assert.equal(buildBooks(source,ledger).catalog.books.length,2);assert.equal(ledger.books[1].sourceEntryCount,51);assert.throws(()=>validateChapters({...ledger.books[1],sourceEntryCount:9}),/source entry count/);assert.throws(()=>buildBooks(source,ledger,{production:true}));
 const copy=structuredClone(source),l=structuredClone(ledger);copy.entries.push({...copy.entries.at(-1),number:18,id:'bukhari:18'});l.sourceRecordSha256=objectHash(copy);l.entries.push({...l.entries.at(-1),number:18,id:'bukhari:18'});assert.throws(()=>buildBooks(copy,l),/not admitted/);
});
test('a ten-minute session crosses the real book boundary without growing an existing seven-entry session',()=>{
 const {source}=collectionFiles();const plan=startSession(source.entries,7,10);assert(plan.numbers.includes(7)&&plan.numbers.includes(8));
 const saved={numbers:[7],cursor:7,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,7),saved);assert.equal(nextSession(source.entries,saved,5).cursor,8);
 assert.deepEqual(planSession(source.entries,17,5).numbers,[17]);for(let n=8;n<=17;n++)assert.equal(recordedChapter(n),null);
});
test('the two real books load separately and expose complete search content only after both succeed',async()=>{
 const {source,ledger,files:derived}=collectionFiles(),published=buildBooks(source,ledger),responses=new Map(published.files),calls=[];
 responses.set('source-review.html','Original notes');responses.set('prototype-review.html','Opening notes');responses.set('faith-review.html',derived.get('reader/faith-review.html'));
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async u=>{const path=u.pathname.slice(8);calls.push(path);return new Response(responses.get(path));}});
 await library.loadForNumber(8);assert.equal(calls.length,2);assert.equal(library.getEntry(7),undefined);assert.equal(library.getEntry(8).id,'bukhari:8');assert.deepEqual(await library.loadAllEntries(),source.entries);assert.equal(calls.length,3);
});
