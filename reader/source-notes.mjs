/* Keep bookmarked source-note fragments working without adding a Back-button hop. */
export function sourceNoteTarget(hash,href,base){
 let id;try{id=decodeURIComponent(hash.slice(1));}catch{return null;}
 if(!hash.startsWith('#')||!/^[a-z0-9-]+$/.test(id)||typeof href!=='string'||!/^notes\/[a-z0-9-]+\.html#[a-z0-9-]+$/.test(href))return null;
 const target=new URL(href,base),origin=new URL(base);
 return target.origin===origin.origin&&target.hash==='#'+id?target.href:null;
}
export function openSourceNote(window,document){
 let id;try{id=decodeURIComponent(window.location.hash.slice(1));}catch{return false;}
 const link=document.getElementById(id);
 if(!link?.hasAttribute('data-source-note'))return false;
 const target=sourceNoteTarget(window.location.hash,link.getAttribute('href'),window.location.href);
 if(!target)return false;
 try{window.location.replace(target);return true;}catch{return false;}
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
 openSourceNote(window,document);
 window.addEventListener('hashchange',()=>openSourceNote(window,document));
}
