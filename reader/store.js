import {createPersonalStore} from './personal-state.mjs';
let storage;
try{storage=window.localStorage;}catch{storage={getItem(){throw new Error('Storage unavailable');},setItem(){throw new Error('Storage unavailable');}};}
export const store=createPersonalStore(storage);
window.HadithStore=store;
