import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {publisherScaleFixture} from './helpers/publisher-scale-fixture.mjs';
test('a 7,600-entry bilingual collection preserves exact order, every source block, citations and suffixed references',()=>{
 const {source,ledger}=publisherScaleFixture(),sourceHash=objectHash(source),ledgerHash=objectHash(ledger),result=buildBooks(source,ledger);
 assert.equal(result.catalog.entries.length,7600);assert.equal(result.catalog.books.length,93);
 const packs=result.catalog.books.map(book=>JSON.parse(result.files.get(book.path))),entries=packs.flatMap(pack=>pack.entries),references=packs.flatMap(pack=>pack.sourceReferences.entries);
 assert.deepEqual(entries,source.entries);assert.deepEqual(references,ledger.sourceReferences.entries);
 assert.deepEqual(result.catalog.entries.map(e=>[e.id,e.number]),source.entries.map(e=>[e.id,e.number]));
 assert(entries.some(e=>typeof e.number==='string'));
 assert.equal(objectHash(source),sourceHash);assert.equal(objectHash(ledger),ledgerHash);
 const reordered=structuredClone(ledger);reordered.entries.reverse();assert.deepEqual(buildBooks(source,reordered).files,result.files);
});
test('indexed publication still refuses duplicate, missing or stale evidence and incompatible book assignment',()=>{
 for(const mutate of [
  l=>l.entries[1]=structuredClone(l.entries[0]),
  l=>l.entries[1].number='128b',
  l=>l.entries[1].id='wrong-id',
  l=>l.entries[1].entrySha256='0'.repeat(64),
  l=>{l.sourceReferences.entries[1].entrySha256='0'.repeat(64);l.referencesSha256=objectHash(l.sourceReferences);l.referencesReview.sha256=l.referencesSha256;},
  l=>{l.books[0].entryNumbers.reverse();l.catalogContextSha256=objectHash(l.books);l.collectionReview.sha256=l.catalogContextSha256;},
  l=>l.entries[1].arabicReview.reviewerKind='ai'
 ]){const {source,ledger}=publisherScaleFixture(300,3);mutate(ledger);assert.throws(()=>buildBooks(source,ledger));}
});
