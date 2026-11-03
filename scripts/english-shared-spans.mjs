/* Bind shared English records to exact, inspected narrator-delimited spans. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const registry=read('content/review/english-shared-spans.json');
export function validateSharedEnglishSpan(comparison,row,config,readEvidence=read){
 assert.equal(registry.schemaVersion,1);
 const keys=registry.records.map(r=>r.bookId+':'+r.appReference);
 assert.equal(new Set(keys).size,keys.length,'Duplicate shared English span registration');
 const expected=registry.records.find(r=>r.bookId===config.id&&r.appReference===row.number);
 if(!expected){assert.equal(comparison.spanEvidence,undefined,'Unregistered shared English span');return false;}
 assert.equal(row.sourceRecordId,expected.sourceRecordId);
 assert.deepEqual(comparison.spanEvidence,expected.binding,'A shared English record needs its exact inspected span');
 assert.deepEqual(comparison.part,expected.part,'Shared English part changed');
 const evidence=comparison.spanEvidence;
 assert(/^research\/[a-z0-9-]+\.json$/.test(evidence.auditPath),'Unsafe shared English evidence path');
 const audit=readEvidence(evidence.auditPath);assert.equal(hash(audit),evidence.auditSha256,'Changed shared English audit');
 const record=audit.records.find(r=>r.reference===row.number),english=record?.englishComparisons?.khan;
 assert(record&&english,'Missing shared English occurrence');
 assert.equal(record.sourceRecordId,row.sourceRecordId);assert.equal(record.arabicSha256,row.originalArabicSha256??row.arabicSha256);
 assert.equal(comparison.reference,english.reference);assert.deepEqual(evidence.span,english.span);
 assert.equal(comparison.referenceEvidence.sourceSha256,audit.englishComparisons.khan.sourceSha256);
 assert.equal(comparison.referenceEvidence.recordSha256,english.recordSha256);
 assert.equal(comparison.status,english.limitations.length?'damaged-comparison':undefined,'Shared comparison limits cannot be hidden');
 for(const limit of english.limitations)assert(comparison.note.includes(limit),'Shared comparison limitation missing');
 const siblings=registry.records.filter(r=>r.bookId===config.id&&r.binding.auditPath===evidence.auditPath&&audit.records.find(a=>a.reference===r.appReference)?.englishComparisons.khan.reference===english.reference);
 assert.equal(siblings.length,expected.part.count,'Missing shared English part');
 let end=0;
 for(const [i,sibling]of siblings.entries()){
  assert.deepEqual(sibling.part,{index:i+1,count:siblings.length},'Shared English parts reordered');
  const span=sibling.binding.span;assert.equal(span.start,end,'Shared English spans overlap or leave a gap');
  assert(Number.isSafeInteger(span.end)&&span.end>span.start&&/^[a-f0-9]{64}$/.test(span.sha256));end=span.end;
 }
 assert(typeof comparison.note==='string'&&comparison.note.trim(),'Shared English span needs a visible scope note');
 return true;
}
