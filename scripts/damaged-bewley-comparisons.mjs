/* A damaged web comparison needs an exact inspected occurrence, not just a label. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const registry=read('content/review/web-comparison-limitations.json');
export function validateDamagedBewleyComparison(c,row,config,sources,readEvidence=read){
 assert.equal(registry.schemaVersion,1);
 const keys=registry.records.map(r=>r.bookId+':'+r.appReference);assert.equal(new Set(keys).size,keys.length,'Duplicate damaged-comparison scope');
 const expected=registry.records.find(r=>r.bookId===config.id&&r.appReference===row.number);
 if(expected){assert.equal(c.status,'damaged-comparison','Known damaged comparison cannot claim complete coverage');assert.equal(expected.sourceId,c.id);assert.deepEqual(c.damageEvidence,expected.damageEvidence,'Changed registered damage evidence');}
 if(c.status!=='damaged-comparison'){assert.equal(c.damageEvidence,undefined,'Damage evidence needs an explicit comparison status');return false;}
 assert(expected,'Unregistered damaged web comparison');
 const e=c.damageEvidence;
 assert(e&&/^research\/[a-z0-9-]+\.json$/.test(e.path),'Damaged web comparison needs its source audit');
 const audit=readEvidence(e.path),record=audit.records?.find(r=>r.reference===row.number),source=audit.englishComparisons?.bewley,witness=record?.englishComparisons?.bewley;
 assert.equal(hash(audit),e.sha256,'Changed damaged-comparison audit');
 const documentedLimit=witness?.status==='limited-comparison-not-wording-approval'&&Array.isArray(witness.limitations)&&witness.limitations.length>0&&witness.limitations.every(note=>typeof note==='string'&&note.trim());
 assert(source&&witness&&(witness.status==='damaged-or-incomplete-comparison'||documentedLimit),'Audit does not identify a damaged comparison');
 // Comparisons were located against the digital occurrence, before any separately
 // labelled printed note. The addition validator independently checks this hash
 // against the immutable inventory and verifies the complete derived wording.
 const digitalHash=row.originalArabicSha256??row.arabicSupplements?.[0]?.digitalArabicSha256??row.arabicSha256;
 for(const addition of row.arabicSupplements??[])assert.equal(addition.digitalArabicSha256,digitalHash,'Printed notes target different digital input');
 assert.equal(record.sourceRecordId,row.sourceRecordId);assert.equal(record.arabicSha256,digitalHash,'Damage evidence is bound to different Arabic');
 assert.equal(c.id,config.bewleySourceId);assert.equal(c.reference,witness.displayedReference);
 assert.equal(sources.find(s=>s.id===c.id)?.url,source.url,'Damaged comparison points to another source');
 assert.deepEqual(e,{path:e.path,sha256:hash(audit),sourceSha256:source.sha256,bodySha256:witness.bodySha256,occurrence:witness.occurrence},'Damage evidence differs from the inspected occurrence');
 assert(typeof c.note==='string'&&c.note.trim(),'Damaged comparison needs a visible explanation');
 for(const key of ['part','splitReferences','referencedReference','continuedByReference','sourceId','absenceEvidence','checkedReferences'])assert.equal(c[key],undefined,'Damaged comparison cannot claim another reference form');
 return true;
}
