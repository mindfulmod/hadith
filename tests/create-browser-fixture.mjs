/* Local manual-test library only. Synthetic reports must never enter reader publication. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {release} from '../reader/release.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.argv[2]&&resolve(process.argv[2]);
assert(out&&!existsSync(out)&&relative(root,out).startsWith('..'),'Choose a new fixture directory outside the repository');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const write=(path,value)=>{const target=resolve(out,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,value);};
for(const file of release.files){const target=resolve(out,'reader',file.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(root,'reader',file.path),target);}
const original=JSON.parse(readFileSync(resolve(root,'reader/books/catalog.json'),'utf8'));
const base=JSON.parse(readFileSync(resolve(root,'reader',original.books[0].path),'utf8'));
const catalog=structuredClone(original),newPaths=[];
for(const [index,count] of [32,63].entries()){
 const id=index?'fixture-second':'fixture-first',number=index+2,title=`Synthetic fixture book ${index+1} — not hadith content`;
 const entries=Array.from({length:count},(_,i)=>{
  const number=10+(i+(index?32:0))*3;
  const english_blocks=['TEST FIXTURE — not a hadith.','Synthetic search phrase. '+('placeholder '.repeat(170))],arabic_blocks=['TEST FIXTURE — not a hadith.','نص تجريبي ليس حديثاً.'];
  const presentation={schemaVersion:1,...Object.fromEntries(Object.entries({english:english_blocks,arabic:arabic_blocks}).map(([language,blocks])=>[language,blocks.map((block,i)=>({block:i,start:0,end:Array.from(block).length,kind:i?'report':'chain'}))]))};
  return {id:`fixture:${number}`,number,book:title,english_blocks,arabic_blocks,presentation,english_status:'SYNTHETIC TEST DATA — not a translation or hadith.',source_pages:{}};
 });
 const entryNumbers=entries.map(e=>e.number);
 const chapters=[{id:'alpha',title:'Synthetic chapter A — not source wording',entryNumbers:entryNumbers.slice(0,12)},{id:'beta',title:'Synthetic chapter B — not source wording',entryNumbers:entryNumbers.slice(12)}];
 const sourceReferences={schemaVersion:1,sourceRecordSha256:catalog.sourceRecordSha256,sources:[{id:'fixture-source',label:'LOCAL TEST SOURCE — not hadith material',kind:'arabic-input',format:'web',url:'https://example.invalid/local-fixture'}],entries:entries.map((entry,i)=>({id:entry.id,number:entry.number,entrySha256:hash(JSON.stringify(entry)),translation:{label:'SYNTHETIC TEST CONTENT',description:'No translation or source certification. This fixture tests the interface only.'},citations:[{id:'fixture',sourceId:'fixture-source',locator:'Synthetic record '+entry.number,scope:'Test fixture only; no source claim.'}],localNotes:{path:'fixture-notes.html',fragment:'fixture-'+entry.number,label:'Local fixture notes'},contextNotes:i===1?[{label:'TEST: inherited chain',text:'LOCAL TEST ONLY — this note tests navigation and is not narration.',citations:['fixture'],related:[{id:entries[0].id,number:entries[0].number,label:'Open the previous test chain',target:'chain'}]}]:[]}))};
 const book={id,number,title,chapters},pack={...base,sourceReferences,sourceRecord:{sources:[],license:{id:'Test fixture only',url:'https://example.invalid/local-fixture',attribution:'Synthetic content for local testing only.',changes:'Not hadith material.'}},book,entries},body=JSON.stringify(pack,null,2)+'\n',sha256=hash(body),path=`books/${id}-${sha256.slice(0,16)}.json`;
 write('reader/'+path,body);newPaths.push(path);
 catalog.books.push({...book,entryNumbers,path,bytes:Buffer.byteLength(body),sha256});
 catalog.entries.push(...entries.map(e=>({id:e.id,number:e.number,bookId:id,book:e.book,englishWords:e.english_blocks.join(' ').trim().split(/\s+/u).length})));
}
write('reader/books/catalog.json',JSON.stringify(catalog,null,2)+'\n');
write('reader/fixture-notes.html','<!doctype html><meta name="viewport" content="width=device-width"><title>Local fixture notes</title><h1>LOCAL TEST ONLY — no source material</h1>'+catalog.entries.filter(e=>e.id.startsWith('fixture:')).map(e=>`<section id="fixture-${e.number}"><h2>Synthetic reference ${e.number}</h2><p>Navigation test content only.</p></section>`).join(''));newPaths.push('fixture-notes.html');
const indexPath=resolve(out,'reader/index.html'),html=readFileSync(indexPath,'utf8');
write('reader/index.html',html.replace('<body>','<body><p style="padding:12px;text-align:center;border:3px solid currentColor;font-weight:bold">LOCAL TEST LIBRARY — synthetic records, not hadith content.</p>'));
const files=[...release.files,...newPaths.map(path=>({path,core:true,audio:false}))].map(f=>{const bytes=readFileSync(resolve(out,'reader',f.path));return {...f,bytes:bytes.length,sha256:hash(bytes)};});
const packs=release.packs.map(pack=>{const paths=pack.id==='reading'?[...pack.files,...newPaths]:pack.files;return {...pack,...(pack.id==='reading'?{description:`LOCAL TEST ONLY: ${catalog.entries.length} records, including synthetic fixtures.`}:{}),files:paths,bytes:paths.reduce((sum,path)=>sum+files.find(f=>f.path===path).bytes,0)};});
const fixtureRelease={schemaVersion:2,id:'fixture-'+hash(JSON.stringify({files,packs})).slice(0,12),bytes:files.reduce((s,f)=>s+f.bytes,0),files,packs};
write('reader/release.mjs','export const release = '+JSON.stringify(fixtureRelease,null,2)+';\n');
const worker=readFileSync(resolve(root,'reader/sw.js'),'utf8').replace(/^\/\/ Reader release: .*\n/,'');write('reader/sw.js','// Reader release: '+fixtureRelease.id+'\n'+worker);
write('reader-version.json',JSON.stringify({release:fixtureRelease.id,label:'LOCAL TEST LIBRARY'}));
write('fixture-information.json',JSON.stringify({purpose:'Manual navigation/session/pagination checks only; not source verification',entries:catalog.entries.length,books:catalog.books.length,syntheticEntryNumbers:catalog.entries.filter(e=>e.id.startsWith('fixture:')).map(e=>e.number)},null,2));
console.log(`Local fixture: ${catalog.books.length} books, ${catalog.entries.length} entries; ${out}`);
