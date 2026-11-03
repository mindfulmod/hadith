/* Assemble reviewed personal-prototype batches; never infer Arabic edits or sign-offs. */
import {validReference,parseReference,referenceBase,referenceSpan,compareReferences} from '../reader/references.mjs';
import {validateBookInventory,validateEntryLayout,layoutInputEvidence,layoutSourceNotice,layoutSourceDetails,chapterLayoutDetails} from './mapped-source.mjs';
import {validateSourceForm} from './source-forms.mjs';
import {validateSourceHolds,pendingSourceEntry,pendingSourceNotes} from './source-holds.mjs';
import {validateChapterDifferences,chapterDifferenceContext,chapterDifferenceDetails} from './chapter-source-differences.mjs';
import {validatePrintedIntroductions,printedIntroductionContext,printedIntroductionDetails} from './printed-chapter-context.mjs';
import {validateEmptyPrintedChapters,emptyPrintedChapterContext,emptyPrintedChapterNotes} from './printed-empty-chapters.mjs';
import {validateAbsentBewleyComparison} from './absent-english-comparisons.mjs';
import {validateDamagedBewleyComparison} from './damaged-bewley-comparisons.mjs';
import {validateEnglishOccurrence,englishOccurrenceGroup,englishOccurrenceCitation} from './english-occurrences.mjs';
import {buildBookIntroduction,bookIntroductionNotes} from './book-introductions.mjs';
import {deriveArabicBlocks} from './arabic-corrections.mjs';
import {validateSharedEnglishSpan} from './english-shared-spans.mjs';
import {digitalReportRows,validatePrintedReportRows,printedReportDetails} from './printed-reports.mjs';
import {derivePrintedBlocks,validatePrintedHeading,reviewedChapterViews,printedHeadingContext,printedAdditionDetails} from './printed-supplements.mjs';
import {sourceLocationCorrections,resolveSourceLocation} from './source-locations.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {partitionSourceNotes} from './source-notes.mjs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {publicJSON} from './public-json.mjs';
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
 menstruation:Object.freeze({id:'menstruation',number:6,title:'Menstruation',first:290,arabicSourceId:'arabic-menstruation',bewleySourceId:'bewley-menstruation',bewleyTitle:'Menstruation',revision:484869,bookIntroduction:'preserved-arabic'}),
 tayammum:Object.freeze({id:'tayammum',number:7,title:'Tayammum',first:327,arabicSourceId:'arabic-tayammum',bewleySourceId:'bewley-tayammum',bewleyTitle:'Tayammum',revision:484871,sourceLayout:'mapped'}),
 prayer:Object.freeze({id:'prayer',number:8,khanBooks:Object.freeze([8,9]),title:'Prayer',first:342,arabicSourceId:'arabic-prayer',bewleySourceId:'bewley-prayer',bewleyTitle:'Prayer',revision:522110,sourceLayout:'mapped'}),
 'prayer-times':Object.freeze({id:'prayer-times',number:9,khanBooks:Object.freeze([10]),title:'Prayer Times',first:499,arabicSourceId:'arabic-prayer-times',bewleySourceId:'bewley-prayer-times',bewleyTitle:'Prayer Times',revision:484870}),
 adhan:Object.freeze({id:'adhan',number:10,khanBooks:Object.freeze([11]),title:'Adhan',first:578,arabicSourceId:'arabic-adhan',bewleySourceId:'bewley-adhan',bewleyTitle:'Adhan',revision:484867,sourceLayout:'mapped'}),
 'prayer-description':Object.freeze({id:'prayer-description',number:11,khanBooks:Object.freeze([12]),title:'Description of Prayer',first:699,arabicSourceId:'arabic-prayer-description',bewleySourceId:'bewley-prayer-description',bewleyTitle:'the Description of the Prayer',revision:253001,sourceLayout:'mapped'}),
 'friday-prayer':Object.freeze({id:'friday-prayer',number:12,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([13]),title:'Friday Prayer',first:836,arabicSourceId:'arabic-friday-prayer',bewleySourceId:'bewley-friday-prayer',bewleyTitle:'Friday Prayer',revision:484865,sourceLayout:'mapped'}),
 'fear-prayer':Object.freeze({id:'fear-prayer',number:13,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([14]),title:'Fear Prayer',first:900,arabicSourceId:'arabic-fear-prayer',bewleySourceId:'bewley-fear-prayer',bewleyTitle:'Fear Prayer',revision:484864}),
 'two-eids':Object.freeze({id:'two-eids',number:14,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([15]),title:'The Two Eids',first:906,arabicSourceId:'arabic-two-eids',bewleySourceId:'bewley-two-eids',bewleyTitle:'The Two Eids',revision:496076}),
 witr:Object.freeze({id:'witr',number:15,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([16]),title:'Witr',first:946,arabicSourceId:'arabic-witr',bewleySourceId:'bewley-witr',bewleyTitle:'Witr',revision:484862}),
 'rain-prayer':Object.freeze({id:'rain-prayer',number:16,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([17]),title:'Rain Prayer',first:960,arabicSourceId:'arabic-rain-prayer',bewleySourceId:'bewley-rain-prayer',bewleyTitle:'Rain Prayer',revision:484861}),
 eclipses:Object.freeze({id:'eclipses',number:17,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([18]),title:'Eclipses',first:993,arabicSourceId:'arabic-eclipses',bewleySourceId:'bewley-eclipses',bewleyTitle:'Eclipses',revision:484860}),
 prostration:Object.freeze({id:'prostration',number:18,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([19]),title:'Prostration of Quran Recitation',first:1017,arabicSourceId:'arabic-prostration',bewleySourceId:'bewley-prostration',bewleyTitle:'Prostration of Quran Recitation',revision:484859}),
 shortening:Object.freeze({id:'shortening',number:19,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([20]),title:'Shortening the Prayer',first:1030,arabicSourceId:'arabic-shortening',bewleySourceId:'bewley-shortening',bewleyTitle:'Shortening the Prayer',revision:278144}),
 'night-prayer':Object.freeze({id:'night-prayer',number:20,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([21]),title:'Night Prayer',first:1069,arabicSourceId:'arabic-night-prayer',bewleySourceId:'bewley-night-prayer',bewleyTitle:'Night Prayer',revision:39522}),
 'voluntary-prayer':Object.freeze({id:'voluntary-prayer',number:21,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([21]),title:'Voluntary Prayer',first:1119,arabicSourceId:'arabic-voluntary-prayer',bewleySourceId:'bewley-voluntary-prayer',bewleyTitle:'Voluntary Prayer',revision:434953}),
 'mosques-prayer':Object.freeze({id:'mosques-prayer',number:22,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([21]),title:'Mosques of Mecca and Medina',first:1132,arabicSourceId:'arabic-mosques-prayer',bewleySourceId:'bewley-mosques-prayer',bewleyTitle:'Mosques of Mecca and Medina',revision:142212}),
 'actions-prayer':Object.freeze({id:'actions-prayer',number:23,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([22]),title:'Actions during Prayer',first:1140,arabicSourceId:'arabic-actions-prayer',bewleySourceId:'bewley-actions-prayer',bewleyTitle:'Actions during Prayer',revision:39529}),
 'forgetfulness':Object.freeze({id:'forgetfulness',number:24,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([22]),title:'Forgetfulness in Prayer',first:1166,arabicSourceId:'arabic-forgetfulness',bewleySourceId:'bewley-forgetfulness',bewleyTitle:'Forgetfulness',revision:39528}),
 'funerals':Object.freeze({id:'funerals',number:25,khanVolumes:Object.freeze([2]),khanBooks:Object.freeze([23]),title:'Funerals',first:1180,arabicSourceId:'arabic-funerals',bewleySourceId:'bewley-funerals',bewleyTitle:'Funerals',revision:393137,sourceLayout:'mapped'})
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
function validateBewleyPart(part){
 assert(part&&typeof part==='object'&&!Array.isArray(part),'Invalid Bewley comparison part');
 assert.deepEqual(Object.keys(part).sort(),['count','index'],'Unexpected Bewley part metadata');
 assert(Number.isSafeInteger(part.index)&&Number.isSafeInteger(part.count)&&part.count>1&&part.index>=1&&part.index<=part.count,'Invalid Bewley comparison part');
}
function validateComparisons(comparisons,config,segments,row,sources){
 const khanReference=new RegExp('^(?:'+(config.khanVolumes||[1]).join('|')+')\\.(?:'+(config.khanBooks||[config.number]).join('|')+')\\.[1-9]\\d*[a-z]?$');
 assert.deepEqual(comparisons.map(c=>c.id).sort(),[config.bewleySourceId,'islamhouse-khan'].sort(),'Expected distinct English comparison records');
 const bewley=comparisons.find(c=>c.id===config.bewleySourceId),khan=comparisons.find(c=>c.id==='islamhouse-khan');
 const sharedSpan=validateSharedEnglishSpan(khan,row,config);
 const absentBewley=validateAbsentBewleyComparison(bewley,row,config,sources);
 const damagedBewley=validateDamagedBewleyComparison(bewley,row,config,sources);
 if(!absentBewley)assert(parseReference(bewley.reference)!==null,'Invalid Bewley comparison');
 if(comparisons.some(c=>c.status==='parallel-occurrence-only')){
  assert.equal(row?.printedReport?.schemaVersion,2,'Parallel-only evidence is defined for explicitly sourced printed tails');
  assert(comparisons.every(c=>c.status==='parallel-occurrence-only'&&typeof c.note==='string'&&c.note.trim()),'Both parallel comparison limits must be explicit');
  assert(khanReference.test(khan.reference));const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length>0&&hash(khan.checkedBody)===record.textSha256,'Parallel comparison body differs from the pinned record');
  for(const c of comparisons)for(const key of ['part','splitReferences','referencedReference','checkedReferences','continuedByReference'])assert.equal(c[key],undefined,'Parallel occurrence cannot claim another reference form');
  assert(compareReferences(parseReference(bewley.reference),row.number)<0,'Parallel comparison must identify an earlier occurrence');
  return;
 }
 if(!absentBewley&&!damagedBewley&&bewley.status!==undefined){
  assert(['cross-reference-with-transmission-note','abbreviated-report'].includes(bewley.status),'Unknown Bewley comparison form');
  assert(typeof bewley.note==='string'&&bewley.note.trim(),'Abbreviated comparison needs an explanation');
  if(bewley.status==='cross-reference-with-transmission-note'||bewley.referencedReference!==undefined)assert(parseReference(bewley.referencedReference)!==null&&compareReferences(parseReference(bewley.referencedReference),parseReference(bewley.reference))<0,'Cross-reference comparison needs its earlier reference');
 }else assert.equal(bewley.referencedReference,undefined,'A comparison pointer needs an explicit status');
 if(bewley.part!==undefined){
  validateBewleyPart(bewley.part);
  assert(bewley.status===undefined&&bewley.splitReferences===undefined&&bewley.referencedReference===undefined,'Shared comparison part cannot claim another comparison form');
  assert(typeof bewley.note==='string'&&bewley.note.trim(),'Shared comparison needs a scope explanation');
 }
 if(bewley.splitReferences!==undefined){
  assert(bewley.status===undefined&&bewley.referencedReference===undefined,'Split comparison cannot also claim an abbreviated pointer');
  const parts=bewley.splitReferences;
  assert(Array.isArray(parts)&&parts.length>1,'Split comparison needs multiple references');
  assert.equal(parts[0].reference,bewley.reference,'Split comparison must begin at its primary reference');
  assert(typeof bewley.note==='string'&&bewley.note.trim(),'Split comparison needs an explanation');
  for(const [index,part]of parts.entries()){
   assert.deepEqual(Object.keys(part).sort(),(part.part===undefined?['reference','segmentIds']:['part','reference','segmentIds']),'Unexpected split comparison metadata');
   if(part.part!==undefined)validateBewleyPart(part.part);
   assert(parseReference(part.reference)!==null&&(!index||compareReferences(parseReference(part.reference),parseReference(parts[index-1].reference))>0),'Split comparison references must be distinct and ordered');
   assert(Array.isArray(part.segmentIds)&&part.segmentIds.length,'Split comparison needs segment coverage');
  }
  assert.deepEqual(parts.flatMap(p=>p.segmentIds),segments.map(s=>s.id),'Split references must cover the selected segments exactly once in order');
 }
 // Omission notices are not translated bodies, even if a review forgets the status.
 englishInventory??=read('content/staging/bukhari-en-islamhouse/catalog.json');
 const pinned=khan.reference&&englishInventory.records.find(r=>r.id===englishInventory.namespace+':'+khan.reference);
 if(pinned?.bodyForm==='translation-omission-notice')assert.equal(khan.status,'translation-omitted','An omission notice cannot be a complete English comparison');
 if(khan.reference&&!khan.splitReferences&&(Number(khan.reference.split('.')[0])!==1||Number(khan.reference.split('.')[1])!==config.number))comparisonEvidence(khan.reference,khan.referenceEvidence);
 if(khan.status==='translation-omitted'){
  assert(khanReference.test(khan.reference),'Invalid omitted-translation reference');
  for(const key of ['part','splitReferences','checkedReferences','referencedReference','referencedReferenceEvidence','continuedByReference'])assert.equal(khan[key],undefined,'An omission notice cannot claim translated report coverage');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert.equal(record.bodyForm,'translation-omission-notice','Expected a pinned omission notice');
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length===1&&typeof khan.checkedBody[0]==='string'&&hash(khan.checkedBody)===record.textSha256,'Omission notice differs from its pinned body');
  assert(typeof khan.note==='string'&&khan.note.trim(),'Omitted translation needs an explanation');return;
 }
 if(khan.status==='unnumbered-back-reference-only'){
  assert(khanReference.test(khan.reference),'Invalid unnumbered-pointer comparison');
  for(const key of ['part','splitReferences','checkedReferences','referencedReference','referencedReferenceEvidence','continuedByReference'])assert.equal(khan[key],undefined,'An unnumbered pointer cannot claim a target or complete body');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length===2&&khan.checkedBody.every(p=>typeof p==='string')&&hash(khan.checkedBody)===record.textSha256,'Unnumbered pointer differs from its pinned body');
  assert(/^Narrated .+:$/.test(khan.checkedBody[0].trim())&&khan.checkedBody[1].trim()==='as above.','Expected the exact unnumbered backward pointer');
  assert(typeof khan.note==='string'&&khan.note.trim(),'Unnumbered pointer needs an explanation');return;
 }
 if(khan.status==='back-reference-only'){
  assert(khanReference.test(khan.reference)&&khanReference.test(khan.referencedReference),'Invalid backward-reference comparison');
  assert(khan.part===undefined&&khan.splitReferences===undefined&&khan.checkedReferences===undefined,'Backward reference cannot claim a complete comparison body');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length===2&&khan.checkedBody.every(p=>typeof p==='string')&&hash(khan.checkedBody)===record.textSha256,'Backward pointer differs from its pinned body');
  const pointer=/^(?:The Prophet said )?as above \(([1-9]\d*)\)\.$/.exec(khan.checkedBody[1].trim());
  assert(/^Narrated .+:$/.test(khan.checkedBody[0].trim())&&pointer&&khan.referencedReference===`${khan.reference.split('.')[0]}.${khan.reference.split('.')[1]}.${pointer[1]}`&&Number(pointer[1])<Number(khan.reference.split('.')[2]),'Invalid or forward comparison pointer');
  if(!khan.checkedBody[1].trim().startsWith('The Prophet said ')||khan.referencedReferenceEvidence!==undefined)comparisonEvidence(khan.referencedReference,khan.referencedReferenceEvidence);
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
 if(khan.status==='damaged-comparison'){
  assert(khanReference.test(khan.reference),'Invalid damaged comparison reference');
  assert((khan.part===undefined||sharedSpan)&&khan.splitReferences===undefined&&khan.checkedReferences===undefined,'A damaged comparison cannot claim complete parts or absence');
  const record=comparisonEvidence(khan.reference,khan.referenceEvidence);
  assert(Array.isArray(khan.checkedBody)&&khan.checkedBody.length>=2&&khan.checkedBody.every(p=>typeof p==='string'),'Damaged comparison requires its exact checked body');
  assert.equal(hash(khan.checkedBody),record.textSha256,'Damaged comparison body differs from its pinned record');
  assert(typeof khan.damagedExcerpt==='string'&&khan.damagedExcerpt.trim()&&khan.checkedBody.some(p=>p.includes(khan.damagedExcerpt)),'Damage must identify wording present in the pinned body');
  assert(typeof khan.note==='string'&&khan.note.trim(),'Damaged comparison needs an explanation');return;
 }
 assert.equal(khan.checkedBody,undefined,'Only an explicit incomplete comparison may carry checked-body evidence');
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
    assert.equal(p.reference.split('.').slice(0,2).join('.'),khan.reference.split('.').slice(0,2).join('.'),'Split references cannot cross English volumes or books');
    if(i)assert(Number(p.reference.split('.')[2])>Number(parts[i-1].reference.split('.')[2]),'Split references must be distinct and ordered');
    const record=comparisonEvidence(p.reference,p.referenceEvidence);
    assert.notEqual(record.bodyForm,'translation-omission-notice','An omission notice cannot be a translated split part');
    assert(Array.isArray(p.segmentIds)&&p.segmentIds.length,'Split comparison needs segment coverage');
    if(p.status==='inline-back-reference-only'){
     assert(Array.isArray(p.checkedBody)&&p.checkedBody.length===1&&typeof p.checkedBody[0]==='string'&&hash(p.checkedBody)===record.textSha256,'Inline pointer differs from its pinned body');
     assert(/^Narrated .+ as above\.$/.test(p.checkedBody[0].trim()),'Expected one narrator-and-pointer paragraph');
     assert(p.referencedReference===undefined&&p.referencedReferenceEvidence===undefined&&p.continuedByReference===undefined,'An inline pointer cannot invent a target');
     assert(p.segmentIds.every(id=>['chain','transmission-note'].includes(segments.find(s=>s.id===id)?.kind)),'Inline pointer cannot stand in for a report body');
     assert(typeof p.note==='string'&&p.note.trim(),'Inline pointer needs an explicit coverage limitation');
     continue;
    }
    if(p.status!==undefined){
     assert(Array.isArray(p.checkedBody)&&p.checkedBody.length===2&&p.checkedBody.every(v=>typeof v==='string')&&hash(p.checkedBody)===record.textSha256,'Abbreviated comparison part differs from its pinned body');
     assert((/^Narrated .+:$/.test(p.checkedBody[0].trim())||(p.status==='same-as-reference-only'&&/^Narrated .+$/.test(p.checkedBody[0].trim())))&&typeof p.note==='string'&&p.note.trim(),'Abbreviated comparison part needs a narrator and explanation');
     if(p.status==='back-reference-only'){
      const pointer=/^as above \(([1-9]\d*)\)\.$/.exec(p.checkedBody[1].trim());
      assert(pointer&&p.referencedReference===`${p.reference.split('.')[0]}.${p.reference.split('.')[1]}.${pointer[1]}`&&Number(pointer[1])<Number(p.reference.split('.')[2]),'Invalid split backward pointer');
      assert.equal(p.continuedByReference,undefined,'Backward pointer cannot claim a forward continuation');
      comparisonEvidence(p.referencedReference,p.referencedReferenceEvidence);
      assert(p.segmentIds.every(id=>segments.find(s=>s.id===id)?.kind==='chain'),'Backward-only part may only correspond to an abbreviated chain');
     }else if(p.status==='same-as-reference-only'){
      const pointer=/^the same as No\. ([1-9]\d*)\. from the Prophet$/.exec(p.checkedBody[1].trim());
      assert(pointer&&p.referencedReference===`${p.reference.split('.')[0]}.${p.reference.split('.')[1]}.${pointer[1]}`&&Number(pointer[1])<Number(p.reference.split('.')[2]),'Invalid same-as split backward pointer');
      assert.equal(p.continuedByReference,undefined,'Same-as pointer cannot claim a forward continuation');
      comparisonEvidence(p.referencedReference,p.referencedReferenceEvidence);
      assert(p.segmentIds.every(id=>segments.find(s=>s.id===id)?.kind==='chain'),'Same-as pointer may only correspond to an abbreviated chain');
     }else if(p.status==='unnumbered-back-reference-only'){
      assert.equal(p.checkedBody[1].trim(),'as above.','Unexpected unnumbered split pointer');
      assert(p.referencedReference===undefined&&p.referencedReferenceEvidence===undefined&&p.continuedByReference===undefined,'An unnumbered split pointer cannot invent a target');
      assert(p.segmentIds.every(id=>['chain','transmission-note'].includes(segments.find(s=>s.id===id)?.kind)),'Unnumbered split pointer cannot stand in for a report body');
     }else if(p.status==='forward-reference-only'){
      const pointer=/^(?:as the following Hadith ([1-9]\d*)\.|The Prophet said, \(what is ascribed to him in the following Hadith ([1-9]\d*)\):)$/.exec(p.checkedBody[1].trim()),target=pointer&&(pointer[1]||pointer[2]);
      assert(target&&p.continuedByReference===`${p.reference.split('.')[0]}.${p.reference.split('.')[1]}.${target}`&&p.continuedByReference===parts[i+1]?.reference&&Number(target)===Number(p.reference.split('.')[2])+1,'Forward-only pointer needs its exact adjacent continuation');
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
 englishInventory??=read('content/staging/bukhari-en-islamhouse/catalog.json');
 const positions=khan.checkedReferences.map(reference=>englishInventory.records.findIndex(r=>r.id===englishInventory.namespace+':'+reference));
 assert(positions[0]>=0&&positions[1]===positions[0]+1,'Checked comparison references must be adjacent in the pinned source order');
 assert.equal(englishInventory.records[positions[0]].section,englishInventory.records[positions[1]].section,'Checked sequence cannot cross source sections');
 assert(typeof khan.note==='string'&&khan.note.trim(),'Missing comparison absence explanation');
 // Literal suffixes are edition labels, not decimal numbers. Bind their exact records.
 if(khan.checkedReferenceEvidence!==undefined||khan.checkedReferences.some(r=>/[a-z]$/.test(r)||Number(r.split('.')[0])!==1||Number(r.split('.')[1])!==config.number)){
  assert(Array.isArray(khan.checkedReferenceEvidence)&&khan.checkedReferenceEvidence.length===khan.checkedReferences.length,'Incomplete checked-sequence evidence');
  khan.checkedReferences.forEach((reference,index)=>comparisonEvidence(reference,khan.checkedReferenceEvidence[index]));
 }
}
function entryTranslationStatus(row){
 if(row.comparisons.filter(c=>c.status==='damaged-comparison').length===2)return 'Personal prototype: AI-assisted working translation checked against two Arabic prints. Both English comparisons contain errors or omissions; neither supplies a complete reliable rendering of this selected entry. See the specific limits in the source notes. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.id!=='islamhouse-khan'&&c.status==='damaged-comparison'))return 'Personal prototype: AI-assisted working translation; two Arabic prints and two English comparison families were inspected. One English comparison contains documented errors or omissions. See source notes for its limits. Independent Arabic, English and context review pending.';
 if(row.comparisons.every(c=>c.status==='not-present-in-checked-sequence'))return 'Personal prototype: a complete report transcribed from an identified Arabic print and checked against a second print. Both selected English sequences omit this occurrence. A separate online English comparison shortens the chain and uses passive wording; the full printed chain and first-person wording are retained. Independent transcription, Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='damaged-comparison'))return 'Personal prototype: AI-assisted working translation; two Arabic prints and one complete English comparison were checked. The second English reference contains damaged wording and cannot confirm the missing words. Independent Arabic, English and context review pending.';
 if(row.printedReport?.schemaVersion===2)return 'Personal prototype: a separate occurrence transcribed from an identified Arabic print and checked against a second print. Two English comparison families cover earlier parallel accounts; their wording and attribution differences are explicit. The app and printed references remain separate. Independent transcription, Arabic, English and context review pending.';
 if(row.printedReport)return 'Personal prototype: a complete report absent from the selected digital source, transcribed from an explicitly identified Arabic print and compared with a second print and two English witnesses. The app reference, original printed reference, narrator-name variant and chapter placement remain explicit. Independent transcription, Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='translation-omitted'))return 'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one complete English comparison were checked. The second English reference contains an omission notice, not a translation. Independent Arabic, English and context review pending.';
 if(row.sourceForm?.kind==='chain-only')return 'Personal prototype: the selected Arabic entry records a narrator chain without repeating the report body. The complete selected chain is translated; related accounts and abbreviated comparisons remain separate. Two Arabic prints and two English comparison families were inspected. Independent Arabic, English and context review pending.';
 if(row.arabicSupplements?.some(s=>s.englishComparisons))return 'Personal prototype: AI-assisted working translation with a separately identified closing transmission note transcribed from an Arabic print. Two printed witnesses, the unchanged digital text and the differing coverage of the English comparisons remain accessible. Independent Arabic, English and context review pending.';
 if(row.arabicSupplements)return 'Personal prototype: AI-assisted working translation with a separately identified closing transmission note transcribed from an Arabic print. Two printed witnesses and the original digital text remain accessible; the English comparisons omit that closing note. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='unnumbered-back-reference-only'))return 'Personal prototype: AI-assisted translation of the selected abbreviated account. Two Arabic prints and two English comparison families were inspected. One English reference contains only an unnumbered backward pointer; no missing body or target number has been supplied. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='reference-only-body-absent'))return 'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one complete English comparison body were checked. The second English reference contains only a backward pointer, not the statement body. Independent Arabic, English and context review pending.';
 if(row.comparisons.some(c=>c.status==='abbreviated-report'))return 'Personal prototype: AI-assisted working translation; two Arabic prints and two English comparison families were inspected. One English comparison abbreviates the report; its omitted wording and any explicit Arabic correction are documented in the source notes. Independent Arabic, English and context review pending.';
 if(row.arabicCorrections)return row.comparisons.some(c=>c.status==='not-present-in-checked-sequence')?'Personal prototype: AI-assisted working translation with an explicitly recorded Arabic correction supported by two printed witnesses. One English comparison was checked; a second is absent from the checked sequence. The original input and absence evidence remain accessible. Independent Arabic, English and context review pending.':'Personal prototype: AI-assisted working translation with an explicitly recorded Arabic correction supported by two printed witnesses. English comparison bodies and the original input remain accessible. Independent Arabic, English and context review pending.';
 if(row.printedWitnesses.some(w=>w.status))return 'Personal prototype: AI-assisted working translation; the modern Arabic print and two English translation families were compared. The historical print does not separately contain this distinct form in its checked chapter; see source notes. Independent Arabic, English and context review pending.';
 return row.comparisons.some(c=>c.status==='not-present-in-checked-sequence')?'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and one English translation family compared. A second English comparison is absent from the checked sequence; see source notes. Independent Arabic, English and context review pending.':'Personal prototype: AI-assisted working translation; two Arabic printed witnesses and two English translation families compared. Independent Arabic, English and context review pending.';
}
function validatePrintedWitnesses(witnesses,row){
 assert.deepEqual(witnesses.map(w=>w.id).sort(),row.printedReport?.schemaVersion===2?['dar-ibn-kathir-2002','dar-tasil-2012-v1']:['brill-1862','dar-ibn-kathir-2002'],'Expected two distinct Arabic print witnesses');
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
function bewleyCitation(row,config){
 const c=row.comparisons.find(c=>c.id===config.bewleySourceId);
 if(c.status==='not-present-in-checked-sequence')return {id:'bewley',sourceId:config.bewleySourceId,locator:'No corresponding report in the checked sequence: '+c.checkedReferences.join(' → '),scope:c.note+' This is documented absence in that sequence, not a completed English comparison.'};
 const located=englishOccurrenceCitation(c);if(located)return {id:'bewley',sourceId:c.sourceId||config.bewleySourceId,...located};
 const describe=p=>p.reference+(p.part?` (part ${p.part.index} of ${p.part.count})`:'');
 return {id:'bewley',sourceId:c.sourceId||config.bewleySourceId,locator:`Book of ${config.bewleyTitle} · ${c.splitReferences?'entries '+c.splitReferences.map(describe).join(', '):'entry '+describe(c)}`,scope:c.splitReferences||c.part?c.note:row.sourceForm?.kind==='chain-only'?'Named English comparison for this abbreviated transmission; no repeated report body is supplied here.':c.status!==undefined?c.note:'Named English comparison for the report body. The shortened chain does not replace the selected full Arabic chain.'};
}
function khanCitation(record){
 if(record.status==='damaged-comparison'){const [volume,book,number]=record.reference.split('.');return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number} · damaged wording`,scope:record.note};}
 if(record.status==='parallel-occurrence-only')return {id:'khan',sourceId:'islamhouse-khan',locator:`Earlier parallel occurrence · ${record.reference}`,scope:record.note};
 if(record.status==='translation-omitted'){const [volume,book,number]=record.reference.split('.');return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number} · translation omitted`,scope:record.note};}
 if(record.status==='unnumbered-back-reference-only'){const [volume,book,number]=record.reference.split('.');return {id:'khan',sourceId:'islamhouse-khan',locator:`Volume ${volume}, Book ${book}, Number ${number} · unnumbered backward pointer only`,scope:record.note};}
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
 const sourceHolds=validateSourceHolds(inventory,review,config),pendingReferences=review.pendingReferences||[];
 assert(Array.isArray(pendingReferences)&&new Set(pendingReferences).size===pendingReferences.length,'Invalid pending source references');
 const pendingEntries=pendingReferences.map(n=>{const hold=sourceHolds.find(h=>h.reference===n);assert(hold,'A gap needs a registered unresolved source hold');return pendingSourceEntry(hold,inventory,config);});
 assert.equal(inventory.records[0].number,config.first,'Source book begins at the wrong reference');
 assert.equal(manifest.revision,config.revision,'Unexpected source revision');
 assert.equal(review.schemaVersion,1);assert.equal(review.status,'personal-prototype-only');assert.equal(review.independentReview,'pending');
 assert.equal(review.inventorySha256,hash(inventory),'Stale source inventory');assert.equal(review.sourceSha256,inventory.sourceSha256);assert.equal(review.sourceId,inventory.sourceId);assert.equal(manifest.file.sha256,inventory.sourceSha256);
 const bookIntroduction=buildBookIntroduction(inventory,review,manifest,config);
 const printedBlocks=validatePrintedReportRows(inventory,review);
 const numbers=digitalReportRows(review).map(e=>e.number);assert(numbers.length,'Empty book batch');
 const allNumbers=[...numbers,...pendingReferences].sort(compareReferences),sourceSpan=referenceSpan(inventory.records.map(r=>r.number),allNumbers[0],allNumbers.at(-1));
 assert.deepEqual(numbers,sourceSpan.filter(n=>!pendingReferences.includes(n)),'Book batch must be in complete source order except documented holds');
 assert.deepEqual(pendingReferences,sourceSpan.filter(n=>pendingReferences.includes(n)),'Pending references must follow source order');
 const blocks=new Map([...inventory.blocks.map(b=>[b.htmlId,b]),...printedBlocks]),entries=[];
 const comparisonGroups=new Map();
 for(const row of review.entries){
  validateComparisons(row.comparisons,config,row.segments,row,review.sources);
  validateEnglishOccurrence(row.comparisons.find(c=>c.id===config.bewleySourceId),row,config,review.sources);
  const bewley=row.comparisons.find(c=>c.id===config.bewleySourceId);
  if(bewley.sourceId!==undefined)assert(review.sources.some(s=>s.id===bewley.sourceId&&s.kind==='english-comparison'),'Comparison source override must name an included English comparison');
  const c=row.comparisons.find(c=>c.id==='islamhouse-khan');
  if(c.status!==undefined&&!c.spanEvidence)continue;
  for(const part of c.splitReferences||[c]){const group=comparisonGroups.get(part.reference)||[];group.push(part);comparisonGroups.set(part.reference,group);}
 }
 for(const group of comparisonGroups.values())if(group.length>1||group.some(c=>c.part)){
  assert(group.every(c=>c.part&&c.part.count===group[0].part?.count),'A shared reference needs consistent report parts');
  assert.equal(group.length,group[0].part.count,'A shared reference needs all declared report parts');
  assert.equal(new Set(group.map(c=>c.part.index)).size,group.length,'A comparison part cannot be assigned twice');
  assert.deepEqual(group.map(c=>c.part.index),Array.from({length:group.length},(_,i)=>i+1),'Shared comparison parts must be complete, unique and in source order');
 }

 const bewleyGroups=new Map();
 for(const row of review.entries){
  const c=row.comparisons.find(c=>c.id===config.bewleySourceId);if(c.status!==undefined)continue;
  for(const part of c.splitReferences||[c]){const key=englishOccurrenceGroup(part),group=bewleyGroups.get(key)||[];group.push(part);bewleyGroups.set(key,group);}
 }
 for(const group of bewleyGroups.values())if(group.length>1||group.some(c=>c.part)){
  const count=group[0].part?.count;
  assert(group.every(c=>c.part&&c.part.count===count),'A shared Bewley reference needs consistent report parts');
  assert.equal(group.length,count,'A shared Bewley reference needs all declared parts');
  assert.deepEqual(group.map(c=>c.part.index),Array.from({length:count},(_,i)=>i+1),'Shared Bewley parts must be complete, unique and in source order');
 }

 for(const row of review.entries){
  const {reviewRecordSha256,...record}=row;assert.equal(reviewRecordSha256,hash(record),'Stale entry review');
  assert.equal(row.status,'personal-prototype-only');assert.equal(row.reviewerKind,'ai');assert.equal(row.independentReview,'pending');
  const original=row.printedReport?{id:row.sourceRecordId,paragraphIds:[row.printedReport.paragraphId],chapterId:row.printedReport.chapterId}:inventory.records.find(r=>r.number===row.number);assert(original&&original.id===row.sourceRecordId&&row.id===`bukhari:${row.number}`,'Source identity mismatch');
  assert.deepEqual(row.paragraphIds,original.paragraphIds);assert.equal(row.chapterId,original.chapterId);
  if(!row.printedReport)validateEntryLayout(inventory,row,original,config);
  assert(row.notes.length&&row.printedWitnesses.length===2&&row.comparisons.length===2,'Missing comparison evidence');
  validatePrintedWitnesses(row.printedWitnesses,row);validateSourceForm(row,review.sources);
  const originalArabic=row.paragraphIds.map(id=>blocks.get(id).text),corrected=deriveArabicBlocks(row,originalArabic,review.sources);
  validatePrintedHeading(row,originalArabic,review.sources);
  const {blockIds,arabicBlocks:arabic_blocks}=derivePrintedBlocks(row,originalArabic,corrected,review.sources),english_blocks=row.segments.map(s=>s.english);
  const presentation={schemaVersion:1,arabic:[],english:[]};
  for(const [i,s] of row.segments.entries()){
   const block=blockIds.indexOf(s.paragraphId);assert(block>=0&&Number.isSafeInteger(s.start)&&Number.isSafeInteger(s.end));
   assert.equal(s.arabic,Array.from(arabic_blocks[block]).slice(s.start,s.end).join(''),'Changed Arabic span');assert.equal(s.arabicSha256,sha(s.arabic));assert.equal(s.englishSha256,sha(s.english));
   if(['chain','transmission-note'].includes(s.kind))for(const [arabic,english]of [[['حدثنا','حدثتنا'],'related to us'],[['حدثني','حدثتني'],'related to me'],[['أخبرنا','أنبأنا'],'informed us'],[['أخبرني','أخبرتني'],'informed me'],[['سمعت'],'i heard']])assert.equal(arabic.reduce((n,word)=>n+s.arabic.replace(/\p{M}/gu,'').split(word).length-1,0),s.english.toLowerCase().split(english).length-1,'Reporting verb mismatch in '+s.id);
   const supplement=row.arabicSupplements?.find(a=>a.id===s.paragraphId),origin=supplement?{provenance:{kind:'printed-supplement',id:supplement.id}}:{};
   presentation.arabic.push({block,start:s.start,end:s.end,kind:s.kind,...origin});presentation.english.push({block:i,start:0,end:Array.from(s.english).length,kind:s.kind,...origin});
  }
  assert.equal(row.arabicSha256,sha(arabic_blocks.join('\n\n')));assert.equal(row.englishSha256,sha(english_blocks.join('\n\n')));
  const entry={id:row.id,book:config.title,number:row.number,arabic_blocks,arabic_sha256:row.arabicSha256,english_blocks,english_status:entryTranslationStatus(row),presentation,review:{status:row.status,independentReview:row.independentReview,sourceRecordId:row.sourceRecordId,reviewRecordSha256,notes:row.notes,reviewScope:row.reviewScope,...(row.printedReport?{printedReport:structuredClone(row.printedReport)}:{}),...(row.sourceForm?{sourceForm:structuredClone(row.sourceForm)}:{}),...(row.sourceLayout?{sourceLayout:structuredClone(row.sourceLayout)}:{}),...(row.arabicCorrections?{originalArabicSha256:row.originalArabicSha256,arabicCorrections:structuredClone(row.arabicCorrections)}:{}),...(row.arabicSupplements?{arabicSupplements:structuredClone(row.arabicSupplements)}:{}),...(row.printedHeading?{printedHeading:structuredClone(row.printedHeading)}:{})},audio_status:'No recording yet.'};
  validateSourceStructure(entry);entries.push(entry);
 }
 const chapters=review.chapters.map(c=>{
  const original=inventory.chapters.find(r=>r.id===c.id);assert(original,'Unknown source chapter');
  assert.deepEqual(c.entryNumbers.filter(n=>!review.entries.some(r=>r.number===n&&r.printedReport)),original.entryNumbers.filter(n=>!pendingReferences.includes(n)));assert.deepEqual(c.contextIds,original.contextIds);assert.equal(c.headingId,original.headingId);assert.equal(c.titleArabic,blocks.get(c.headingId).text);assert(['ai-working-translation','heading-discrepancy-pending','heading-translation-pending'].includes(c.status));assert.equal(c.independentReview,'pending');assert(c.title.trim());
  if(c.status==='heading-translation-pending'){assert.equal(c.title,'Chapter heading translation pending');assert(typeof c.translationPendingReason==='string'&&c.translationPendingReason.trim(),'Pending heading needs an explanation');}
  if(c.status==='heading-discrepancy-pending'){assert.equal(c.title,'Chapter heading under review');assert.equal(c.headingDiscrepancy?.status,'unresolved');assert(c.titleArabic.includes(c.headingDiscrepancy.digitalPhrase));assert(c.headingDiscrepancy.printedPhrase&&c.headingDiscrepancy.printedWitnesses.length===2);}
  validateEmptyPrintedChapters(c,inventory,review);
  const differences=validateChapterDifferences(c,inventory,review),printed=validatePrintedIntroductions(c,inventory,review),paragraphs=c.contextIds.length+printed.length;
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers,sourceContext:{schemaVersion:1,headingStatus:c.status,numberedReports:c.entryNumbers.length?'present':original.entryNumbers.length?'pending-review':'none-in-source',introduction:{arabicParagraphs:paragraphs,englishStatus:paragraphs?'pending':'not-applicable'},...printedIntroductionContext(printed),...chapterDifferenceContext(differences),...(c.status==='heading-translation-pending'?{pendingHeading:{sourceId:inventory.sourceId,sourceSha256:inventory.sourceSha256,headingId:c.headingId,arabicSha256:sha(c.titleArabic),reason:c.translationPendingReason,evidenceSha256:hash(c)}}:{}),notes:{path:config.id+'-review.html',fragment:c.id}}};
 });
 assert.deepEqual(chapters.flatMap(c=>c.entryNumbers),entries.map(e=>e.number),'Chapter coverage mismatch');
 for(const p of pendingEntries)assert(chapters.some(c=>c.id===p.chapterId),'Pending report needs its preserved chapter');
 // Empty source chapters are real context. They cannot disappear or be reordered in an admitted span.
 const start=inventory.chapters.findIndex(c=>c.id===review.chapters[0]?.id),end=inventory.chapters.findIndex(c=>c.id===review.chapters.at(-1)?.id);
 assert(start>=0&&end>=start,'Missing chapter span');
 assert.deepEqual(review.chapters.map(c=>c.id),inventory.chapters.slice(start,end+1).map(c=>c.id),'Incomplete source chapter span');
 if(numbers[0]===config.first)assert.equal(start,0,'Opening source-only chapters must be retained');
 const chapterViews=reviewedChapterViews(review);
 const catalogChapters=chapterViews.map(c=>{const original=chapters.find(v=>v.id===c.id);if(original)return {...original,entryNumbers:c.entryNumbers};
  if(c.printedEmptyHeading)return {id:c.id,title:c.title,entryNumbers:[],sourceContext:{schemaVersion:1,headingStatus:'heading-translation-pending',numberedReports:'none-in-source',introduction:{arabicParagraphs:0,englishStatus:'not-applicable'},notes:{path:config.id+'-review.html',fragment:c.id},printedEmptyHeading:emptyPrintedChapterContext(c.printedEmptyHeading)}};
  return {id:c.id,title:c.title,entryNumbers:c.entryNumbers,sourceContext:{schemaVersion:1,headingStatus:'ai-working-translation',numberedReports:'present',introduction:{arabicParagraphs:0,englishStatus:'not-applicable'},notes:{path:config.id+'-review.html',fragment:c.id},printedHeading:printedHeadingContext(c.printedHeading)}};
 });
 return {entries,chapters:catalogChapters,chapterViews,...(pendingEntries.length?{pendingEntries}:{}),...(bookIntroduction?{bookIntroduction}:{})};
}
export function assembleCollection(opening,inventory,review,manifest,config=BOOK_CONFIGS.faith){
 const batch=buildBookBatch(inventory,review,manifest,config),sources=structuredClone(opening.source.sources);
 assert(!opening.ledger.books.some(b=>b.id===config.id),'Book already assembled');
 assert.equal(referenceBase(opening.source.entries.at(-1).number)+1,config.first,'Collection book order must be consecutive');
 for(const s of review.sources)if(!sources.some(v=>v.id===s.id))sources.push(resolveSourceLocation(s));
 const range=`${batch.entries[0].number}–${batch.entries.at(-1).number}`;
 const correctedNumbers=review.entries.filter(e=>e.arabicCorrections).map(e=>e.number),allPending=[...opening.ledger.books.flatMap(b=>b.pendingEntries||[]),...(batch.pendingEntries||[])];
 const source={...opening.source,scope:config.id==='faith'?`Personal prototype: opening entries 1–7 and Book of Faith entries ${range}. The rest of the collection remains in preparation.`:`Personal prototype: ${allPending.length?'available complete entries':'complete numbered entries'} 1–${batch.entries.at(-1).number} across ${opening.ledger.books.length+1} books.${allPending.length?' Pending source review: '+allPending.map(p=>p.number).join(', ')+'. These reserved references are excluded from reading and narration.':''} The rest of the collection remains in preparation.`,
  license:{...opening.source.license,attribution:config.id==='faith'?'Sahih al-Bukhari by Muhammad ibn Ismail al-Bukhari; Arabic digital transcription by Arabic Wikisource contributors, opening revision 484874 and Faith revision 490285.':opening.source.license.attribution+` Book of ${config.title}: revision ${config.revision}.`,changes:opening.source.license.changes+` ${correctedNumbers.length?`${review.entries.some(e=>e.printedReport)?'Digital-source entries in ':''}Hadith ${range} derive from revision ${config.revision}; only ${correctedNumbers.join(', ')} have declared Arabic corrections, with unchanged original inputs preserved separately`:`${review.entries.some(e=>e.printedReport)?'Digital-source entries in ':''}Hadith ${range} retain their Arabic ${inventory.schemaVersion>=2?'source spans':'paragraphs'} unchanged from revision ${config.revision}`}; their new English and available chapter titles are AI-assisted.${review.entries.some(e=>e.printedReport)?' Separately identified complete reports absent from that digital source are transcribed from Arabic prints, with their own source identities, exact printed references, two-witness readings and chapter-placement evidence. No digital report is renumbered or merged.':''}${review.chapters.some(c=>c.status==='heading-discrepancy-pending')?' A disputed chapter heading is explicitly withheld.':''}${inventory.schemaVersion>=2?' Exact source origins and original labels are retained; any different reader reference is explicitly mapped.':''} Chapter introductions are preserved separately in Arabic, with English translation still pending.${review.chapters.some(c=>c.printedEmptyChaptersAfter?.length)?' A separately identified empty printed chapter is preserved between its exact digital neighbours; both printed headings and the unchanged digital boundary remain accessible, with English pending and no invented report or narration.':''}${review.chapters.some(c=>c.printedIntroductions?.length)?' A declared printed chapter introduction supplies material omitted by the digital source; original chapter blocks are unchanged and both printed readings and exact pages remain separately recorded.':''}${review.entries.some(e=>e.arabicSupplements||e.printedHeading)?(review.entries.some(e=>e.printedHeading)?(review.entries.some(e=>e.arabicSupplements)?' Declared printed additions supply a missing closing transmission note and chapter heading; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.':' A declared printed addition supplies a missing chapter heading; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.'):' A declared printed addition supplies a missing closing transmission note; original digital blocks remain unchanged, and the selected printed wording, differences and exact pages are recorded separately.'):''}`},sources,
  prototypeReview:config.id==='faith'?{...opening.source.prototypeReview,openingSourceSha256:hash(opening.source),faithReviewSha256:hash(review),faithSourceSha256:manifest.file.sha256}:{...opening.source.prototypeReview,[config.id+'ReviewSha256']:hash(review),[config.id+'SourceSha256']:manifest.file.sha256},entries:[...opening.source.entries,...batch.entries]};
 const sourceHash=hash(source),references=structuredClone(opening.ledger.sourceReferences);references.sourceRecordSha256=sourceHash;
 for(const {id,label,kind,format,url}of review.sources.map(resolveSourceLocation)){const existing=references.sources.find(s=>s.id===id);if(existing)assert.deepEqual(existing,{id,label,kind,format,url},'Conflicting shared source');else references.sources.push({id,label,kind,format,url});}
 for(const e of batch.entries){
  const r=review.entries.find(r=>r.number===e.number),chapter=review.chapters.find(c=>c.entryNumbers.includes(e.number));
  references.entries.push({id:e.id,number:e.number,entrySha256:hash(e),translation:{label:'Personal prototype · English working translation',description:e.english_status+' This is a new working translation, not the Darussalam translation.'},citations:[
   {id:'base',...(r.printedReport?{sourceId:r.printedReport.inputSourceId,pdfPage:r.printedReport.witnesses.find(w=>w.sourceId===r.printedReport.selectedWitnessId).pdfPage,locator:`Printed reference ${r.printedReport.printReference} · app reference ${e.number}`,scope:r.printedReport.transcriptionPolicy}:{sourceId:config.arabicSourceId,locator:`Book of ${config.title} · source entry ${r.sourceLayout?.sourceReference.label??e.number} · ${chapter.titleArabic}`,scope:r.sourceLayout?'Exact source spans with unchanged original labels and paragraphs preserved in the offline notes. Any separately declared wording correction is recorded with its evidence.':r.arabicCorrections?'Derived Arabic with an explicitly recorded correction supported by two printed witnesses. The unchanged digital paragraph, before/after wording and evidence are preserved in the offline source notes.':'Exact Arabic paragraphs from the pinned revision. Source chapter grouping is retained; full chapter introductions are preserved separately in Arabic in the offline notes.'})},
   bewleyCitation(r,config),
   khanCitation(r.comparisons.find(c=>c.id==='islamhouse-khan')),
   ...r.printedWitnesses.map(printedCitation),
   ...structuredClone(r.additionalCitations||[])
  ],contextNotes:[...structuredClone(r.contextNotes||[]),...layoutSourceNotice(r)],localNotes:{path:config.id+'-review.html',fragment:`hadith-${e.number}`,label:'Comparison notes and chapter source for this hadith'}});
 }
 const books=[...structuredClone(opening.ledger.books),{id:config.id,number:config.number,title:config.title,sourceEntryCount:inventory.records.length+review.entries.filter(r=>r.printedReport).length,entryNumbers:batch.entries.map(e=>e.number),chapters:batch.chapters,...(batch.pendingEntries?{pendingEntries:batch.pendingEntries}:{}),...(batch.bookIntroduction?{introduction:batch.bookIntroduction}:{})}];
 const ledger={...structuredClone(opening.ledger),sourceRecordSha256:sourceHash,books,catalogContextSha256:hash(books),sourceReferences:references,referencesSha256:hash(references)};
 ledger.entries.push(...batch.entries.map(e=>({number:e.number,id:e.id,entrySha256:hash(e),arabicSha256:e.arabic_sha256,englishSha256:sha(e.english_blocks.join('\n\n')),status:'personal-prototype-only',arabicReview:{status:'pending'},englishReview:{status:'pending'},contextReview:{status:'pending'}})));
 ledger.rights.evidence.push(`reader/${config.id}-inputs.json`,`reader/${config.id}-review.html`);
 const selectedIds=new Set([...(review.bookIntroduction?.blocks.map(b=>b.htmlId)||[]),...review.chapters.flatMap(c=>[c.headingId,...c.contextIds]),...review.entries.flatMap(e=>e.paragraphIds)]);
 const inputs={schemaVersion:1,sourceLocationCorrections,status:'personal-prototype-only',manifest,completeInventorySha256:hash(inventory),scope:`Only the blocks used by Hadith ${range} and their chapter context.${review.bookIntroduction?' The separately reviewed book introduction is also retained.':''} The complete source inventory remains separately preserved.`,selectedBlocks:inventory.blocks.filter(b=>selectedIds.has(b.htmlId)),...(inventory.schemaVersion>=2?{sourceLayout:layoutInputEvidence(inventory,selectedIds)}:{}),review,...(batch.pendingEntries?{pendingSourceHolds:validateSourceHolds(inventory,review,config).filter(h=>review.pendingReferences.includes(h.reference)).map(h=>({hold:h,evidence:read(h.evidence.path)}))}:{})};
 const chapterNotes=batch.chapterViews.map(c=>{
  if(c.printedEmptyHeading)return emptyPrintedChapterNotes(c,review.sources.map(resolveSourceLocation),config.id);
  if(c.printedHeading)return `<article id="${esc(c.id)}"><p class="eyebrow">Chapter material · supplied from Arabic prints</p><h2>${esc(c.title)}</h2><p><a href="./#book/${config.id}/chapter/${esc(c.id)}">Open this chapter →</a></p><p>This heading is absent from the pinned digital chapter. It is preserved here from the printed witnesses without changing the original digital grouping. The heading stays separate from the numbered hadith and its narration.</p>${printedAdditionDetails(c.printedHeading,review.sources.map(resolveSourceLocation))}<p><a href="#${esc(c.printedHeading.sourceChapterId)}">Original digital chapter and grouping</a></p><p>Numbered reports in this section: ${c.entryNumbers.map(n=>`<a href="./#read/${n}">${n}</a>`).join(', ')}.</p></article>`;
  const sourceURL=new URL(manifest.url);sourceURL.hash=inventory.blocks.find(b=>b.htmlId===c.headingId).origin?.blockId??c.headingId;
  return `<article id="${esc(c.id)}"><p class="eyebrow">Chapter material · separate from numbered hadith</p><h2>${esc(c.title)}</h2><p><a href="./#book/${config.id}/chapter/${esc(c.id)}">Open this chapter →</a></p><p>${c.status==='heading-translation-pending'?esc(c.translationPendingReason)+' The title above is an app status, not a translation.':c.status==='heading-discrepancy-pending'?'The English heading is withheld because the selected digital and printed witnesses differ. The title above is an app status.':'The English heading is an AI-assisted working translation; independent review is pending.'}</p><h3>Selected Arabic heading</h3><div class="arabic" dir="rtl" lang="ar"><p>${esc(c.titleArabic)}</p></div><h3>Chapter introduction</h3>${c.contextIds.length?`<p>${c.contextIds.length} Arabic ${c.contextIds.length===1?'paragraph':'paragraphs'}. English translation is pending.</p><div class="arabic" dir="rtl" lang="ar">${c.contextIds.map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div>`:'<p>No separate introductory paragraph appears in this selected source chapter.</p>'}${chapterDifferenceDetails(validateChapterDifferences(c,inventory,review),review.sources.map(resolveSourceLocation))}${printedIntroductionDetails(c,review.sources.map(resolveSourceLocation))}${chapterLayoutDetails(inventory,c)}<p><a href="${esc(sourceURL.href)}" target="_blank" rel="noopener">Pinned Arabic source · revision ${manifest.revision} ↗</a></p><p>${c.entryNumbers.length?`Numbered reports in this chapter: ${c.entryNumbers.map(n=>`<a href="./#read/${n}">${n}</a>`).join(', ')}.`:(batch.pendingEntries||[]).some(p=>p.chapterId===c.id)?'The numbered report in this chapter is pending source review; no English report is supplied.':'This source chapter has no numbered report. No hadith number has been invented for it.'}</p>${c.printedDivisions?`<p>The digital source groups ${review.chapters.find(original=>original.id===c.id).entryNumbers.filter(n=>!review.entries.find(r=>r.number===n).printedReport).join(', ')} under this heading. The printed witnesses introduce another heading before ${c.printedDivisions.map(d=>`<a href="#${esc(d.id)}">Hadith ${d.beforeEntry}: ${esc(d.title)}</a>`).join('; ')}. That section is separately browseable; the original digital grouping remains in the exact inputs.</p>`:''}${c.headingDiscrepancy?`<p>The heading difference is documented in the <a href="#hadith-${c.entryNumbers[0]}">report comparison notes</a>.</p>`:''}</article>`;
 }).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Book of ${config.title} · source notes</title><link rel="stylesheet" href="reader.css"><style>.review-page article{margin:3rem 0;padding-top:2rem;border-top:1px solid var(--line)}.review-page details{margin:1rem 0}.review-page summary{padding:1rem 0;cursor:pointer}.review-page .arabic{font-size:1.4rem;line-height:2}.review-page li{margin-bottom:1rem}</style></head><body><main class="review-page"><a href="./#book/${config.id}">← Book of ${config.title}</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>The Book of ${config.title}.</h1><p>${esc(review.scope)}</p><details class="edition-history"><summary>Edition comparison history</summary><p>These notes record findings as successive batches were prepared. Later entries may resolve earlier holds. Use the individual entry notes below for the evidence supplied with the current reading text.</p><p>${esc(review.editionNote)}</p></details><p><a href="${config.id}-inputs.json">Exact inputs and comparison record</a> · <a href="source-record.json">Current reading text</a></p>${review.bookIntroduction?'<p><a href="#book-introduction">Book introduction · opening quotations</a></p>':''}<nav aria-label="Chapter source notes">${batch.chapterViews.map((c,i)=>`<a href="#${esc(c.id)}">Chapter ${i+1}</a>`).join(' · ')}</nav><nav aria-label="Hadith source notes">${[...batch.entries,...(batch.pendingEntries||[])].sort((a,b)=>compareReferences(a.number,b.number)).map(e=>`<a href="#hadith-${e.number}">${e.number}${e.status==='source-review-pending'?' · pending':''}</a>`).join(' · ')}</nav>${batch.entries.map(e=>{
  const r=review.entries.find(r=>r.number===e.number),c=(r.printedReport?.schemaVersion===2?batch.chapterViews:review.chapters).find(c=>c.entryNumbers.includes(e.number)),row=references.entries.find(row=>row.number===e.number);
  return `<article id="hadith-${e.number}"><h2>Hadith ${e.number}</h2><p>AI-assisted working translation. Independent review pending.</p><a href="./#read/${e.number}">Open this hadith →</a><h3>Comparison findings</h3><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul><p>${esc(r.reviewScope)}</p><details><summary>Complete working English</summary>${e.english_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</details><details><summary>${r.printedReport?'Arabic transcribed from the selected print':r.arabicSupplements?'Arabic used in the reader · printed addition':r.arabicCorrections?'Arabic used in the reader · declared correction':'Unchanged Arabic report'}</summary><div class="arabic" dir="rtl" lang="ar">${e.arabic_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</div></details>${printedReportDetails(r.printedReport,review.sources.map(resolveSourceLocation))}${r.arabicCorrections?`<section class="correction-record"><h3>Recorded Arabic correction</h3><p>Applied only to this personal prototype. AI-evaluated; independent review pending.</p>${r.arabicCorrections.map(c=>`<p>${esc(c.reason)}</p><p>Original wording:</p><p class="arabic" lang="ar" dir="rtl">${esc(c.before)}</p><p>Reader wording:</p><p class="arabic" lang="ar" dir="rtl">${esc(c.after)}</p>`).join('')}<details><summary>Unchanged original digital report</summary><div class="arabic original-arabic" lang="ar" dir="rtl">${r.paragraphIds.map(id=>`<p>${esc(inventory.blocks.find(b=>b.htmlId===id).text)}</p>`).join('')}</div></details></section>`:''}${r.arabicSupplements?.map(a=>printedAdditionDetails(a,review.sources.map(resolveSourceLocation))).join('')||''}${r.printedHeading?`<p>Printed chapter heading: <a href="#${esc(r.printedHeading.id)}">${esc(r.printedHeading.english)}</a>. This heading is separate from the narration.</p>`:''}${layoutSourceDetails(inventory,r)}<details><summary>Chapter heading and introduction</summary><p>${esc(c.title)}</p><p>${c.status==='heading-translation-pending'?'The English heading is pending review; the label above is an app status, not source wording.':c.status==='heading-discrepancy-pending'?'This heading has no published English translation because the digital and printed witnesses differ. The label above is an app status, not source wording.':'The heading’s English is provisional.'} Any following introduction is preserved in Arabic; it is separate from the numbered hadith and its English translation remains pending.</p><div class="arabic" dir="rtl" lang="ar">${(c.printedHeading?[c.titleArabic]:[c.headingId,...c.contextIds].map(id=>inventory.blocks.find(b=>b.htmlId===id).text)).map(t=>`<p>${esc(t)}</p>`).join('')}</div>${c.printedIntroductions?`<p><a href="#${esc(c.id)}">Separate chapter quotation from Arabic prints</a></p>`:''}</details><details><summary>Sources and exact locations</summary><ul>${row.citations.map(c=>{const s=references.sources.find(s=>s.id===c.sourceId),url=new URL(s.url);if(c.pdfPage)url.hash='page='+c.pdfPage;return `<li><a href="${esc(url.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a><p>${esc(c.locator)}<br>${esc(c.scope)}</p></li>`;}).join('')}</ul></details></article>`;
 }).join('')}${(batch.pendingEntries||[]).map(p=>pendingSourceNotes(validateSourceHolds(inventory,review,config).find(h=>h.reference===p.number),inventory,manifest)).join('')}${bookIntroductionNotes(inventory,review,manifest,config)}${chapterNotes}<p>${esc(source.license.attribution)}</p><p>${esc(source.license.changes)} <a href="${esc(source.license.url)}">CC BY-SA 4.0</a>.</p></main></body></html>\n`;
 return {source,ledger,files:new Map([...[...(opening.files||[])].filter(([path])=>Object.keys(BOOK_CONFIGS).some(id=>path===`reader/${id}-inputs.json`||path===`reader/${id}-review.html`)),['research/bukhari-personal-collection.json',bytes(source)],['content/review/personal-collection-ledger.json',bytes(ledger)],['reader/source-record.json',publicJSON(source)],[`reader/${config.id}-inputs.json`,publicJSON(inputs)],[`reader/${config.id}-review.html`,html]])};
}
export function combineBookReviews(registry,config,readReview=read){
 bookConfig(config);
 assert.equal(registry.schemaVersion,1);assert(registry.batches.length,'No book review batches');
 const sourceNumbers=read(`content/staging/bukhari-${config.id}-wikisource/catalog.json`).records.map(r=>r.number);
 assert.equal(sourceNumbers[0],config.first,'Source book begins at the wrong reference');
 const reviews=[];let position=0;
 for(const batch of registry.batches){
  assert(new RegExp('^content/review/'+config.id+'-[a-z-]+-review\\.json$').test(batch.path),'Unsafe batch path');
  assert(validReference(batch.first)&&validReference(batch.last),'Invalid batch reference');
  const review=readReview(batch.path);assert.equal(hash(review),batch.sha256,'Changed book batch record');
  const span=referenceSpan(sourceNumbers,sourceNumbers[position],batch.last),pending=review.pendingReferences||[];
  assert.deepEqual(pending,span.filter(n=>pending.includes(n)),'Pending references must be within their registered batch span');
  const selected=span.filter(n=>!pending.includes(n));
  assert.equal(batch.first,selected[0],'Book batches must be consecutive except documented holds');
  assert.deepEqual(digitalReportRows(review).map(e=>e.number),selected,'Incomplete registered book batch');
  if(reviews.length)for(const key of ['schemaVersion','status','independentReview','sourceId','sourceSha256','inventorySha256','sourceLayout','bookIntroduction'])assert.deepEqual(review[key],reviews[0][key],'Conflicting book batch source');
  reviews.push(review);position+=span.length;
 }
 const sources=[];
 for(const review of reviews)for(const source of review.sources){const existing=sources.find(s=>s.id===source.id);if(existing)assert.deepEqual(existing,source,'Conflicting book batch source');else sources.push(source);}
 const entries=reviews.flatMap(r=>r.entries),chapters=reviews.flatMap(r=>r.chapters),pendingReferences=reviews.flatMap(r=>r.pendingReferences||[]);
 assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length,'A chapter cannot be split across review batches');
 return {...reviews[0],sources,entries,chapters,...(pendingReferences.length?{pendingReferences}:{}),scope:`${pendingReferences.length?'Available complete reports':'Complete numbered reports'} ${config.first}–${entries.at(-1).number}.${pendingReferences.length?' References '+pendingReferences.join(', ')+' remain pending source review and are excluded from reading and narration.':''} Available chapter titles use provisional English. Disputed headings are labelled under review; unnumbered chapter introductions remain separately preserved in Arabic.`,editionNote:reviews.map(r=>r.editionNote).join(' '),batches:registry.batches};
}
export function buildFaithBatch(inventory,review,manifest){return buildBookBatch(inventory,review,manifest,BOOK_CONFIGS.faith);}
export function combineFaithReviews(registry,readReview=read){return combineBookReviews(registry,BOOK_CONFIGS.faith,readReview);}
export function collectionFiles(){
 let result=prototypeFiles();
 for(const config of Object.values(BOOK_CONFIGS))result=assembleCollection(result,read(`content/staging/bukhari-${config.id}-wikisource/catalog.json`),combineBookReviews(read(`content/review/${config.id}-batches.json`),config),read(`content/sources/wikisource-${config.id}/manifest.json`),config);
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=collectionFiles(),publication=partitionSourceNotes(result.files);for(const [path,body]of publication.files){const url=new URL(path,root);if(process.argv.includes('--check'))assert.equal(readFileSync(url,'utf8'),body,'Stale collection file: '+path);else {mkdirSync(new URL('./',url),{recursive:true});writeFileSync(url,body);}}
 console.log(`${result.ledger.books.length} books, ${result.source.entries.length} complete prototype source entries; source ${hash(result.source)}`);
}
