/* Displayed numbers are not unique identifiers when a comparison page mislabels reports. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const pinned=read('content/review/english-occurrence-locators.json');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const text=s=>typeof s==='string'&&s.trim().length>0;
const cache=new Map();
export function validateOccurrenceRegistry(registry,readEvidence=read){
 assert.equal(registry.schemaVersion,1);assert(Array.isArray(registry.locators));const ids=new Set(),origins=new Set(),locations=new Set();
 for(const item of registry.locators){
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)&&!ids.has(item.id),'Duplicate comparison locator');ids.add(item.id);
  assert.equal(item.status,'located-comparison-not-wording-approval');assert(text(item.sourceId)&&/^https:\/\//.test(item.sourceUrl));
  assert(Number.isSafeInteger(item.sourceBytes)&&item.sourceBytes>0&&digest(item.sourceSnapshotSha256)&&digest(item.originalArabicSha256)&&digest(item.locatedTextSha256));
  assert(Number.isSafeInteger(item.occurrence)&&item.occurrence>0&&/^[1-9]\d*$/.test(item.displayedReference)&&/^[IVXLC]+$/.test(item.chapterLabel)&&text(item.note)&&text(item.locatorPolicy));
  const origin=item.sourceId+':'+item.arabicSourceRecordId,location=item.sourceSnapshotSha256+':'+item.displayedReference+':'+item.occurrence;
  assert(!origins.has(origin)&&!locations.has(location),'Comparison locator reuses a source occurrence');origins.add(origin);locations.add(location);
  assert(/^research\/[a-z0-9-]+\.json$/.test(item.auditEvidence?.path)&&digest(item.auditEvidence.sha256),'Invalid comparison audit path');
  const audit=readEvidence(item.auditEvidence.path);assert.equal(hash(audit),item.auditEvidence.sha256,'Comparison audit changed');
  const source=audit.englishComparisons?.bewley,row=audit.records?.find(r=>r.reference===item.appReference),c=row?.englishComparisons?.bewley;
  assert(source&&c&&source.url===item.sourceUrl&&source.sha256===item.sourceSnapshotSha256&&source.bytes===item.sourceBytes&&source.locatorPolicy===item.locatorPolicy,'Comparison snapshot does not match the inspected source');
  assert.equal(row.sourceRecordId,item.arabicSourceRecordId);assert.equal(row.arabicSha256,item.originalArabicSha256);assert.equal(c.displayedReference,item.displayedReference);assert.equal(c.occurrence,item.occurrence);assert.equal(c.bodySha256,item.locatedTextSha256);
 }
 return registry;
}
function registry(){if(!cache.has('validated'))cache.set('validated',validateOccurrenceRegistry(pinned));return cache.get('validated');}
export function validateEnglishOccurrence(comparison,row,config,sources){
 const expected=registry().locators.find(x=>x.sourceId===config.bewleySourceId&&x.arabicSourceRecordId===row.sourceRecordId),evidence=comparison.occurrenceLocator;
 if(!expected){assert.equal(evidence,undefined,'Unregistered English comparison occurrence');return;}
 assert.deepEqual(evidence,{id:expected.id,sha256:hash(expected)},'A known mislabelled comparison needs its exact occurrence evidence');
 assert.equal(comparison.reference,expected.displayedReference,'Do not silently renumber the English comparison');assert.equal(row.number,expected.appReference);
 assert.equal(row.originalArabicSha256??row.arabicSha256,expected.originalArabicSha256,'Comparison is bound to different Arabic wording');
 const source=sources.find(s=>s.id===(comparison.sourceId||config.bewleySourceId));assert(source?.kind==='english-comparison'&&source.url===expected.sourceUrl,'Comparison locator points to a different source');
 if(source.sha256!==undefined)assert.equal(source.sha256,expected.sourceSnapshotSha256);
 for(const key of ['part','splitReferences','status','referencedReference'])assert.equal(comparison[key],undefined,'A distinct mislabelled occurrence cannot claim another reference form');
 assert(text(comparison.note),'Located comparison needs a visible explanation');
}
export function englishOccurrenceGroup(comparison){return comparison.occurrenceLocator?comparison.reference+'@'+comparison.occurrenceLocator.id:comparison.reference;}
export function englishOccurrenceCitation(comparison){
 if(!comparison.occurrenceLocator)return null;
 const item=registry().locators.find(x=>x.id===comparison.occurrenceLocator.id);assert(item&&hash(item)===comparison.occurrenceLocator.sha256);
 return {locator:`Chapter ${item.chapterLabel} · displayed entry ${item.displayedReference} · occurrence ${item.occurrence} of this label`,scope:item.note+' '+comparison.note};
}
