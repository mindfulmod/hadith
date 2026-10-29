import {createLibrarySearch,searchCancelled} from './search.mjs';
const PROTOCOL=1;
const failure=()=>new Error('Search could not verify all available text');
export function createSearchClient({catalog,releaseId,loadLibrary,workerFactory=()=>new Worker(new URL('./search-worker.mjs',import.meta.url),{type:'module'}),stallMs=30000,yieldTask}){
 const sourceRecordSha256=catalog.sourceRecordSha256,summaries=new Map(catalog.entries.map((e,index)=>[e.number,{...e,index}]));
 let worker=null,workerUnavailable=false,fallback=null,active=null,serial=0;
 function finish(ticket,error,result){if(active!==ticket)return;clearTimeout(ticket.timer);active=null;if(error)ticket.reject(error);else ticket.resolve(result);}
 function progress(ticket){clearTimeout(ticket.timer);ticket.timer=setTimeout(()=>{if(active!==ticket)return;if(ticket.mode==='worker')useFallback(ticket);else{fallback=null;finish(ticket,failure());}},stallMs);}
 function stopWorker(){if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();worker=null;}}
 async function useFallback(ticket){
  stopWorker();workerUnavailable=true;if(active!==ticket)return;ticket.mode='fallback';progress(ticket);
  if(!fallback)fallback=createLibrarySearch({loadLibrary,sourceRecordSha256,yieldTask,onProgress:()=>{if(active?.mode==='fallback')progress(active);}});
  try{const result=await fallback.search(ticket.query,ticket.limit,ticket.offset,{isCurrent:()=>active===ticket});finish(ticket,null,result);}
  catch(error){finish(ticket,error);}
 }
 function validResult(result,ticket){
  if(!result||!Number.isSafeInteger(result.total)||result.total<0||result.total>catalog.entries.length||!Array.isArray(result.results)||result.results.length!==Math.min(ticket.limit,Math.max(0,result.total-ticket.offset)))return false;
  const seen=new Set();let previous=-1;
  for(const match of result.results){const summary=summaries.get(match?.entry?.number),position=summary?.index;if(!summary||summary.id!==match.entry.id||summary.book!==match.entry.book||seen.has(summary.number)||position<=previous||!['en','ar'].includes(match.language)||typeof match.text!=='string'||(match.sourceOrigin!==undefined&&match.sourceOrigin!=='printed-supplement'))return false;seen.add(summary.number);previous=position;}
  return true;
 }
 function ensureWorker(){
  if(worker)return worker;
  const instance=workerFactory();worker=instance;
  instance.onmessage=event=>{
   const ticket=active,message=event.data;if(!ticket||ticket.mode!=='worker'||worker!==instance||message?.id!==ticket.id)return;
   if(message.protocol!==PROTOCOL||message.releaseId!==releaseId||message.sourceRecordSha256!==sourceRecordSha256){stopWorker();finish(ticket,failure());return;}
   if(message.type==='progress'){progress(ticket);return;}
   if(message.type==='result'&&validResult(message.result,ticket)){finish(ticket,null,message.result);return;}
   // Content/version errors must never silently become partial or different results.
   stopWorker();finish(ticket,failure());
  };
  const broken=()=>{if(worker!==instance)return;if(active?.mode==='worker')useFallback(active);else{stopWorker();workerUnavailable=true;}};
  instance.onerror=event=>{event.preventDefault?.();broken();};
  instance.onmessageerror=broken;
  return instance;
 }
 function cancel(){const ticket=active;if(!ticket)return;finish(ticket,searchCancelled());if(worker)try{worker.postMessage({type:'cancel',id:ticket.id});}catch{stopWorker();workerUnavailable=true;}}
 return Object.freeze({
  search(query,{limit=30,offset=0}={}){
   cancel();if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0)return Promise.reject(new Error('Invalid search page'));
   const value=String(query).trim().slice(0,200);
   if(!value)return Promise.resolve({total:0,results:[]});
   return new Promise((resolve,reject)=>{
    const ticket={id:++serial,query:value,limit,offset,resolve,reject,mode:'worker',timer:null};active=ticket;
    if(workerUnavailable){useFallback(ticket);return;}
    try{const instance=ensureWorker();progress(ticket);instance.postMessage({protocol:PROTOCOL,type:'search',id:ticket.id,releaseId,sourceRecordSha256,query:value,limit,offset});}
    catch{useFallback(ticket);}
   });
  },cancel,dispose(){cancel();stopWorker();fallback=null;}
 });
}
