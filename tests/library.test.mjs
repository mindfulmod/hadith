import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeBackup,parseBackup,mergeBackup} from '../reader/backup.mjs';
import {createPersonalStore,normalizeState} from '../reader/personal-state.mjs';
import {searchEntries} from '../reader/search.mjs';
import {buildInventory} from '../scripts/import-bukhari.mjs';
import {release} from '../reader/release.mjs';
const entries=JSON.parse(readFileSync(new URL('../research/bukhari-opening-review.json',import.meta.url))).entries;
test('exact search finds phrases, narrator chains and references without rewriting source',()=>{
 const before=JSON.stringify(entries);
 for(const q of ['ACTIONS ARE ONLY','"according to intentions"','Hadith 1','Bukhari 1','#1'])assert.deepEqual(searchEntries(entries,q).results.map(r=>r.entry.number),[1]);
 assert.deepEqual(searchEntries(entries,'Hisham ibn').results.map(r=>r.entry.number),[2]);
 assert.equal(searchEntries(entries,'intentions actions').total,0);
 assert.equal(searchEntries(entries,'<img onerror=alert(1)>').total,0);
 assert.equal(searchEntries(entries,'').total,0);
 const arabic=entries[1].arabic_blocks[0].slice(0,20);
 assert.equal(searchEntries(entries,arabic).results[0].language,'ar');
 assert.equal(JSON.stringify(entries),before);
});
test('search reports totals and bounds results for a full-size library',()=>{
 const corpus=Array.from({length:7563},(_,i)=>({number:i+1,english_blocks:['complete shared phrase'],arabic_blocks:[]}));
 const found=searchEntries(corpus,'shared phrase');assert.equal(found.total,7563);assert.equal(found.results.length,50);assert.equal(found.results[49].entry.number,50);
});
test('backup roundtrip preserves unknown-but-valid references for later library downloads',()=>{
 const state=normalizeState({saved:[1,7400],finished:[2],positions:{1:320,7400:400},last:7400,theme:'night',followAudio:false,audio:{release:'cedar-opening-v1',seconds:27}});
 const parsed=parseBackup(JSON.stringify(makeBackup(state,new Date('2026-10-18T12:00:00Z'))));
 assert.deepEqual(parsed.state,state);assert.equal(parsed.exportedAt,'2026-10-18T12:00:00.000Z');
});
test('restore merges without erasing saved items and only restores place on explicit choice',()=>{
 const current=normalizeState({saved:[1],finished:[1],last:1,positions:{1:100},theme:'day',session:{numbers:[1,2],cursor:1,ended:false}});
 const other=normalizeState({saved:[2],finished:[2],last:2,positions:{1:50,2:200},theme:'night'});
 const merged=mergeBackup(current,other);assert.deepEqual(merged.saved,[1,2]);assert.deepEqual(merged.finished,[1,2]);assert.equal(merged.last,1);assert.equal(merged.theme,'day');assert.equal(merged.positions[1],100);
 const restored=mergeBackup(current,other,true);assert.equal(restored.last,2);assert.equal(restored.theme,'night');assert.equal(restored.positions[1],50);assert.equal(restored.session,undefined);
 assert.equal(current.saved.length,1);
});
test('malformed, incompatible, polluted and oversized backups are rejected',()=>{
 const good=makeBackup(normalizeState({}));
 for(const text of ['oops','[]',JSON.stringify({...good,version:99}),JSON.stringify({...good,namespace:'different-edition'}),JSON.stringify({...good,state:{...good.state,saved:['1']}}),JSON.stringify({...good,state:{...good.state,positions:{1:-1}}}),'{"__proto__":{"polluted":true}}',' '.repeat(1048577)])assert.throws(()=>parseBackup(text));
 assert.equal({}.polluted,undefined);
});
test('a failed restore is atomic and reload-time writes cannot overwrite a successful restore',()=>{
 let raw=JSON.stringify(normalizeState({saved:[1]})),fail=false;
 const store=createPersonalStore({getItem:()=>raw,setItem:(key,value)=>{if(fail)throw new Error('Quota');raw=value;}});
 const before=structuredClone(store.get());fail=true;assert.throws(()=>store.replaceTransactional({saved:[2]}));assert.deepEqual(store.get(),before);assert.deepEqual(JSON.parse(raw).saved,[1]);
 fail=false;store.replaceTransactional({saved:[2]});store.holdWrites();store.set({saved:[1]});assert.deepEqual(store.get().saved,[2]);assert.deepEqual(JSON.parse(raw).saved,[2]);
});
test('corrupt local data is bounded and never treated as source content',()=>{
 const s=normalizeState({saved:[1,1,-1,'2',Infinity],positions:{'__proto__':0,1:-8,2:100},size:999,theme:'<script>',session:{numbers:[1,1],cursor:1},content:'changed'});
 assert.deepEqual(s.saved,[1]);assert.deepEqual(s.positions,{2:100});assert.equal(s.size,21);assert.equal(s.theme,'device');assert.equal(s.content,undefined);assert.equal(s.session,undefined);
});
test('pinned full-source inventory reports real gaps and never becomes reader-eligible',()=>{
 const catalog=buildInventory();assert.equal(catalog.books.length,97);assert.equal(catalog.records.length,7390);assert.equal(catalog.audit.missingNumbers.length,173);assert.equal(catalog.audit.emptyRecords.length,10);assert(catalog.audit.missingNumbers.includes(1166));assert(catalog.audit.emptyRecords.includes(1161));assert.equal(catalog.readerEligible,false);
 assert(!release.files.some(f=>/staging|openiti-bukhari/.test(f.path)));
 const raw=readFileSync(new URL('../content/sources/openiti-bukhari/source.mARkdown',import.meta.url),'utf8');
 assert(catalog.records.every(r=>raw.slice(r.start,r.end).startsWith('### |')||raw.slice(r.start,r.end).startsWith('# ')));
});
