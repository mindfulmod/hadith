/* Search normalization is only an index operation. Displayed source is untouched. */
export function searchKey(text){return String(text).normalize('NFC').toLocaleLowerCase('en').replace(/[‘’]/g,"'").replace(/\s+/gu,' ').trim();}
export function searchEntries(entries,input,limit=50){
 const query=String(input).trim().slice(0,200).replace(/^"(.*)"$/s,'$1');
 if(!query)return {total:0,results:[]};
 const reference=query.match(/^(?:(?:sahih\s+al[- ]?bukhari|bukhari|hadith)\s*|#)?(\d+)$/i);
 const key=searchKey(query),matches=[];
 for(const e of entries){
  if(reference){if(e.number===Number(reference[1]))matches.push({entry:e,language:'en',text:e.english_blocks.at(-1)});continue;}
  for(const [language,blocks] of [['en',e.english_blocks],['ar',e.arabic_blocks||[]]]){
   const text=blocks.find(block=>searchKey(block).includes(key));
   if(text!==undefined){matches.push({entry:e,language,text});break;}
  }
 }
 return {total:matches.length,results:matches.slice(0,limit)};
}
