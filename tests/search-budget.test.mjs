import test from 'node:test';
import assert from 'node:assert/strict';
import {createSearchIndex,searchEntries,SEARCH_TIME_SLICE_MS} from '../reader/search.mjs';
const entries=Array.from({length:8000},(_,i)=>({id:'test:'+i,number:i+1,book:'Synthetic only',english_blocks:['Narrator '+i,'Exact shared phrase.'],arabic_blocks:['نص تجريبي '+i]}));
const thin=r=>({...r,results:r.results.map(({entry,...m})=>({entry:{id:entry.id,number:entry.number,book:entry.book},...m}))});
test('fast large scans do not incur one timer delay per 32 entries',async()=>{
 let pauses=0;const index=await createSearchIndex(entries,{yieldTask:async()=>{pauses++;},now:()=>0});assert.equal(pauses,1);
 for(const query of ['shared phrase','نص تجريبي','7999','missing']){const before=pauses,result=await index.search(query,30,30);assert.deepEqual(result,thin(searchEntries(entries,query,30,30)));assert.equal(pauses-before,1);}
});
test('time spent working forces a real yield between batches and preserves exact paginated results',async()=>{
 let clock=0,pauses=0;const index=await createSearchIndex(entries.slice(0,160),{yieldTask:async()=>{pauses++;},now:()=>clock+=SEARCH_TIME_SLICE_MS/2});assert.equal(pauses,3);
 const before=pauses;assert.deepEqual(await index.search('shared phrase',30,30),thin(searchEntries(entries.slice(0,160),'shared phrase',30,30)));assert.equal(pauses-before,3);
 const cached=pauses;await index.search('shared phrase',30,60);assert.equal(pauses,cached,'pagination must reuse the complete match list');
});
test('cancellation at a time-slice boundary rejects the scan without replacing the previous complete result',async()=>{
 let clock=0,cancel=false,current=true;const index=await createSearchIndex(entries,{now:()=>clock+=SEARCH_TIME_SLICE_MS,yieldTask:async()=>{if(cancel)current=false;}});
 const complete=await index.search('shared phrase');cancel=true;
 await assert.rejects(index.search('نص تجريبي',30,0,{isCurrent:()=>current}),{name:'AbortError'});
 assert.deepEqual(await index.search('shared phrase'),complete);
});
test('invalid scheduling inputs cannot accidentally create an unbounded scan',async()=>{
 for(const options of [{timeSliceMs:0},{timeSliceMs:-1},{timeSliceMs:Infinity},{timeSliceMs:NaN},{now:null},{yieldTask:42}])await assert.rejects(createSearchIndex(entries.slice(0,1),options));
});
