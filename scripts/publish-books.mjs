/* A reproducible publisher. It verifies recorded sign-offs; it cannot certify accuracy. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {publicJSON} from './public-json.mjs';
import {validateChapters} from '../reader/navigation.mjs';
import {validateSourceStructure} from '../reader/source-structure.mjs';
import {validateSourceReferences} from '../reader/source-references.mjs';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const objectHash=value=>digest(JSON.stringify(value));
const root=new URL('../',import.meta.url);
const json=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
// Deliberate version admissions keep prototype growth separate from human production reviews.
const prototypeAdmissions=json('content/review/prototype-admissions.json');
// Retained for the original two-entry evaluation and its regression fixtures.
const evaluationSourceHash='fea9b889d30bdc3ceb8e41de8cb390292905391d2079993ce69a85b138bd7f33';
function approval(record,hash,label){
 assert.equal(record?.status,'approved',label+' needs approval');
 assert.equal(record.reviewerKind,'human',label+' requires independent human review');
 assert.equal(record.sha256,hash,label+' approval is stale');
 assert(typeof record.reviewer==='string'&&record.reviewer.trim(),label+' needs a reviewer');
 assert(typeof record.reviewedAt==='string'&&Number.isFinite(Date.parse(record.reviewedAt)),label+' needs a review date');
 assert(Array.isArray(record.evidence)&&record.evidence.length&&record.evidence.every(v=>typeof v==='string'&&v.trim()),label+' needs evidence');
}
export function buildBooks(source,ledger,{production=false}={}){
 assert.equal(ledger.schemaVersion,1);assert.equal(ledger.namespace,'bukhari-opening-v1');
 assert.equal(ledger.sourceRecordSha256,objectHash(source),'Source metadata or text changed since its ledger was recorded');
 assert(Array.isArray(source.entries)&&source.entries.length,'No publishable entries');
 assert.equal(new Set(source.entries.map(e=>e.number)).size,source.entries.length,'Duplicate reference');
 assert.equal(new Set(source.entries.map(e=>e.id)).size,source.entries.length,'Duplicate source ID');
 assert.equal(ledger.entries.length,source.entries.length,'Every entry needs a ledger');
 assert.equal(new Set(ledger.entries.map(e=>e.number)).size,ledger.entries.length,'Duplicate review record');
 assert.equal(ledger.catalogContextSha256,objectHash(ledger.books),'Book grouping or labels changed since review');
 const mode=production?'production':ledger.publication;
 assert(['evaluation','personal-prototype','production'].includes(mode),'Unknown publication mode');
 if(mode==='production'){
  assert.equal(ledger.publication,'production','Evaluation text cannot enter a production collection');
  approval(ledger.rights,ledger.sourceRecordSha256,'Reuse rights');
  approval(ledger.collectionReview,ledger.catalogContextSha256,'Collection context');
 }else if(mode==='personal-prototype'){
  assert.equal(prototypeAdmissions.schemaVersion,1);
  const admission=prototypeAdmissions.admissions.find(a=>a.sourceRecordSha256===ledger.sourceRecordSha256&&(a.catalogContextSha256??objectHash(a.books))===ledger.catalogContextSha256);
  assert(admission,'Personal prototype source version is not admitted');
  assert.equal(admission.status,'personal-prototype-only');
  assert.equal(admission.catalogContextSha256??objectHash(admission.books),objectHash(admission.books),'Prototype context admission is stale');
  assert.deepEqual(source.entries.map(e=>e.id),admission.entryIds,'Personal prototype scope changed');
  assert.deepEqual(ledger.books,admission.books,'Personal prototype book context changed');
  assert.equal(source.prototypeReview?.status,'personal-prototype-only');
  assert.equal(source.prototypeReview.independentReview,'pending');
 }else{
  assert.deepEqual(ledger.books,[{id:'opening-revelation',number:1,title:source.entries[0].book,entryNumbers:[1,2]}],'Evaluation book context is fixed');
  assert.deepEqual(source.entries.map(e=>e.number),[1,2],'Evaluation is limited to the two existing entries');
  assert.equal(ledger.sourceRecordSha256,evaluationSourceHash,'Unapproved evaluation source change');
 }
 for(const entry of source.entries){
  assert(Number.isSafeInteger(entry.number)&&entry.number>0,'Invalid reference');
  assert(typeof entry.id==='string'&&entry.id,'Missing source ID');
  validateSourceStructure(entry);
  const record=ledger.entries.find(r=>r.number===entry.number);
  assert(record&&record.id===entry.id,'Missing review record');
  assert.equal(record.entrySha256,objectHash(entry),'Entry or context changed since review');
  const ar=digest(entry.arabic_blocks.join('\n\n')),en=digest(entry.english_blocks.join('\n\n'));
  assert.equal(entry.arabic_sha256,ar,'Arabic integrity mismatch');
  assert.equal(record.arabicSha256,ar,'Arabic review hash mismatch');assert.equal(record.englishSha256,en,'English review hash mismatch');
  if(mode==='production'){
   assert.equal(record.status,'approved','Unapproved entry');
   assert.deepEqual(record.unresolvedDiscrepancies,[],'Resolve discrepancies before publication');
   approval(record.arabicReview,ar,'Arabic');approval(record.englishReview,en,'English');approval(record.contextReview,record.entrySha256,'Chapter and reference context');
  }else assert.equal(record.status,mode==='personal-prototype'?'personal-prototype-only':'evaluation-only','Non-production status must stay explicit');
 }
 validateSourceReferences(ledger.sourceReferences,source.entries,{sourceRecordSha256:ledger.sourceRecordSha256});
 assert.equal(ledger.referencesSha256,objectHash(ledger.sourceReferences),'Source references changed since review');
 for(const row of ledger.sourceReferences.entries)assert.equal(row.entrySha256,objectHash(source.entries.find(e=>e.id===row.id)),'References do not match the exact entry');
 if(mode==='production')approval(ledger.referencesReview,ledger.referencesSha256,'Source references');
 const assigned=ledger.books.flatMap(b=>b.entryNumbers);
 assert.deepEqual(assigned,source.entries.map(e=>e.number),'Book order must assign each entry exactly once');
 assert.equal(new Set(ledger.books.map(b=>b.id)).size,ledger.books.length,'Duplicate book ID');
 const {entries,...sourceRecord}=source;
 // Collection metadata changes independently of a book’s exact entries and citations.
 // Preserve it once in the checked catalog; keep all review gates above unchanged.
 const catalog={schemaVersion:2,namespace:ledger.namespace,publication:mode,sourceRecordSha256:ledger.sourceRecordSha256,referencesSha256:ledger.referencesSha256,sourceRecord,books:[],entries:[]};
 const files=new Map();
 for(const book of ledger.books){
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id),'Invalid book ID');
  assert(Number.isSafeInteger(book.number)&&book.number>0&&typeof book.title==='string'&&book.title.trim(),'Missing book context');
  validateChapters(book);
  const selected=book.entryNumbers.map(n=>entries.find(e=>e.number===n));
  assert(selected.length,'Empty book');
  const referenceRows=ledger.sourceReferences.entries.filter(row=>book.entryNumbers.includes(row.number));
  const citedIds=new Set(referenceRows.flatMap(row=>row.citations.map(c=>c.sourceId)));
  const sourceReferences={schemaVersion:2,entriesSha256:objectHash(selected),sources:ledger.sourceReferences.sources.filter(s=>citedIds.has(s.id)),entries:referenceRows};
  const pack={schemaVersion:2,namespace:ledger.namespace,publication:mode,book:{id:book.id,number:book.number,title:book.title,...(book.sourceEntryCount!==undefined?{sourceEntryCount:book.sourceEntryCount}:{}),...(book.chapters?{chapters:book.chapters}:{}),...(book.introduction?{introduction:book.introduction}:{})},sourceReferences,entries:selected};
  const bytes=publicJSON(pack),sha256=digest(bytes),path=`books/${book.id}-${sha256.slice(0,16)}.json`;
  files.set(path,bytes);
  catalog.books.push({...book,path,bytes:Buffer.byteLength(bytes),sha256});
  catalog.entries.push(...selected.map(e=>({id:e.id,number:e.number,bookId:book.id,book:e.book,englishWords:e.english_blocks.join(' ').trim().split(/\s+/u).length})));
 }
 files.set('books/catalog.json',publicJSON(catalog));
 return {catalog,files};
}
export function publishBooks({check=false,production=false}={}){
 const result=buildBooks(json('research/bukhari-personal-collection.json'),json('content/review/personal-collection-ledger.json'),{production});
 const directory=new URL('reader/books/',root);
 if(!check)mkdirSync(directory,{recursive:true});
 for(const [path,bytes] of result.files){const url=new URL('reader/'+path,root);if(check)assert.equal(readFileSync(url,'utf8'),bytes,'Stale generated book file: '+path);else writeFileSync(url,bytes);}
 // Old content-addressed files are not silently deleted. Only this catalog is released.
 if(check)assert(readdirSync(directory).includes('catalog.json'));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=publishBooks({check:process.argv.includes('--check'),production:process.argv.includes('--production')});
 console.log(`${result.catalog.publication}: ${result.catalog.books.length} book pack, ${result.catalog.entries.length} complete entries; recorded text hashes checked.`);
}
