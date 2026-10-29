/* Normalization is only an index operation. Displayed source is untouched. */
export function searchKey(text){return String(text).normalize('NFC').toLocaleLowerCase('en').replace(/[‘’]/g,"'").replace(/\s+/gu,' ').trim();}
function queryParts(input){
 const query=String(input).trim().slice(0,200).replace(/^"(.*)"$/s,'$1');
 if(!query)return null;
 const reference=query.match(/^(?:(?:sahih\s+al[- ]?bukhari|bukhari|hadith)\s*|#)?(\d+)$/i);
 return {reference:reference?Number(reference[1]):null,key:searchKey(query)};
}
function matchResult(entry,language,block){
 const field=language==='en'?'english':'arabic';
 const printed=entry.presentation?.[field]?.some(r=>r.block===block&&r.provenance?.kind==='printed-supplement');
 return {entry,language,text:entry[field+'_blocks'][block],...(printed?{sourceOrigin:'printed-supplement'}:{})};
}
function page(matches,limit,offset){const start=Number.isSafeInteger(offset)&&offset>0?offset:0;return {total:matches.length,results:matches.slice(start,start+limit)};}
// Synchronous reference behavior remains available for source checks and small consumers.
export function searchEntries(entries,input,limit=50,offset=0){
 const query=queryParts(input);if(!query)return {total:0,results:[]};
 const matches=[];
 for(const e of entries){
  if(query.reference!==null){if(e.number===query.reference)matches.push(matchResult(e,'en',e.english_blocks.length-1));continue;}
  for(const [language,blocks] of [['en',e.english_blocks],['ar',e.arabic_blocks||[]]]){
   const block=blocks.findIndex(text=>searchKey(text).includes(query.key));
   if(block>=0){matches.push(matchResult(e,language,block));break;}
  }
 }
 return page(matches,limit,offset);
}
export const yieldSearchTask=()=>new Promise(resolve=>setTimeout(resolve,0));
export function searchCancelled(){const error=new Error('Search cancelled');error.name='AbortError';return error;}
const checkCurrent=current=>{if(!current())throw searchCancelled();};
// Retain exact snippets and matching keys, not full review records or citation trees.
function searchRow(entry){
 const blocks=(field)=>entry[field+'_blocks']?.map((text,block)=>({text,key:searchKey(text),...(entry.presentation?.[field]?.some(r=>r.block===block&&r.provenance?.kind==='printed-supplement')?{sourceOrigin:'printed-supplement'}:{})}))||[];
 return {entry:Object.freeze({id:entry.id,number:entry.number,book:entry.book}),en:blocks('english'),ar:blocks('arabic')};
}
function indexedMatch(row,language,block){const {text,sourceOrigin}=row[language][block];return {entry:row.entry,language,text,...(sourceOrigin?{sourceOrigin}:{})};}
async function appendRows(rows,entries,{yieldTask,batchSize}){
 await yieldTask();
 for(let start=0;start<entries.length;start+=batchSize){
  for(const entry of entries.slice(start,start+batchSize))rows.push(searchRow(entry));
  if(start+batchSize<entries.length)await yieldTask();
 }
}
function indexFromRows(rows,{yieldTask,batchSize}){
 let cachedKey=null,cachedMatches=null;
 return Object.freeze({async search(input,limit=50,offset=0,{isCurrent=()=>true}={}){
  checkCurrent(isCurrent);const query=queryParts(input);if(!query)return {total:0,results:[]};
  const cacheKey=JSON.stringify([query.reference,query.key]);
  if(cachedKey===cacheKey)return page(cachedMatches,limit,offset);
  const matches=[];
  await yieldTask();
  for(let start=0;start<rows.length;start+=batchSize){
   checkCurrent(isCurrent);
   for(const row of rows.slice(start,start+batchSize)){
    if(query.reference!==null){if(row.entry.number===query.reference)matches.push(indexedMatch(row,'en',row.en.length-1));continue;}
    for(const language of ['en','ar']){const block=row[language].findIndex(text=>text.key.includes(query.key));if(block>=0){matches.push(indexedMatch(row,language,block));break;}}
   }
   if(start+batchSize<rows.length)await yieldTask();
  }
  checkCurrent(isCurrent);cachedKey=cacheKey;cachedMatches=matches;
  return page(matches,limit,offset);
 }});
}
export async function createSearchIndex(entries,{yieldTask=yieldSearchTask,batchSize=32}={}){
 if(!Number.isSafeInteger(batchSize)||batchSize<1)throw new Error('Invalid search batch size');
 const rows=[];await appendRows(rows,entries,{yieldTask,batchSize});return indexFromRows(rows,{yieldTask,batchSize});
}
// Build one verified book at a time. A failed book never produces a partial index.
export function createLibrarySearch({loadLibrary,sourceRecordSha256,yieldTask=yieldSearchTask,onProgress=()=>{}}){
 let pending=null;
 const prepare=()=>{
  if(pending)return pending;
  const task=(async()=>{
   const library=await loadLibrary();
   if(library.catalog.sourceRecordSha256!==sourceRecordSha256)throw new Error('Search collection version mismatch');
   const rows=[],batchSize=32;let position=0;
   for(const book of library.catalog.books){
    onProgress();const pack=await library.loadBook(book.id);
    if(!Array.isArray(pack?.entries)||!pack.entries.length)throw new Error('Search collection is incomplete');
    for(const entry of pack.entries){const expected=library.catalog.entries[position++];if(!expected||entry.id!==expected.id||entry.number!==expected.number||entry.book!==expected.book)throw new Error('Search collection order mismatch');}
    await appendRows(rows,pack.entries,{yieldTask,batchSize});
   }
   if(position!==library.catalog.entries.length)throw new Error('Search collection is incomplete');
   onProgress();return indexFromRows(rows,{yieldTask,batchSize});
  })();
  pending=task;task.catch(()=>{if(pending===task)pending=null;});return task;
 };
 return Object.freeze({async search(query,limit=50,offset=0,options){return (await prepare()).search(query,limit,offset,options);}});
}
