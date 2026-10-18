import {searchEntries} from './search.mjs';
import {escapeHTML} from './source-format.mjs';
export function searchForm(count){return `<form id="library-search" role="search"><label for="search-query">Find a hadith</label><div class="search-controls"><input id="search-query" type="search" maxlength="200" placeholder="A phrase or hadith number" autocomplete="off" spellcheck="false" aria-describedby="search-help"><button class="primary" type="submit">Search</button></div><p id="search-help" class="sample-note">Search the ${count} available hadith, including narrator chains. Phrases match in order; English ignores case.</p></form><section id="search-results" aria-label="Search results" hidden><p id="search-summary" role="status"></p><div id="search-matches"></div><button id="search-clear" class="text-button" type="button">Clear search</button></section>`;}
export function mountSearch(entries){
 const form=document.querySelector('#library-search');if(!form)return;
 const input=form.querySelector('input'),results=document.querySelector('#search-results'),summary=document.querySelector('#search-summary'),matches=document.querySelector('#search-matches'),browse=document.querySelector('#collection-entries');
 const clear=()=>{input.value='';results.hidden=true;browse.hidden=false;input.focus();};
 document.querySelector('#search-clear').onclick=clear;
 input.addEventListener('input',()=>{if(!input.value){results.hidden=true;browse.hidden=false;}});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!input.value.trim()){clear();return;}
  const found=searchEntries(entries,input.value);results.hidden=false;browse.hidden=true;
  summary.textContent=found.total?`${found.total} ${found.total===1?'hadith matches':'hadith match'}${found.total>found.results.length?`; showing the first ${found.results.length}`:''}.`:'No matches in the available text. Try a shorter phrase or a hadith number.';
  matches.innerHTML=found.results.map(({entry,language,text})=>`<a class="search-result" href="#read/${entry.number}"><strong>Hadith ${entry.number}<span aria-hidden="true"> →</span></strong><p ${language==='ar'?'lang="ar" dir="rtl"':''}>${escapeHTML(text)}</p><small>Open the complete hadith and sources</small></a>`).join('');
 });
}
