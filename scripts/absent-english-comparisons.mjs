/* An absent occurrence is evidence about a bounded sequence, never a matching translation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const registry=read('content/review/english-sequence-absences.json');
export function validateAbsentBewleyComparison(c,row,config,sources){
 assert.equal(registry.schemaVersion,1);
 const evidence=registry.records.find(r=>r.bookId===config.id&&r.appReference===row.number);
 if(!evidence&&c.status!=='not-present-in-checked-sequence'){assert.equal(c.absenceEvidence,undefined,'Unexpected absence evidence');return false;}
 assert(evidence&&evidence.bookId===config.id&&evidence.appReference===row.number,'Unregistered absent English occurrence');
 assert.deepEqual(c.absenceEvidence,{id:evidence.id,sha256:hash(evidence)},'Changed absence evidence');
 assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');
 assert.equal(c.id,evidence.sourceId);assert.equal(c.id,config.bewleySourceId);
 assert.deepEqual(c.checkedReferences,evidence.checkedReferences);
 for(const key of ['part','splitReferences','referencedReference','continuedByReference','sourceId'])assert.equal(c[key],undefined,'Absent comparison cannot claim a matching occurrence');
 assert.equal(row.printedReport?.schemaVersion,1,'An absent Bewley occurrence needs a complete printed origin');
 assert.equal(row.printedReport.printReference,evidence.printedReference);
 for(const doc of [evidence.sourceAudit,evidence.candidate])assert(/^(?:content\/review|research)\/[a-z0-9-]+\.json$/.test(doc.path),'Invalid absence evidence path');
 const audit=read(evidence.sourceAudit.path),candidate=read(evidence.candidate.path);
 assert.equal(hash(audit),evidence.sourceAudit.sha256,'Changed absence source audit');
 assert.equal(hash(candidate),evidence.candidate.sha256,'Changed absence candidate');
 assert.equal(audit.englishComparisons.bewley.sha256,evidence.sourceSha256);
 assert.equal(sources.find(s=>s.id===c.id)?.url,audit.englishComparisons.bewley.url,'Absent comparison points to another source');
 assert.deepEqual(evidence.checkedOccurrences,evidence.checkedReferences.map(ref=>audit.records.find(r=>String(r.reference)===ref)?.englishComparisons.bewley),'Absence boundaries differ from pinned occurrences');
 assert.deepEqual(evidence.checkedReferences,[String(candidate.afterReference),String(candidate.beforeReference)]);
 const positions=evidence.checkedReferences.map(ref=>audit.records.findIndex(r=>String(r.reference)===ref));
 assert(positions[0]>=0&&positions[1]===positions[0]+1,'Absence boundaries must be adjacent source records');
 assert.equal(candidate.proposedAppReference,row.number);assert.equal(candidate.printedReference,evidence.printedReference);
 assert.equal(candidate.arabicSha256,row.arabicSha256,'Absent occurrence has a different printed body');
 for(const field of ['afterReference','beforeReference','digitalSourceId','digitalSourceSha256','digitalInventorySha256'])assert.equal(row.printedReport[field],candidate[field]);
 const limits=candidate.comparisonLimits.find(v=>v.sourceId===c.id);
 assert.equal(limits.status,c.status);assert.deepEqual(limits.checkedReferences,c.checkedReferences);assert.equal(c.note,limits.note);
 const other=row.comparisons.find(v=>v.id==='islamhouse-khan'),otherLimits=candidate.comparisonLimits.find(v=>v.sourceId===other?.id);
 assert.equal(other?.status,otherLimits?.status);assert.deepEqual(other.checkedReferences,otherLimits.checkedReferences);
 const policy=read('content/review/reference-numbering-policy.json');assert.equal(hash(policy),evidence.referencePolicySha256);
 assert.equal(row.printedReport.referenceDecision?.status,'user-confirmed');
 assert.equal(row.printedReport.referenceDecision.appReference,row.number);assert.equal(row.printedReport.referenceDecision.printedReference,evidence.printedReference);
 assert.equal(row.printedReport.referenceDecision.userReply,policy.userReply);
 assert(policy.confirmedCases.some(v=>v.appReference===row.number&&v.printedReference===evidence.printedReference),'Missing confirmed reference decision');
 const single=evidence.individualComparison,citation=row.additionalCitations?.find(v=>v.id===single.citationId),source=sources.find(s=>s.id===single.sourceId);
 assert(citation&&citation.sourceId===single.sourceId&&citation.scope===single.scope,'Separate online comparison and its limits must remain visible');
 assert.equal(source?.kind,'english-comparison');assert.equal(source.url,single.url);
 const checked=candidate.comparisonLimits.find(v=>v.sourceId===single.sourceId);
 assert.equal(checked.url,single.url);assert.equal(checked.note,single.scope);assert.equal(checked.status,'individual-report-inspected');
 return true;
}
