import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch} from '../scripts/build-collection.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('a structural map cannot become reader content through the ordinary admission path',()=>{
 const inventory=read('content/staging/bukhari-ablution-wikisource/catalog.json');
 const review=read('content/review/knowledge-first-review.json'),manifest=read('content/sources/wikisource-knowledge/manifest.json');
 for(const candidate of [inventory,{...inventory,schemaVersion:1}]){
  assert.throws(()=>buildBookBatch(candidate,review,manifest,BOOK_CONFIGS.knowledge),/Mapped source inventories need explicit reader provenance support/);
 }
});
