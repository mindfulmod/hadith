import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createContentLibrary} from '../reader/content-library.mjs';
import {validatePacks} from '../reader/offline-store.mjs';
import {checkSourceNoteLinks} from '../scripts/build-site.mjs';
test('the local-only navigation fixture remains loadable with complete presentation and source metadata',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'hadith-fixture-test-')),out=join(temp,'site');
 try{
  execFileSync(process.execPath,['tests/create-browser-fixture.mjs',out],{cwd:new URL('../',import.meta.url)});
  const {release}=await import(pathToFileURL(join(out,'reader/release.mjs')).href);validatePacks(release);
  const library=await createContentLibrary({files:release.files,base:new URL('https://example.invalid/reader/'),fetcher:async url=>new Response(readFileSync(join(out,url.pathname)))});
  const entries=await library.loadAllEntries();assert.equal(entries.length,97);
  const synthetic=entries.filter(entry=>entry.id.startsWith('fixture:'));assert.equal(synthetic.length,95);
  assert(synthetic.every(entry=>entry.english_blocks[0]==='TEST FIXTURE — not a hadith.'));
  const packs=await Promise.all(library.catalog.books.map(book=>library.loadBook(book.id)));
  checkSourceNoteLinks(packs,{read:path=>readFileSync(join(out,'reader',path),'utf8')});
  const related=packs[1].sourceReferences.entries[1].contextNotes[0].related[0];assert.equal(related.target,'chain');assert.equal(related.number,10);
  assert(readFileSync(join(out,'reader/index.html'),'utf8').includes('LOCAL TEST LIBRARY'));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
