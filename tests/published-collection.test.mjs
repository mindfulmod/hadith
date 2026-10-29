import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {BOOK_RANGES,BOOK_IDS,ENTRY_NUMBERS,LAST_NUMBER,RECORDED_NUMBERS} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('admitted source, published packs and narration coverage match an independent explicit fixture',()=>{
 const {source,ledger}=collectionFiles(),catalog=read('reader/books/catalog.json'),audio=read('reader/audio/catalog.json');
 assert.equal(new Set(ENTRY_NUMBERS).size,ENTRY_NUMBERS.length);
 assert.deepEqual(ENTRY_NUMBERS.filter(n=>typeof n==='string'),['619b']);
 assert.deepEqual(ENTRY_NUMBERS.filter(n=>typeof n==='number'),Array.from({length:LAST_NUMBER},(_,i)=>i+1));
 assert.deepEqual(ENTRY_NUMBERS.slice(618,621),[619,'619b',620]);
 assert.deepEqual(source.entries.map(e=>e.number),ENTRY_NUMBERS);assert.deepEqual(catalog.entries.map(e=>e.number),ENTRY_NUMBERS);assert.deepEqual(narrationPlan(source).entries.map(e=>e.number),ENTRY_NUMBERS);
 assert.deepEqual(catalog.books.map(b=>b.id),BOOK_IDS);assert.deepEqual(ledger.books.map(b=>b.id),BOOK_IDS);
 for(const b of BOOK_RANGES){const expected=b.references;assert.deepEqual(catalog.entries.filter(e=>e.bookId===b.id).map(e=>e.number),expected);assert.deepEqual(ledger.books.find(x=>x.id===b.id).entryNumbers,expected);const pack=read('reader/'+catalog.books.find(x=>x.id===b.id).path);assert.deepEqual(pack.entries.map(e=>e.number),expected);}
 assert.deepEqual(audio.coverage.recorded,RECORDED_NUMBERS);assert.deepEqual(audio.coverage.unrecorded,ENTRY_NUMBERS.filter(n=>!RECORDED_NUMBERS.includes(n)));
});
