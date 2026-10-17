import {release} from './release.mjs';
import {verifyResponse} from './integrity.mjs';
const CACHE='hadith-reader-'+release.id;
const base=new URL('./',import.meta.url);
let busy=false, ready=false, message='Checking this device…', workerReady=false, updateReady=false;
const supported='serviceWorker' in navigator && 'caches' in window && window.isSecureContext;
function show(){
 document.querySelectorAll('[data-download]').forEach(b=>{b.disabled=busy||!supported||!workerReady;b.textContent=busy?'Saving…':ready?'Check saved copy':'Save for offline';});
 document.querySelectorAll('[data-offline-status]').forEach(el=>{el.textContent=message+(updateReady?' An update is ready; close all reader windows and reopen.':'');el.dataset.ready=String(ready);});
}
export const refreshOffline=show;
async function complete(cache,deep=false){
 for(const file of release.files){const r=await cache.match(new URL(file.path,base));if(!r)return false;if(deep){try{await verifyResponse(r,file);}catch{return false;}}}
 return !!(await cache.match(new URL('release.mjs',base)));
}
async function check(){
 if(busy)return;busy=true;show();
 try{const cache=await caches.open(CACHE);ready=await complete(cache,true);message=ready?'Ready offline · both hadith, audio and artwork checked.':'Save the sample before switching to airplane mode.';}
 catch{ready=false;message='Offline storage is unavailable. You can still read online.';}
 finally{busy=false;show();}
}
async function save(){
 if(busy||!workerReady)return;
 busy=true;ready=false;let count=0;message='Saving the complete sample…';show();
 try{
  const cache=await caches.open(CACHE);
  for(const file of release.files){
   const url=new URL(file.path,base);let existing=await cache.match(url),valid=false;
   if(existing){try{await verifyResponse(existing,file);valid=true;}catch{}}
   if(!valid){const r=await fetch(url,{cache:'reload'});await verifyResponse(r,file);await cache.put(url,r);}
   message=`Saving and checking ${++count} of ${release.files.length} files…`;show();
  }
  if(!await complete(cache,true))throw new Error('Incomplete');
  ready=true;message='Ready offline · both hadith, audio and artwork checked.';
  // Requesting persistent storage is best effort; the ready check does not rely on it.
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
 }catch{message='Download unfinished. Keep this page open with a connection and try again. Saved files will be reused.';}
 finally{busy=false;show();}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-download]'))save();});
if(supported){
 navigator.serviceWorker.register('./sw.js',{type:'module',scope:'./',updateViaCache:'none'}).then(async reg=>{
  const noticeUpdate=()=>{updateReady=!!reg.waiting;show();};
  reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',noticeUpdate);});
  noticeUpdate();
  const expected=new URL('sw.js',base).href;
  const controlled=()=>navigator.serviceWorker.controller?.scriptURL===expected;
  if(!controlled())await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('Worker not controlling'));},15000);function changed(){if(controlled()){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}}navigator.serviceWorker.addEventListener('controllerchange',changed);changed();});
  workerReady=true;await check();
  noticeUpdate();
 }).catch(()=>{message='Offline setup did not finish. Reopen with a connection to try again.';show();});
}else{message='Offline saving needs Safari or another supported browser over HTTPS.';show();}
window.addEventListener('pageshow',()=>{if(workerReady)check();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&workerReady)check();});
