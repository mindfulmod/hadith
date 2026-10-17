// Reader release: opening-f0e700648d49
import {release} from './release.mjs';
import {verifyResponse} from './integrity.mjs';
import {parseRange} from '../range.mjs';
const CACHE = 'hadith-reader-' + release.id;
const base = new URL('./',self.location.href);
const urlFor = path => new URL(path,base).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const file of release.files.filter(f=>f.core)) {
  const response=await fetch(urlFor(file.path),{cache:'reload'});
  await verifyResponse(response,file); await cache.put(urlFor(file.path),response);
 }
 // The release file is the manifest and cannot include its own hash.
 const manifest=await fetch(urlFor('release.mjs'),{cache:'reload'});
 if(!manifest.ok)throw new Error('Release manifest unavailable');
 await cache.put(urlFor('release.mjs'),manifest);
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// A new release waits for open reader windows to close. Never replace a playing page.
self.addEventListener('fetch',event=>{
 const req=event.request, url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==base.origin)return;
 const path=url.pathname===base.pathname||url.pathname===base.pathname+'index.html'?'index.html':url.pathname.startsWith(base.pathname)?url.pathname.slice(base.pathname.length):null;
 const known=release.files.find(f=>urlFor(f.path)===url.origin+url.pathname);
 if(!known&&path!=='index.html'&&path!=='release.mjs')return;
 event.respondWith((async()=>{
  if(req.cache==='reload')return fetch(req);
  const cache=await caches.open(CACHE);
  const cached=await cache.match(urlFor(path==='index.html'?'index.html':known?.path||path));
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
