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
// Store normalized keys separately; never reconstruct display text from those keys.
export async function createSearchIndex(entries,{yieldTask=yieldSearchTask,batchSize=32}={}){
 if(!Number.isSafeInteger(batchSize)||batchSize<1)throw new Error('Invalid search batch size');
 const rows=[];
 await yieldTask();
 for(let start=0;start<entries.length;start+=batchSize){
  for(const entry of entries.slice(start,start+batchSize))rows.push({entry,en:entry.english_blocks.map(searchKey),ar:(entry.arabic_blocks||[]).map(searchKey)});
  if(start+batchSize<entries.length)await yieldTask();
 }
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
    const e=row.entry;
    if(query.reference!==null){if(e.number===query.reference)matches.push(matchResult(e,'en',e.english_blocks.length-1));continue;}
    for(const language of ['en','ar']){const block=row[language].findIndex(text=>text.includes(query.key));if(block>=0){matches.push(matchResult(e,language,block));break;}}
   }
   if(start+batchSize<rows.length)await yieldTask();
  }
  checkCurrent(isCurrent);cachedKey=cacheKey;cachedMatches=matches;
  return page(matches,limit,offset);
 }});
}
// A failed book never produces a partial index. A later request can retry.
export function createLibrarySearch({loadLibrary,sourceRecordSha256,yieldTask=yieldSearchTask,onProgress=()=>{}}){
 let pending=null;
 const prepare=()=>{
  if(pending)return pending;
  const task=(async()=>{
   const library=await loadLibrary();
   if(library.catalog.sourceRecordSha256!==sourceRecordSha256)throw new Error('Search collection version mismatch');
   for(const book of library.catalog.books){onProgress();await library.loadBook(book.id);await yieldTask();}
   const entries=library.catalog.entries.map(e=>library.getEntry(e.number));
   if(entries.some(e=>!e))throw new Error('Search collection is incomplete');
   onProgress();return createSearchIndex(entries,{yieldTask});
  })();
  pending=task;task.catch(()=>{if(pending===task)pending=null;});return task;
 };
 return Object.freeze({async search(query,limit=50,offset=0,options){return (await prepare()).search(query,limit,offset,options);}});
}
