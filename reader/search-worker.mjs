import {createLibrarySearch} from './search.mjs';
import {createContentLibrary} from './content-library.mjs';
import {release} from './release.mjs';
export const SEARCH_PROTOCOL=1;
// Exported for protocol tests; only the worker scope installs this handler.
export function createWorkerSearchHandler({releaseId,loadLibrary,post,yieldTask=()=>Promise.resolve()}){
 let latest=0,cancelled=false,sourceHash=null,engine=null;
 return async function handle(message){
  if(!message||!Number.isSafeInteger(message.id)||message.id<1)return;
  if(message.type==='cancel'){if(message.id>=latest){latest=message.id;cancelled=true;}return;}
  if(message.type!=='search'||message.id<=latest)return;
  latest=message.id;cancelled=false;const id=message.id;
  const reply=body=>{if(id===latest&&!cancelled)post({protocol:SEARCH_PROTOCOL,id,releaseId,sourceRecordSha256:message.sourceRecordSha256,...body});};
  if(message.protocol!==SEARCH_PROTOCOL||message.releaseId!==releaseId||!/^[a-f0-9]{64}$/.test(message.sourceRecordSha256)||typeof message.query!=='string'||message.query.length>200||!Number.isSafeInteger(message.limit)||message.limit<1||message.limit>50||!Number.isSafeInteger(message.offset)||message.offset<0){reply({type:'error',code:'version'});return;}
  if(sourceHash&&sourceHash!==message.sourceRecordSha256){reply({type:'error',code:'version'});return;}
  sourceHash=message.sourceRecordSha256;
  if(!engine)engine=createLibrarySearch({loadLibrary,sourceRecordSha256:sourceHash,yieldTask,onProgress:()=>{if(!cancelled)post({protocol:SEARCH_PROTOCOL,id:latest,releaseId,sourceRecordSha256:sourceHash,type:'progress'});}});
  try{
   reply({type:'progress'});
   const found=await engine.search(message.query,message.limit,message.offset,{isCurrent:()=>id===latest&&!cancelled});
   reply({type:'result',result:{total:found.total,results:found.results.map(({entry,...match})=>({entry:{id:entry.id,number:entry.number,book:entry.book},...match}))}});
  }catch(error){if(error.name!=='AbortError')reply({type:'error',code:'content'});}
 };
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
 const handle=createWorkerSearchHandler({releaseId:release.id,loadLibrary:()=>createContentLibrary({files:release.files}),post:message=>self.postMessage(message)});
 self.onmessage=event=>{handle(event.data);};
}
