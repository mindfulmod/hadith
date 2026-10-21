import test from 'node:test';
import assert from 'node:assert/strict';
import {listeningPlan} from '../reader/listening-plan.mjs';
import {recordings} from '../reader/recording.mjs';
test('actual session plans select a contiguous prefix and native file endings',()=>{
 const p=listeningPlan([1,2,3,4,5,6,7],recordings);assert.deepEqual(p.playable,[1,2,3,4,5,6]);assert.equal(p.nextNumber,7);assert.equal(p.steps.length,5);
 const single=listeningPlan([1],recordings);assert.equal(single.steps[0].recordingId,'cedar-opening-v1-chapter-1');assert.equal(single.nextNumber,null);
 const suffix=listeningPlan([2,3],recordings);assert.equal(suffix.steps[0].start,recordings[0].chapters[1].start);assert.equal(suffix.reason,'complete');
 for(const numbers of [[],[1,3],[2,1],[1,1],['1'],[0],null])assert.equal(listeningPlan(numbers,recordings),null);
});
test('an unavailable exact session endpoint cannot silently play extra or truncated speech',()=>{
 const combined=[{id:'future',duration:20,chapters:[{number:5,start:0,duration:10},{number:6,start:10,duration:10}]}];
 const p=listeningPlan([5],combined);assert.equal(p.reason,'boundary-unavailable');assert.deepEqual(p.steps,[]);assert.equal(p.nextNumber,5);
});

test('each new opening recording can finish a whole-hadith session without extra speech',()=>{
 for(const n of [4,5,6]){const p=listeningPlan([n],recordings);assert.equal(p.reason,'complete');assert.deepEqual(p.playable,[n]);assert.equal(p.steps.length,1);assert.equal(p.steps[0].start,0);assert.equal(p.steps[0].duration,recordings.find(r=>r.chapters[0].number===n).duration);}
});
