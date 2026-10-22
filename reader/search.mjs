/* Search normalization is only an index operation. Displayed source is untouched. */
export function searchKey(text){return String(text).normalize('NFC').toLocaleLowerCase('en').replace(/[‘’]/g,"'").replace(/\s+/gu,' ').trim();}
function matchResult(entry,language,block){
 const field=language==='en'?'english':'arabic';
 const printed=entry.presentation?.[field]?.some(r=>r.block===block&&r.provenance?.kind==='printed-supplement');
 return {entry,language,text:entry[field+'_blocks'][block],...(printed?{sourceOrigin:'printed-supplement'}:{})};
}
export function searchEntries(entries,input,limit=50,offset=0){
 const query=String(input).trim().slice(0,200).replace(/^"(.*)"$/s,'$1');
 if(!query)return {total:0,results:[]};
 const reference=query.match(/^(?:(?:sahih\s+al[- ]?bukhari|bukhari|hadith)\s*|#)?(\d+)$/i);
 const key=searchKey(query),matches=[];
 for(const e of entries){
  if(reference){if(e.number===Number(reference[1]))matches.push(matchResult(e,'en',e.english_blocks.length-1));continue;}
  for(const [language,blocks] of [['en',e.english_blocks],['ar',e.arabic_blocks||[]]]){
   const block=blocks.findIndex(text=>searchKey(text).includes(key));
   if(block>=0){matches.push(matchResult(e,language,block));break;}
  }
 }
 return {total:matches.length,results:matches.slice(Number.isSafeInteger(offset)&&offset>0?offset:0,(Number.isSafeInteger(offset)&&offset>0?offset:0)+limit)};
}
