import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBookInventory} from '../scripts/mapped-source.mjs';
import {BOOK_CONFIGS} from '../scripts/build-collection.mjs';
import {release} from '../reader/release.mjs';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));

test('a suffixed candidate inventory cannot be admitted by integer-only or ordinary book paths', () => {
 const inventory = read('content/staging/bukhari-adhan-wikisource/catalog.json');
 assert.equal(inventory.schemaVersion, 3);
 assert.equal(inventory.records.filter(r => r.sourceReference.number === 619).length, 2);
 assert.throws(() => validateBookInventory(inventory, {}, {id:'adhan'}), /explicit reader provenance support/);
 assert.throws(() => validateBookInventory(inventory, {}, {id:'adhan',sourceLayout:'mapped'}), /requires its structural inventory/);
 assert.throws(() => validateBookInventory({...inventory,schemaVersion:2}, {}, {id:'adhan',sourceLayout:'mapped'}), /Unknown mapped source book/);
 assert.equal(BOOK_CONFIGS.adhan, undefined);
 assert(!read('reader/books/catalog.json').books.some(b => b.id === 'adhan'));
 assert(!release.files.some(f => f.path.includes('adhan')));
});
