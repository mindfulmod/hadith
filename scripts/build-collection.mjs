/* Assemble reviewed personal-prototype batches; never infer Arabic edits or sign-offs. */
import {validateBookInventory,validateEntryLayout,layoutInputEvidence,layoutSourceNotice,layoutSourceDetails} from './mapped-source.mjs';
import {validateSourceForm} from './source-forms.mjs';
import {buildBookIntroduction,bookIntroductionNotes} from './book-introductions.mjs';
import {deriveArabicBlocks} from './arabic-corrections.mjs';
import {derivePrintedBlocks,validatePrintedHeading,reviewedChapterViews,printedHeadingContext,printedAdditionDetails} from './printed-supplements.mjs';
import {sourceLocationCorrections,resolveSourceLocation} from './source-locations.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {prototypeFiles} from './build-opening-prototype.mjs';
import {validateSourceStructure} from '../reader/source-structure.mjs';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o)),bytes=o=>JSON.stringify(o,null,2)+'\n';
export const BOOK_CONFIGS=Object.freeze({
 faith:Object.freeze({id:'faith',number:2,title:'Faith',first:8,arabicSourceId:'arabic-faith',bewleySourceId:'bewley',bewleyTitle:'Belief',revision:490285}),
 knowledge:Object.freeze({id:'knowledge',number:3,title:'Knowledge',first:59,arabicSourceId:'arabic-knowledge',bewleySourceId:'bewley-knowledge',bewleyTitle:'Knowledge',revision:252975}),
 ablution:Object.freeze({id:'ablution',number:4,title:'Ablution',first:135,arabicSourceId:'arabic-ablution',bewleySourceId:'bewley-ablution',bewleyTitle:'Wudu',revision:273249,sourceLayout:'mapped'}),
 ghusl:Object.freeze({id:'ghusl',number:5,title:'Ghusl',first:245,arabicSourceId:'arabic-ghusl',bewleySourceId:'bewley-ghusl',bewleyTitle:'Ghusl',revision:484873,bookIntroduction:'preserved-arabic'}),
 menstruation:Object.freeze({id:'menstruation',number:6,title:'Menstruation',first:290,arabicSourceId:'arabic-menstruation',bewleySourceId:'bewley-menstruation',bewleyTitle:'Menstruation',revision:484869,bookIntroduction:'preserved-arabic'})
});
function bookConfig(config){assert(Object.values(BOOK_CONFIGS).includes(config),'Unknown book configuration');return config;}
let englishInventory;
function comparisonEvidence(reference,evidence){
 englishInventory??=read('content/staging/bukhari-en-islamhouse/catalog.json');
 const record=englishInventory.records.find(r=>r.id===englishInventory.namespace+':'+reference);
 assert(record,'Comparison label is absent from the pinned inventory');
 assert.deepEqual(evidence,{sourceSha256:englishInventory.sourceSha256,sourceRecordId:record.id,recordSha256:hash(record)},'Comparison needs exact pinned-inventory evidence');
 return record;
}
function validateComparisons(comparisons,config,segments){
 const khanReference=new RegExp('^1\\.'+config.number+'\\.[1-9]\\d*[a-z]?$');
 assert.deepEqual(comparisons.map(c=>c.id).sort(),[config.bewleySourceId,'islamhouse-khan'].sort(),'Expected distinct English comparison records');
 const bewley=comparisons.find(c=>c.id===config.bewleySourceId),khan=comparisons.find(c=>c.id==='islamhouse-khan');
 assert(/^[1-9]\d*$/.test(bewley.reference),'Invalid Bewley comparison');
 if(bewley.status!==undefined){
  assert(['cross-reference-with-transmission-note','abbreviated-report'].includes(bewley.status),'Unknown Bewley comparison form');
  assert(typeof bewley.note==='string'&&bewley.note.trim(),'Abbreviated comparison needs an explanation');
  if(bewley.status==='cross-reference-with-transmission-note'||bewley.referencedReference!==undefined)assert(/^[1-9]\d*$/.test(bewley.referencedReference)&&Number(bewley.referencedReference)<Number(bewley.reference),'Cross-reference comparison needs its earlier reference');
 }else assert.equal(bewley.referencedReference,undefined,'A comparison pointer needs an explicit status');
 assert(bewley.part===undefined&&bewley.splitReferences===undefined,'Unexpected Bewley part metadata');
 if(khan.status==='back-reference-only'){
  assert(khanReference.test(khan.reference)&&khanReference.test(khan.referencedReference),'Invalid backward-reference comparison');
  assert(khan.part===undefined&&khan.splitReferences===undefined&&khan.checkedReferences===undefined,'Backward reference cannot claim a complete comparison body');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length===2&&khan.checkedBody.every(p=>typeof p==='string')&&hash(khan.checkedBody)===record.textSha256,'Backward pointer differs from its pinned body');
  const pointer=/^The Prophet said as above \(([1-9]\d*)\)\.$/.exec(khan.checkedBody[1].trim());
  assert(/^Narrated .+:$/.test(khan.checkedBody[0].trim())&&pointer&&khan.referencedReference===`1.${config.number}.${pointer[1]}`&&Number(pointer[1])<Number(khan.reference.split('.')[2]),'Invalid or forward comparison pointer');
  assert(typeof khan.note==='string'&&khan.note.trim(),'Backward reference needs an explanation');return;
 }
 if(khan.status==='reference-only-body-absent'){
  assert(khanReference.test(khan.reference),'Invalid reference-only comparison');
  assert(khan.part===undefined&&khan.splitReferences===undefined&&khan.checkedReferences===undefined,'Reference-only comparison cannot claim complete report parts');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length===2&&khan.checkedBody.every(p=>typeof p==='string'),'Reference-only comparison needs its exact checked body');
  assert.equal(hash(khan.checkedBody),record.textSha256,'Reference-only body differs from the pinned record');
  assert(/^Narrated .+:$/.test(khan.checkedBody[0].trim())&&/^the above mentioned Statement of '[A-Za-z -]+\.$/.test(khan.checkedBody[1].trim()),'Checked record is not a narrator and backward pointer');
  assert(typeof khan.note==='string'&&khan.note.trim(),'Reference-only comparison needs an omission explanation');
  return;
 }
 assert.equal(khan.checkedBody,undefined,'Only a reference-only comparison may carry checked-body evidence');
 if(khan.status===undefined){
  assert(khanReference.test(khan.reference),'Invalid Khan-family comparison');
  if(khan.splitReferences!==undefined){
   assert(khan.part===undefined&&khan.referenceEvidence===undefined,'Split comparison cannot claim a shared-reference part');
   const parts=khan.splitReferences;
   assert(Array.isArray(parts)&&parts.length>1,'Split comparison needs multiple records');
   assert.equal(parts[0].reference,khan.reference,'Split comparison must start at its primary reference');
   assert(typeof khan.note==='string'&&khan.note.trim(),'Split comparison needs an explanation');
   for(const [i,p]of parts.entries()){
    assert(khanReference.test(p.reference),'Invalid split reference');
    if(i)assert(Number(p.reference.split('.')[2])>Number(parts[i-1].reference.split('.')[2]),'Split references must be distinct and ordered');
    const record=comparisonEvidence(p.reference,p.referenceEvidence);
    assert(Array.isArray(p.segmentIds)&&p.segmentIds.length,'Split comparison needs segment coverage');
    if(p.status!==undefined){
     assert(Array.isArray(p.checkedBody)&&p.checkedBody.length===2&&p.checkedBody.every(v=>typeof v==='string')&&hash(p.checkedBody)===record.textSha256,'Abbreviated comparison part differs from its pinned body');
     assert(/^Narrated .+:$/.test(p.checkedBody[0].trim())&&typeof p.note==='string'&&p.note.trim(),'Abbreviated comparison part needs a narrator and explanation');
     if(p.status==='back-reference-only'){
      const pointer=/^as above \(([1-9]\d*)\)\.$/.exec(p.checkedBody[1].trim());
      assert(pointer&&p.referencedReference===`1.${config.number}.${pointer[1]}`&&Number(pointer[1])<Number(p.reference.split('.')[2]),'Invalid split backward pointer');
      assert.equal(p.continuedByReference,undefined,'Backward pointer cannot claim a forward continuation');
      comparisonEvidence(p.referencedReference,p.referencedReferenceEvidence);
      assert(p.segmentIds.every(id=>segments.find(s=>s.id===id)?.kind==='chain'),'Backward-only part may only correspond to an abbreviated chain');
     }else if(p.status==='forward-reference-only'){
      const pointer=/^as the following Hadith ([1-9]\d*)\.$/.exec(p.checkedBody[1].trim());
      assert(pointer&&p.continuedByReference===`1.${config.number}.${pointer[1]}`&&p.continuedByReference===parts[i+1]?.reference&&Number(pointer[1])===Number(p.reference.split('.')[2])+1,'Forward-only pointer needs its exact adjacent continuation');
      assert(p.referencedReference===undefined&&p.referencedReferenceEvidence===undefined,'Forward-only pointer cannot claim a backward reference');
      assert(p.segmentIds.every(id=>segments.find(s=>s.id===id)?.kind==='chain'),'Forward-only part may only correspond to an abbreviated chain');
     }else{
      assert.equal(p.status,'forward-incipit-only','Unknown abbreviated comparison part');
      assert.equal(p.checkedBody[1].trim(),"While Allah's Apostle was prostrating (as stated below).",'Unexpected forward incipit');
      assert(p.continuedByReference===parts[i+1]?.reference&&Number(p.continuedByReference.split('.')[2])===Number(p.reference.split('.')[2])+1,'Forward incipit needs its adjacent continuation');
      assert(p.referencedReference===undefined&&p.referencedReferenceEvidence===undefined,'Forward incipit cannot claim a backward reference');
      const kinds=p.segmentIds.map(id=>segments.find(s=>s.id===id)?.kind);assert.deepEqual(kinds,['chain','report'],'Forward incipit must retain its chain and opening report');
     }
    }else assert(p.checkedBody===undefined&&p.referencedReference===undefined&&p.referencedReferenceEvidence===undefined&&p.continuedByReference===undefined,'Abbreviated comparison metadata needs an explicit status');
   }
   assert.deepEqual(parts.flatMap(p=>p.segmentIds),segments.map(s=>s.id),'Split references must cover the selected segments exactly once in order');
   return;
  }
  if(/[a-z]$/.test(khan.reference)){
   comparisonEvidence(khan.reference,khan.referenceEvidence);
  }else if(khan.referenceEvidence!==undefined)comparisonEvidence(khan.reference,khan.referenceEvidence);
  if(khan.part!==undefined)assert(khan.part&&Number.isSafeInteger(khan.part.index)&&Number.isSafeInteger(khan.part.count)&&khan.part.count>1&&khan.part.index>=1&&khan.part.index<=khan.part.count,'Invalid comparison part');
  return;
 }
 assert(khan.part===undefined&&khan.splitReferences===undefined,'An absent comparison cannot claim a report part');
 assert.equal(khan.status,'not-present-in-checked-sequence','Unknown comparison status');assert.equal(khan.reference,null,'An absent comparison cannot claim a matching reference');
 assert(Array.isArray(khan.checkedReferences)&&khan.checkedReferences.length===2&&khan.checkedReferences.every(r=>khanReference.test(r)),'Missing comparison search evidence');
 assert.equal(Number(khan.checkedReferences[1].split('.')[2]),Number(khan.checkedReferences[0].split('.')[2])+1,'Checked comparison references must be adjacent');
 assert(typeof khan.note==='string'&&khan.note.trim(),'Missing comparison absence explanation');
 if(khan.checkedReferenceEvidence!==undefined){
  assert(Array.isArray(khan.checkedReferenceEvidence)&&khan.checkedReferenceEvidence.length===khan.checkedReferences.length,'Incomplete checked-sequence evidence');
  khan.checkedReferences.forEach((reference,index)=>comparisonEvidence(reference,khan.checkedReferenceEvidence[index]));
 }
}
function entryTranslationStatus(row){
 if(row.sourceForm?.kind==='chain-only')return 'Personal prototype: the selected Arabic entry records a narrator chain without repeating the report body. The complete selected chain is translated; related accounts and abbreviated comparisons remain separate. Two Arabic prints and two English comparison families were inspected. Independent Arabic, English and context review pending.';
 if(row.arabicSupplements?.some(s=>s.englishComparisons))return 'Personal prototype: AI-assisted working translation with a separately identified closing transmission note transcribed from an Arabic print. Two printed witnesses, the unchanged digital text and the differing coverage of the English comparisons remain accessible. Independent Arabic, English and context review pending.';
 if(row.arabicSupplements)return 'Personal prototype: AI-assisted working translation with a separately identified closing transmission note transcribed from an Arabic print. Two printed witnesses and the original digital text remain accessible; the English comparisons omit that closing note. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='reference-only-body-absent'))return 'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one complete English comparison body were checked. The second English reference contains only a backward pointer, not the statement body. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='abbreviated-report'))return 'Personal prototype: AI-assisted working translation; two Arabic prints and two English comparison families were inspected. One English comparison abbreviates the report; its omitted wording and any explicit Arabic correction are documented in the source notes. Independent Arabic, English and context review pending.';
 if(row.arabicCorrections)return 'Personal prototype: AI-assisted working translation with an explicitly recorded Arabic correction supported by two printed witnesses. English comparison bodies and the original input remain accessible. Independent Arabic, English and context review pending.';
 if(row.printedWitnesses.some(w=>w.status))return 'Personal prototype: AI-assisted working translation; the modern Arabic print and two English translation families were compared. The historical print does not separately contain this distinct form in its checked chapter; see source notes. Independent Arabic, English and context review pending.';
 return row.comparisons.some(c=>c.status==='not-present-in-checked-sequence')?'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one English translation family compared. A second English comparison is absent from the checked sequence; see source notes. Independent Arabic, English and context review pending.':'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and two English translation families compared. Independent Arabic, English and context review pending.';
}
function validatePrintedWitnesses(witnesses){
 assert.deepEqual(witnesses.map(w=>w.id).sort(),['brill-1862','dar-ibn-kathir-2002'],'Expected two distinct Arabic print witnesses');
 for(const w of witnesses){
  assert(Array.isArray(w.pdfPages)&&w.pdfPages.length&&w.pdfPages.every((p,i)=>Number.isSafeInteger(p)&&p>0&&(!i||p>w.pdfPages[i-1])),'Invalid printed witness pages');
  if(w.status===undefined){assert.equal(w.note,undefined,'A witness note requires an explicit comparison status');continue;}
  assert.equal(w.id,'brill-1862','This absence status is defined for the historical witness only');
  assert.equal(w.status,'not-separately-present-in-checked-chapter','Unknown printed comparison status');assert(typeof w.note==='string'&&w.note.trim(),'Missing printed comparison absence evidence');
 }
}
function printedCitation(w){
 const location=`PDF ${w.pdfPages.length===1?'page':'pages'} ${w.pdfPages.join(', ')}`;
 return {id:w.id,sourceId:w.id,locator:w.status?`Checked ${location} · no separate match in this chapter`:location,pdfPage:w.pdfPages[0],scope:w.status?w.note+' This checked absence is not an exact printed match.':'Printed Arabic comparison; narrator-name and chapter-division differences are recorded in the offline notes.'};
}
function khanCitation(record){
 if(record.status==='back-reference-only'){const [volume,book,number]=record.reference.split('.');return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number} · backward reference only`,scope:record.note};}

 if(record.status==='reference-only-body-absent'){const [volume,book,number]=record.reference.split('.');return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number} · reference only; statement body absent`,scope:record.note};}
 if(record.splitReferences){const [volume,book]=record.reference.split('.'),abbreviated=record.splitReferences.some(p=>p.status);return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Numbers ${record.splitReferences.map(p=>p.reference.split('.')[2]).join(', ')} · separately numbered comparison parts${abbreviated?' · includes an abbreviated part':''}`,scope:record.note+' The reader retains one complete numbered entry from its selected Arabic source.'};}
 if(record.status==='not-present-in-checked-sequence')return {id:'khan',sourceId:'islamhouse-khan',locator:`No corresponding report in the checked sequence: ${record.checkedReferences.join(' → ')}`,scope:record.note+' This is documented absence in that sequence, not a completed English comparison or a claim about every occurrence elsewhere in the collection.'};
 const [volume,book,number]=record.reference.split('.');
 return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number}${record.part?` · report ${record.part.index} of ${record.part.count}`:''}`,scope:record.part?'This English reference contains multiple reports. Only the identified report is matched here; the reader retains separate entries and full chains from its selected Arabic source.':'Khan-family English comparison, individually matched by wording. This reference is recorded per report; no full-collection numbering equivalence is assumed.'};
}
export function buildBookBatch(inventory,review,manifest,config){
 bookConfig(config);
 validateBookInventory(inventory,review,config);
 assert.equal(inventory.records[0].number,config.first,'Source book begins at the wrong reference');
 assert.equal(manifest.revision,config.revision,'Unexpected source revision');
 assert.equal(review.schemaVersion,1);assert.equal(review.status,'personal-prototype-only');assert.equal(review.independentReview,'pending');
 assert.equal(review.inventorySha256,hash(inventory),'Stale source inventory');assert.equal(review.sourceSha256,inventory.sourceSha256);assert.equal(review.sourceId,inventory.sourceId);assert.equal(manifest.file.sha256,inventory.sourceSha256);
 const bookIntroduction=buildBookIntroduction(inventory,review,manifest,config);
 const numbers=review.entries.map(e=>e.number);assert(numbers.length,'Empty book batch');
 assert.deepEqual(numbers,inventory.records.filter(r=>r.number>=numbers[0]&&r.number<=numbers.at(-1)).map(r=>r.number),'Book batch must be in complete source order');
 const blocks=new Map(inventory.blocks.map(b=>[b.htmlId,b])),entries=[];
 const comparisonGroups=new Map();
 for(const row of review.entries){
  validateComparisons(row.comparisons,config,row.segments);const c=row.comparisons.find(c=>c.id==='islamhouse-khan');
  if(c.status!==undefined)continue;
  for(const part of c.splitReferences||[c]){const group=comparisonGroups.get(part.reference)||[];group.push(part);comparisonGroups.set(part.reference,group);}
 }
 for(const group of comparisonGroups.values())if(group.length>1){
  assert(group.every(c=>c.part&&c.part.count===group[0].part?.count),'A shared reference needs consistent report parts');
  assert.equal(new Set(group.map(c=>c.part.index)).size,group.length,'A comparison part cannot be assigned twice');
 }

 for(const row of review.entries){
  const {reviewRecordSha256,...record}=row;assert.equal(reviewRecordSha256,hash(record),'Stale entry review');
  assert.equal(row.status,'personal-prototype-only');assert.equal(row.reviewerKind,'ai');assert.equal(row.independentReview,'pending');
  const original=inventory.records.find(r=>r.number===row.number);assert(original&&original.id===row.sourceRecordId&&row.id===`bukhari:${row.number}`,'Source identity mismatch');
  assert.deepEqual(row.paragraphIds,original.paragraphIds);assert.equal(row.chapterId,original.chapterId);
  validateEntryLayout(inventory,row,original);
  assert(row.notes.length&&row.printedWitnesses.length===2&&row.comparisons.length===2,'Missing comparison evidence');
  validatePrintedWitnesses(row.printedWitnesses);validateSourceForm(row,review.sources);
  const originalArabic=row.paragraphIds.map(id=>blocks.get(id).text),corrected=deriveArabicBlocks(row,originalArabic,review.sources);
  validatePrintedHeading(row,originalArabic,review.sources);
  const {blockIds,arabicBlocks:arabic_blocks}=derivePrintedBlocks(row,originalArabic,corrected,review.sources),english_blocks=row.segments.map(s=>s.english);
  const presentation={schemaVersion:1,arabic:[],english:[]};
  for(const [i,s] of row.segments.entries()){
   const block=blockIds.indexOf(s.paragraphId);assert(block>=0&&Number.isSafeInteger(s.start)&&Number.isSafeInteger(s.end));
   assert.equal(s.arabic,Array.from(arabic_blocks[block]).slice(s.start,s.end).join(''),'Changed Arabic span');assert.equal(s.arabicSha256,sha(s.arabic));assert.equal(s.englishSha256,sha(s.english));
   if(['chain','transmission-note'].includes(s.kind))for(const [arabic,english]of [[['حدثنا','حدثتنا'],'related to us'],[['حدثني','حدثتني'],'related to me'],[['أخبرنا'],'informed us'],[['أخبرني','أخبرتني'],'informed me'],[['سمعت'],'i heard']])assert.equal(arabic.reduce((n,word)=>n+s.arabic.replace(/\p{M}/gu,'').split(word).length-1,0),s.english.toLowerCase().split(english).length-1,'Reporting verb mismatch in '+s.id);
   const supplement=row.arabicSupplements?.find(a=>a.id===s.paragraphId),origin=supplement?{provenance:{kind:'printed-supplement',id:supplement.id}}:{};
   presentation.arabic.push({block,start:s.start,end:s.end,kind:s.kind,...origin});presentation.english.push({block:i,start:0,end:Array.from(s.english).length,kind:s.kind,...origin});
  }
  assert.equal(row.arabicSha256,sha(arabic_blocks.join('\n\n')));assert.equal(row.englishSha256,sha(english_blocks.join('\n\n')));
  const entry={id:row.id,book:config.title,number:row.number,arabic_blocks,arabic_sha256:row.arabicSha256,english_blocks,english_status:entryTranslationStatus(row),presentation,review:{status:row.status,independentReview:row.independentReview,sourceRecordId:row.sourceRecordId,reviewRecordSha256,notes:row.notes,reviewScope:row.reviewScope,...(row.sourceForm?{sourceForm:structuredClone(row.sourceForm)}:{}),...(row.sourceLayout?{sourceLayout:structuredClone(row.sourceLayout)}:{}),...(row.arabicCorrections?{originalArabicSha256:row.originalArabicSha256,arabicCorrections:structuredClone(row.arabicCorrections)}:{}),...(row.arabicSupplements?{arabicSupplements:structuredClone(row.arabicSupplements)}:{}),...(row.printedHeading?{printedHeading:structuredClone(row.printedHeading)}:{})},audio_status:'No recording yet.'};
  validateSourceStructure(entry);entries.push(entry);
 }
 const chapters=review.chapters.map(c=>{
  const original=inventory.chapters.find(r=>r.id===c.id);assert(original,'Unknown source chapter');
  assert.deepEqual(c.entryNumbers,original.entryNumbers);assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.headingId,original.headingId);assert.equal(c.titleArabic,blocks.get(c.headingId).text);assert(['ai-working-translation','heading-discrepancy-pending'].includes(c.status));assert.equal(c.independentReview,'pending');assert(c.title.trim());
  if(c.status==='heading-discrepancy-pending'){assert.equal(c.title,'Chapter heading under review');assert.equal(c.headingDiscrepancy?.status,'unresolved');assert(c.titleArabic.includes(c.headingDiscrepancy.digitalPhrase));assert(c.headingDiscrepancy.printedPhrase&&c.headingDiscrepancy.printedWitnesses.length===2);}
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers,sourceContext:{schemaVersion:1,headingStatus:c.status,numberedReports:c.entryNumbers.length?'present':'none-in-source',introduction:{arabicParagraphs:c.contextIds.length,englishStatus:c.contextIds.length?'pending':'not-applicable'},notes:{path:config.id+'-review.html',fragment:c.id}}};
 });
 assert.deepEqual(chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number),'Chapter coverage mismatch');
 // Empty source chapters are real context. They cannot disappear or be reordered in an admitted span.
 const start=inventory.chapters.findIndex(c=>c.id===review.chapters[0]?.id),end=inventory.chapters.findIndex(c=>c.id===review.chapters.at(-1)?.id);
 assert(start>=0&&end>=start,'Missing chapter span');
 assert.deepEqual(review.chapters.map(c=>c.id),inventory.chapters.slice(start,end+1).map(c=>c.id),'Incomplete source chapter span');
 if(numbers[0]===config.first)assert.equal(start,0,'Opening source-only chapters must be retained');
 const chapterViews=reviewedChapterViews(review);
 const catalogChapters=chapterViews.map(c=>{const original=chapters.find(v=>v.id===c.id);if(original)return {...original,entryNumbers:c.entryNumbers};
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers,sourceContext:{schemaVersion:1,headingStatus:'ai-working-translation',numberedReports:'present',introduction:{arabicParagraphs:0,englishStatus:'not-applicable'},notes:{path:config.id+'-review.html',fragment:c.id},printedHeading:printedHeadingContext(c.printedHeading)}};
 });
 return {entries,chapters:catalogChapters,chapterViews,...(bookIntroduction?{bookIntroduction}:{})};
}
export function assembleCollection(opening,inventory,review,manifest,config=BOOK_CONFIGS.faith){
 const batch=buildBookBatch(inventory,review,manifest,config),sources=structuredClone(opening.source.sources);
 assert(!opening.ledger.books.some(b=>b.id===config.id),'Book already assembled');
 assert.equal(opening.source.entries.at(-1).number+1,config.first,'Collection book order must be consecutive');
 for(const s of review.sources)if(!sources.some(v=>v.id===s.id))sources.push(resolveSourceLocation(s));
 const range=`${batch.entries[0].number}–${batch.entries.at(-1).number}`;
 const correctedNumbers=review.entries.filter(e=>e.arabicCorrections).map(e=>e.number);
 const source={...opening.source,scope:config.id==='faith'?`Personal prototype: opening entries 1–7 and Book of Faith entries ${range}. The rest of the collection remains in preparation.`:`Personal prototype: complete numbered entries 1–${batch.entries.at(-1).number} across ${opening.ledger.books.length+1} books. The rest of the collection remains in preparation.`,
  license:{...opening.source.license,attribution:config.id==='faith'?'Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic digital transcription by Arabic Wikisource contributors, opening revision 484874 and Faith revision 490285.':opening.source.license.attribution+` Book of ${config.title}: revision ${config.revision}.`,changes:opening.source.license.changes+` ${correctedNumbers.length?`Hadith ${range} derive from revision ${config.revision}; only ${correctedNumbers.join(', ')} have declared Arabic corrections, with unchanged original inputs preserved separately`:`Hadith ${range} retain their Arabic ${inventory.schemaVersion===2?'source spans':'paragraphs'} unchanged from revision ${config.revision}`}; their new English and available chapter titles are AI-assisted.${review.chapters.some(c=>c.status==='heading-discrepancy-pending')?' A disputed chapter heading is explicitly withheld.':''}${inventory.schemaVersion===2?' Exact source origins and original labels are retained; any different reader reference is explicitly mapped.':''} Chapter introductions are preserved separately in Arabic, with English translation still pending.${review.entries.some(e=>e.arabicSupplements||e.printedHeading)?(review.entries.some(e=>e.printedHeading)?(review.entries.some(e=>e.arabicSupplements)?' Declared printed additions supply a missing closing transmission note and chapter heading; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.':' A declared printed addition supplies a missing chapter heading; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.'):' A declared printed addition supplies a missing closing transmission note; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.'):''}`},sources,
  prototypeReview:config.id==='faith'?{...opening.source.prototypeReview,openingSourceSha256:hash(opening.source),faithReviewSha256:hash(review),faithSourceSha256:manifest.file.sha256}:{...opening.source.prototypeReview,[config.id+'ReviewSha256']:hash(review),[config.id+'SourceSha256']:manifest.file.sha256},entries:[...opening.source.entries,...batch.entries]};
 const sourceHash=hash(source),references=structuredClone(opening.ledger.sourceReferences);references.sourceRecordSha256=sourceHash;
 for(const {id,label,kind,format,url}of review.sources.map(resolveSourceLocation)){const existing=references.sources.find(s=>s.id===id);if(existing)assert.deepEqual(existing,{id,label,kind,format,url},'Conflicting shared source');else references.sources.push({id,label,kind,format,url});}
 for(const e of batch.entries){
  const r=review.entries.find(r=>r.number===e.number),chapter=review.chapters.find(c=>c.entryNumbers.includes(e.number));
  references.entries.push({id:e.id,number:e.number,entrySha256:hash(e),translation:{label:'Personal prototype · English working translation',description:e.english_status+' This is a new working translation, not the Darussalam translation.'},citations:[
   {id:'base',sourceId:config.arabicSourceId,locator:`Book of ${config.title} · source entry ${r.sourceLayout?.sourceReference.label??e.number} · ${chapter.titleArabic}`,scope:r.sourceLayout?'Exact source spans with unchanged original labels and paragraphs preserved in the offline notes. Any separately declared wording correction is recorded with its evidence.':r.arabicCorrections?'Derived Arabic with an explicitly recorded correction supported by two printed witnesses. The unchanged digital paragraph, before/after wording and evidence are preserved in the offline source notes.':'Exact Arabic paragraphs from the pinned revision. Source chapter grouping is retained; full chapter introductions are preserved separately in Arabic in the offline notes.'},
   {id:'bewley',sourceId:config.bewleySourceId,locator:`Book of ${config.bewleyTitle} · entry ${r.comparisons.find(c=>c.id===config.bewleySourceId).reference}`,scope:r.sourceForm?.kind==='chain-only'?'Named English comparison for this abbreviated transmission; no repeated report body is supplied here.':r.comparisons.find(c=>c.id===config.bewleySourceId).status!==undefined?r.comparisons.find(c=>c.id===config.bewleySourceId).note:'Named English comparison for the report body. The shortened chain does not replace the selected full Arabic chain.'},
   khanCitation(r.comparisons.find(c=>c.id==='islamhouse-khan')),
   ...r.printedWitnesses.map(printedCitation),
   ...structuredClone(r.additionalCitations||[])
  ],contextNotes:[...structuredClone(r.contextNotes||[]),...layoutSourceNotice(r)],localNotes:{path:config.id+'-review.html',fragment:`hadith-${e.number}`,label:'Comparison notes and chapter source for this hadith'}});
 }
 const books=[...structuredClone(opening.ledger.books),{id:config.id,number:config.number,title:config.title,sourceEntryCount:inventory.records.length,entryNumbers:batch.entries.map(e=>e.number),chapters:batch.chapters,...(batch.bookIntroduction?{introduction:batch.bookIntroduction}:{})}];
 const ledger={...structuredClone(opening.ledger),sourceRecordSha256:sourceHash,books,catalogContextSha256:hash(books),sourceReferences:references,referencesSha256:hash(references)};
 ledger.entries.push(...batch.entries.map(e=>({number:e.number,id:e.id,entrySha256:hash(e),arabicSha256:e.arabic_sha256,englishSha256:sha(e.english_blocks.join('\n\n')),status:'personal-prototype-only',arabicReview:{status:'pending'},englishReview:{status:'pending'},contextReview:{status:'pending'}})));
 ledger.rights.evidence.push(`reader/${config.id}-inputs.json`,`reader/${config.id}-review.html`);
 const selectedIds=new Set([...(review.bookIntroduction?.blocks.map(b=>b.htmlId)||[]),...review.chapters.flatMap(c=>[c.headingId,...c.contextIds]),...review.entries.flatMap(e=>e.paragraphIds)]);
 const inputs={schemaVersion:1,sourceLocationCorrections,status:'personal-prototype-only',manifest,completeInventorySha256:hash(inventory),scope:`Only the blocks used by Hadith ${range} and their chapter context.${review.bookIntroduction?' The separately reviewed book introduction is also retained.':''} The complete source inventory remains separately preserved.`,selectedBlocks:inventory.blocks.filter(b=>selectedIds.has(b.htmlId)),...(inventory.schemaVersion===2?{sourceLayout:layoutInputEvidence(inventory,selectedIds)}:{}),review};
 const chapterNotes=batch.chapterViews.map(c=>{
  if(c.printedHeading)return `<article id="${esc(c.id)}"><p class="eyebrow">Chapter material · supplied from Arabic prints</p><h2>${esc(c.title)}</h2><p><a href="./#book/${config.id}/chapter/${esc(c.id)}">Open this chapter →</a></p><p>This heading is absent from the pinned digital chapter. It is preserved here from the printed witnesses without changing the original digital grouping. The heading stays separate from the numbered hadith and its narration.</p>${printedAdditionDetails(c.printedHeading,review.sources.map(resolveSourceLocation))}<p><a href="#${esc(c.printedHeading.sourceChapterId)}">Original digital chapter and grouping</a></p><p>Numbered reports in this section: ${c.entryNumbers.map(n=>`<a href="./#read/${n}">${n}</a>`).join(', ')}.</p></article>`;
  const sourceURL=new URL(manifest.url);sourceURL.hash=inventory.blocks.find(b=>b.htmlId===c.headingId).origin?.blockId??c.headingId;
  return `<article id="${esc(c.id)}"><p class="eyebrow">Chapter material · separate from numbered hadith</p><h2>${esc(c.title)}</h2><p><a href="./#book/${config.id}/chapter/${esc(c.id)}">Open this chapter →</a></p><p>${c.status==='heading-discrepancy-pending'?'The English heading is withheld because the selected digital and printed witnesses differ. The title above is an app status.':'The English heading is an AI-assisted working translation; independent review is pending.'}</p><h3>Selected Arabic heading</h3><div class="arabic" dir="rtl" lang="ar"><p>${esc(c.titleArabic)}</p></div><h3>Chapter introduction</h3>${c.contextIds.length?`<p>${c.contextIds.length} Arabic ${c.contextIds.length===1?'paragraph':'paragraphs'}. English translation is pending.</p><div class="arabic" dir="rtl" lang="ar">${c.contextIds.map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div>`:'<p>No separate introductory paragraph appears in this selected source chapter.</p>'}<p><a href="${esc(sourceURL.href)}" target="_blank" rel="noopener">Pinned Arabic source · revision ${manifest.revision} ↗</a></p><p>${c.entryNumbers.length?`Numbered reports in this chapter: ${c.entryNumbers.map(n=>`<a href="./#read/${n}">${n}</a>`).join(', ')}.`:'This source chapter has no numbered report. No hadith number has been invented for it.'}</p>${c.printedDivisions?`<p>The digital source groups ${review.chapters.find(original=>original.id===c.id).entryNumbers.join(', ')} under this heading. The printed witnesses introduce another heading before ${c.printedDivisions.map(d=>`<a href="#${esc(d.id)}">Hadith ${d.beforeEntry}: ${esc(d.title)}</a>`).join('; ')}. That section is separately browseable; the original digital grouping remains in the exact inputs.</p>`:''}${c.headingDiscrepancy?`<p>The heading difference is documented in the <a href="#hadith-${c.entryNumbers[0]}">report comparison notes</a>.</p>`:''}</article>`;
 }).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Book of ${config.title} · source notes</title><link rel="stylesheet" href="reader.css"><style>.review-page article{margin:3rem 0;padding-top:2rem;border-top:1px solid var(--line)}.review-page details{margin:1rem 0}.review-page summary{padding:1rem 0;cursor:pointer}.review-page .arabic{font-size:1.4rem;line-height:2}.review-page li{margin-bottom:1rem}</style></head><body><main class="review-page"><a href="./#book/${config.id}">← Book of ${config.title}</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>The Book of ${config.title}.</h1><p>${esc(review.scope)}</p><details class="edition-history"><summary>Edition comparison history</summary><p>These notes record findings as successive batches were prepared. Later entries may resolve earlier holds. Use the individual entry notes below for the evidence supplied with the current reading text.</p><p>${esc(review.editionNote)}</p></details><p><a href="${config.id}-inputs.json">Exact inputs and comparison record</a> · <a href="source-record.json">Current reading text</a></p>${review.bookIntroduction?'<p><a href="#book-introduction">Book introduction · opening quotations</a></p>':''}<nav aria-label="Chapter source notes">${batch.chapterViews.map((c,i)=>`<a href="#${esc(c.id)}">Chapter ${i+1}</a>`).join(' · ')}</nav><nav aria-label="Hadith source notes">${batch.entries.map(e=>`<a href="#hadith-${e.number}">${e.number}</a>`).join(' · ')}</nav>${batch.entries.map(e=>{
  const r=review.entries.find(r=>r.number===e.number),c=review.chapters.find(c=>c.entryNumbers.includes(e.number)),row=references.entries.find(row=>row.number===e.number);
  return `<article id="hadith-${e.number}"><h2>Hadith ${e.number}</h2><p>AI-assisted working translation. Independent review pending.</p><a href="./#read/${e.number}">Open this hadith →</a><h3>Comparison findings</h3><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p>${esc(r.reviewScope)}</p><details><summary>Complete working English</summary>${e.english_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</details><details><summary>${r.arabicSupplements?'Arabic used in the reader · printed addition':r.arabicCorrections?'Arabic used in the reader · declared correction':'Unchanged Arabic report'}</summary><div class="arabic" dir="rtl" lang="ar">${e.arabic_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</div></details>${r.arabicCorrections?`<section class="correction-record"><h3>Recorded Arabic correction</h3><p>Applied only to this personal prototype. AI-evaluated; independent review pending.</p>${r.arabicCorrections.map(c=>`<p>${esc(c.reason)}</p><p>Original wording:</p><p class="arabic" lang="ar" dir="rtl">${esc(c.before)}</p><p>Reader wording:</p><p class="arabic" lang="ar" dir="rtl">${esc(c.after)}</p>`).join('')}<details><summary>Unchanged original digital report</summary><div class="arabic original-arabic" lang="ar" dir="rtl">${r.paragraphIds.map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div></details></section>`:''}${r.arabicSupplements?.map(a=>printedAdditionDetails(a,review.sources.map(resolveSourceLocation))).join('')||''}${r.printedHeading?`<p>Printed chapter heading: <a href="#${esc(r.printedHeading.id)}">${esc(r.printedHeading.english)}</a>. This heading is separate from the narration.</p>`:''}${layoutSourceDetails(inventory,r)}<details><summary>Chapter heading and introduction</summary><p>${esc(c.title)}</p><p>${c.status==='heading-discrepancy-pending'?'This heading has no published English translation because the digital and printed witnesses differ. The label above is an app status, not source wording.':'The heading’s English is provisional.'} Any following introduction is preserved in Arabic; it is separate from the numbered hadith and its English translation remains pending.</p><div class="arabic" dir="rtl" lang="ar">${[c.headingId,...c.contextIds].map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div></details><details><summary>Sources and exact locations</summary><ul>${row.citations.map(c=>{const s=references.sources.find(s=>s.id===c.sourceId),url=new URL(s.url);if(c.pdfPage)url.hash='page='+c.pdfPage;return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a><p>${esc(c.locator)}<br>${esc(c.scope)}</p></li>`;}).join('')}</ul></details></article>`;
 }).join('')}${bookIntroductionNotes(inventory,review,manifest,config)}${chapterNotes}<p>${esc(source.license.attribution)}</p><p>${esc(source.license.changes)} <a href="${esc(source.license.url)}">CC BY-SA 4.0</a>.</p></main></body></html>\n`;
 return {source,ledger,files:new Map([...[...(opening.files||[])].filter(([path])=>Object.keys(BOOK_CONFIGS).some(id=>path===`reader/${id}-inputs.json`||path===`reader/${id}-review.html`)),['research/bukhari-personal-collection.json',bytes(source)],['content/review/personal-collection-ledger.json',bytes(ledger)],['reader/source-record.json',bytes(source)],[`reader/${config.id}-inputs.json`,bytes(inputs)],[`reader/${config.id}-review.html`,html]])};
}
export function combineBookReviews(registry,config,readReview=read){
 bookConfig(config);
 assert.equal(registry.schemaVersion,1);assert(registry.batches.length,'No book review batches');
 const reviews=[];let next=config.first;
 for(const batch of registry.batches){
  assert(new RegExp('^content/review/'+config.id+'-[a-z-]+-review\\.json$').test(batch.path),'Unsafe batch path');
  assert.equal(batch.first,next,'Book batches must be consecutive');assert(Number.isSafeInteger(batch.last)&&batch.last>=batch.first);
  const review=readReview(batch.path);assert.equal(hash(review),batch.sha256,'Changed book batch record');
  assert.deepEqual(review.entries.map(e=>e.number),Array.from({length:batch.last-batch.first+1},(_,i)=>batch.first+i),'Incomplete registered book batch');
  if(reviews.length)for(const key of ['schemaVersion','status','independentReview','sourceId','sourceSha256','inventorySha256','sourceLayout','bookIntroduction'])assert.deepEqual(review[key],reviews[0][key],'Conflicting book batch source');
  reviews.push(review);next=batch.last+1;
 }
 const sources=[];
 for(const review of reviews)for(const source of review.sources){const existing=sources.find(s=>s.id===source.id);if(existing)assert.deepEqual(existing,source,'Conflicting book batch source');else sources.push(source);}
 const entries=reviews.flatMap(r=>r.entries),chapters=reviews.flatMap(r=>r.chapters);
 assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length,'A chapter cannot be split across review batches');
 return {...reviews[0],sources,entries,chapters,scope:`Complete numbered reports ${config.first}–${next-1}. Available chapter titles use provisional English. Disputed headings are labelled under review; unnumbered chapter introductions remain separately preserved in Arabic.`,editionNote:reviews.map(r=>r.editionNote).join(' '),batches:registry.batches};
}
export function buildFaithBatch(inventory,review,manifest){return buildBookBatch(inventory,review,manifest,BOOK_CONFIGS.faith);}
export function combineFaithReviews(registry,readReview=read){return combineBookReviews(registry,BOOK_CONFIGS.faith,readReview);}
export function collectionFiles(){
 let result=prototypeFiles();
 for(const config of Object.values(BOOK_CONFIGS))result=assembleCollection(result,read(`content/staging/bukhari-${config.id}-wikisource/catalog.json`),combineBookReviews(read(`content/review/${config.id}-batches.json`),config),read(`content/sources/wikisource-${config.id}/manifest.json`),config);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=collectionFiles();for(const [path,body]of result.files){const url=new URL(path,root);if(process.argv.includes('--check'))assert.equal(readFileSync(url,'utf8'),body,'Stale collection file: '+path);else writeFileSync(url,body);}
 console.log(`${result.ledger.books.length} books, ${result.source.entries.length} complete prototype source entries; source ${hash(result.source)}`);
}
