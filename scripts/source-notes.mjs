/* Split generated source notes without changing source paragraphs or review decisions. */
import {parseReference,referenceBase} from '../reader/references.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {escapeHTML as esc} from '../reader/source-format.mjs';
import {publicJSON} from './public-json.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const describe=(path,body)=>({path,bytes:Buffer.byteLength(body),sha256:sha(body)});
const articlePattern=/<article id="([a-z0-9-]+)">[\s\S]*?<\/article>/g;
const anchors=html=>[...html.matchAll(/\s+id="([^"]+)"/g)].map(m=>m[1]);
const hrefPattern=/\b(href|src)="([^"]+)"/g;
function groupFor(id,first){
 let match=/^hadith-([0-9]+[a-z]?)$/.exec(id);
 if(match){const start=first+Math.floor((referenceBase(parseReference(match[1]))-first)/16)*16;return `hadith-${start}-${start+15}`;}
 if(id==='book-introduction')return id;
 match=/^chapter-(\d+)(?:-print-\d+)?$/.exec(id);
 assert(match,'Unknown source-note section: '+id);
 const start=1+Math.floor((Number(match[1])-1)/16)*16;return `chapters-${start}-${start+15}`;
}
function moveLinks(html,from,to,routes){
 return html.replace(hrefPattern,(all,attr,raw)=>{
  if(/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(raw))return all;
  let destination;
  if(raw.startsWith('#')){const route=routes.get(raw.slice(1));assert(route,'Unmapped source-note link: '+raw);destination=route.path+raw;}
  else destination=posix.normalize(posix.join(posix.dirname(from),raw.split('#')[0]))+(raw.includes('#')?'#'+raw.split('#').slice(1).join('#'):'');
  const [path,...hash]=destination.split('#');let relative=posix.relative(posix.dirname(to),path);
  if(path===posix.dirname(from))relative+='/';
  if(!relative)relative='./';
  return `${attr}="${relative}${hash.length?'#'+hash.join('#'):''}"`;
 });
}
export function partitionSourceNotes(canonicalFiles){
 const files=new Map(canonicalFiles),books=[],published=new Map();
 for(const [fullPath,html]of canonicalFiles){
  const match=/^reader\/([a-z0-9-]+)-review\.html$/.exec(fullPath);if(!match)continue;
  const id=match[1],index=fullPath.slice(7),articles=[...html.matchAll(articlePattern)].map(m=>({id:m[1],html:m[0],start:m.index}));
  assert(articles.length&&articles.length===(html.match(/<article\b/g)||[]).length,'Unsupported source-note article structure');
  assert.equal(new Set(articles.map(a=>a.id)).size,articles.length,'Duplicate source-note section');
  const first=referenceBase(parseReference(articles.find(a=>a.id.startsWith('hadith-'))?.id.slice(7)));assert(Number.isSafeInteger(first)&&first>0);
  const start=articles[0].start,last=articles.at(-1),end=last.start+last.html.length;
  assert.equal(html.slice(start,end),articles.map(a=>a.html).join(''),'Unowned material between source-note sections');
  const prefix=html.slice(0,start),footer=html.slice(end),shell=prefix.slice(0,prefix.indexOf('<main class="review-page">')+'<main class="review-page">'.length);
  assert(shell.endsWith('<main class="review-page">'),'Missing source-note page shell');
  const title=/<h1>([\s\S]*?)<\/h1>/.exec(prefix)?.[1];assert(title,'Missing source-note title');
  const groups=new Map(),routes=new Map();
  for(const a of articles){const group=groupFor(a.id,first),path=`notes/${id}-${group}.html`;if(!groups.has(path))groups.set(path,[]);groups.get(path).push(a);routes.set(a.id,{id:a.id,path});}
  const paths=[...groups.keys()],pages=[];
  for(const [pageIndex,path]of paths.entries()){
   const selected=groups.get(path),link=(p,label)=>`<a href="${p}">${label}</a>`,navigation=`<nav aria-label="Source-note pages">${pageIndex?link(paths[pageIndex-1],'← Previous notes')+' · ':''}${link(index,'All source notes')}${pageIndex+1<paths.length?' · '+link(paths[pageIndex+1],'Next notes →'):''}</nav>`;
   // Only link destinations are relocated. Every complete article is preserved.
   const head=moveLinks(shell,index,path,routes),nav=moveLinks(navigation,index,path,routes);
   const body=`${head}<a href="../#book/${id}">← Return to this book</a><p class="eyebrow">PERSONAL PROTOTYPE · INDEPENDENT REVIEW PENDING</p><h1>${title} Source notes.</h1><p>Complete comparison notes and source wording. English translations and independent review remain pending where indicated.</p>${nav}${selected.map(a=>moveLinks(a.html,index,path,routes)).join('')}${nav}${moveLinks(footer,index,path,routes)}`;
   published.set('reader/'+path,body);pages.push({...describe(path,body),sections:selected.map(a=>a.id)});
  }
  const indexPrefix=prefix.replace(/href="#([a-z0-9-]+)"/g,(_all,fragment)=>{const route=routes.get(fragment);assert(route,'Unknown index destination');return `id="${fragment}" data-source-note href="${route.path}#${fragment}"`;});
  const indexHTML=indexPrefix+'<p>Choose a hadith or chapter above to open its complete notes.</p><noscript><p>Automatic opening is unavailable. Use the links above; the complete notes work without JavaScript.</p></noscript>'+footer.replace('</body>','<script type="module" src="source-notes.mjs"></script></body>');
  published.set(fullPath,indexHTML);
  books.push({id,index:describe(index,indexHTML),canonicalSha256:sha(html),canonicalBytes:Buffer.byteLength(html),routes:[...routes.values()],pages});
 }
 assert(books.length,'No source-note books');
 for(const [path,body]of published)files.set(path,body);
 const manifest={schemaVersion:1,policy:'Complete generated articles, grouped into stable sixteen-reference pages. Existing book URLs and fragments remain valid. This changes delivery only, not source wording or review status.',books};
 files.set('reader/source-notes.json',publicJSON(manifest));
 return {files,manifest,published};
}
export function checkSourceNotePublication(manifest,{read,releaseFiles}={}){
 assert.equal(manifest?.schemaVersion,1,'Unsupported source-note manifest');assert(Array.isArray(manifest.books)&&manifest.books.length,'Missing source-note books');
 const all=new Map(),indexes=new Set(),release=releaseFiles&&new Map(releaseFiles.map(f=>[f.path,f]));
 for(const book of manifest.books){
  assert(/^[a-z0-9-]+$/.test(book.id)&&book.index.path===book.id+'-review.html'&&!indexes.has(book.index.path),'Invalid source-note index');indexes.add(book.index.path);
  for(const item of [book.index,...book.pages]){
   assert(!all.has(item.path),'Duplicate source-note file');
   assert(item===book.index||new RegExp('^notes/'+book.id+'-(?:hadith-\\d+-\\d+|chapters-\\d+-\\d+|book-introduction)\\.html$').test(item.path),'Unsafe source-note path');
   const body=read(item.path);assert.deepEqual(describe(item.path,body),{path:item.path,bytes:item.bytes,sha256:item.sha256},'Changed source-note file: '+item.path);all.set(item.path,body);
   if(release){const descriptor=release.get(item.path);assert(descriptor&&descriptor.bytes===item.bytes&&descriptor.sha256===item.sha256,'Missing or stale offline source notes: '+item.path);}
  }
  const mapped=new Set();
  for(const route of book.routes){
   assert(/^[a-z0-9-]+$/.test(route.id)&&!mapped.has(route.id),'Duplicate or unsafe source-note route');mapped.add(route.id);
   const page=book.pages.find(p=>p.path===route.path);assert(page?.sections.includes(route.id),'Source-note route has no page');
   assert.equal(anchors(all.get(route.path)).filter(id=>id===route.id).length,1,'Missing or duplicate source-note destination');
   const index=all.get(book.index.path);assert(index.includes(`id="${route.id}" data-source-note href="${route.path}#${route.id}"`),'Missing source-note compatibility link');
  }
  assert.deepEqual(book.pages.flatMap(p=>p.sections).sort(),[...mapped].sort(),'Source-note section coverage mismatch');
 }
 for(const [path,html]of all)for(const match of html.matchAll(hrefPattern)){
  const url=new URL(match[2].replaceAll('&amp;','&'),new URL(path,'https://notes.invalid/reader/'));
  const destination=url.pathname.slice('/reader/'.length);
  if(url.origin!=='https://notes.invalid'||!all.has(destination)||!url.hash)continue;
  assert.equal(anchors(all.get(destination)).filter(id=>id===decodeURIComponent(url.hash.slice(1))).length,1,`Broken source-note cross-link: ${path} → ${destination}${url.hash}`);
 }
 if(release)for(const path of ['source-notes.mjs','source-notes.json'])assert(release.has(path),'Missing offline source-note dependency: '+path);
 return [...all.keys()];
}
