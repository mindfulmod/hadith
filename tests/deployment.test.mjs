import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isPublicFile,verifyFiles,checkArtifactPaths,checkLocalLinks} from '../scripts/build-site.mjs';
import {release} from '../reader/release.mjs';
const repository=new URL('../',import.meta.url);
test('site packaging preserves the reader and earlier public experiences, excluding source intake and build tools',()=>{
 const paths=execFileSync('git',['ls-files','-z'],{cwd:repository,encoding:'utf8'}).split('\0').filter(isPublicFile);
 checkArtifactPaths(paths);
 for(const path of ['voices.html','audio/auditions.json','landscapes/index.html','research/visual-world.html','research/reader-next/concept.mjs','reader/about.html'])assert(paths.includes(path),path);
 for(const path of ['content/sources/openiti-bukhari/source.mARkdown','content/staging/bukhari-ar/catalog.json','reader/build-release.mjs','reader/check-content.mjs','.git/config','reader/../../secret.json','scripts/publish-books.mjs','tests/deployment.test.mjs'])assert.equal(isPublicFile(path),false,path);
});
test('missing public assets prevent site assembly even when other files are present',()=>{
 const paths=execFileSync('git',['ls-files','-z'],{cwd:repository,encoding:'utf8'}).split('\0').filter(isPublicFile);
 assert.throws(()=>checkArtifactPaths(paths.filter(p=>p!=='range.mjs')),/Missing offline asset/);
 assert.throws(()=>checkArtifactPaths(paths.filter(p=>p!=='reader/about.html')),/Missing public route/);
});
test('site assembly refuses changed bytes before creating an artifact',()=>{
 const bytes=Buffer.from('checked text'),file={path:'example',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 verifyFiles([file],{read:()=>bytes});
 assert.throws(()=>verifyFiles([file],{read:()=>Buffer.from('changed text')}),/Wrong release/);
 assert.throws(()=>verifyFiles([file],{read:()=>bytes.subarray(1)}),/Wrong release/);
});
test('the current release includes source and privacy information offline',()=>{
 for(const path of ['about.html','about.mjs','source-record.json','source-review.html'])assert(release.files.some(f=>f.path===path&&f.core));
 const about=readFileSync(new URL('../reader/about.html',import.meta.url),'utf8');assert(about.includes('source-correction.yml'));assert(about.includes('AI-assisted working translation'));assert(about.includes('does not upload it'));
});

test('local-link checking catches omitted pages and tolerates anchors and external sources',()=>{
 const paths=['index.html','reader/index.html','reader/about.html'];
 const pages={'index.html':'<a href="reader/">Read</a>', 'reader/index.html':'<a href="about.html#privacy">About</a><a href="https://sunnah.com/bukhari:1">Source</a>','reader/about.html':'<a href="./">Return</a>'};
 checkLocalLinks(paths,{read:path=>pages[path]});
 pages['reader/about.html']='<img src="missing.jpg">';assert.throws(()=>checkLocalLinks(paths,{read:path=>pages[path]}),/Missing local link/);
});
