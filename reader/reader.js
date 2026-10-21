import {createContentLibrary} from './content-library.mjs';
import {release} from './release.mjs';
import {store} from './store.js';
import {collectionView,bookView,savedView,mountSearch,mountBookJump} from './library.mjs';
import {libraryRoute,bookForNumber,chapterForNumber,bookRoute} from './navigation.mjs';
import {initPersonalTools} from './personal-tools.mjs';
import {listen,listenAlong,resumeListening,prepareListening,getPlaybackState} from './audio.mjs';
import {refreshOffline,offlinePanel} from './offline.mjs';
import {resolveSession,followTarget,readingSeconds,startSession,nextSession,visitSession} from './session.mjs';
import {recording,recordedChapter} from './recording.mjs';
import {sourceHTML} from './source-format.mjs';
import {narrationHTML} from './source-structure.mjs';
import {sourceDialogHTML,sourceContextHTML} from './source-references.mjs';
/* Source blocks are rendered verbatim. Personal session state never changes them. */
function startReader(library) {
 const $=s=>document.querySelector(s), data=library.catalog;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const media=matchMedia('(prefers-color-scheme: dark)');
 let current=null, mode='home', scrollTimer, restoring=false, startingAudio=false, autoDestination=null, renderVersion=0;
 const announce=text=>{$('#status').textContent=text;};
 const write=patch=>{store.set(patch);if(!store.available())announce('Your browser could not save your place. You can keep reading.');};
 const entry=n=>data.entries.find(e=>e.number===n);
 const session=()=>resolveSession(data.entries,store.get().session,store.get().minutes,store.get().last);
 const duration=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
 write({session:session()});
 function appearance(){
  const s=store.get(),night=s.theme==='night'||(s.theme==='device'&&media.matches);
  document.documentElement.dataset.theme=night?'night':'day';
  document.documentElement.style.setProperty('--size',s.size+'px');
  document.documentElement.style.setProperty('--leading',s.spacious?'2':'1.75');
  document.documentElement.style.setProperty('--reading',s.font==='sans'?'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif':'"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif');
  document.body.classList.toggle('no-art',!s.art);
  $('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  for(const [attribute,key] of [['theme-choice','theme'],['size','size'],['font','font'],['minutes','minutes']])document.querySelectorAll('[data-'+attribute+']').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-'+attribute)===String(s[key]))));
  $('#more-space').checked=s.spacious;$('#show-art').checked=s.art;$('#follow-audio').checked=s.followAudio;
 }
 function home(){
  const s=store.get(),plan=session(),begun=plan.numbers.some(n=>Object.hasOwn(s.positions,n)),ended=plan.ended,count=plan.numbers.length;
  const books=[...new Set(plan.numbers.map(n=>entry(n).bookId))].map(id=>data.books.find(b=>b.id===id));
  const seconds=plan.numbers.reduce((sum,n)=>sum+readingSeconds(entry(n)),0),upcoming=nextSession(data.entries,plan,s.minutes);
  const sameRecording=JSON.stringify(plan.numbers)===JSON.stringify(recording.chapters.map(c=>c.number));
  const countText=count===1?'One':count===2?'Two':count;
  return `<section class="session-start" aria-labelledby="session-title"><p class="eyebrow">${ended?'YOUR FINISHED SESSION':'YOUR CURRENT SESSION'} · ${books.length===1?'BOOK '+String(books[0].number).padStart(2,'0'):books.length+' BOOKS'}</p><div class="session-invitation"><div><h1 id="session-title">A little time.<br>${countText} hadith.</h1><p class="session-context">${escape(books[0].title)}${books.length>1?`<br><span>Continuing through ${escape(books.at(-1).title)}</span>`:''}<span>Sahih al-Bukhari · in book order</span></p></div><div class="session-art" role="img" aria-label="An imagined warm limestone garden with quiet water."></div></div><div class="session-actions">${ended?(upcoming?`<button class="primary" data-next-session>Next session <span aria-hidden="true">→</span></button>`:'<button class="primary" data-restart>Read this session again <span aria-hidden="true">→</span></button>'):`<a class="primary" href="#read/${plan.cursor}">${begun?'Continue':'Begin reading'} <span aria-hidden="true">→</span></a>`}${sameRecording?`<button data-listen-resume class="listen-choice">${getPlaybackState().playing?'Return to listening':s.audio?.seconds>0?'Resume listening':'Listen to this session'} <span>${duration(recording.duration)} total</span></button>`:`<a href="#listen/${recording.chapters[0].number}" class="listen-choice">Opening audio sample <span>${recording.chapters.length} recorded hadith</span></a>`}</div><ol class="session-path">${plan.numbers.map(n=>{const audio=recordedChapter(n);return `<li ${n===plan.cursor?'class="current"':''}><a href="#read/${n}" ${n===plan.cursor?'aria-current="step"':''}><span class="path-number">${String(n).padStart(2,'0')}</span><span><strong>Hadith ${n}</strong><small>${s.finished.includes(n)?'Marked as read':n===plan.cursor&&begun?'Your session place':'Full narration and narrator chain'}</small></span><span class="path-time">${audio?duration(audio.duration):'~'+Math.max(1,Math.ceil(readingSeconds(entry(n))/60))+' min'}<small>${audio?'audio':'reading'}</small></span></a></li>`;}).join('')}</ol><p class="sample-note">About ${Math.max(1,Math.ceil(seconds/60))} ${Math.max(1,Math.ceil(seconds/60))===1?'minute':'minutes'} of reading, at your pace. ${seconds>s.minutes*60?'This session runs longer than your preference so the final hadith stays complete. ':''}Your ${s.minutes}-minute preference applies when you start a new session. <button class="text-button" data-open-settings>Change preference</button></p><a class="quiet-link" href="#collection">Browse the collection <span aria-hidden="true">→</span></a>${data.publication!=='production'?'<p class="review-note">Personal prototype · AI-assisted English · Independent review pending<br>Cedar audio is available for Hadith 1–2.</p>':''}${offlinePanel(release)}</section>`;
 }
 function sessionTrack(n){const plan=session(),index=plan.numbers.indexOf(n);return `<div class="session-topline"><a href="#home">Your current session</a><span>${index<0?'Browsing freely':`${index+1} of ${plan.numbers.length} in this session`}</span></div>`;}
 function neighbors(number){const index=data.entries.findIndex(e=>e.number===number);return {previous:data.entries[index-1],next:data.entries[index+1]};}
 function nextControl(number,compact=false){const {next}=neighbors(number);return next?`<a class="primary" data-read-step href="#read/${next.number}" aria-label="Next hadith, Hadith ${next.number}">${compact?'Next':'Next hadith'} <span aria-hidden="true">→</span></a>`:session().numbers.includes(number)?`<button class="primary" data-end-session>${compact?'Finish':'Finish this session'}</button>`:'<a class="primary" href="#collection">Collection →</a>';}
 function reader(e,pack){
  const s=store.get(),{previous,next}=neighbors(e.number),plan=session(),book=bookForNumber(data,e.number),chapter=chapterForNumber(book,e.number);
  return `<article class="reading" aria-labelledby="hadith-title">${sessionTrack(e.number)}<div class="reading-art" aria-hidden="true"></div><header class="reading-heading"><div><p class="reference"><a href="${bookRoute(book)}">Book ${String(book.number).padStart(2,'0')} · ${escape(book.title)}</a></p><h1 id="hadith-title">Hadith ${e.number}</h1></div><button id="bookmark" class="bookmark" aria-pressed="${s.saved.includes(e.number)}">${s.saved.includes(e.number)?'Saved ✓':'Save'}</button></header>${chapter?`<p class="chapter-context"><a href="${bookRoute(book,chapter)}">${sourceHTML(chapter.title)}</a></p>`:''}<button class="status-link" data-sources="${e.number}">English · ${data.publication!=='production'?'Personal prototype · Working translation · ':''}Source details</button>${sourceContextHTML(pack.sourceReferences,e.number)}${narrationHTML(e)}<footer class="reading-end"><p class="eyebrow">END OF HADITH ${e.number}</p><nav class="end-actions" aria-label="Continue reading">${previous?`<a data-read-step href="#read/${previous.number}">← Previous hadith</a>`:'<a href="#home">Your session</a>'}${nextControl(e.number)}</nav>${next&&e.number===plan.numbers.at(-1)?'<button data-end-session class="session-pause">Finish this session here</button>':''}<button id="finish" aria-pressed="${s.finished.includes(e.number)}">${s.finished.includes(e.number)?'Marked as read ✓':'Mark as read'}</button><p class="sample-note">Move through the hadith at your own pace. Read markers are optional.</p><div class="start-from-here"><button data-start-session="${e.number}">Start a session here</button><p class="sample-note">A new ${s.minutes}-minute reading plan, starting with Hadith ${e.number}. Your bookmarks and read marks are kept.</p></div>${data.publication!=='production'?'<p class="review-note">Full narrator introduction is available above. AI-assisted English; independent scholarly review is pending.</p>':''}</footer></article>`;
 }
 function listening(){return `<section class="listening-room" aria-labelledby="listening-title"><div class="listening-scene" role="img" aria-label="A still, imagined limestone garden in warm light."></div><div class="listening-heading"><p class="eyebrow">${escape(bookForNumber(data,recording.chapters[0].number).title)}</p><h1 id="listening-title">Hadith <span data-playing-number>${recording.chapters[0].number}</span></h1><p>${recording.chapters.length} complete recorded hadith · full narrator chains</p><p class="review-note">Cedar Take A · AI narration under review</p></div></section>`;}
 function queue(){return `<section class="listening-queue" aria-labelledby="queue-title"><h2 id="queue-title">In this recording</h2>${recording.chapters.map(c=>`<button data-listen="${c.number}" aria-label="Play Hadith ${c.number}"><span><span class="queue-number">${String(c.number).padStart(2,'0')}</span> Hadith ${c.number}</span><span>${duration(c.duration)} <span aria-hidden="true">▷</span></span></button>`).join('')}<p class="sample-note">These entries play in order, then stop. Listening does not change your reading marks or replace your session.</p></section>`;}
 function end(){const plan=session(),upcoming=nextSession(data.entries,plan,store.get().minutes);return `<section class="session-end"><div class="reading-art" aria-hidden="true"></div><p class="eyebrow">A PLACE TO PAUSE</p><h1>A little time,<br>well spent.</h1><p>This session contains ${plan.numbers.length} complete hadith. Your read marks are kept separately.</p><div class="end-record">${plan.numbers.map(n=>`<a href="#read/${n}">Hadith ${n}<span>${store.get().finished.includes(n)?'Marked as read ✓':'Not marked as read'}</span></a>`).join('')}</div>${upcoming?`<button class="primary" data-next-session>Next session · Hadith ${upcoming.cursor} <span aria-hidden="true">→</span></button><p class="sample-note">About ${store.get().minutes} minutes, finishing at a complete hadith.</p>`:'<p class="sample-note">You’ve reached the end of the currently available hadith. You can return to this session whenever you wish.</p><button class="primary" data-restart>Read this session again →</button>'}<a class="quiet-link" href="#collection">Browse the collection</a><a class="quiet-link" href="#home">Back to your session</a></section>`;}
 async function sourceDialog(number){
  const route=location.hash;
  let pack;try{pack=await library.loadForNumber(number);}catch{announce('Sources could not load. Reconnect and try Arabic & sources again.');return;}
  if(location.hash!==route)return;
  const e=library.getEntry(number);
  $('#source-title').textContent=`Hadith ${e.number} · Arabic & sources`;
  $('#source-content').innerHTML=sourceDialogHTML(e,pack,{hasAudio:!!recordedChapter(e.number)});
  $('#sources').showModal();
 }
 function revealChains(){document.querySelectorAll('.reading .chain').forEach(chain=>{chain.open=true;});}
 function capture(){if(current&&!restoring)write({positions:{...store.get().positions,[current]:window.scrollY}});}
 function updateListening(){
  const state=getPlaybackState();
  document.querySelectorAll('[data-playing-number]').forEach(el=>el.textContent=state.number);
  document.querySelectorAll('[data-read-playing]').forEach(el=>{el.href=`#read/${state.number}`;el.textContent=`Read Hadith ${state.number}`;});
  document.querySelectorAll('[data-sources-playing]').forEach(el=>el.dataset.sources=state.number);
  document.querySelectorAll('.listening-queue [data-listen]').forEach(el=>{if(Number(el.dataset.listen)===state.number)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
  $('#audio-room').href=`#listen/${state.number}`;
  $('#audio-follow').setAttribute('aria-pressed',String(store.get().followAudio));
  $('#audio-follow').textContent=store.get().followAudio?'Follow ✓':'Follow';
  $('#follow-audio').checked=store.get().followAudio;
  const target=followTarget({enabled:store.get().followAudio,mode,current,chapter:state.number,playing:state.playing,blocked:restoring||startingAudio||document.hidden||$('#sources').open||$('#settings').open});
  if(target!==null&&entry(target)&&autoDestination!==target){
   autoDestination=target;location.replace(`#read/${target}`);
  }
 }
 function setFollow(enabled){write({followAudio:enabled});updateListening();}
 function stopFollowingForNavigation(){if(getPlaybackState().active&&store.get().followAudio){write({followAudio:false});announce('Follow is off. You can browse while the audio continues.');updateListening();}}

 function dock(){
  if(mode==='read'){
   const {previous}=neighbors(current);
   return `${previous?`<a data-read-step href="#read/${previous.number}" aria-label="Previous hadith, Hadith ${previous.number}">← Previous</a>`:'<button disabled aria-label="No previous hadith">← Previous</button>'}<button data-sources="${current}">Arabic & sources</button>${recordedChapter(current)?`<button data-reading-listen data-listen="${current}">Listen ▷</button>`:'<button disabled aria-label="Listen: audio is not yet available for this hadith" title="Audio is not yet available for this hadith">No audio yet</button>'}<a data-session-return href="#home">Session</a>${nextControl(current,true)}`;
  }
  return mode==='listen'?`<a href="#home">Session</a><a data-read-playing href="#read/1">Read Hadith 1</a><button data-sources-playing data-sources="1">Arabic & sources</button>`:`<a href="#home" ${mode==='home'||mode==='end'?'aria-current="page"':''}>Session</a><a href="#collection" ${mode==='collection'||mode==='book'?'aria-current="page"':''}>Collection</a><a href="#saved" ${mode==='saved'?'aria-current="page"':''}>Saved <span id="saved-count">${store.get().saved.length||''}</span></a>`;
 }
 async function render(){
  const version=++renderVersion;
  capture();clearTimeout(scrollTimer);
  const hash=location.hash||'#home',match=hash.match(/^#(read|listen)\/(\d+)(?:\/(chain))?$/),chainRequested=match?.[1]==='read'&&match[3]==='chain',valid=match&&(!match[3]||chainRequested)&&entry(Number(match[2]))&&(match[1]==='read'||recordedChapter(Number(match[2])));
  const libraryLocation=libraryRoute(hash,data),audioMissing=match?.[1]==='listen'&&!match[3]&&entry(Number(match[2]))&&!recordedChapter(Number(match[2]));
  const main=$('#main');let currentPack;
  if(valid&&match[1]==='read'){
   restoring=true;main.setAttribute('aria-busy','true');
   if(!library.getEntry(Number(match[2]))){mode='loading';document.body.dataset.view='home';$('#dock').innerHTML='<a href="#home">Session</a><a href="#collection">Collection</a>';main.innerHTML='<section class="collection"><h1>Opening your hadith…</h1><p role="status">Loading the complete text and source references.</p></section>';}
   try{currentPack=await library.loadForNumber(Number(match[2]));}
   catch{if(version!==renderVersion)return;current=null;mode='error';restoring=false;$('#listening-support').innerHTML='';document.body.dataset.view='home';main.removeAttribute('aria-busy');main.innerHTML='<section class="collection"><h1>This hadith could not open.</h1><p>The complete text could not be downloaded and checked. Reconnect and try again. Your saved place is unchanged.</p><button class="primary" data-retry-content>Try again</button><p><a href="#home">Back to your session</a></p></section>';$('#dock').innerHTML=dock();main.focus();return;}
  }
  if(version!==renderVersion)return;main.removeAttribute('aria-busy');
  mode=valid?match[1]:audioMissing?'audio-missing':libraryLocation?libraryLocation.mode:hash==='#end'?'end':/^#(?:read|listen|book|collection|saved)(?:\/|$)/.test(hash)?'missing':'home';
  current=mode==='read'?Number(match[2]):null;
  const automatic=current!==null&&autoDestination===current;autoDestination=null;
  // A manual route (including Back) wins over audio following.
  if(current&&!automatic&&getPlaybackState().active&&getPlaybackState().number!==current)write({followAudio:false});
  if(automatic)write({positions:{...store.get().positions,[current]:0}});
  restoring=true;
  document.body.dataset.view=mode;
  $('#listening-support').innerHTML='';
  if(current){write({last:current,session:visitSession(session(),current)});main.innerHTML=reader(library.getEntry(current),currentPack);document.title=`Hadith ${current} · Sahih al-Bukhari`;}
  else if(mode==='listen'){prepareListening(Number(match[2]));main.innerHTML=listening();$('#listening-support').innerHTML=queue();document.title='Listen · Sahih al-Bukhari';}
  else if(mode==='collection'){main.innerHTML=collectionView(data,store.get(),libraryLocation.page);document.title='Collection · Sahih al-Bukhari';}
  else if(mode==='book'){main.innerHTML=bookView(data,store.get(),libraryLocation);document.title=(libraryLocation.chapter?.title||libraryLocation.book.title)+' · Hadith';}
  else if(mode==='saved'){main.innerHTML=savedView(data,store.get(),libraryLocation.page);document.title='Saved readings · Hadith';}
  else if(mode==='audio-missing'){main.innerHTML=`<section class="collection"><h1>Audio isn’t available yet.</h1><p>Hadith ${Number(match[2])} is available to read. A recording has not been added for it.</p><a class="primary" href="#read/${Number(match[2])}">Read Hadith ${Number(match[2])} →</a><p><a href="#home">Back to your session</a></p></section>`;document.title='Audio unavailable · Hadith';}
  else if(mode==='missing'){main.innerHTML='<section class="collection"><h1>This page is not available.</h1><p>The reference may belong to a different edition or a later release. Your reading place has not changed.</p><a class="primary" href="#collection">Browse the available collection →</a></section>';document.title='Page unavailable · Hadith';}
  else if(mode==='end'){main.innerHTML=end();document.title='A place to pause · Hadith';}
  else{main.innerHTML=home();document.title='Your session · Sahih al-Bukhari';}
  $('#dock').innerHTML=dock();mountSearch(()=>library.loadAllEntries());mountBookJump();updateListening();refreshOffline();
  if(current&&(chainRequested||(store.get().followAudio&&getPlaybackState().active&&getPlaybackState().number===current)))revealChains();
  restoring=true;requestAnimationFrame(()=>{if(version!==renderVersion)return;main.focus({preventScroll:true});window.scrollTo(0,current?Number(store.get().positions[current])||0:0);if(chainRequested){const chain=$('.reading .chain summary');if(chain){chain.focus({preventScroll:true});chain.scrollIntoView({block:'start'});announce(`Narrator chain for Hadith ${current}.`);}}else if(automatic){$('#hadith-title').scrollIntoView({block:'start'});announce(`Following Hadith ${current}.`);}requestAnimationFrame(()=>{if(version!==renderVersion)return;restoring=false;updateListening();});});
 }
 function beginPlan(plan){
  capture();current=null;stopFollowingForNavigation();
  write({session:plan,positions:{...store.get().positions,[plan.cursor]:0}});
  const destination='#read/'+plan.cursor;if(location.hash===destination)render();else location.hash=destination;
 }
 function markRead(number,done){const finished=store.get().finished;write({finished:done?[...new Set([...finished,number])]:finished.filter(n=>n!==number)});announce(done?'Marked as read':'Marked as unread');}
 document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.hasAttribute('data-listen')){
   if(!recordedChapter(Number(target.dataset.listen)))return;
   const n=Number(target.dataset.listen);startingAudio=true;
   try{if(mode==='read'){listenAlong(n);if(store.get().followAudio)revealChains();}else{listen(n);location.hash=`#listen/${n}`;}}finally{startingAudio=false;}
   updateListening();
  }
  if(target.tagName==='A'&&/^#read\/\d+(?:\/chain)?$/.test(target.getAttribute('href')||'')&&!target.hasAttribute('data-read-playing')&&!event.metaKey&&!event.ctrlKey){
   stopFollowingForNavigation();
   if(target.hasAttribute('data-read-step')){const n=Number(target.hash.split('/')[1]);write({positions:{...store.get().positions,[n]:0}});}
  }
  if(target.id==='audio-follow'){const enabled=!store.get().followAudio;setFollow(enabled);if(enabled&&current)revealChains();announce(enabled?'Following the playing hadith.':'Follow is off. You can browse freely.');}
  if(target.hasAttribute('data-listen-resume')){resumeListening();location.hash=`#listen/${getPlaybackState().number}`;}
  if(target.hasAttribute('data-source-related')&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey)target.closest('dialog')?.close();
  if(target.hasAttribute('data-sources'))sourceDialog(Number(target.dataset.sources));
  if(target.hasAttribute('data-retry-content'))render();
  if(target.hasAttribute('data-open-settings'))$('#settings').showModal();
  if(target.id==='bookmark'){const saved=store.get().saved.includes(current);write({saved:saved?store.get().saved.filter(n=>n!==current):[...store.get().saved,current]});target.textContent=saved?'Save':'Saved ✓';target.setAttribute('aria-pressed',String(!saved));announce(saved?'Bookmark removed':'Hadith saved');}
  if(target.id==='finish'){const done=!store.get().finished.includes(current);markRead(current,done);target.textContent=done?'Marked as read ✓':'Mark as read';target.setAttribute('aria-pressed',String(done));}
  if(target.hasAttribute('data-end-session')){stopFollowingForNavigation();write({session:{...session(),ended:true}});location.hash='#end';}
  if(target.hasAttribute('data-restart')){const plan=session();beginPlan({...plan,cursor:plan.numbers[0],ended:false});}
  if(target.hasAttribute('data-next-session')){const plan=nextSession(data.entries,session(),store.get().minutes);if(plan)beginPlan(plan);}
  if(target.hasAttribute('data-start-session')){const n=Number(target.dataset.startSession);if(entry(n))beginPlan(startSession(data.entries,n,store.get().minutes));}
 });
 document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{write({minutes:Number(b.dataset.minutes)});appearance();if(mode==='home'){const before=window.scrollY;render();requestAnimationFrame(()=>{$('#settings').focus({preventScroll:true});window.scrollTo(0,before);});}});
 $('.skip').onclick=e=>{e.preventDefault();$('#main').focus();};
 $('#settings-button').onclick=()=>$('#settings').showModal();
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{write({theme:b.dataset.themeChoice});appearance();});
 document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{write({size:Number(b.dataset.size)});appearance();});
 document.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>{write({font:b.dataset.font});appearance();});
 $('#more-space').onchange=e=>{write({spacious:e.target.checked});appearance();};$('#show-art').onchange=e=>{write({art:e.target.checked});appearance();};
 $('#follow-audio').onchange=e=>setFollow(e.target.checked);
 for(const dialog of [$('#sources'),$('#settings')])dialog.addEventListener('close',updateListening);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateListening();});
 new ResizeObserver(()=>document.documentElement.style.setProperty('--dock-height',$('#dock').getBoundingClientRect().height+'px')).observe($('#dock'));
 media.addEventListener('change',appearance);window.addEventListener('hashchange',render);window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(capture,200);},{passive:true});window.addEventListener('pagehide',capture);
 document.addEventListener('hadith:audio',updateListening);
 initPersonalTools({capture,refresh:()=>{restoring=true;appearance();render();},prepareReload:()=>{restoring=true;clearTimeout(scrollTimer);}});
 // The installed app's start URL opens the session; explicit links still open their hadith.
 appearance();render();if(!store.available())$('.site-footer>span').textContent='Reading works, but this browser cannot save your place.';
}
async function boot(){
 const preference=store.get().theme;document.documentElement.dataset.theme=preference==='night'||(preference==='device'&&matchMedia('(prefers-color-scheme:dark)').matches)?'night':'day';
 const main=document.querySelector('#main');main.setAttribute('aria-busy','true');
 main.innerHTML='<section class="collection"><h1>Your quiet moment.</h1><p role="status">Opening your collection…</p></section>';
 try{const library=await createContentLibrary({files:release.files});main.removeAttribute('aria-busy');startReader(library);}
 catch{main.removeAttribute('aria-busy');main.innerHTML='<section class="collection"><h1>Your collection could not open.</h1><p>Reconnect and try again. If the problem continues, use Check for app updates. Your bookmarks and reading place are kept.</p><button class="primary" id="retry-library">Try again</button><p><a href="../update.html">Check for app updates</a> · <a href="source-review.html">Read the source review</a></p></section>';document.querySelector('#retry-library').onclick=boot;}
}
boot();
