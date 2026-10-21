/* Derive a labelled personal edition without altering the pinned source or drafts. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {validateSourceStructure} from '../reader/source-structure.mjs';
import {escapeHTML as esc} from '../reader/source-format.mjs';
const root=new URL('../',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const hash=o=>sha(JSON.stringify(o));
const bytes=o=>JSON.stringify(o,null,2)+'\n';
export function buildOpeningPrototype(original,draft,decisions,originalLedger){
 assert.equal(decisions.schemaVersion,1);assert.equal(decisions.status,'personal-prototype-only');
 assert.equal(decisions.independentReview,'pending');assert.equal(decisions.draftSha256,hash(draft),'Prototype decisions target a different draft');
 assert.deepEqual(original.entries.map(e=>e.number),[1,2]);assert.deepEqual(draft.entries.map(e=>e.number),[3,4,5,6,7]);
 const questionIds=draft.entries.flatMap(e=>e.unresolved.filter(q=>typeof q==='object').map(q=>q.id));
 assert.deepEqual(decisions.decisions.map(d=>d.id).sort(),questionIds.sort(),'Every open wording question needs a recorded prototype choice');
 const sourceIds=new Set([...draft.sources,...decisions.sources].map(s=>s.id));
 for(const d of decisions.decisions){
  assert.equal(d.status,'chosen-for-personal-prototype');assert.equal(d.reviewerKind,'ai');assert.equal(d.independentReview,'pending');
  assert(d.decision.trim()&&d.sources.length&&d.sources.every(id=>sourceIds.has(id)),'Missing decision evidence');
  const e=draft.entries.find(e=>e.number===d.number);assert(e?.unresolved.some(q=>q.id===d.id),'Decision assigned to the wrong entry');
 }
 const corrected=new Set();
 const added=draft.entries.map(e=>{
  const segments=structuredClone(e.segments),entryDecisions=decisions.decisions.filter(d=>d.number===e.number);
  const englishEdits=entryDecisions.flatMap(d=>d.englishEdits.map(edit=>({...edit,decisionId:d.id})));
  for(const edit of englishEdits){
   const s=segments.find(s=>s.id===edit.segmentId);assert(s&&edit.before&&edit.after.trim()&&s.english.split(edit.before).length===2,'English edit does not match exactly once');
   s.english=s.english.replace(edit.before,edit.after);
  }
  const corrections=decisions.arabicCorrections.filter(c=>c.number===e.number).map(c=>{
   const p=e.proposedCorrections?.find(p=>p.id===c.proposalId);assert(p&&entryDecisions.some(d=>d.id===c.decisionId),'Missing correction proposal or decision');
   assert.equal(p.status,'proposed-not-applied');assert.equal(p.reviewerKind,'ai');
   assert(p.sources.length>=2&&p.sources.every(id=>sourceIds.has(id)),'Correction needs its evidence');
   const segment=segments.find(s=>s.paragraphId===p.paragraphId&&s.start<=p.start&&s.end>=p.end);assert(segment,'Correction outside source segment');
   const chars=Array.from(segment.arabic),start=p.start-segment.start,end=p.end-segment.start;
   assert.equal(chars.slice(start,end).join(''),p.original,'Correction does not match the original');
   assert.equal(Array.from(p.replacement).length,end-start,'This correction requires new source offsets');
   chars.splice(start,end-start,...Array.from(p.replacement));segment.arabic=chars.join('');corrected.add(c.proposalId);
   assert(englishEdits.some(edit=>edit.segmentId===p.englishSegmentId&&edit.before===p.englishOriginal&&edit.after===p.englishReplacement),'Arabic correction lacks its corresponding English change');
   return {...p,status:'applied-to-personal-prototype-only',decisionId:c.decisionId};
  });
  const arabic_blocks=e.arabicParagraphIds.map(id=>segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''));
  const english_blocks=segments.map(s=>s.english);
  const entry={id:`bukhari:${e.number}`,book:original.entries[0].book,number:e.number,arabic_blocks,arabic_sha256:sha(arabic_blocks.join('\n\n')),english_blocks,
   english_status:'Personal prototype: AI-assisted working translation; source comparisons and translation choices recorded. Independent Arabic, English and context review pending.',
   presentation:{schemaVersion:1,arabic:segments.map(s=>({block:e.arabicParagraphIds.indexOf(s.paragraphId),start:s.start,end:s.end,kind:s.kind})),english:segments.map((s,block)=>({block,start:0,end:Array.from(s.english).length,kind:s.kind}))},
   review:{status:'personal-prototype-only',independentReview:'pending',originalDraftId:e.id,originalDraftReviewSha256:e.reviewRecordSha256,decisions:entryDecisions,arabicCorrections:corrections,comparisonChecks:e.checks,printedWitnesses:e.printedWitnesses},
   audio_status:'No recording yet.'};
  validateSourceStructure(entry);return entry;
 });
 assert.equal(corrected.size,decisions.arabicCorrections.length,'Unapplied or duplicate correction');
 const sources=[...original.sources];
 for(const s of [...draft.sources,...decisions.sources])if(!sources.some(old=>old.id===s.id))sources.push(s);
 const source={...original,created:'2026-10-20',scope:'First seven opening entries. Personal prototype only; independent review pending.',
  license:{...original.license,changes:'Entries 1–2 are unchanged. Entries 3–7 are derived from the pinned Arabic; Hadith 5 has one explicitly recorded correction from له to لك supported by two printed witnesses. Original inputs are retained in prototype-inputs.json. New AI-assisted English, presentation and comparison notes are offered under CC BY-SA 4.0. This does not license third-party comparison translations or the rest of the app.'},
  sources,findings:[...original.findings,'Entries 3–7 have AI comparison records and declared wording choices; no human accuracy certification is claimed. The derived Hadith 5 correction does not modify the pinned digital input.'],
  prototypeReview:{status:'personal-prototype-only',independentReview:'pending',userDecision:decisions.userDecision,originalSourceSha256:hash(original),originalDraftSha256:hash(draft),decisionsSha256:hash(decisions)},entries:[...original.entries,...added]};
 const sourceHash=hash(source),referenceSources=structuredClone(originalLedger.sourceReferences.sources);
 const labels={'islamhouse-khan':['IslamHouse · Khan-family English comparison','english-comparison','web'],'brill-1862':['Historical Arabic print · Brill 1862','arabic-witness','pdf'],'dar-ibn-kathir-2002':['Arabic print · Dar Ibn Kathir 2002','arabic-witness','pdf'],'ibn-hajar-opening-5':['Ibn Hajar · Fath al-Bari','commentary','web']};
 for(const s of draft.sources){if(referenceSources.some(r=>r.id===s.id))continue;const [label,kind,format]=labels[s.id];referenceSources.push({id:s.id,label,kind,format,url:s.url});}
 referenceSources.push(...decisions.sources.map(({id,label,url,kind,format})=>({id,label,url,kind,format})));
 const rows=structuredClone(originalLedger.sourceReferences.entries);
 for(const e of added){
  const d=draft.entries.find(d=>d.number===e.number),entryDecisions=e.review.decisions;
  const citations=[{id:'base',sourceId:'arabic-base',locator:`Opening book · source entry ${e.number}`,scope:e.number===5?'Derived Arabic with one declared correction: له → لك. The unchanged digital input is preserved in the offline prototype inputs and comparison notes.':'Arabic retained verbatim from the fixed digital revision, including its source paragraph boundaries.'},
   {id:'bewley',sourceId:'bewley',locator:`Opening chapter · entry ${e.number}`,scope:'Independent named English comparison; not copied into this working translation.'},
   {id:'khan',sourceId:'islamhouse-khan',locator:`English reference ${d.comparators.find(c=>c.id==='islamhouse-khan').reference}`,scope:'Khan-family comparator. References 1.1.3 combine Arabic entries 3 and 4; 1.1.4–6 correspond to Arabic entries 5–7. Not a second Arabic base or a third independent English translator.'},
   ...d.printedWitnesses.map(w=>({id:w.id,sourceId:w.id,locator:`PDF ${w.pdfPages.length>1?'pages':'page'} ${w.pdfPages.join(', ')}`,pdfPage:w.pdfPages[0],scope:'Visually inspected Arabic witness. Differences are recorded in the comparison notes; the digital input is not assumed to come from this edition.'}))];
  for(const id of new Set(entryDecisions.flatMap(d=>d.sources))){
   if(citations.some(c=>c.sourceId===id))continue;
   const s=decisions.sources.find(s=>s.id===id)||draft.sources.find(s=>s.id===id);
   citations.push({id,sourceId:id,locator:s.locator||'Fath al-Bari, volume 1, pages 39–40 · opening report 5',scope:s.scope||s.role});
  }
  const contextNotes=[];
  if(e.number===4)contextNotes.push({label:'A continued chain',text:'This report continues through Ibn Shihab from the preceding narrator chain, then through Abu Salamah and Jabir. The first-person account is the Prophet’s.',citations:['ayni-opening-4'],related:[{id:'bukhari:3',number:3,label:'See the preceding chain',target:'chain'}]});
  if(e.number===5)contextNotes.push({label:'A recorded source correction',text:'This personal edition uses “for you” where the digital transcription has “for him.” Two printed Arabic witnesses support the correction. The original and evidence remain in the source notes.',citations:['brill-1862','dar-ibn-kathir-2002','ibn-hajar-opening-5'],related:[]});
  rows.push({id:e.id,number:e.number,entrySha256:hash(e),translation:{label:'Personal prototype · English working translation',description:e.english_status+' This is a new working translation, not the Darussalam translation.'},citations,contextNotes,localNotes:{path:'prototype-review.html',fragment:`hadith-${e.number}`,label:'Translation choices and original source for this hadith'}});
 }
 const sourceReferences={schemaVersion:1,sourceRecordSha256:sourceHash,sources:referenceSources,entries:rows};
 const books=[{id:'opening-revelation',number:1,title:original.entries[0].book,entryNumbers:source.entries.map(e=>e.number)}];
 const ledger={schemaVersion:1,namespace:originalLedger.namespace,publication:'personal-prototype',sourceRecordSha256:sourceHash,
  rights:{status:'pending',evidence:['reader/prototype-inputs.json','reader/prototype-review.html']},books,entries:source.entries.map(e=>({number:e.number,id:e.id,entrySha256:hash(e),arabicSha256:e.arabic_sha256,englishSha256:sha(e.english_blocks.join('\n\n')),status:'personal-prototype-only',arabicReview:{status:'pending'},englishReview:{status:'pending'},contextReview:{status:'pending'}})),catalogContextSha256:hash(books),collectionReview:{status:'pending'},sourceReferences,referencesSha256:hash(sourceReferences),referencesReview:{status:'pending'}};
 const inputs={schemaVersion:1,originalTwoEntrySource:original,originalDraft:draft,prototypeDecisions:decisions};
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Personal prototype · source choices</title><link rel="stylesheet" href="reader.css"><style>.review-page article{margin:3rem 0;padding-top:2rem;border-top:1px solid var(--line)}.review-page details{margin:1rem 0}.review-page summary{cursor:pointer;padding:1rem 0}.review-page li{margin-bottom:1rem}.review-page .arabic{font-size:1.4rem;line-height:2} .review-page code{overflow-wrap:anywhere}</style></head><body><main class="review-page"><a href="./">← Return to your session</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>The wording and its sources.</h1><p>Hadith 3–7 use new AI-assisted working translations. These are provisional language choices, not scholarly certification. The original digital Arabic and working drafts remain available alongside the derived reading text.</p><p><a href="source-review.html">Earlier comparison notes: Hadith 1–2</a> · <a href="prototype-inputs.json">Unchanged inputs and decision record (JSON)</a> · <a href="source-record.json">Current reading text (JSON)</a></p><nav aria-label="Choose source notes">${added.map(e=>`<a href="#hadith-${e.number}">Hadith ${e.number}</a>`).join(' · ')}</nav>${added.map(e=>{
  const row=rows.find(r=>r.number===e.number),originalEntry=draft.entries.find(d=>d.number===e.number);
  return `<article id="hadith-${e.number}"><p class="eyebrow">INDEPENDENT ARABIC, ENGLISH AND CONTEXT REVIEW PENDING</p><h2>Hadith ${e.number}</h2><a href="./#read/${e.number}">Open this hadith in the reader →</a>${e.review.decisions.map(d=>`<h3>${esc(d.topic)}</h3><p>${esc(d.decision)}</p>${d.englishEdits.map(edit=>`<p><strong>Earlier draft:</strong> ${esc(edit.before)}<br><strong>Personal prototype:</strong> ${esc(edit.after)}</p>`).join('')}`).join('')}<details><summary>Complete working English</summary>${e.english_blocks.map(t=>`<p>${esc(t)}</p>`).join('')}</details><details><summary>Unchanged digital Arabic input</summary><div class="arabic" lang="ar" dir="rtl">${originalEntry.arabicParagraphIds.map(id=>`<p>${esc(originalEntry.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''))}</p>`).join('')}</div></details><details><summary>Earlier comparison findings</summary><ul>${e.review.comparisonChecks.map(c=>`<li><strong>${esc(c.topic)}</strong><br>${esc(c.finding)}</li>`).join('')}</ul></details><details><summary>Sources and exact locations</summary><ul>${row.citations.map(c=>{const s=referenceSources.find(s=>s.id===c.sourceId);const u=new URL(s.url);if(c.pdfPage)u.hash='page='+c.pdfPage;return `<li><a href="${esc(u.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a><p>${esc(c.locator)}<br>${esc(c.scope)}</p></li>`;}).join('')}</ul></details></article>`;
 }).join('')}<p>${esc(source.license.attribution)}</p><p>${esc(source.license.changes)} <a href="${esc(source.license.url)}">CC BY-SA 4.0</a>.</p><a href="./">Return to your session →</a></main></body></html>\n`;
 return {source,ledger,files:new Map([['research/bukhari-opening-prototype.json',bytes(source)],['content/review/opening-prototype-ledger.json',bytes(ledger)],['reader/prototype-inputs.json',bytes(inputs)],['reader/prototype-review.html',html]])};
}
export function prototypeFiles(){return buildOpeningPrototype(read('research/bukhari-opening-review.json'),read('content/review/opening-next-drafts.json'),read('content/review/opening-prototype-decisions.json'),read('content/review/opening-ledger.json'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=prototypeFiles();for(const [path,body] of result.files){const url=new URL(path,root);if(process.argv.includes('--check'))assert.equal(readFileSync(url,'utf8'),body,'Stale prototype file: '+path);else writeFileSync(url,body);}
 console.log(`Personal prototype: ${result.source.entries.length} complete entries; original inputs retained; source ${hash(result.source)}`);
}
