import test from 'node:test';import assert from 'node:assert/strict';
import {startSession,resolveSession,visitSession,nextSession,rememberSessionPending,sessionAvailable} from '../reader/session.mjs';
import {normalizeState} from '../reader/personal-state.mjs';
import {makeBackup,parseBackup,mergeBackup} from '../reader/backup.mjs';
import {sessionAvailableView} from '../reader/library.mjs';
import {listeningPlan} from '../reader/listening-plan.mjs';
import {recordings} from '../reader/recording.mjs';
const entry=n=>({number:n,englishWords:30});
// Only synthetic identifiers are used. No actual source hold is resolved.
const before=[1,3,4].map(entry),after=[1,2,3,4,5].map(entry);
test('a newly available report does not change an active or finished legacy session',()=>{
 for(const ended of [false,true]){const old={numbers:[1,3],cursor:3,ended};const restored=resolveSession(after,old,10,2);assert.deepEqual(restored,old);assert.deepEqual(sessionAvailable(after,restored).map(e=>e.number),[2]);assert.strictEqual(visitSession(restored,2),restored);assert.equal(nextSession(after,restored).cursor,4);}
 assert.deepEqual(sessionAvailable(after,{numbers:[1],cursor:1}),[]);assert.deepEqual(sessionAvailable(after,{numbers:[3,4],cursor:3}),[]);
});
test('remembered leading holds remain separate after publication and persist through reopening',()=>{
 const original=rememberSessionPending(startSession(before,3),[2]);assert.deepEqual(original.numbers,[3,4]);assert.deepEqual(original.pendingNumbers,[2]);assert.deepEqual(sessionAvailable(before,original),[]);
 const reopened=resolveSession(after,normalizeState({session:original}).session);assert.deepEqual(reopened,original);assert.deepEqual(sessionAvailable(after,reopened).map(e=>e.number),[2]);
 assert.deepEqual(rememberSessionPending(reopened,[2,3,-1,'invalid']).pendingNumbers,[2]);assert.equal(startSession(after,2).pendingNumbers,undefined);
});
test('duplicate, reversed, missing and type-changed session entries still recover',()=>{
 for(const numbers of [[3,1],[1,1],[1,99],[1,'3'],[],null])assert.deepEqual(resolveSession(after,{numbers,cursor:1},5,4),startSession(after,4));
 const suffix=[entry(7),entry('7b'),entry('7c'),entry(8)];const s={numbers:[7,'7c',8],cursor:'7c',ended:false};assert.deepEqual(resolveSession(suffix,s),s);assert.deepEqual(sessionAvailable(suffix,s).map(e=>e.number),['7b']);
});
test('backup exports and full-place restore keep pending references without replacing the current session on ordinary merge',()=>{
 const saved=rememberSessionPending({numbers:[3,4],cursor:3,ended:false},[2]);const current=normalizeState({session:{numbers:[1],cursor:1,ended:false}}),backup=makeBackup({session:saved});const parsed=parseBackup(JSON.stringify(backup));assert.deepEqual(parsed.state.session,saved);assert.deepEqual(mergeBackup(current,parsed.state,false).session,current.session);assert.deepEqual(mergeBackup(current,parsed.state,true).session,saved);
 for(const bad of [[2,2],[3],['2'],[null],{}]){const copy=structuredClone(backup);copy.state.session.pendingNumbers=bad;assert.throws(()=>parseBackup(JSON.stringify(copy)),/invalid pending session/);}
});
test('separate availability links neither insert a session row nor start a new session',()=>{
 assert.equal(sessionAvailableView([]),'');const view=sessionAvailableView(sessionAvailable(after,{numbers:[1,3],cursor:1}));assert.match(view,/#read\/2/);assert.match(view,/Your saved session is unchanged/);assert.doesNotMatch(view,/data-start-session|<li|newly|reviewed/);
});

test('listening uses exact saved entries and never includes an inserted report from a combined file',()=>{
 const plan=listeningPlan([1,3],recordings,after);assert.deepEqual(plan.playable,[1,3]);assert.equal(plan.steps[0].recordingId,'cedar-opening-v1-chapter-1');assert.equal(plan.reason,'complete');
 const stopped=listeningPlan([1,3,4],recordings.filter(r=>!r.chapters.some(c=>c.number===3)),after);assert.deepEqual(stopped.playable,[1]);assert.equal(stopped.nextNumber,3);assert.equal(stopped.reason,'unrecorded');
 for(const numbers of [[3,1],[1,1],[1,99],[],['1']])assert.equal(listeningPlan(numbers,recordings,after),null);
});
