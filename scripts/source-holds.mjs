/* A documented wording dispute cannot be cleared by a routine translation batch. */
import assert from 'node:assert/strict';
import {escapeHTML as esc} from '../reader/source-format.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const sha=text=>createHash('sha256').update(text).digest('hex');
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const holds=read('content/review/source-holds.json');

export function validateSourceHolds(inventory,review,config,registry=holds){
 assert.equal(registry.schemaVersion,1,'Unsupported source hold registry');
 assert(Array.isArray(registry.holds),'Missing source hold registry');
 const ids=new Set();
 for(const hold of registry.holds){
  assert(typeof hold.id==='string'&&hold.id.trim()&&!ids.has(hold.id),'Invalid or duplicate source hold');ids.add(hold.id);
  assert.equal(hold.status,'unresolved','Source holds require an explicit reviewed resolution workflow');
  assert(typeof hold.bookId==='string'&&hold.bookId&&typeof hold.reason==='string'&&hold.reason.trim(),'Incomplete source hold');
  assert(/^research\/[a-z0-9-]+\.json$/.test(hold.evidence.path),'Invalid source hold evidence path');
  assert.equal(sha(JSON.stringify(read(hold.evidence.path))),hold.evidence.sha256,'Source hold evidence changed');
  if(hold.bookId!==config.id)continue;
  assert.equal(hold.sourceId,inventory.sourceId,'Source hold must be reviewed after source identity changes');
  assert.equal(hold.sourceSha256,inventory.sourceSha256,'Source hold must be reviewed after source revision changes');
  const row=inventory.records.find(r=>r.id===hold.sourceRecordId);
  assert(row&&row.number===hold.reference,'Held source record is missing or remapped');
  assert.deepEqual(row.paragraphIds,hold.paragraphIds,'Held source paragraphs changed');
  const body=row.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id)?.text);
  assert(body.every(t=>typeof t==='string'),'Held source text is missing');
  assert.equal(sha(body.join('')),hold.arabicSha256,'Held source wording changed');
  assert(!review.entries.some(r=>r.number===hold.reference||r.sourceRecordId===hold.sourceRecordId),
   `Unresolved source wording hold: ${hold.id}. See ${hold.evidence.path}`);
 }
 return registry.holds.filter(h=>h.bookId===config.id);
}

// Public pending metadata is derived only from an exact, validated source hold.
export function pendingSourceEntry(hold,inventory,config){
 const row=inventory.records.find(r=>r.id===hold.sourceRecordId);
 return {id:hold.id,number:hold.reference,chapterId:row.chapterId,status:'source-review-pending',reason:hold.reason,sourceId:hold.sourceId,sourceSha256:hold.sourceSha256,sourceRecordId:hold.sourceRecordId,arabicSha256:hold.arabicSha256,evidenceSha256:hold.evidence.sha256,notes:{path:config.id+'-review.html',fragment:'hadith-'+hold.reference}};
}
export function pendingSourceNotes(hold,inventory,manifest){
 const e=read(hold.evidence.path),arabic=hold.paragraphIds.map(id=>inventory.blocks.find(b=>b.htmlId===id).text);
 const prints=e.printedSources||[],commentary=e.classicalCommentary;
 return '<article id="hadith-'+hold.reference+'"><p class="eyebrow">SOURCE REVIEW PENDING · NOT AVAILABLE TO READ OR LISTEN</p><h2>Hadith '+hold.reference+' · source review pending</h2><p>'+esc(hold.reason)+'</p><p>This is an unresolved wording choice in the app’s selected source. It is not a judgment that the hadith itself is inauthentic. No English translation or recording is supplied. Reading continues to the next available report; this reference stays reserved.</p><p><a href="./#read/'+hold.reference+'">Return to the pending reference →</a></p><details><summary>Unchanged selected Arabic · source evidence only</summary><div class="arabic" lang="ar" dir="rtl">'+arabic.map(t=>'<p>'+esc(t)+'</p>').join('')+'</div></details><p><a href="'+esc(manifest.url)+'" target="_blank" rel="noopener">Pinned Arabic source ↗</a></p><h3>Documented source difference</h3><p>'+esc(e.decision.reason)+'</p>'+ (commentary?'<p>'+esc(commentary.observation)+'</p><p><a href="'+esc(commentary.url)+'" target="_blank" rel="noopener">'+esc(commentary.work)+' ↗</a> · '+esc(commentary.locator)+'</p>'+(commentary.comparisonUrl?'<p><a href="'+esc(commentary.comparisonUrl)+'" target="_blank" rel="noopener">'+esc(commentary.comparisonLabel)+' ↗</a></p>':''):'')+'<ul>'+prints.map(p=>'<li><a href="'+esc(p.url+'#page='+p.pdfPage)+'" target="_blank" rel="noopener">'+esc(p.label)+' · PDF page '+p.pdfPage+' ↗</a>'+ (p.printedReference?' · printed reference '+p.printedReference:'')+'<p>'+esc(p.observation)+'</p></li>').join('')+'</ul><p>The selected Arabic, this explanation and source locations are saved with the reading material. Opening an external edition requires an internet connection. Independent source selection and translation review remain pending.</p></article>';
}
