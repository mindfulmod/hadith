/* Reproducible source inventory. It never writes into the public reader bundle. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),base=new URL('content/sources/openiti-bukhari/',root);
const sha=text=>createHash('sha256').update(text).digest('hex');
export function inventory(source,manifest){
 const lines=[];let offset=0;
 for(const text of source.split(/(?<=\n)/u)){lines.push({text,start:offset,end:offset+text.length});offset+=text.length;}
 const first=lines.findIndex(l=>l.text.trim()==='### | بدء الوحي');
 if(first<0)throw new Error('The known opening-book marker is missing. Review the source; do not guess.');
 const books=[{number:1,title:'بدء الوحي',line:first+1,start:lines[first].start}];
 for(let i=first+1;i<lines.length;i++){
  const match=lines[i].text.match(/^### \$ (\d+) -\s*(.*)/u);if(!match)continue;
  const title=match[2].trim()||lines[i+1]?.text.replace(/^# /u,'').trim();
  books.push({number:Number(match[1]),title,line:i+1,start:lines[i].start});
 }
 if(books.length!==97||books.some((b,i)=>b.number!==i+1))throw new Error('Unexpected book structure. Stop for source review.');
 const records=[],unclassifiedNumeric=[];
 for(let i=0;i<books.length;i++){
  const book=books[i];book.end=books[i+1]?.start??source.length;book.sha256=sha(source.slice(book.start,book.end));book.records=[];
  const inBook=lines.filter(l=>l.start>=book.start&&l.start<book.end);
  for(let j=0;j<inBook.length;j++){
   const line=inBook[j],match=line.text.match(/^(?:### \||#) (\d+)(?: ms\d+)?\s*-\s*$/u);
   if(!match){if(/^### \| \d/u.test(line.text))unclassifiedNumeric.push({line:lines.indexOf(line)+1,book:book.number,text:line.text.trim()});continue;}
   let end=j+1;
   while(end<inBook.length){const text=inBook[end].text;if(/^(?:### \| \d+(?: ms\d+)?\s*-|# \d+(?: ms\d+)?\s*-)/u.test(text)||(/^### [|$]/u.test(text)&&!/^### \| \[ص:/u.test(text)))break;end++;}
   const stop=inBook[end]?.start??book.end,raw=source.slice(line.start,stop);
   // Only classify the presence of a body. No cleaned Arabic text is emitted.
   const body=raw.split('\n').slice(1).join('\n').replace(/^### .*$/gm,'').replace(/PageV\d+P\d+|ms\d+/gu,'').replace(/[#~\s]/gu,'');
   const record={id:`${manifest.id}:b${book.number}:r${book.records.length+1}`,book:book.number,number:Number(match[1]),line:lines.indexOf(line)+1,start:line.start,end:stop,sha256:sha(raw),status:'unreviewed',issues:body?'': 'empty-numbered-record'};
   book.records.push(record.id);records.push(record);
  }
 }
 const counts=new Map();for(const r of records)counts.set(r.number,(counts.get(r.number)||0)+1);
 const [low,high]=manifest.expectedNumberRange,missing=[];for(let n=low;n<=high;n++)if(!counts.has(n))missing.push(n);
 return {schema:1,sourceId:manifest.id,sourceSha256:sha(source),offsetUnit:'JavaScript UTF-16 code units; end exclusive',status:'candidate-not-approved',readerEligible:false,books,records,audit:{bookCount:books.length,recordCount:records.length,uniqueNumbers:counts.size,missingNumbers:missing,duplicateNumbers:[...counts].filter(([,count])=>count>1).map(([number,count])=>({number,count})),emptyRecords:records.filter(r=>r.issues).map(r=>r.number),unclassifiedNumericHeadings:unclassifiedNumeric,limitations:['A marker count is not a content-completeness check.','Every record requires Arabic witness comparison, numbering validation and a licensed or reviewed English text before publication.','Raw source retains front matter, chapter material, page references and editorial text. None is silently merged into a narration.']}};
}
export function buildInventory(){
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
 for(const f of manifest.files){const b=readFileSync(new URL(f.path,base));if(b.length!==f.bytes||sha(b)!==f.sha256)throw new Error('Source integrity failed: '+f.path);}
 return inventory(readFileSync(new URL('source.mARkdown',base),'utf8'),manifest);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=buildInventory(),output=new URL('content/staging/bukhari-ar/catalog.json',root),serialized=JSON.stringify(result,null,2)+'\n';
 if(process.argv.includes('--check')){if(readFileSync(output,'utf8')!==serialized)throw new Error('Staged catalogue is stale; rebuild and review the changes.');}
 else{mkdirSync(new URL('content/staging/bukhari-ar/',root),{recursive:true});writeFileSync(output,serialized);}
 console.log(JSON.stringify(result.audit,null,2));
}
