import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {collectionFiles} from '../scripts/build-collection.mjs';
import {partitionSourceNotes,checkSourceNotePublication} from '../scripts/source-notes.mjs';
import {sourceNoteTarget,openSourceNote} from '../reader/source-notes.mjs';
import {release} from '../reader/release.mjs';
import {createOfflineStore,readerCacheName} from '../reader/offline-store.mjs';
const canonical=collectionFiles(),publication=partitionSourceNotes(canonical.files),base='https://example.com/hadith/reader/';
const articles=html=>[...html.matchAll(/<article id="([a-z0-9-]+)">[\s\S]*?<\/article>/g)].map(m=>({id:m[1],html:m[0]}));
const hrefs=html=>[...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
const withoutHrefs=html=>html.replace(/\b(href|src)="[^"]+"/g,'$1="[link]"');
const read=path=>publication.files.get('reader/'+path);
const sha=x=>createHash('sha256').update(x).digest('hex');
const fixture=rows=>new Map([['reader/example-review.html','<!doctype html><html><body><main class="review-page"><h1>Example</h1><nav>'+rows.map(([id])=>`<a href="#${id}">${id}</a>`).join('')+'</nav>'+rows.map(([id,body])=>`<article id="${id}">${body}</article>`).join('')+'</main></body></html>']]);
test('long UTF-8 evidence moves as whole articles and all cross-links resolve across overflow pages',()=>{
 const rows=Array.from({length:16},(_,i)=>['hadith-'+(i+1),`<a href="#hadith-16">Last report</a><p lang="ar">${'ن'.repeat(i<6?30000:10)}</p>`]),files=fixture(rows),result=partitionSourceNotes(files),book=result.manifest.books[0];
 assert(book.pages.length>=3);assert(book.pages.every(p=>p.bytes<128*1024));assert.equal(book.routes[0].path,'notes/example-hadith-1-16.html');assert(book.pages.some(p=>p.path.endsWith('-part-2.html')));
 const original=articles(files.values().next().value);
 for(const a of original){const route=book.routes.find(r=>r.id===a.id),current=articles(result.files.get('reader/'+route.path)).find(x=>x.id===a.id);assert.equal(withoutHrefs(current.html),withoutHrefs(a.html));}
 checkSourceNotePublication(result.manifest,{read:p=>result.files.get('reader/'+p)});
 assert.deepEqual(partitionSourceNotes(files),result);
});
test('expanding a later reference range preserves existing source-note destinations',()=>{
 const rows=Array.from({length:16},(_,i)=>['hadith-'+(i+1),'<p>'+('ن'.repeat(i<3?30000:10))+'</p>']),before=partitionSourceNotes(fixture(rows)),after=partitionSourceNotes(fixture([...rows,['hadith-17','<p>Next complete report</p>']]));
 assert.deepEqual(after.manifest.books[0].routes.slice(0,16),before.manifest.books[0].routes);assert.equal(after.manifest.books[0].routes[16].path,'notes/example-hadith-17-32.html');
});
test('chapter introductions can overflow without entering report pages or losing their full text',()=>{
 const rows=[['hadith-1','<p>Complete report</p>'],...Array.from({length:3},(_,i)=>['chapter-'+(i+1),'<p lang="ar">'+'ن'.repeat(40000)+'</p>'])],result=partitionSourceNotes(fixture(rows)),book=result.manifest.books[0];
 assert.equal(book.pages.filter(p=>p.path.includes('chapters-')).length,3);assert(book.routes.filter(r=>r.id.startsWith('chapter-')).every(r=>r.path.includes('chapters-')));checkSourceNotePublication(result.manifest,{read:p=>result.files.get('reader/'+p)});
});
test('an oversized single section is rejected rather than truncating source evidence or raising the budget',()=>{
 assert.throws(()=>partitionSourceNotes(fixture([['hadith-1','<p>'+'ن'.repeat(65536)+'</p>']])),/One complete source-note section exceeds the page budget/);
});
test('every complete published source-note section preserves all text, markup and exact citation destinations',()=>{
 let count=0;
 for(const book of publication.manifest.books){
  const original=articles(canonical.files.get('reader/'+book.index.path)),routes=new Map(book.routes.map(r=>[r.id,r]));
  assert.equal(original.length,book.routes.length);
  for(const old of original){const route=routes.get(old.id),current=articles(read(route.path)).filter(a=>a.id===old.id);assert.equal(current.length,1);assert.equal(withoutHrefs(current[0].html),withoutHrefs(old.html),'Source content changed: '+old.id);
   const expected=hrefs(old.html).map(href=>href.startsWith('#')?new URL(routes.get(href.slice(1)).path+href,base).href:new URL(href,new URL(book.index.path,base)).href);
   assert.deepEqual(hrefs(current[0].html).map(href=>new URL(href,new URL(route.path,base)).href),expected,'Citation moved to another source: '+old.id);count++;
  }
  const index=read(book.index.path);assert.equal(articles(index).length,0);assert(index.includes('<noscript>'));assert(book.index.bytes<40000);assert(book.pages.every(page=>page.bytes<128*1024),'Current source page exceeds the measured budget');
 }
 assert.equal(count,publication.manifest.books.reduce((sum,b)=>sum+b.routes.length,0));assert(count>850);
 assert.deepEqual(JSON.parse(readFileSync(new URL('../reader/source-record.json',import.meta.url))),canonical.source);
 for(const path of ['content/review/personal-collection-ledger.json','research/bukhari-personal-collection.json','reader/source-record.json'])assert.equal(publication.files.get(path),canonical.files.get(path));
});
test('publication covers every current source route and rejects missing pages, changed bytes, missing offline dependencies or broken fragments',()=>{
 checkSourceNotePublication(publication.manifest,{read,releaseFiles:release.files});
 const changed=structuredClone(publication.manifest);changed.books[0].routes[0].path='notes/missing.html';assert.throws(()=>checkSourceNotePublication(changed,{read}),/no page/);
 const duplicated=structuredClone(publication.manifest);duplicated.books[0].routes.push(duplicated.books[0].routes[0]);assert.throws(()=>checkSourceNotePublication(duplicated,{read}),/Duplicate/);
 const omitted=structuredClone(publication.manifest);omitted.books[0].routes.pop();assert.throws(()=>checkSourceNotePublication(omitted,{read}),/coverage mismatch/);
 assert.throws(()=>checkSourceNotePublication(publication.manifest,{read:path=>read(path)+' '}),/Changed source-note/);
 for(const path of ['source-notes.mjs','source-notes.json',publication.manifest.books[0].pages[0].path])assert.throws(()=>checkSourceNotePublication(publication.manifest,{read,releaseFiles:release.files.filter(f=>f.path!==path)}),/Missing/);
 for(const row of canonical.ledger.sourceReferences.entries.filter(r=>r.number>7)){const book=publication.manifest.books.find(b=>b.index.path===row.localNotes.path);assert(book.routes.some(r=>r.id===row.localNotes.fragment));}
 for(const b of canonical.ledger.books.slice(1))for(const item of [...b.chapters.map(c=>c.sourceContext?.notes).filter(Boolean),...(b.introduction?[b.introduction.notes]:[])])assert(publication.manifest.books.find(v=>v.index.path===item.path).routes.some(r=>r.id===item.fragment));
});
test('fragment compatibility navigates only to a known local section, replaces history, and has a manual fallback',()=>{
 const href='notes/prayer-hadith-342-357.html#hadith-342',current=base+'prayer-review.html#hadith-342';
 assert.equal(sourceNoteTarget('#hadith-342',href,current),base+href);assert.equal(sourceNoteTarget('#%68adith-342',href,current),base+href);
 for(const [hash,url]of [['#bad',href],['#%ZZ',href],['#hadith-342','https://other.example/'+href],['#hadith-342','../'+href],['#hadith-342','notes/../../evil.html#hadith-342'],['#hadith-342','javascript:alert(1)'],['#hadith-342',null]])assert.equal(sourceNoteTarget(hash,url,current),null);
 const calls=[],window={location:{hash:'#hadith-342',href:current,replace:url=>calls.push(url)}},document={getElementById:id=>id==='hadith-342'?{hasAttribute:()=>true,getAttribute:()=>href}:null};
 assert.equal(openSourceNote(window,document),true);assert.deepEqual(calls,[base+href]);window.location.hash='#unavailable';assert.equal(openSourceNote(window,document),false);assert.equal(calls.length,1);
 window.location.hash='#hadith-342';window.location.replace=()=>{throw Error('navigation unavailable');};assert.equal(openSourceNote(window,document),false);
});
test('unsupported sections, interleaved text, nested articles, duplicate IDs and unresolved chapter links fail closed',()=>{
 const path='reader/faith-review.html',original=canonical.files.get(path);
 for(const edit of [s=>s.replace('id="hadith-8"','id="unexpected"'),s=>s.replace('</article>','</article><p>Unowned source words</p>'),s=>s.replace('<article id="hadith-8">','<article id="hadith-8"><article id="nested">'),s=>s.replace('id="hadith-9"','id="hadith-8"'),s=>s.replace('href="#hadith-8"','href="#absent"')]){const files=new Map(canonical.files);files.set(path,edit(original));assert.throws(()=>partitionSourceNotes(files));}
});
class MemoryCaches{constructor(){this.maps=new Map();}async keys(){return [...this.maps.keys()];}async open(name){if(!this.maps.has(name))this.maps.set(name,new Map());const values=this.maps.get(name);return{match:async url=>values.get(String(url))?.clone(),put:async(url,response)=>values.set(String(url),response.clone()),delete:async url=>values.delete(String(url))};}async delete(name){return this.maps.delete(name);}}
const makeRelease=(id,responses)=>{const files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:sha(body)}));return{id,files,packs:[{id:'reading',kind:'reading',title:'Reading',requires:[],files:files.map(f=>f.path),bytes:files.reduce((sum,f)=>sum+f.bytes,0)}]};};
test('an interrupted source-note upgrade retains the old offline notes and resumes to complete checked pages',async()=>{
 const before=new Map([...canonical.files].filter(([p])=>/^reader\/[a-z0-9-]+-review\.html$/.test(p)).map(([p,b])=>[p.slice(7),b]));
 const after=new Map([...publication.published].map(([p,b])=>[p.slice(7),b]));after.set('source-notes.json',read('source-notes.json'));after.set('source-notes.mjs',readFileSync(new URL('../reader/source-notes.mjs',import.meta.url),'utf8'));
 const old=makeRelease('notes-old',before),updated=makeRelease('notes-partitioned',after),cacheStorage=new MemoryCaches();
 const previous=createOfflineStore({release:old,base,cacheStorage,fetcher:async url=>new Response(before.get(url.slice(base.length)))});await previous.run('save','reading');
 const failed=publication.manifest.books.at(-1).pages.at(-1).path,requests=[];let broken=true;
 const current=createOfflineStore({release:updated,base,cacheStorage,fetcher:async url=>{const path=url.slice(base.length);requests.push(path);return new Response(after.get(path)+(broken&&path===failed?'altered':''));}});
 await assert.rejects(current.run('save','reading'),error=>error.code==='integrity');assert((await previous.inspect()).packs[0].ready);assert(!(await current.inspect()).packs[0].ready);
 const offset=requests.length;broken=false;assert((await current.run('save','reading')).packs[0].ready);assert.deepEqual(requests.slice(offset),[...after.keys()].filter(path=>path===failed||!requests.slice(0,offset).includes(path)));
 const oldCache=await cacheStorage.open(readerCacheName(old)),newCache=await cacheStorage.open(readerCacheName(updated));
 for(const [path,body]of before)assert.equal(await(await oldCache.match(base+path)).text(),body);
 for(const [path,body]of after)assert.equal(await(await newCache.match(base+path)).text(),body);
});
