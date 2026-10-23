import {readFileSync} from 'node:fs';
// Explicit expectations; never read a generated catalog to determine expected coverage.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/published-collection.json',import.meta.url),'utf8'));
export const BOOK_RANGES=Object.freeze(fixture.books.map(b=>Object.freeze(b)));
export const BOOK_IDS=Object.freeze(BOOK_RANGES.map(b=>b.id));
export const ENTRY_NUMBERS=Object.freeze(BOOK_RANGES.flatMap(b=>Array.from({length:b.last-b.first+1},(_,i)=>b.first+i)));
export const ENTRY_COUNT=ENTRY_NUMBERS.length;
export const BOOK_COUNT=BOOK_RANGES.length;
export const LAST_NUMBER=ENTRY_NUMBERS.at(-1);
export const RECORDED_NUMBERS=Object.freeze(fixture.recordedNumbers);
export const UNRECORDED_COUNT=ENTRY_COUNT-RECORDED_NUMBERS.length;
