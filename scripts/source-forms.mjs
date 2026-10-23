/* A chain-only entry must be explicitly reviewed, never inferred from missing prose. */
import assert from 'node:assert/strict';
export function validateSourceForm(row,sources){
 const form=row.sourceForm;if(form===undefined)return;
 assert.equal(form.kind,'chain-only','Unknown source form');assert.equal(form.reviewerKind,'ai');assert.equal(form.independentReview,'pending');
 assert.equal(form.sourceRecordId,row.sourceRecordId,'Source form belongs to another entry');assert.equal(form.arabicSha256,row.arabicSha256,'Source form belongs to another text');
 assert(typeof form.reason==='string'&&form.reason.trim(),'Source form needs a reason');
 assert(row.segments.length&&row.segments.every(s=>s.kind==='chain'),'Chain-only entry has a non-chain segment');
 assert.deepEqual(form.witnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Source form needs two printed witnesses');
 for(const witness of form.witnesses){const source=sources.find(s=>s.id===witness.sourceId),print=row.printedWitnesses.find(w=>w.id===witness.sourceId);assert(source?.kind==='arabic-witness'&&/^[a-f0-9]{64}$/.test(source.sha256),'Unpinned source-form witness');assert.equal(witness.sourceSha256,source.sha256,'Source-form witness changed');assert(Number.isSafeInteger(witness.pdfPage)&&print?.status===undefined&&print.pdfPages.includes(witness.pdfPage),'Source form lacks its inspected page');}
 const note=row.contextNotes?.find(n=>n.id===form.contextNoteId);assert(note?.label?.trim()&&note.text?.trim()&&['base',...form.witnesses.map(w=>w.sourceId)].every(id=>note.citations.includes(id)),'Chain-only entry needs a visible evidence note');assert(note.related?.length&&note.related.every(r=>r.id!==row.id&&r.target==='entry'),'Chain-only entry needs a separate related account');
}
