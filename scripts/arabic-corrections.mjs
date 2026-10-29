/* Apply only explicit, evidence-bound personal-prototype corrections. Pinned input stays immutable. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function deriveArabicBlocks(row,originals,sources){
 const corrections=row.arabicCorrections;
 if(corrections===undefined){assert.equal(row.originalArabicSha256,undefined,'Original hash without a correction');return [...originals];}
 assert(Array.isArray(corrections)&&corrections.length,'Empty correction declaration');
 assert.equal(row.originalArabicSha256,sha(originals.join('\n\n')),'Correction targets changed Arabic input');
 const result=[...originals],ids=new Set(),paragraphs=new Map();
 for(const c of corrections){
  assert(typeof c.id==='string'&&c.id.trim()&&!ids.has(c.id),'Missing or duplicate correction identity');ids.add(c.id);
  assert.equal(c.status,'chosen-for-personal-prototype');assert.equal(c.reviewerKind,'ai');assert.equal(c.independentReview,'pending');
  const index=row.paragraphIds.indexOf(c.paragraphId);assert(index>=0&&row.paragraphIds.lastIndexOf(c.paragraphId)===index,'Correction needs one unambiguous original paragraph');
  const state=paragraphs.get(c.paragraphId)||{end:0,delta:0,corrections:[]};
  const points=Array.from(originals[index]);assert.equal(c.originalParagraphSha256,sha(originals[index]),'Stale correction paragraph');
  assert(Number.isSafeInteger(c.start)&&Number.isSafeInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=points.length,'Invalid correction offsets');
  assert(typeof c.before==='string'&&c.before.trim()&&typeof c.after==='string'&&c.after.trim()&&c.before!==c.after,'Invalid correction wording');
  assert.equal(points.slice(c.start,c.end).join(''),c.before,'Correction does not match original wording');
  assert(c.start>=state.end,'Corrections must be ordered and must not overlap in the original paragraph');
  assert(typeof c.reason==='string'&&c.reason.trim(),'Correction lacks a reason');
  assert.deepEqual(c.witnesses.map(w=>w.sourceId).sort(),['brill-1862','dar-ibn-kathir-2002'],'Correction requires two distinct printed witnesses');
  for(const w of c.witnesses){const source=sources.find(s=>s.id===w.sourceId),print=row.printedWitnesses.find(p=>p.id===w.sourceId);assert(source?.kind==='arabic-witness'&&/^[a-f0-9]{64}$/.test(source.sha256),'Correction source is not a pinned Arabic witness');assert.equal(w.sourceSha256,source.sha256,'Correction witness changed');let reading=w.reading;
   if(w.spellingEquivalence!==undefined){
    assert.equal(w.spellingEquivalence,'ibn-alif-omitted','Unknown printed spelling equivalence');
    assert(typeof reading==='string'&&reading.split(' ابن ').length===2,'Spelling equivalence needs exactly one medial ibn');
    reading=reading.replace(' ابن ',' بن ');
    assert.notEqual(w.reading,c.after,'Unnecessary printed spelling equivalence');
   }
   assert.equal(reading,c.after,'Correction differs from its recorded printed reading');assert(Number.isSafeInteger(w.pdfPage)&&print?.status===undefined&&print.pdfPages.includes(w.pdfPage),'Correction lacks a matching inspected page');}
  const notice=row.contextNotes?.find(n=>n.id===c.contextNoteId);assert(notice?.label?.trim()&&notice.text?.trim()&&['base',...c.witnesses.map(w=>w.sourceId)].every(id=>notice.citations.includes(id)),'Correction lacks its visible source notice');
  const segment=row.segments.find(s=>s.id===c.englishSegmentId);assert(segment&&typeof c.englishRendering==='string'&&c.englishRendering.trim()&&segment.english.includes(c.englishRendering),'Correction lacks its matching English rendering');
  const derivedStart=c.start+state.delta,derived=Array.from(result[index]),replacement=Array.from(c.after);
  derived.splice(derivedStart,c.end-c.start,...replacement);result[index]=derived.join('');
  assert(segment.paragraphId===c.paragraphId&&segment.start<=derivedStart&&segment.end>=derivedStart+replacement.length,'Correction is outside its translated segment');
  state.end=c.end;state.delta+=replacement.length-(c.end-c.start);state.corrections.push(c);paragraphs.set(c.paragraphId,state);
 }
 for(const [id,state]of paragraphs)for(const c of state.corrections)assert.equal(c.correctedParagraphSha256,sha(result[row.paragraphIds.indexOf(id)]),'Incorrect derived paragraph hash');
 return result;
}
