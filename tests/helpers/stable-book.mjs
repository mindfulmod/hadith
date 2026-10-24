import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Historical payloads stay fixed even when public JSON formatting changes.
// Cross-release byte stability is tested independently in stable-book-packs.test.mjs.
export function assertHistoricalBook(published,path){
 const expected=JSON.parse(readFileSync(new URL('../../reader/'+path,import.meta.url),'utf8'));
 const descriptor=published.catalog.books.find(b=>b.id===expected.book.id);
 assert(descriptor,'Historical book is missing from the current catalog');
 const actual=published.files.get(descriptor.path);
 assert.equal(typeof actual,'string','Catalogued book file is missing');
 assert.deepEqual(JSON.parse(actual),expected,'Historical book text, chapters or references changed');
}
