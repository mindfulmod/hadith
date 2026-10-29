/* Entry-specific provenance. Citations and context are never narration text. */
import {validReference} from './references.mjs';
import {escapeHTML as escape} from './source-format.mjs';
const requireValue=(value,message)=>{if(!value)throw new Error(message);};
const text=value=>typeof value==='string'&&value.trim().length>0;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const identifier=value=>typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const kinds=new Set(['arabic-input','arabic-witness','english-comparison','reference-check','commentary']);
export function externalSourceURL(value){
 requireValue(text(value),'Missing source URL');
 const url=new URL(value);
 requireValue(url.protocol==='https:'&&!url.username&&!url.password,'Source links must use HTTPS without credentials');
 return url;
}
export function validateSourceReferences(bundle,entries,{sourceRecordSha256,entriesSha256,knownEntries=entries}={}){
 requireValue([1,2].includes(bundle?.schemaVersion),'Missing or unsupported source references');
 if(bundle.schemaVersion===1){
  requireValue(bundle.entriesSha256===undefined&&hash(bundle.sourceRecordSha256)&&bundle.sourceRecordSha256===sourceRecordSha256,'Source references belong to another text version');
 }else{
  requireValue(bundle.sourceRecordSha256===undefined&&hash(bundle.entriesSha256)&&bundle.entriesSha256===entriesSha256,'Source references belong to another book text version');
 }
 requireValue(Array.isArray(bundle.sources)&&bundle.sources.length>0&&Array.isArray(bundle.entries),'Missing source reference records');
 const sources=new Map();
 for(const source of bundle.sources){
  requireValue(identifier(source.id)&&!sources.has(source.id)&&text(source.label)&&kinds.has(source.kind)&&['web','pdf'].includes(source.format),'Invalid or duplicate source');
  externalSourceURL(source.url);sources.set(source.id,source);
 }
 requireValue(bundle.entries.length===entries.length,'Incomplete entry references');
 const known=new Map(knownEntries.map(e=>[e.id,e.number]));
 for(const [index,row] of bundle.entries.entries()){
  const entry=entries[index];
  requireValue(validReference(row.number)&&row.id===entry.id&&row.number===entry.number&&hash(row.entrySha256),'Source reference identity mismatch');
  requireValue(text(row.translation?.label)&&text(row.translation?.description),'Missing translation attribution');
  requireValue(Array.isArray(row.citations)&&row.citations.length>0,'Missing entry citations');
  const citationIds=new Set();
  for(const citation of row.citations){
   const source=sources.get(citation.sourceId);
   requireValue(identifier(citation.id)&&!citationIds.has(citation.id)&&source&&text(citation.locator)&&text(citation.scope),'Invalid entry citation');
   if(citation.pdfPage!==undefined)requireValue(source.format==='pdf'&&Number.isSafeInteger(citation.pdfPage)&&citation.pdfPage>0,'Invalid PDF page');
   citationIds.add(citation.id);
  }
  requireValue(row.citations.some(c=>sources.get(c.sourceId).kind==='arabic-input'),'Entry must identify its Arabic input');
  const notes=row.localNotes;
  requireValue(notes&&typeof notes.path==='string'&&/^[a-z0-9][a-z0-9/_.-]*\.html$/.test(notes.path)&&!notes.path.split('/').some(p=>p==='..'||p==='.'||!p)&&identifier(notes.fragment)&&text(notes.label),'Invalid offline comparison notes');
  requireValue(Array.isArray(row.contextNotes),'Missing source context list');
  if(entry.review?.sourceForm){const form=entry.review.sourceForm,note=row.contextNotes.find(n=>n.id===form.contextNoteId);requireValue(note&&note.related?.length&&['base',...(form.witnesses||[]).map(w=>w.sourceId)].every(id=>note.citations?.includes(id)),'Chain-only source needs its visible evidence note');}
  for(const note of row.contextNotes){
   requireValue(text(note.label)&&text(note.text)&&Array.isArray(note.citations)&&note.citations.length>0&&note.citations.every(id=>citationIds.has(id)),'Source context must cite its evidence');
   requireValue(Array.isArray(note.related)&&note.related.every(link=>known.get(link.id)===link.number&&link.id!==row.id&&text(link.label)&&(link.target===undefined||['entry','chain'].includes(link.target))),'Source context points to an unavailable reference');
  }
 }
 return bundle;
}
export function referenceFor(bundle,number){const row=bundle.entries.find(e=>e.number===number);requireValue(row,'Source references are unavailable for this entry');return row;}
export function citationURL(source,citation){const url=externalSourceURL(source.url);if(citation.pdfPage!==undefined)url.hash='page='+citation.pdfPage;return url.href;}
function sourceMap(bundle){return new Map(bundle.sources.map(source=>[source.id,source]));}
function citationHTML(citation,sources){
 const source=sources.get(citation.sourceId);
 return `<li><a target="_blank" rel="noopener" href="${escape(citationURL(source,citation))}">${escape(source.label)} ↗</a><p class="citation-location">${escape(citation.locator)}</p><p>${escape(citation.scope)}</p></li>`;
}
export function sourceContextHTML(bundle,number,{inDialog=false}={}){
 const row=referenceFor(bundle,number),sources=sourceMap(bundle);
 if(!row.contextNotes.length)return '';
 return `<aside class="source-context" aria-label="Source context, separate from the narration"><p class="source-section-label">Source context · separate from the narration</p>${row.contextNotes.map(note=>`<h3>${escape(note.label)}</h3><p>${escape(note.text)}</p>${note.related.map(link=>`<a data-source-related href="#read/${link.number}${link.target==='chain'?'/chain':''}">${escape(link.label)} →</a>`).join('')}${inDialog?`<ul class="source-citations">${note.citations.map(id=>citationHTML(row.citations.find(c=>c.id===id),sources)).join('')}</ul>`:`<button class="text-button" data-sources="${number}">Evidence and source details</button>`}`).join('')}</aside>`;
}
export function sourceDialogHTML(entry,pack,{hasAudio=false}={}){
 const bundle=pack.sourceReferences,row=referenceFor(bundle,entry.number),sources=sourceMap(bundle);
 const base=row.citations.filter(c=>sources.get(c.sourceId).kind==='arabic-input'),comparisons=row.citations.filter(c=>sources.get(c.sourceId).kind!=='arabic-input');
 const licence=pack.sourceRecord.license;externalSourceURL(licence.url);
 const notes=`${row.localNotes.path}#${row.localNotes.fragment}`;
 return `<p class="source-status"><strong>${escape(row.translation.label)}</strong><br>${escape(row.translation.description)}</p><section class="source-origin"><h3>Arabic source used here</h3><ul class="source-citations">${base.map(c=>citationHTML(c,sources)).join('')}</ul></section>${sourceContextHTML(bundle,entry.number,{inDialog:true})}<details class="source-section"><summary>Complete Arabic text</summary><div lang="ar" dir="rtl" class="arabic">${entry.arabic_blocks.map((block,index)=>`${entry.presentation?.arabic.some(r=>r.block===index&&r.provenance?.kind==='printed-supplement')?'<p class="sample-note" lang="en" dir="ltr">Closing transmission note · from an Arabic print</p>':''}<p data-source-block="arabic-${index}">${escape(block)}</p>`).join('')}</div></details>${comparisons.length?`<details class="source-section"><summary>Comparison sources <span>${comparisons.length}</span></summary><ul class="source-citations">${comparisons.map(c=>citationHTML(c,sources)).join('')}</ul></details>`:''}<p><a href="${escape(notes)}" target="_blank" rel="noopener">${escape(row.localNotes.label)} ↗</a></p><p class="sample-note">Arabic text and comparison notes are included in Save reading. External source websites and publisher PDFs need a connection.</p><details class="source-section"><summary>Attribution and reuse</summary><p class="source-licence">${escape(licence.attribution)}<br><br>${escape(licence.changes)} <a target="_blank" rel="noopener" href="${escape(licence.url)}">${escape(licence.id)} ↗</a></p></details><p class="source-status"><strong>Listening status</strong><br>${hasAudio?'Cedar is an AI-generated voice. Its complete submitted script matches the English source text; generated speech still needs an exact-word and pronunciation review. <a href="audio-review.html">Review the narration ↗</a>':'A recording has not been added for this hadith. The complete text is available to read.'}</p>`;
}
