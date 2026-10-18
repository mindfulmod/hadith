import {normalizeState,isRecord,validNumber} from './personal-state.mjs';
export const backupFormat='mindfulmod-hadith-backup';
export const maxBackupBytes=1048576;
const namespace='bukhari-opening-v1';
export function makeBackup(state,now=new Date()){
 return {format:backupFormat,version:1,namespace,exportedAt:now.toISOString(),state:normalizeState(state)};
}
export function parseBackup(text){
 if(new TextEncoder().encode(text).length>maxBackupBytes)throw new Error('This file is too large. Choose a Hadith backup smaller than 1 MB.');
 let file;try{file=JSON.parse(text,(key,value)=>{if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsafe key');return value;});}catch{throw new Error('This is not a readable Hadith backup. Your saved data has not changed.');}
 if(!isRecord(file)||file.format!==backupFormat||file.version!==1||file.namespace!==namespace)throw new Error('This backup belongs to another app or an unsupported version. Your saved data has not changed.');
 const s=file.state;
 if(!isRecord(s)||!Array.isArray(s.saved)||!Array.isArray(s.finished)||!s.saved.every(validNumber)||!s.finished.every(validNumber)||!isRecord(s.positions)||!validNumber(s.last))throw new Error('This backup contains invalid reading data. Nothing has been restored.');
 if(!Object.entries(s.positions).every(([n,y])=>/^\d+$/.test(n)&&validNumber(Number(n))&&Number.isFinite(y)&&y>=0&&y<=10000000))throw new Error('This backup contains invalid reading positions. Nothing has been restored.');
 const normalized=normalizeState(s);
 return {state:normalized,exportedAt:typeof file.exportedAt==='string'&&!Number.isNaN(Date.parse(file.exportedAt))?new Date(file.exportedAt).toISOString():null};
}
export function mergeBackup(current,backup,restorePlace=false){
 const a=normalizeState(current),b=normalizeState(backup);
 const merged={...a,...(restorePlace?b:{}),saved:[...new Set([...a.saved,...b.saved])],finished:[...new Set([...a.finished,...b.finished])],positions:restorePlace?{...a.positions,...b.positions}:{...b.positions,...a.positions}};
 if(restorePlace&&!b.session)delete merged.session;
 return normalizeState(merged);
}
