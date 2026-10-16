const key='mindfulmod-hadith-landscapes-v1';
const cards=[...document.querySelectorAll('.card')];
let saved=new Set();
try{const ids=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(ids))saved=new Set(ids.filter(id=>cards.some(c=>c.dataset.id===id)))}catch{}
let onlySaved=false;
const dialog=document.querySelector('dialog');
function render(){
  cards.forEach(card=>{const selected=saved.has(card.dataset.id);card.hidden=onlySaved&&!selected;const button=card.querySelector('.save');button.setAttribute('aria-pressed',String(selected));button.textContent=selected?'✓ Shortlisted':'+ Shortlist'});
  document.querySelector('#saved-filter').textContent='Shortlist · '+saved.size;
  document.querySelector('#all-filter').setAttribute('aria-pressed',String(!onlySaved));
  document.querySelector('#saved-filter').setAttribute('aria-pressed',String(onlySaved));
  document.querySelector('#empty').hidden=!onlySaved||saved.size>0;
  document.querySelector('#status').textContent=saved.size?saved.size+' selected · saved on this browser':'Tap an image to explore; shortlist what draws you in.';
  document.querySelector('#selection').textContent=saved.size?'Your shortlist: '+[...saved].sort().join(', '):'Choose a few favourites, then share their numbers in our chat.';
}
function toggle(id){saved.has(id)?saved.delete(id):saved.add(id);try{localStorage.setItem(key,JSON.stringify([...saved]))}catch{document.querySelector('#storage-note').hidden=false}render();if(dialog.open)updateDialogButton(id)}
function updateDialogButton(id){const button=document.querySelector('#dialog-save');button.dataset.id=id;button.setAttribute('aria-pressed',String(saved.has(id)));button.textContent=saved.has(id)?'✓ Shortlisted':'+ Shortlist'}
cards.forEach(card=>{
  card.querySelector('.save').addEventListener('click',()=>toggle(card.dataset.id));
  card.querySelector('.art').addEventListener('click',()=>{const img=card.querySelector('img');document.querySelector('#dialog-title').textContent=card.dataset.id+' · '+card.querySelector('h2').textContent;document.querySelector('#dialog-region').textContent=card.querySelector('.region').textContent;const large=document.querySelector('#dialog-image');large.src=img.src;large.alt=img.alt;updateDialogButton(card.dataset.id);dialog.showModal()});
});
document.querySelector('#dialog-save').addEventListener('click',event=>toggle(event.currentTarget.dataset.id));
document.querySelector('#close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
document.querySelector('#all-filter').addEventListener('click',()=>{onlySaved=false;render()});
document.querySelector('#saved-filter').addEventListener('click',()=>{onlySaved=true;render()});
render();
