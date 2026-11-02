/* A documented wording dispute cannot be cleared by a routine translation batch. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const sha=text=>createHash('sha256').update(text).digest('hex');
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const holds=read('content/review/source-holds.json');

export function validateSourceHolds(inventory,review,config,registry=holds){
 assert.equal(registry.schemaVersion,1,'Unsupported source hold registry');
 assert(Array.isArray(registry.holds),'Missing source hold registry');
 const ids=new Set();
 for(const hold of registry.holds){
  assert(typeof hold.id==='string'&&hold.id.trim()&&!ids.has(hold.id),'Invalid or duplicate source hold');ids.add(hold.id);
  assert.equal(hold.status,'unresolved','Source holds require an explicit reviewed resolution workflow');
  assert(typeof hold.bookId==='string'&&hold.bookId&&typeof hold.reason==='string'&&hold.reason.trim(),'Incomplete source hold');
  assert(/^research\/[a-z0-9-]+\.json$/.test(hold.evidence.path),'Invalid source hold evidence path');
  assert.equal(sha(JSON.stringify(read(hold.evidence.path))),hold.evidence.sha256,'Source hold evidence changed');
  if(hold.bookId!==config.id)continue;
  assert.equal(hold.sourceId,inventory.sourceId,'Source hold must be reviewed after source identity changes');
  assert.equal(hold.sourceSha256,inventory.sourceSha256,'Source hold must be reviewed after source revision changes');
  const row=inventory.records.find(r=>r.id===hold.sourceRecordId);
  assert(row&&row.number===hold.reference,'Held source record is missing or remapped');
  assert.deepEqual(row.paragraphIds,hold.paragraphIds,'Held source paragraphs changed');
  const body=row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id)?.text);
  assert(body.every(t=>typeof t==='string'),'Held source text is missing');
  assert.equal(sha(body.join('')),hold.arabicSha256,'Held source wording changed');
  assert(!review.entries.some(r=>r.number===hold.reference||r.sourceRecordId===hold.sourceRecordId),
   `Unresolved source wording hold: ${hold.id}. See ${hold.evidence.path}`);
 }
}
