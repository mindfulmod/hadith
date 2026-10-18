import {listen,resumeListening,prepareListening,getPlaybackState} from './audio.mjs';
import {refreshOffline} from './offline.mjs';
import {resolveSession,advanceSession} from './session.mjs';
import {recording} from './recording.mjs';
/* Source blocks are rendered verbatim. Personal session state never changes them. */
(() => {
 const $=s=>document.querySelector(s), data=window.HadithContent, store=window.HadithStore;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const media=matchMedia('(prefers-color-scheme: dark)');
 let current=null, mode='home', scrollTimer, restoring=false;
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
  $('#more-space').checked=s.spacious;$('#show-art').checked=s.art;
 }
 function listEntry(e){return `<a class="entry-link" href="#read/${e.number}"><span class="entry-num">${String(e.number).padStart(2,'0')}</span><span>Hadith ${e.number}<small>${escape(e.book)}</small></span><span>${store.get().finished.includes(e.number)?'Read ✓':'→'}</span></a>`;}
 function home(){const s=store.get(),plan=session(),begun=Object.keys(s.positions).length>0,ended=plan.ended;return `<section class="session-start" aria-labelledby="session-title"><p class="eyebrow">YOUR CURRENT SESSION · BOOK 01</p><div class="session-invitation"><div><h1 id="session-title">A little time.<br>Two hadith.</h1><p class="session-context">The Beginning of Revelation<br><span>Sahih al-Bukhari · in book order</span></p></div><div class="session-art" role="img" aria-label="An imagined warm limestone garden with quiet water."></div></div><ol class="session-path">${plan.numbers.map(n=>`<li ${n===plan.cursor?'class="current"':''}><a href="#read/${n}" ${n===plan.cursor?'aria-current="step"':''}><span class="path-number">${String(n).padStart(2,'0')}</span><span><strong>Hadith ${n}</strong><small>${s.finished.includes(n)?'Marked as read':n===plan.cursor&&begun?'Your reading place':'Full narration and narrator chain'}</small></span><span class="path-time">${duration(recording.chapters.find(c=>c.number===n).duration)}<small>audio</small></span></a></li>`).join('')}</ol><div class="session-actions">${ended?'<button class="primary" data-restart>Read the session again <span aria-hidden="true">→</span></button>':`<a class="primary" href="#read/${plan.cursor}">${begun?'Continue':'Begin reading'} <span aria-hidden="true">→</span></a>`}<button data-listen-resume class="listen-choice">${getPlaybackState().playing?'Return to listening':s.audio?.seconds>0?'Resume listening':'Listen to both'} <span>${duration(recording.duration)} total</span></button></div><p class="sample-note">Two complete hadith, at your pace. This sample is shorter than your ${s.minutes}-minute preference. <button class="text-button" data-open-settings>Change preference</button></p><p class="review-note">English working translation · Cedar AI narration<br>Text and pronunciation remain under review.</p><section class="offline-card" aria-labelledby="offline-title"><div class="offline-heading"><h2 id="offline-title">Take this session with you.</h2><button data-download>Save for offline</button></div><p class="offline-status" data-offline-status role="status">Checking this device…</p><details class="offline-help"><summary>Offline use on your iPhone</summary><p>In Safari, use Share → Add to Home Screen. Open the saved app and download there. Wait for “Ready offline” before enabling airplane mode.</p><p>Both hadith, the full narration, source notes and artwork are included. External source websites still need a connection. Safari and your Home Screen app may have separate saved copies.</p></details></section></section>`;}
 function sessionTrack(n){const plan=session();return `<div class="session-topline"><a href="#home">Opening session</a><nav class="session-track" aria-label="Hadith in this session">${plan.numbers.map((number,i)=>`${i?'<span aria-hidden="true"></span>':''}<a href="#read/${number}" ${n===number?'aria-current="step"':''} aria-label="Hadith ${number}">${number}</a>`).join('')}</nav></div>`;}
 function reader(e){const s=store.get(),plan=session(),index=plan.numbers.indexOf(e.number),next=plan.numbers[index+1];return `<article class="reading" aria-labelledby="hadith-title">${sessionTrack(e.number)}<div class="reading-art" aria-hidden="true"></div><header class="reading-heading"><div><p class="reference">Sahih al-Bukhari · Book 01</p><h1 id="hadith-title">Hadith ${e.number}</h1></div><button id="bookmark" class="bookmark" aria-pressed="${s.saved.includes(e.number)}">${s.saved.includes(e.number)?'Saved ✓':'Save'}</button></header><button class="status-link" data-sources="${e.number}">English · Working translation · Source details</button><details class="chain"><summary>Chain of narrators <span>Full introduction</span></summary><p class="prose" data-source-block="english-0">${escape(e.english_blocks[0])}</p></details><div class="narration prose">${e.english_blocks.slice(1).map((block,i)=>`<p data-source-block="english-${i+1}">${escape(block)}</p>`).join('')}</div><footer class="reading-end"><p class="eyebrow">END OF HADITH ${e.number}</p><div class="end-actions"><button id="finish" aria-pressed="${s.finished.includes(e.number)}">${s.finished.includes(e.number)?'Marked as read ✓':'Mark as read'}</button><button class="primary" data-complete="${e.number}">${next?'Read & continue':'Read & finish session'} <span aria-hidden="true">→</span></button></div><p class="sample-note">${next?'Continue marks this hadith as read and opens the next complete hadith.':'Finish marks this hadith as read and closes this session.'}</p><p class="review-note">Full narrator introduction is available above. AI-assisted English; independent scholarly review is pending.</p></footer></article>`;}
 function listening(){return `<section class="listening-room" aria-labelledby="listening-title"><div class="listening-scene" role="img" aria-label="A still, imagined limestone garden in warm light."></div><div class="listening-heading"><p class="eyebrow">THE BEGINNING OF REVELATION</p><h1 id="listening-title">Hadith <span data-playing-number>1</span></h1><p>Two complete hadith · full narrator chains</p><p class="review-note">Cedar Take A · AI narration under review</p></div></section>`;}
 function queue(){return `<section class="listening-queue" aria-labelledby="queue-title"><h2 id="queue-title">In this session</h2>${recording.chapters.map(c=>`<button data-listen="${c.number}" aria-label="Play Hadith ${c.number}"><span><span class="queue-number">${String(c.number).padStart(2,'0')}</span> Hadith ${c.number}</span><span>${duration(c.duration)} <span aria-hidden="true">▷</span></span></button>`).join('')}<p class="sample-note">Both entries play in order, then stop. Listening does not change your reading marks.</p></section>`;}
 function end(){return `<section class="session-end"><div class="reading-art" aria-hidden="true"></div><p class="eyebrow">A PLACE TO PAUSE</p><h1>The opening session<br>ends here.</h1><p>Two complete hadith. You can return to either one whenever you wish.</p><div class="end-record">${session().numbers.map(n=>`<a href="#read/${n}">Hadith ${n}<span>${store.get().finished.includes(n)?'Marked as read ✓':'Not marked as read'}</span></a>`).join('')}</div><a class="primary" href="#home">Back to your session <span aria-hidden="true">→</span></a><a class="quiet-link" href="#saved">Open your bookmarks</a></section>`;}
 function sourceDialog(e){
  $('#source-title').textContent=`Hadith ${e.number} · Arabic & sources`;
  $('#source-content').innerHTML=`<p class="source-status"><strong>About this English translation</strong><br>${escape(e.english_status)} This is a new working translation, not the Darussalam translation.</p><p class="source-status"><strong>Listening status</strong><br>Cedar is an AI-generated voice. The submitted script includes every English source block and honorific, without changes. The generated speech still needs a word-by-word and pronunciation review. <a href="audio-review.html">Review the narration and compare two delivery styles ↗</a></p><h3>Arabic text</h3><div lang="ar" dir="rtl" class="arabic">${e.arabic_blocks.map((p,i)=>`<p data-source-block="arabic-${i}">${escape(p)}</p>`).join('')}</div><h3>Source trail</h3><p class="sample-note">The Arabic and comparison notes are saved with the app. External publisher and source websites require a connection.</p><ul class="source-list"><li><a target="_blank" rel="noopener" href="${escape(data.sources[0].url)}">Arabic Wikisource · fixed revision 484874 ↗</a><br>Arabic digital input, retained verbatim.</li><li><a target="_blank" rel="noopener" href="${escape(data.sources[1].url)}#page=${e.source_pages.darussalam_sample_pdf_page}">Darussalam publisher sample · printed page ${e.source_pages.darussalam_sample_printed_page} ↗</a><br>Arabic and Muhammad Muhsin Khan English used for comparison.</li><li><a target="_blank" rel="noopener" href="https://aishabewley.org/bukhari1">Aisha Bewley · opening entries ↗</a><br>A second named English translator used for comparison.</li><li><a target="_blank" rel="noopener" href="https://sunnah.com/bukhari:${e.number}">Sunnah.com · Bukhari ${e.number} ↗</a><br>Additional Arabic and numbering check.</li></ul><a href="source-review.html" target="_blank" rel="noopener">Read the full comparison notes and historical Arabic witness ↗</a><p class="source-licence">${escape(data.license.attribution)}<br><br>${escape(data.license.changes)} <a target="_blank" rel="noopener" href="${data.license.url}">CC BY-SA 4.0 ↗</a></p>`;
  $('#sources').showModal();
 }
 function capture(){if(current&&!restoring)write({positions:{...store.get().positions,[current]:window.scrollY}});}
 function updateListening(){
  const state=getPlaybackState();
  document.querySelectorAll('[data-playing-number]').forEach(el=>el.textContent=state.number);
  document.querySelectorAll('[data-read-playing]').forEach(el=>{el.href=`#read/${state.number}`;el.textContent=`Read Hadith ${state.number}`;});
  document.querySelectorAll('[data-sources-playing]').forEach(el=>el.dataset.sources=state.number);
  document.querySelectorAll('.listening-queue [data-listen]').forEach(el=>{if(Number(el.dataset.listen)===state.number)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
  $('#audio-room').href=`#listen/${state.number}`;
 }
 function dock(){return mode==='read'?`<a href="#home">Session</a><button data-sources="${current}">Arabic & sources</button><button data-listen="${current}" class="primary">Listen ▷</button>`:mode==='listen'?`<a href="#home">Session</a><a data-read-playing href="#read/1">Read Hadith 1</a><button data-sources-playing data-sources="1">Arabic & sources</button>`:`<a href="#home" ${mode==='home'||mode==='end'?'aria-current="page"':''}>Session</a><a href="#collection" ${mode==='collection'?'aria-current="page"':''}>Collection</a><a href="#saved" ${mode==='saved'?'aria-current="page"':''}>Saved <span id="saved-count">${store.get().saved.length||''}</span></a>`;}
 function render(){
  capture();clearTimeout(scrollTimer);
  const hash=location.hash||'#home',match=hash.match(/^#(read|listen)\/(\d+)$/),valid=match&&entry(Number(match[2]));
  mode=valid?match[1]:['#collection','#saved','#end'].includes(hash)?hash.slice(1):'home';
  current=mode==='read'?Number(match[2]):null;
  const main=$('#main');
  document.body.dataset.view=mode;
  $('#listening-support').innerHTML='';
  if(current){write({last:current,session:{...session(),cursor:current}});main.innerHTML=reader(entry(current));document.title=`Hadith ${current} · Sahih al-Bukhari`;}
  else if(mode==='listen'){prepareListening(Number(match[2]));main.innerHTML=listening();$('#listening-support').innerHTML=queue();document.title='Listen · Sahih al-Bukhari';}
  else if(mode==='collection'||mode==='saved'){const saved=mode==='saved',entries=saved?data.entries.filter(e=>store.get().saved.includes(e.number)):data.entries;main.innerHTML=`<section class="collection"><p class="eyebrow">SAHIH AL-BUKHARI · BOOK 01</p><h1>${saved?'Saved for another moment.':'The Beginning of Revelation'}</h1><p class="intro">${saved?'Your personal bookmarks, kept on this device.':'The first two hadith, in book order. Only this opening sample is available.'}</p>${entries.length?entries.map(listEntry).join(''):'<p>No bookmarks yet. Use Save beside a hadith to keep it here.</p><a class="primary" href="#read/1">Begin with Hadith 1 →</a>'}</section>`;document.title=(saved?'Saved readings':'Opening collection')+' · Hadith';}
  else if(mode==='end'){main.innerHTML=end();document.title='A place to pause · Hadith';}
  else{main.innerHTML=home();document.title='Your session · Sahih al-Bukhari';}
  $('#dock').innerHTML=dock();updateListening();refreshOffline();
  restoring=true;requestAnimationFrame(()=>{main.focus({preventScroll:true});window.scrollTo(0,current?Number(store.get().positions[current])||0:0);requestAnimationFrame(()=>{restoring=false;});});
 }
 function markRead(number,done){const finished=store.get().finished;write({finished:done?[...new Set([...finished,number])]:finished.filter(n=>n!==number)});announce(done?'Marked as read':'Marked as unread');}
 document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.hasAttribute('data-listen')){const n=Number(target.dataset.listen);listen(n);location.hash=`#listen/${n}`;}
  if(target.hasAttribute('data-listen-resume')){resumeListening();location.hash=`#listen/${getPlaybackState().number}`;}
  if(target.hasAttribute('data-sources'))sourceDialog(entry(Number(target.dataset.sources)));
  if(target.hasAttribute('data-open-settings'))$('#settings').showModal();
  if(target.id==='bookmark'){const saved=store.get().saved.includes(current);write({saved:saved?store.get().saved.filter(n=>n!==current):[...store.get().saved,current]});target.textContent=saved?'Save':'Saved ✓';target.setAttribute('aria-pressed',String(!saved));announce(saved?'Bookmark removed':'Hadith saved');}
  if(target.id==='finish'){const done=!store.get().finished.includes(current);markRead(current,done);target.textContent=done?'Marked as read ✓':'Mark as read';target.setAttribute('aria-pressed',String(done));}
  if(target.hasAttribute('data-complete')){const n=Number(target.dataset.complete);markRead(n,true);const next=advanceSession(session(),n);write({session:next});location.hash=next.ended?'#end':`#read/${next.cursor}`;}
  if(target.hasAttribute('data-restart')){const numbers=session().numbers;write({session:{numbers,cursor:numbers[0],ended:false},positions:{...store.get().positions,...Object.fromEntries(numbers.map(n=>[n,0]))}});location.hash=`#read/${numbers[0]}`;}
 });
 document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{write({minutes:Number(b.dataset.minutes)});appearance();if(mode==='home'){const before=window.scrollY;render();requestAnimationFrame(()=>{$('#settings').focus({preventScroll:true});window.scrollTo(0,before);});}});
 $('.skip').onclick=e=>{e.preventDefault();$('#main').focus();};
 $('#settings-button').onclick=()=>$('#settings').showModal();
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{write({theme:b.dataset.themeChoice});appearance();});
 document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{write({size:Number(b.dataset.size)});appearance();});
 document.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>{write({font:b.dataset.font});appearance();});
 $('#more-space').onchange=e=>{write({spacious:e.target.checked});appearance();};$('#show-art').onchange=e=>{write({art:e.target.checked});appearance();};
 media.addEventListener('change',appearance);window.addEventListener('hashchange',render);window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(capture,200);},{passive:true});window.addEventListener('pagehide',capture);
 document.addEventListener('hadith:audio',updateListening);
 // The installed app's start URL opens the session; explicit links still open their hadith.
 appearance();render();if(!store.available())$('.site-footer>span').textContent='Reading works, but this browser cannot save your place.';
})();
