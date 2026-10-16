import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRange} from '../range.mjs';
test('Safari first-byte probe and open ended media requests',()=>{assert.deepEqual(parseRange('bytes=0-1',100),{start:0,end:1});assert.deepEqual(parseRange('bytes=20-',100),{start:20,end:99});});
test('suffix ranges and bounds are clamped',()=>{assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});assert.deepEqual(parseRange('bytes=0-999',100),{start:0,end:99});assert.deepEqual(parseRange('bytes=-200',100),{start:0,end:99});});
test('invalid or unsatisfiable requests are rejected',()=>{for(const value of ['bytes=100-','bytes=4-2','bytes=-0','bytes=-','bytes=0-1,4-5','nonsense','bytes=9007199254740992-'])assert.equal(parseRange(value,100),null);assert.equal(parseRange('bytes=0-',0),null);});
