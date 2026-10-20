import {release} from './release.mjs';
import {offlinePanel,formatBytes,offlineError} from './offline-view.mjs';
export {offlinePanel};
const base=new URL('./',import.meta.url);
let state=null,workerReady=false,updateReady=false,registration=null,lastUpdateCheck=0,pending=false,feedback=false,message='Checking this device…',estimate='';
const heartbeats=new Set();
const supported='serviceWorker' in navigator&&'caches' in window&&window.isSecureContext;
const notice=document.createElement('aside');notice.className='update-notice';notice.hidden=true;notice.setAttribute('aria-label','Reader update');notice.innerHTML='<span>A new reader version is ready.</span><a href="../update.html">Open update →</a>';document.querySelector('.topbar')?.after(notice);
const packName=id=>release.packs.find(p=>p.id===id)?.title||'downloads';
function summary(){
 const reading=state?.packs?.find(p=>p.id==='reading'),audio=state?.packs?.filter(p=>p.id!=='reading'&&p.ready)||[];
 if(reading?.ready)return audio.length?'Reading and your saved audio are ready offline.':'Reading is ready offline. Audio is a separate download.';
 return 'Save your reading and any audio you want before going offline.';
}
function show(){
 const operation=state?.operation,busy=pending||!!operation;notice.hidden=!updateReady;
 for(const row of document.querySelectorAll('[data-pack]')){
  const id=row.dataset.pack,pack=release.packs.find(p=>p.id===id),saved=state?.packs?.find(p=>p.id===id),button=row.querySelector('[data-save-pack]'),remove=row.querySelector('[data-remove-pack]');
  button.disabled=busy||!workerReady||!!saved?.ready;
  button.textContent=saved?.ready?'Saved ✓':pack.kind==='reading'?'Save reading':'Save audio';
  button.setAttribute('aria-label',`${saved?.ready?'Saved':pack.kind==='reading'?'Save reading':'Save audio'}: ${pack.title}${saved?.ready?' for offline use':''}`);
  row.querySelector('[data-pack-status]').textContent=!state?'Not checked yet':saved?.ready?'Ready offline':saved?.state==='ready'?'Audio saved; save reading to use offline':saved?.filesSaved?`${formatBytes(saved.bytesSaved)} already saved`:'Not saved';
  row.querySelector('[data-pack-status]').dataset.ready=String(!!saved?.ready);
  if(remove){remove.hidden=!saved?.filesSaved;remove.disabled=busy||!workerReady;}
 }
 let status=message;
 if(operation)status=operation.action==='save'?`Saving ${packName(operation.packId)}…`:operation.action==='check'?'Checking the saved files…':operation.action==='remove'?'Removing this audio download…':'Removing older reader downloads…';
 for(const el of document.querySelectorAll('[data-offline-status]')){if(el.textContent!==status)el.textContent=status;}
 const saving=operation?.action==='save';
 for(const el of document.querySelectorAll('.download-progress'))el.hidden=!saving;
 const percent=saving?Math.min(100,Math.floor(((operation.doneBytes||0)+(operation.fileBytes||0))/Math.max(1,operation.totalBytes||1)*100)):0;
 for(const el of document.querySelectorAll('[data-download-progress]'))el.value=percent;
 for(const el of document.querySelectorAll('[data-download-detail]'))el.textContent=`${percent}% · ${operation?.doneFiles||0} of ${operation?.totalFiles||0} files checked`;
 for(const el of document.querySelectorAll('[data-offline-check],[data-offline-cleanup]'))el.disabled=busy||!workerReady;
 for(const el of document.querySelectorAll('[data-saved-size]'))el.textContent=state?.packs?.length?formatBytes(state.packs.reduce((sum,p)=>sum+p.bytesSaved,0))+' saved for this version':'';
 for(const el of document.querySelectorAll('[data-old-downloads]'))el.hidden=!state?.oldVersions;
 for(const el of document.querySelectorAll('[data-storage-estimate]'))el.textContent=estimate;
}
export const refreshOffline=show;
function send(data){
 return new Promise((resolve,reject)=>{
  const worker=navigator.serviceWorker.controller;if(!worker){reject(new Error('Worker unavailable'));return;}
  const channel=new MessageChannel();let timer;
  const finish=(value,error)=>{clearTimeout(timer);heartbeats.delete(beat);channel.port1.close();error?reject(error):resolve(value);};
  const beat=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(null,new Error('Worker did not respond')),45000);};
  heartbeats.add(beat);beat();channel.port1.onmessage=event=>finish(event.data);channel.port1.onmessageerror=()=>finish(null,new Error('Unreadable worker reply'));
  worker.postMessage(data,[channel.port2]);
 });
}
const command=(action,packId)=>send({type:'HADITH_OFFLINE',release:release.id,action,packId});
async function storageEstimate(){
 try{const value=await navigator.storage?.estimate();estimate=Number.isFinite(value?.quota)&&Number.isFinite(value?.usage)?`Browser estimate: about ${formatBytes(Math.max(0,value.quota-value.usage))} available to this website. This space is shared with other MindfulMod pages; it is not a guarantee.`:'';}catch{estimate='';}show();
}
async function inspect(){
 if(!workerReady)return;
 try{const result=await command('status');if(result.ok&&result.state){state=result.state;if(!state.operation&&!pending){feedback=false;message=summary();}}else if(result.error){message=offlineError(result.error);if(result.error==='version')workerReady=false;}}catch{message='Saved downloads could not be checked. Reopen with a connection and try again.';}show();
}
async function perform(action,packId){
 if(pending||state?.operation||!workerReady)return;
 let succeeded=false;pending=true;feedback=false;message=action==='save'?`Preparing ${packName(packId)}…`:'Checking downloads…';show();
 try{
  const result=await command(action,packId);succeeded=!!result.ok;if(result.state)state=result.state;
  feedback=true;message=result.ok?action==='remove'?'Audio download removed. Your reading and bookmarks are kept.':action==='cleanup'?'Older downloads removed. This version and your bookmarks are kept.':summary():offlineError(result.error);
  if(result.ok&&action==='save')navigator.storage?.persist?.().catch(()=>{});
 }catch{feedback=true;message='The save could not be confirmed. Use Check downloads; finished files will be reused.';}
 finally{pending=false;show();storageEstimate();}
 if(action==='remove'||(action==='save'&&!succeeded))document.querySelector(`[data-save-pack="${packId}"]`)?.focus({preventScroll:true});
 else if(action==='save'||action==='cleanup'||action==='check')document.querySelector('[data-offline-check]')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.hasAttribute('data-save-pack'))perform('save',target.dataset.savePack);
 if(target.hasAttribute('data-remove-pack'))perform('remove',target.dataset.removePack);
 if(target.hasAttribute('data-offline-check'))perform('check');
 if(target.hasAttribute('data-offline-cleanup'))perform('cleanup');
 if(target.hasAttribute('data-offline-cancel'))command('cancel').catch(()=>{});
});
if(supported){
 navigator.serviceWorker.addEventListener('message',event=>{
  const data=event.data;
  if(data?.type==='HADITH_AUDIO_IN_USE'){
   const playing=[...document.querySelectorAll('audio')].some(audio=>!audio.paused&&!audio.ended&&data.files.some(path=>new URL(path,base).href===(audio.currentSrc||audio.src)));
   event.ports[0]?.postMessage({playing});return;
  }
  if(data?.type==='HADITH_OFFLINE_STATUS'&&data.release===release.id){state=data;for(const beat of heartbeats)beat();if(!state.operation&&!pending&&!feedback)message=summary();show();}
 });
 navigator.serviceWorker.register('./sw.js',{type:'module',scope:'./',updateViaCache:'none'}).then(async reg=>{
  registration=reg;
  const noticeUpdate=()=>{updateReady=!!reg.waiting;show();};reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',noticeUpdate));noticeUpdate();
  const controlled=()=>navigator.serviceWorker.controller?.scriptURL===new URL('sw.js',base).href;
  if(!controlled())await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('Worker not controlling'));},15000);function changed(){if(controlled()){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();}}navigator.serviceWorker.addEventListener('controllerchange',changed);changed();});
  const active=await send({type:'GET_READER_RELEASE'});
  if(active.release!==release.id){message=offlineError('version');show();return;}
  workerReady=true;await inspect();storageEstimate();noticeUpdate();
 }).catch(()=>{message='Offline setup did not finish. Reopen with a connection to try again.';show();});
}else{message='Offline saving needs Safari or another supported browser over HTTPS.';show();}
function checkForUpdate(){if(!registration||Date.now()-lastUpdateCheck<60000)return;lastUpdateCheck=Date.now();registration.update().catch(()=>{});}
window.addEventListener('pageshow',()=>{inspect();checkForUpdate();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){inspect();checkForUpdate();}});
