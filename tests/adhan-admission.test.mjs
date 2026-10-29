import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBooks} from '../scripts/publish-books.mjs';
const bytes=p=>readFileSync(new URL('../'+p,import.meta.url));
const read=p=>JSON.parse(bytes(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive='content/review/candidates/adhan-632-698';

test('Adhan admission retains its exact historical evidence and changes no translation or source evidence',()=>{
 const snapshot=read(archive+'/snapshot.json');
 assert.equal(snapshot.baselineCommit,'a6d55223d3d863f2583ba67aa27edd139e9d7d6a');
 assert.equal(snapshot.files.length,6);
 for(const file of snapshot.files)assert.equal(hash(bytes(file.archivedPath)),file.sha256);
 for(const name of ['fourth','fifth','final']){
  const original=read(`${archive}/adhan-${name}-review.json`),proof=read(`${archive}/adhan-${name}-verification.json`),current=read(`content/review/adhan-${name}-review.json`);
  assert.equal(hash(bytes(`${archive}/adhan-${name}-review.json`)),proof.review.sha256);
  assert.equal(hash(JSON.stringify(original)),proof.review.objectSha256);
  const withoutAdmissionMetadata=review=>({...review,scope:undefined,editionNote:undefined,entries:review.entries.map(row=>({...row,reviewScope:undefined,reviewRecordSha256:undefined}))});
  assert.deepEqual(withoutAdmissionMetadata(current),withoutAdmissionMetadata(original));
  assert.equal(current.independentReview,'pending');
 }
});

test('expanded Adhan remains a personal prototype and cannot pass the production publication gate',()=>{
 const source=read('research/bukhari-personal-collection.json'),ledger=read('content/review/personal-collection-ledger.json');
 assert.equal(source.entries.length,699);
 assert.equal(ledger.publication,'personal-prototype');
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/cannot enter a production collection/);
});
