import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validReference,parseReference,referenceBase,compareReferences,referenceSpan,contiguousReferences} from '../reader/references.mjs';
import {normalizeState,createPersonalStore,storageKey,legacyStorageKey} from '../reader/personal-state.mjs';
import {makeBackup,parseBackup,mergeBackup} from '../reader/backup.mjs';
import {buildBooks,digest} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
import {searchEntries,createSearchIndex,createLibrarySearch} from '../reader/search.mjs';
import {startSession,visitSession,nextSession,resolveSession} from '../reader/session.mjs';
import {listeningPlan} from '../reader/listening-plan.mjs';
import {bookView,savedView} from '../reader/library.mjs';
import {sourceDialogHTML,sourceContextHTML} from '../reader/source-references.mjs';
import {partitionSourceNotes,checkSourceNotePublication} from '../scripts/source-notes.mjs';
import {sourceNoteTarget} from '../reader/source-notes.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {referenceFixture} from './helpers/reference-fixture.mjs';

test('canonical references keep numeric and suffixed identities separate without coercion',()=>{
 for(const value of [1,619,'619b',10000000,'10000000z'])assert(validReference(value));
 for(const value of [0,-1,1.5,Infinity,NaN,true,null,{},[],10000001,'1','0619b','619B','619bb','٦١٩b','619 b','<b>'])assert(!validReference(value));
 assert.equal(parseReference('619'),619);assert.equal(parseReference('00619'),619);assert.equal(parseReference('619b'),'619b');assert.equal(parseReference('619B'),null);assert.equal(parseReference('619B',{ignoreCase:true}),'619b');assert.equal(parseReference('619b trailing'),null);
 assert.deepEqual([620,'619b',619,10,9].sort(compareReferences),[9,10,619,'619b',620]);assert.equal(referenceBase('619b'),619);
});
test('source order spans include a suffix and never turn it into an integer range',()=>{
 const all=[618,619,'619b',620,621];assert.deepEqual(referenceSpan(all,619,620),[619,'619b',620]);assert.deepEqual(referenceSpan(all,'619b','619b'),['619b']);
 assert(contiguousReferences([619,'619b',620],all));for(const seq of [[619,620],['619b',619],['619b','619b'],['619'],[]])assert(!contiguousReferences(seq,all));
 assert.throws(()=>referenceSpan(all,620,619));assert.throws(()=>referenceSpan(all,619,622));
});
test('legacy saved data migrates intact and old releases cannot overwrite the new store',()=>{
 const old=normalizeState({last:180,saved:[1,180],finished:[2],positions:{180:372},session:{numbers:[180,181],cursor:180,ended:false},theme:'night',audio:{release:'cedar-opening-v1',seconds:44}});
 const values=new Map([[legacyStorageKey,JSON.stringify(old)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const first=createPersonalStore(storage);assert.deepEqual(first.get(),old);assert(!values.has(storageKey));
 first.set({saved:[1,180,'619b'],last:'619b',positions:{...old.positions,'619b':233},session:{numbers:[619,'619b',620],cursor:'619b',ended:false}});
 assert.deepEqual(JSON.parse(values.get(legacyStorageKey)),old);const current=structuredClone(first.get());values.set(legacyStorageKey,JSON.stringify(normalizeState({last:1,saved:[]})));
 assert.deepEqual(createPersonalStore(storage).get(),current);assert.equal(current.positions['619b'],233);assert.equal(current.session.cursor,'619b');
 first.holdWrites();first.set({saved:[]});assert.deepEqual(first.get(),current);
});
test('failed migration and restore leave the legacy copy and durable current data intact',()=>{
 const raw=JSON.stringify(normalizeState({saved:[1],last:180})),values=new Map([[legacyStorageKey,raw]]);let fail=true;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);}};
 const store=createPersonalStore(storage);store.set({saved:[1,'619b']});assert.equal(store.available(),false);assert.equal(values.get(legacyStorageKey),raw);assert(!values.has(storageKey));
 fail=false;store.set({});const before=structuredClone(store.get()),saved=values.get(storageKey);fail=true;assert.throws(()=>store.replaceTransactional({saved:[620]}));assert.deepEqual(store.get(),before);assert.equal(values.get(storageKey),saved);
});
test('backup v2 roundtrips distinct references, and legacy v1 remains importable',()=>{
 const state=normalizeState({last:'619b',saved:[619,'619b',620,'8000a'],finished:['619b'],positions:{619:12,'619b':400,620:0},session:{numbers:[619,'619b',620],cursor:'619b',ended:false}});
 const file=makeBackup(state);assert.equal(file.version,2);assert.deepEqual(parseBackup(JSON.stringify(file)).state,state);
 const legacy={...makeBackup(normalizeState({saved:[1,577],last:180})),version:1};assert.deepEqual(parseBackup(JSON.stringify(legacy)).state,legacy.state);
 assert.throws(()=>parseBackup(JSON.stringify({...file,version:1})));for(const bad of ['619','0619b','619B',619.5])assert.throws(()=>parseBackup(JSON.stringify({...file,state:{...state,saved:[bad]}})));
 assert.throws(()=>parseBackup(JSON.stringify({...file,state:{...state,session:{numbers:[619,'619b'],cursor:620}}})));
 const merged=mergeBackup(normalizeState({saved:[619],last:1}),state);assert.deepEqual(merged.saved,[619,'619b',620,'8000a']);assert.equal(merged.last,1);assert.equal(mergeBackup(normalizeState({}),state,true).last,'619b');
});
test('publication and verified book loading preserve complete suffixed records and source links',async()=>{
 const {source,ledger}=referenceFixture(),before=structuredClone(source),built=buildBooks(source,ledger),responses=new Map([...built.files,['fixture-review.html','Fixture notes']]);
 const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const library=await createContentLibrary({files,base:new URL('https://fixture.invalid/reader/'),fetcher:async url=>new Response(responses.get(url.pathname.slice(8)))});
 const pack=await library.loadForNumber('619b');assert.deepEqual(pack.entries,source.entries);assert.deepEqual(source,before);assert.equal(library.getEntry('619b').id,'fixture:619b');assert.equal(library.getEntry(619).id,'fixture:619');assert.equal(library.getEntry('619'),undefined);
 const html=sourceDialogHTML(pack.entries[1],pack);assert(html.includes('#hadith-619b'));assert(html.includes('#read/619/chain'));assert(sourceContextHTML(pack.sourceReferences,'619b').includes('data-sources="619b"'));
 const state=normalizeState({saved:[619,'619b']});assert(savedView(library.catalog,state).includes('#read/619b'));assert(bookView(library.catalog,state,{book:library.catalog.books[0],page:1}).includes('#read/619b'));
 const engine=createLibrarySearch({loadLibrary:async()=>library,sourceRecordSha256:library.catalog.sourceRecordSha256,yieldTask:()=>Promise.resolve()});assert.equal((await engine.search('619b')).results[0].entry.id,'fixture:619b');
 for(const bad of ['619','0619b','619B',619.5]){const fixture=referenceFixture([619,bad,620]);assert.throws(()=>buildBooks(fixture.source,fixture.ledger),/Invalid reference|Duplicate/);}
 const plan=narrationPlan(source);assert.deepEqual(plan.entries.map(e=>e.number),[619,'619b',620]);assert.equal(plan.entries[1].script,source.entries[1].english_blocks.join('\n\n'));
});
test('synchronous and compact search distinguish 619 from 619b in references and exact text',async()=>{
 const {source}=referenceFixture(),index=await createSearchIndex(source.entries,{yieldTask:()=>Promise.resolve()});
 for(const q of ['619b','Hadith 619b','#619b','Bukhari 619B','"619b"'])for(const result of [searchEntries(source.entries,q),await index.search(q)])assert.deepEqual(result.results.map(r=>r.entry.number),['619b']);
 for(const result of [searchEntries(source.entries,'619'),await index.search('619')])assert.deepEqual(result.results.map(r=>r.entry.number),[619]);
 assert.deepEqual((await index.search('exact test words',1,1)).results.map(r=>r.entry.number),['619b']);
});
test('finite sessions follow catalogue order through the suffix while free browsing preserves Continue',()=>{
 const {source}=referenceFixture(),session=startSession(source.entries,619,5);assert.deepEqual(session.numbers,[619,'619b',620]);const moved=visitSession(session,'619b');assert.equal(moved.cursor,'619b');assert.deepEqual(visitSession(moved,700),moved);assert.deepEqual(resolveSession(source.entries,moved,5),moved);
 assert.equal(nextSession(source.entries,{numbers:[619],cursor:619,ended:true},5).cursor,'619b');assert.equal(nextSession(source.entries,{numbers:['619b'],cursor:'619b',ended:true},5).cursor,620);assert.equal(nextSession(source.entries,{numbers:[620],cursor:620,ended:true},5),null);
});
test('listening uses catalogue adjacency and stops at a missing suffixed recording',()=>{
 const {source}=referenceFixture(),recordings=[619,'619b',620].map(number=>({id:'fixture-'+number,duration:10,chapters:[{number,start:0,duration:10}]}));
 const plan=listeningPlan([619,'619b',620],recordings,source.entries);assert.deepEqual(plan.playable,[619,'619b',620]);assert.equal(plan.reason,'complete');assert.equal(listeningPlan([619,620],recordings,source.entries),null);
 const missing=listeningPlan([619,'619b',620],recordings.filter(r=>r.chapters[0].number!=='619b'),source.entries);assert.deepEqual(missing.playable,[619]);assert.equal(missing.nextNumber,'619b');assert.equal(missing.reason,'unrecorded');assert.equal(listeningPlan([619,'619b',620],recordings),null);
});
test('source-note partitioning preserves distinct suffix anchors and offline navigation',()=>{
 const refs=[619,'619b',620],html='<html><head><title>Fixture</title></head><body><main class="review-page"><h1>Fixture.</h1>'+refs.map(n=>`<a href="#hadith-${n}">${n}</a>`).join('')+refs.map(n=>`<article id="hadith-${n}"><h2>Fixture ${n}</h2><p>Exact fixture text ${n}.</p><a href="./#read/${n}">Read</a></article>`).join('')+'</main></body></html>',split=partitionSourceNotes(new Map([['reader/fixture-review.html',html]]));
 assert.equal(split.manifest.books[0].pages.length,1);assert.deepEqual(split.manifest.books[0].pages[0].sections,['hadith-619','hadith-619b','hadith-620']);checkSourceNotePublication(split.manifest,{read:path=>split.files.get('reader/'+path)});
 assert.equal(sourceNoteTarget('#hadith-619b','notes/fixture-hadith-619-634.html#hadith-619b','https://fixture.invalid/reader/fixture-review.html'),'https://fixture.invalid/reader/notes/fixture-hadith-619-634.html#hadith-619b');
});
