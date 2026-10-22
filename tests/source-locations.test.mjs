import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSourceLocation,sourceLocationCorrections} from '../scripts/source-locations.mjs';
import {collectionFiles} from '../scripts/build-collection.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('a recorded same-file citation repair preserves original review evidence and all active PDF links',()=>{
 const fix=sourceLocationCorrections.corrections[0],draft=read('content/review/opening-next-drafts.json'),original=draft.sources.find(s=>s.id===fix.sourceId),before=structuredClone(original),corrected=resolveSourceLocation(original);
 assert.equal(original.url,fix.fromURL);assert.deepEqual(original,before);assert.equal(corrected.url,fix.toURL);assert.equal(fix.sha256,'f23b5c4dc56c68562b699b045eb209bcbf3708ec9dda9c56f1407f627fbaa9e1');
 const {source,ledger,files}=collectionFiles();assert.equal(source.sources.find(s=>s.id===fix.sourceId).url,fix.toURL);assert.equal(ledger.sourceReferences.sources.find(s=>s.id===fix.sourceId).url,fix.toURL);
 for(const path of ['reader/faith-review.html','reader/knowledge-review.html']){assert(!decodeURI(files.get(path)).includes(fix.fromURL));assert(decodeURI(files.get(path)).includes(fix.toURL));}
 const input=JSON.parse(files.get('reader/knowledge-inputs.json'));assert.equal(input.review.sources.find(s=>s.id===fix.sourceId).url,fix.fromURL);assert.deepEqual(input.sourceLocationCorrections,sourceLocationCorrections);
});
test('citation repair cannot be applied to a differently hashed witness or an unrelated source',()=>{
 const fix=sourceLocationCorrections.corrections[0];assert.throws(()=>resolveSourceLocation({id:fix.sourceId,url:fix.fromURL,sha256:'0'.repeat(64)}),/different witness/);
 for(const source of [{id:'different',url:fix.fromURL},{id:fix.sourceId,url:'https://example.com/unrelated.pdf'}])assert.deepEqual(resolveSourceLocation(source),source);
});
