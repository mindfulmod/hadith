import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSourceReferences,sourceDialogHTML,sourceContextHTML,citationURL} from '../reader/source-references.mjs';
import {buildBooks,objectHash,digest} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const source=read('research/bukhari-opening-review.json'),ledger=read('content/review/opening-ledger.json');
const validate=refs=>validateSourceReferences(refs,source.entries,{sourceRecordSha256:ledger.sourceRecordSha256});
function pack({raw=false}={}){const built=buildBooks(source,ledger),value=JSON.parse(built.files.get(built.catalog.books[0].path));return raw?value:{...value,sourceRecord:built.catalog.sourceRecord};}
test('each entry shows only its recorded references, page and translation identity',()=>{
 const value=pack();validateSourceReferences(value.sourceReferences,source.entries,{entriesSha256:objectHash(source.entries)});
 for(const e of source.entries){const html=sourceDialogHTML(e,value,{hasAudio:true});assert(html.includes(`PDF page ${e.source_pages.darussalam_sample_pdf_page}`));assert(html.includes(`bukhari:${e.number}`));assert(!html.includes(`bukhari:${e.number===1?2:1}`));assert(html.includes(`source-review.html#hadith-${e.number}`));assert(html.includes('not the Darussalam translation'));assert.equal((html.match(/data-source-block="arabic-/g)||[]).length,e.arabic_blocks.length);}
});
test('citations preserve edition-specific locators and never infer numbers or translator identity',()=>{
 const value=pack(),row=value.sourceReferences.entries[0];
 row.translation={label:'Synthetic translator identity',description:'Synthetic edition fixture, not source content.'};
 value.sourceReferences.sources=value.sourceReferences.sources.filter(s=>['arabic-base','bewley'].includes(s.id));
 row.citations=[row.citations[0],{id:'combined',sourceId:'bewley',locator:'TEST: volume 1, record 1.1.3 combines two reports',scope:'Only the selected report was compared.'}];
 const html=sourceDialogHTML(source.entries[0],value);assert(html.includes('Synthetic translator identity'));assert(html.includes('1.1.3 combines two reports'));assert(!html.includes('Darussalam'));assert(!html.includes('sunnah.com'));assert(!html.includes('AI-generated voice'));assert(html.includes('A recording has not been added'));
});
test('missing, stale, unsafe and ambiguous source records fail validation',()=>{
 const changes=[r=>r.entries.pop(),r=>r.entries.reverse(),r=>r.entries[0].id='wrong',r=>r.sourceRecordSha256='0'.repeat(64),r=>r.sources[0].url='javascript:alert(1)',r=>r.sources[0].url='https://secret@example.com/',r=>r.sources.push(r.sources[0]),r=>r.entries[0].citations[0].sourceId='absent',r=>r.entries[0].citations[0].pdfPage=2,r=>r.entries[0].citations[1].pdfPage=0,r=>r.entries[0].citations.shift(),r=>r.entries[0].localNotes.path='../other.html',r=>r.entries[0].localNotes.path='https://example.com/notes.html',r=>r.entries[0].translation.description=''];
 for(const change of changes){const refs=structuredClone(ledger.sourceReferences);change(refs);assert.throws(()=>validate(refs));}
});
test('PDF links retain query parameters and point to explicit PDF pages',()=>{
 const source={url:'https://example.com/?controller=attachment&id_attachment=433'};
 const url=new URL(citationURL(source,{pdfPage:6}));assert.equal(url.searchParams.get('id_attachment'),'433');assert.equal(url.hash,'#page=6');
});
test('inherited context is separate from source wording and links only to real references',()=>{
 const refs=structuredClone(ledger.sourceReferences);refs.entries[1].contextNotes=[{label:'TEST: inherited chain',text:'TEST: this context is not narration.',citations:['base'],related:[{id:'bukhari:1',number:1,label:'Previous chain',target:'chain'}]}];
 validate(refs);const html=sourceContextHTML(refs,2);assert(html.includes('separate from the narration'));assert(html.includes('href="#read/1/chain"'));assert(!html.includes('data-source-block'));
 refs.entries[1].contextNotes[0].related[0].number=9;assert.throws(()=>validate(refs),/unavailable reference/);
 refs.entries[1].contextNotes[0].related=[];refs.entries[1].contextNotes[0].citations=['missing'];assert.throws(()=>validate(refs),/cite its evidence/);
});
test('metadata is escaped and cannot change the Arabic source text',()=>{
 const value=pack();value.sourceReferences.sources[0].label='<script>unsafe</script>';value.sourceReferences.entries[0].translation.description='"<img onerror=x>&';
 const html=sourceDialogHTML(source.entries[0],value);assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
 for(const block of source.entries[0].arabic_blocks)assert(html.includes(block));
});
test('reference changes invalidate review hashes without requiring a wording change',()=>{
 const copy=structuredClone(ledger);copy.sourceReferences.entries[0].citations[1].locator='Changed page';assert.throws(()=>buildBooks(source,copy),/references changed since review/);
 copy.referencesSha256=objectHash(copy.sourceReferences);copy.sourceReferences.entries[0].entrySha256='0'.repeat(64);copy.referencesSha256=objectHash(copy.sourceReferences);assert.throws(()=>buildBooks(source,copy),/References do not match/);
});
test('production requires a separate human reference review bound to the exact metadata',()=>{
 const copy=structuredClone(ledger),approved=sha256=>({status:'approved',reviewerKind:'human',reviewer:'TEST FIXTURE ONLY',reviewedAt:'2026-10-20',sha256,evidence:['test fixture only']});
 copy.publication='production';copy.rights=approved(copy.sourceRecordSha256);copy.collectionReview=approved(copy.catalogContextSha256);
 for(const row of copy.entries){row.status='approved';row.unresolvedDiscrepancies=[];row.arabicReview=approved(row.arabicSha256);row.englishReview=approved(row.englishSha256);row.contextReview=approved(row.entrySha256);}
 assert.throws(()=>buildBooks(source,copy),/Source references needs approval/);copy.referencesReview=approved(copy.referencesSha256);assert.equal(buildBooks(source,copy).catalog.publication,'production');
 copy.referencesReview.reviewerKind='ai';assert.throws(()=>buildBooks(source,copy),/independent human review/);
});
test('book loading refuses missing references or offline comparison notes',async()=>{
 for(const missing of ['references','notes']){
  const built=buildBooks(source,ledger),value=pack({raw:true}),catalog=structuredClone(built.catalog);
  if(missing==='references')delete value.sourceReferences;
  const body=JSON.stringify(value),sha256=digest(body),path=`books/${value.book.id}-${sha256.slice(0,16)}.json`;Object.assign(catalog.books[0],{path,sha256,bytes:Buffer.byteLength(body)});
  const responses=new Map([[path,body],['books/catalog.json',JSON.stringify(catalog)]]);if(missing!=='notes')responses.set('source-review.html','<p>fixture</p>');
  const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
  const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async url=>new Response(responses.get(url.pathname.slice('/reader/'.length)))});
  await assert.rejects(library.loadForNumber(1),missing==='references'?/source references/:/Offline comparison notes/);assert.equal(library.getEntry(1),undefined);
 }
});
