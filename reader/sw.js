// Reader release: opening-6e3a632b3c83
import {release} from './release.mjs';
import {verifyResponse} from './integrity.mjs';
import {createOfflineStore,readerCacheName,verifiedCopy,releaseModuleSource} from './offline-store.mjs';
import {parseRange} from '../range.mjs';
const CACHE=readerCacheName(release),base=new URL('./',self.location.href),urlFor=path=>new URL(path,base).href;
const store=createOfflineStore({release,base,notify:state=>{
 self.clients.matchAll({type:'window'}).then(clients=>clients.forEach(client=>{
  if(client.url.startsWith(base.href))client.postMessage({type:'HADITH_OFFLINE_STATUS',...state});
 })).catch(()=>{});
}});
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const file of release.files.filter(f=>f.core)){
  const response=await fetch(urlFor(file.path),{cache:'reload'});
  await verifyResponse(response,file);await cache.put(urlFor(file.path),verifiedCopy(response,file));
 }
 await cache.put(urlFor('release.mjs'),new Response(releaseModuleSource(release),{headers:{'Content-Type':'text/javascript'}}));
})()));
// Wait for older reader clients to close. Never replace a playing page.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function audioInUse(packId){
 const pack=release.packs.find(p=>p.id===packId);if(!pack)return false;
 const clients=(await self.clients.matchAll({type:'window'})).filter(client=>{const u=new URL(client.url);return [base.pathname,base.pathname+'index.html',base.pathname+'audio-review.html'].includes(u.pathname);});
 const answers=await Promise.all(clients.map(client=>new Promise(resolve=>{
  const channel=new MessageChannel();let finished=false;
  const done=value=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();resolve(value);};
  const timer=setTimeout(()=>done(true),2000);
  channel.port1.onmessage=event=>done(event.data?.playing!==false);
  client.postMessage({type:'HADITH_AUDIO_IN_USE',files:pack.files},[channel.port2]);
 })));
 return answers.some(Boolean);
}
self.addEventListener('message',event=>{
 const data=event.data,port=event.ports?.[0];
 if(data?.type==='GET_READER_RELEASE'){port?.postMessage({release:release.id});return;}
 if(data?.type!=='HADITH_OFFLINE'||!port)return;
 event.waitUntil((async()=>{
  try{
   const client=event.source?.id&&await self.clients.get(event.source.id);
   if(data.release!==release.id||!client?.url.startsWith(base.href)){port.postMessage({ok:false,error:'version'});return;}
   if(data.action==='cancel'){store.cancel();port.postMessage({ok:true});return;}
   if(data.action==='remove'&&await audioInUse(data.packId)){port.postMessage({ok:false,error:'playing',state:store.state});return;}
   const state=data.action==='status'?await store.inspect():await store.run(data.action,data.packId);
   port.postMessage({ok:true,state});
  }catch(error){port.postMessage({ok:false,error:error.code||'storage',state:store.state});}
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==base.origin)return;
 const path=url.pathname===base.pathname||url.pathname===base.pathname+'index.html'?'index.html':url.pathname.startsWith(base.pathname)?url.pathname.slice(base.pathname.length):null;
 const known=release.files.find(f=>urlFor(f.path)===url.origin+url.pathname);
 if(!known&&path!=='index.html'&&path!=='release.mjs')return;
 event.respondWith((async()=>{
  if(req.cache==='reload')return fetch(req);
  const cache=await caches.open(CACHE),cached=await cache.match(urlFor(path==='index.html'?'index.html':known?.path||path));
  if(cached){
   if(req.headers.has('range')&&known?.audio){
    const bytes=await cached.arrayBuffer(),range=parseRange(req.headers.get('range'),bytes.byteLength);
    if(!range)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
    const headers=new Headers(cached.headers);headers.set('Content-Range',`bytes ${range.start}-${range.end}/${bytes.byteLength}`);headers.set('Content-Length',String(range.end-range.start+1));headers.set('Accept-Ranges','bytes');headers.delete('Content-Encoding');
    return new Response(bytes.slice(range.start,range.end+1),{status:206,headers});
   }
   return cached;
  }
  return fetch(req);
 })());
});
