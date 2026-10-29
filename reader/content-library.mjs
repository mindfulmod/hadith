import {validReference} from './references.mjs';
import {verifyResponse,objectDigest} from './integrity.mjs';
import {validateChapters} from './navigation.mjs';
import {validateSourceStructure} from './source-structure.mjs';
import {validateSourceReferences,externalSourceURL} from './source-references.mjs';
export const BOOK_CACHE_LIMITS=Object.freeze({books:4,bytes:4*1024*1024});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const requireValue=(value,message)=>{if(!value)throw new Error(message);};
function validateCatalog(catalog){
 requireValue([1,2].includes(catalog?.schemaVersion)&&catalog.namespace==='bukhari-opening-v1','Unsupported collection');
 requireValue(['evaluation','personal-prototype','production'].includes(catalog.publication),'Unknown publication status');
 if(catalog.schemaVersion===2){
  requireValue(catalog.sourceRecord&&Array.isArray(catalog.sourceRecord.sources)&&catalog.sourceRecord.license&&!Object.hasOwn(catalog.sourceRecord,'entries'),'Missing collection source trail');
  externalSourceURL(catalog.sourceRecord.license.url);
  requireValue(/^[a-f0-9]{64}$/.test(catalog.sourceRecordSha256)&&/^[a-f0-9]{64}$/.test(catalog.referencesSha256),'Invalid collection review hashes');
 }
 requireValue(Array.isArray(catalog.books)&&catalog.books.length>0&&Array.isArray(catalog.entries)&&catalog.entries.length>0,'Empty collection');
 const books=new Map(catalog.books.map(b=>[b.id,b]));
 requireValue(books.size===catalog.books.length,'Duplicate book');
 for(const b of catalog.books){
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.id)&&Number.isSafeInteger(b.number)&&b.number>0&&typeof b.title==='string','Invalid book');
  requireValue(typeof b.sha256==='string'&&/^[a-f0-9]{64}$/.test(b.sha256)&&b.path===`books/${b.id}-${b.sha256.slice(0,16)}.json`&&Number.isSafeInteger(b.bytes)&&b.bytes>0,'Invalid book download');
  requireValue(Array.isArray(b.entryNumbers)&&b.entryNumbers.length>0,'Empty book');
  validateChapters(b);
  for(const chapter of b.chapters||[])if(chapter.sourceContext)requireValue(typeof chapter.sourceContext.notes.path==='string','Missing chapter source path');
 }
 const numbers=new Set(),ids=new Set();
 for(const e of catalog.entries){
  requireValue(validReference(e.number)&&!numbers.has(e.number)&&typeof e.id==='string'&&!ids.has(e.id),'Duplicate or invalid reference');
  requireValue(books.has(e.bookId)&&typeof e.book==='string'&&Number.isSafeInteger(e.englishWords)&&e.englishWords>0,'Invalid entry metadata');
  numbers.add(e.number);ids.add(e.id);
 }
 requireValue(JSON.stringify(catalog.books.flatMap(b=>b.entryNumbers))===JSON.stringify(catalog.entries.map(e=>e.number)),'Book order mismatch');
 for(const b of catalog.books)requireValue(JSON.stringify(catalog.entries.filter(e=>e.bookId===b.id).map(e=>e.number))===JSON.stringify(b.entryNumbers),'Book references mismatch');
 return catalog;
}
export async function createContentLibrary({files,base=new URL('./',import.meta.url),fetcher=fetch,timeoutMs=15000,maxCachedBooks=BOOK_CACHE_LIMITS.books,maxCachedBytes=BOOK_CACHE_LIMITS.bytes}){
 requireValue(Number.isSafeInteger(maxCachedBooks)&&maxCachedBooks>0&&Number.isSafeInteger(maxCachedBytes)&&maxCachedBytes>0,'Invalid book cache limits');
 const descriptors=new Map(files.map(f=>[f.path,f]));
 async function read(file){
  const shipped=descriptors.get(file.path);
  requireValue(shipped&&shipped.bytes===file.bytes&&shipped.sha256===file.sha256,'Book does not belong to this reader release');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const response=await fetcher(new URL(file.path,base),{signal:controller.signal});await verifyResponse(response,file);return await response.json();}
  finally{clearTimeout(timer);}
 }
 const index=descriptors.get('books/catalog.json');requireValue(index,'Collection index unavailable');
 const catalog=freeze(validateCatalog(await read(index))),pending=new Map(),loaded=new Map();
 const summaries=new Map(catalog.entries.map(e=>[e.number,e])),bookDescriptors=new Map(catalog.books.map(b=>[b.id,b]));
 let cachedBytes=0;
 function cachedBook(id){const pack=loaded.get(id);if(pack){loaded.delete(id);loaded.set(id,pack);}return pack;}
 function remember(id,pack){
  loaded.set(id,pack);cachedBytes+=bookDescriptors.get(id).bytes;
  // Keep a whole book even when it alone exceeds the budget; never truncate source text.
  while(loaded.size>1&&(loaded.size>maxCachedBooks||cachedBytes>maxCachedBytes)){const oldest=loaded.keys().next().value;loaded.delete(oldest);cachedBytes-=bookDescriptors.get(oldest).bytes;}
 }
 for(const book of catalog.books)if(book.introduction)requireValue(descriptors.has(book.introduction.notes.path),'Offline book introduction is missing from this release');
 for(const book of catalog.books)for(const chapter of book.chapters||[])if(chapter.sourceContext)requireValue(descriptors.has(chapter.sourceContext.notes.path),'Offline chapter source notes are missing from this release');
 function loadBook(id){
  if(loaded.has(id))return Promise.resolve(cachedBook(id));
  if(pending.has(id))return pending.get(id);
  const descriptor=bookDescriptors.get(id);
  if(!descriptor)return Promise.reject(new Error('Book not in this collection'));
  const task=(async()=>{
   const pack=await read(descriptor);
   requireValue(pack.schemaVersion===catalog.schemaVersion&&pack.namespace===catalog.namespace&&pack.publication===catalog.publication,'Book version mismatch');
   requireValue(pack.book?.id===id&&pack.book.number===descriptor.number&&pack.book.title===descriptor.title,'Book identity mismatch');
   requireValue(pack.book.sourceEntryCount===descriptor.sourceEntryCount,'Source coverage mismatch');
   requireValue(JSON.stringify(pack.book.introduction)===JSON.stringify(descriptor.introduction),'Book introduction context mismatch');
   requireValue(JSON.stringify(pack.book.chapters)===JSON.stringify(descriptor.chapters),'Chapter context mismatch');
   if(catalog.schemaVersion===1)requireValue(pack.sourceRecord&&Array.isArray(pack.sourceRecord.sources)&&pack.sourceRecord.license,'Missing source trail');
   else requireValue(!Object.hasOwn(pack,'sourceRecord'),'Book contains conflicting collection metadata');
   requireValue(Array.isArray(pack.entries)&&JSON.stringify(pack.entries.map(e=>e.number))===JSON.stringify(descriptor.entryNumbers),'Incomplete book');
   for(const entry of pack.entries){
    const summary=summaries.get(entry.number);
    requireValue(entry.id===summary.id&&entry.book===summary.book,'Entry identity mismatch');
    validateSourceStructure(entry);
    requireValue(entry.english_blocks.join(' ').trim().split(/\s+/u).length===summary.englishWords,'Entry metadata mismatch');
   }
   requireValue(pack.sourceReferences?.schemaVersion===catalog.schemaVersion,'Missing or incompatible source references');
   validateSourceReferences(pack.sourceReferences,pack.entries,catalog.schemaVersion===1?{sourceRecordSha256:catalog.sourceRecordSha256,knownEntries:catalog.entries}:{entriesSha256:await objectDigest(pack.entries),knownEntries:catalog.entries});
   for(const [index,entry]of pack.entries.entries())requireValue(pack.sourceReferences.entries[index].entrySha256===await objectDigest(entry),'Reference entry hash mismatch');
   if(catalog.schemaVersion===2)pack.sourceRecord=catalog.sourceRecord;
   externalSourceURL(pack.sourceRecord.license.url);
   for(const row of pack.sourceReferences.entries)requireValue(descriptors.has(row.localNotes.path),'Offline comparison notes are missing from this release');
   freeze(pack);remember(id,pack);return pack;
  })();
  pending.set(id,task);
  task.finally(()=>{if(pending.get(id)===task)pending.delete(id);}).catch(()=>{});
  return task;
 }
 async function loadForNumber(number){const summary=summaries.get(number);requireValue(summary,'Hadith not in this collection');return loadBook(summary.bookId);}
 function getEntry(number){const summary=summaries.get(number);return cachedBook(summary?.bookId)?.entries.find(e=>e.number===number);}
 async function loadAllEntries(){
  // Explicit bulk consumer: hold returned entries, never depend on all books staying cached.
  const entries=[];for(const book of catalog.books)entries.push(...(await loadBook(book.id)).entries);
  return entries;
 }
 const cacheInfo=()=>Object.freeze({bookIds:Object.freeze([...loaded.keys()]),encodedBytes:cachedBytes,maxCachedBooks,maxCachedBytes});
 return Object.freeze({catalog,loadBook,loadForNumber,getEntry,loadAllEntries,cacheInfo});
}
