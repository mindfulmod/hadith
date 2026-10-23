import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBookInventory} from '../scripts/mapped-source.mjs';
import {buildFaithBatch} from '../scripts/build-collection.mjs';
import {isPublicFile} from '../scripts/build-site.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('book introductions require explicit reader support before either ordinary or mapped admission',()=>{
 const candidate=read('content/staging/bukhari-ghusl-wikisource/catalog.json');
 for(const config of [{id:'ghusl'},{id:'ghusl',sourceLayout:'mapped'}]){
  assert.throws(()=>validateBookInventory(candidate,{},config),/Book introductions need explicit/);
  assert.throws(()=>validateBookInventory({...candidate,bookIntroduction:null},{},config),/Book introductions need explicit/);
 }
});
test('the existing batch builder cannot silently discard book-level introductory material',()=>{
 const inventory=read('content/staging/bukhari-faith-wikisource/catalog.json'),review=read('content/review/faith-first-review.json'),manifest=read('content/sources/wikisource-faith/manifest.json');
 inventory.bookIntroduction=read('content/staging/bukhari-ghusl-wikisource/catalog.json').bookIntroduction;
 assert.throws(()=>buildFaithBatch(inventory,review,manifest),/Book introductions need explicit/);
 for(const path of ['content/sources/wikisource-ghusl/source.html','content/sources/wikisource-ghusl/manifest.json','content/staging/bukhari-ghusl-wikisource/catalog.json'])assert.equal(isPublicFile(path),false);
});
