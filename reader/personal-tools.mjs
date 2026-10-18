import {store} from './store.js';
import {makeBackup,parseBackup,mergeBackup,maxBackupBytes} from './backup.mjs';
export function initPersonalTools({capture,refresh,prepareReload}){
 const $=selector=>document.querySelector(selector);let pending=null,undo=null,selection=0;
 const message=text=>{$('#backup-status').textContent=text;};
 $('#backup-export').onclick=()=>{
  capture();const backup=makeBackup(store.get()),blob=new Blob([JSON.stringify(backup,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`hadith-backup-${backup.exportedAt.slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  message('Backup prepared. Save the file in Files or another place you keep backups.');
 };
 $('#backup-file').onchange=async event=>{
  const token=++selection,file=event.target.files?.[0];pending=null;$('#backup-preview').hidden=true;message('');if(!file)return;
  try{
   if(file.size>maxBackupBytes)throw new Error('Choose a Hadith backup smaller than 1 MB.');
   const parsed=parseBackup(await file.text());if(token!==selection)return;pending=parsed;
   $('#backup-description').textContent=`${parsed.state.saved.length} ${parsed.state.saved.length===1?'bookmark':'bookmarks'} and ${parsed.state.finished.length} ${parsed.state.finished.length===1?'read mark':'read marks'}${parsed.exportedAt?' · saved '+new Date(parsed.exportedAt).toLocaleDateString():''}. Existing bookmarks and read marks will be kept.`;
   $('#backup-place').checked=false;$('#backup-preview').hidden=false;
  }catch(error){if(token===selection)message(error.message);}
 };
 $('#backup-apply').onclick=()=>{
  if(!pending)return;
  const restorePlace=$('#backup-place').checked;capture();const previous=structuredClone(store.get());
  try{store.replaceTransactional(mergeBackup(previous,pending.state,restorePlace));}
  catch{message('This browser could not save the restore. Your existing data has not changed. Try freeing some browser storage.');return;}
  undo=previous;pending=null;$('#backup-preview').hidden=true;$('#backup-file').value='';
  if(restorePlace){prepareReload();store.holdWrites();location.hash='#home';location.reload();return;}
  refresh();$('#backup-undo').hidden=false;message('Bookmarks and read marks merged. Your current reading place and preferences are unchanged.');
 };
 $('#backup-undo').onclick=()=>{
  if(!undo)return;
  try{store.replaceTransactional(undo);undo=null;$('#backup-undo').hidden=true;refresh();message('The previous saved data has been restored.');}
  catch{message('Undo could not be saved. Your current data is unchanged.');}
 };
 $('#settings').addEventListener('close',()=>{selection++;pending=null;undo=null;$('#backup-preview').hidden=true;$('#backup-undo').hidden=true;$('#backup-file').value='';message('');});
}
