/* Package tracked public assets only, after checking the exact reader release. */
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {publishBooks} from './publish-books.mjs';
import {audioFiles} from './build-audio.mjs';
import {release} from '../reader/release.mjs';
const repository=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extension=/\.(?:html|css|js|mjs|json|webmanifest|png|jpg|jpeg|webp|svg|mp3|m4a|wav|pdf)$/i;
const publicFolders=new Set(['reader','audio','landscapes','research']);
export function isPublicFile(path){
 if(!path||path.includes('\\')||path.split('/').some(part=>part==='..'||part==='.'||part.startsWith('.')))return false;
 if(!extension.test(path)||/(?:^|\/)(?:build-release|check-content|check-study)\.mjs$/.test(path))return false;
 return !path.includes('/')||publicFolders.has(path.split('/')[0]);
}
export function verifyFiles(files,{read=path=>readFileSync(resolve(repository,'reader',path))}={}){
 for(const file of files){const bytes=read(file.path);assert.equal(bytes.length,file.bytes,'Wrong release size: '+file.path);assert.equal(hash(bytes),file.sha256,'Wrong release hash: '+file.path);}
}
export function checkArtifactPaths(paths,readerRelease=release){
 const included=new Set(paths);
 for(const path of ['index.html','update.html','reader-version.json','reader/index.html','reader/sw.js','reader/release.mjs','reader/content.js','reader/about.html','research/reader-next/concept.html'])assert(included.has(path),'Missing public route: '+path);
 for(const f of readerRelease.files){const path=relative(repository,resolve(repository,'reader',f.path)).split('\\').join('/');assert(included.has(path),'Missing offline asset: '+path);}
 assert(!paths.some(p=>p.startsWith('content/')||p.startsWith('tests/')||p.startsWith('scripts/')),'Internal source intake must not enter the site artifact');
}
export function checkLocalLinks(paths,{read=path=>readFileSync(resolve(repository,path),'utf8')}={}){
 const included=new Set(paths),base=new URL('https://example.invalid/hadith/');
 for(const path of paths.filter(p=>p.endsWith('.html'))){
  for(const match of read(path).matchAll(/(?:href|src)=["']([^"']+)["']/g)){
   const raw=match[1].replaceAll('&amp;','&');if(raw.startsWith('#'))continue;
   const url=new URL(raw,new URL(path,base));if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))continue;
   let target=decodeURIComponent(url.pathname.slice(base.pathname.length));if(!target||target.endsWith('/'))target+='index.html';
   assert(included.has(target),`Missing local link from ${path}: ${raw}`);
  }
 }
}
export function checkSourceNoteLinks(packs,{read=path=>readFileSync(resolve(repository,'reader',path),'utf8')}={}){
 const pages=new Map();
 for(const pack of packs)for(const notes of [...pack.sourceReferences.entries.map(row=>row.localNotes),...(pack.book?.chapters||[]).filter(c=>c.sourceContext).map(c=>c.sourceContext.notes)]){
  const {path,fragment}=notes;
  if(!pages.has(path))pages.set(path,[...read(path).matchAll(/\s+id\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]));
  assert.equal(pages.get(path).filter(id=>id===fragment).length,1,`Missing or duplicate comparison note anchor: ${path}#${fragment}`);
 }
}
export function buildSite(destination){
 audioFiles({check:true});
 const books=publishBooks({check:true});verifyFiles(release.files);
 checkSourceNoteLinks(books.catalog.books.map(book=>JSON.parse(books.files.get(book.path))));
 const version=JSON.parse(readFileSync(resolve(repository,'reader-version.json'),'utf8'));assert.equal(version.release,release.id,'Stale update marker');
 const paths=execFileSync('git',['ls-files','-z'],{cwd:repository,encoding:'utf8'}).split('\0').filter(isPublicFile).sort();
 checkArtifactPaths(paths);checkLocalLinks(paths);
 const out=resolve(destination);assert(!existsSync(out),'Output must be a new directory; existing files are never removed');
 // Validate everything before writing any artifact.
 const files=paths.map(path=>{const input=resolve(repository,path);const rel=relative(repository,input);assert(!rel.startsWith('..')&&!isAbsolute(rel),'Unsafe path');const stat=lstatSync(input);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Only ordinary files may be published: '+path);const bytes=readFileSync(input);return {path,bytes:bytes.length,sha256:hash(bytes)};});
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim();
 const workingTreeDirty=!!execFileSync('git',['status','--porcelain'],{cwd:repository,encoding:'utf8'}).trim();
 if(process.env.GITHUB_ACTIONS==='true')assert(!workingTreeDirty,'CI must package a clean checked-out commit');
 mkdirSync(out,{recursive:true});
 for(const file of files){const target=resolve(out,file.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(repository,file.path),target);}
 const manifest={schemaVersion:1,commit,workingTreeDirty,readerRelease:release.id,files};
 writeFileSync(resolve(out,'site-release.json'),JSON.stringify(manifest,null,2)+'\n');writeFileSync(resolve(out,'.nojekyll'),'');
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=buildSite(process.argv[2]||resolve(repository,'_site'));
 console.log(`${result.files.length} public files; reader ${result.readerRelease}; commit ${result.commit}`);
}
