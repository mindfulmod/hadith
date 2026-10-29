import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBookInventory,layoutEvidence,entryLayoutEvidence,validateEntryLayout} from '../scripts/mapped-source.mjs';
import {BOOK_CONFIGS} from '../scripts/build-collection.mjs';
import {release} from '../reader/release.mjs';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));

test('a suffixed source map is verified explicitly while ordinary import and unreviewed publication remain refused', () => {
 const inventory = read('content/staging/bukhari-adhan-wikisource/catalog.json');
 assert.equal(inventory.schemaVersion, 3);
 assert.equal(inventory.records.filter(r => r.sourceReference.number === 619).length, 2);
 assert.throws(() => validateBookInventory(inventory, {}, {id:'adhan'}), /explicit reader provenance support/);
 validateBookInventory(inventory, {sourceLayout:layoutEvidence(inventory)}, {id:'adhan',sourceLayout:'mapped'});
 assert.throws(() => validateBookInventory({...inventory,schemaVersion:2}, {}, {id:'adhan',sourceLayout:'mapped'}), /authoritative checked source map/);
 assert.equal(BOOK_CONFIGS.adhan.sourceLayout, 'mapped');
 const book=read('reader/books/catalog.json').books.find(b => b.id === 'adhan');
 assert.deepEqual(book.entryNumbers,Array.from({length:41},(_,i)=>578+i));
 assert(!book.entryNumbers.includes('619b'));
 assert(release.files.some(f => f.path.includes('adhan')));
});

test('the Adhan suffix retains its exact source origin, comparison reference and printed boundary pages',()=>{
 const inventory=read('content/staging/bukhari-adhan-wikisource/catalog.json'),record=inventory.records.find(r=>r.number==='619b'),row={number:'619b',sourceLayout:entryLayoutEvidence(inventory,record),comparisons:[{id:'bewley-adhan',reference:'619b'},{id:'islamhouse-khan',reference:'1.11.619'}],printedWitnesses:[{id:'brill-1862',pdfPages:[168,169]},{id:'dar-ibn-kathir-2002',pdfPages:[162,163]}]},config={bewleySourceId:'bewley-adhan'};
 validateEntryLayout(inventory,row,record,config);
 for(const mutate of [r=>r.comparisons[0].reference='619',r=>r.sourceLayout.sourceReference.occurrence=1,r=>r.printedWitnesses[1].pdfPages=[162]]){const bad=structuredClone(row);mutate(bad);assert.throws(()=>validateEntryLayout(inventory,bad,record,config));}
});
