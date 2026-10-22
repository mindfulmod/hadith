/* Recorded citation repairs leave the preserved source inputs and text untouched. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export const sourceLocationCorrections=JSON.parse(readFileSync(new URL('../content/review/source-location-corrections.json',import.meta.url),'utf8'));
assert.equal(sourceLocationCorrections.schemaVersion,1);
export function resolveSourceLocation(source){
 const correction=sourceLocationCorrections.corrections.find(c=>c.sourceId===source.id&&c.fromURL===source.url);
 if(!correction)return {...source};
 if(source.sha256!==undefined)assert.equal(source.sha256,correction.sha256,'Citation correction belongs to a different witness');
 return {...source,url:correction.toURL};
}
