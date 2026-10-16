import {parseRange} from './range.mjs';
const SHELL='hadith-pilot-shell-v4';
const AUDIO='hadith-pilot-audio-v1';
const shell=['./','./index.html','./style.css','./voices.html','./voices.css','./voices.js','./app.js','./tracks.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys()){if(name.startsWith('hadith-pilot-')&&name!==SHELL&&name!==AUDIO)await caches.delete(name);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 event.respondWith((async()=>{
  const isAudio=new URL(request.url).pathname.endsWith('.m4a');
  const cache=await caches.open(isAudio?AUDIO:SHELL);
  const stored=await cache.match(request.url);
  if(isAudio&&stored){
   const range=request.headers.get('range');
   if(!range)return stored;
   const data=await stored.arrayBuffer();const bounds=parseRange(range,data.byteLength);
   if(!bounds)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${data.byteLength}`}});
   const {start,end}=bounds;
   return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':stored.headers.get('content-type')||'audio/mp4','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${data.byteLength}`,'Accept-Ranges':'bytes'}});
  }
  // Prefer fresh pages online; retain the precached shell for offline starts.
  if(!isAudio){try{const response=await fetch(request);if(response.ok)return response;}catch{}if(stored)return stored;if(request.mode==='navigate')return await cache.match(new URL('./index.html',self.registration.scope).href)||Response.error();return Response.error();}
  return fetch(request);
 })());
});
