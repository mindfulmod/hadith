/* Presentation-only spans. These exact phrases remain in the source and speech. */
export const honorifics = Object.freeze([
 'may Allah bless him and grant him peace',
 'may Allah Most High be pleased with him',
 'may Allah Most High be pleased with her'
]);
const pattern=new RegExp('('+honorifics.join('|')+')','gu');
export function sourceParts(text){
 const parts=[];let start=0;
 for(const match of text.matchAll(pattern)){
  if(match.index>start)parts.push({text:text.slice(start,match.index),honorific:false});
  parts.push({text:match[0],honorific:true});start=match.index+match[0].length;
 }
 if(start<text.length)parts.push({text:text.slice(start),honorific:false});
 return parts;
}
export function escapeHTML(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function sourceHTML(text){return sourceParts(text).map(p=>p.honorific?`<span class="honorific">${escapeHTML(p.text)}</span>`:escapeHTML(p.text)).join('');}

// Long source headings stay complete inside a native disclosure.
export function chapterContextHTML(title,href){
 const content=`<a href="${escapeHTML(href)}">${sourceHTML(title)}</a>`;
 return Array.from(title).length>160?`<details class="chapter-context chapter-context-long"><summary>Chapter context <span>Full heading</span></summary><p>${content}</p></details>`:`<p class="chapter-context">${content}</p>`;
}
