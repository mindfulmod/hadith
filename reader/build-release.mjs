/* Run after all source/asset changes, before publishing. No dependencies. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recordings} from './recording.mjs';
import {checkSourceNotePublication} from '../scripts/source-notes.mjs';
import {audioFiles} from '../scripts/build-audio.mjs';
audioFiles({check:true});
import {validatePacks,releaseModuleSource} from './offline-store.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const core=['index.html','about.html','about.mjs','reader.css','reader.js','store.js','personal-state.mjs','backup.mjs','search.mjs','search-client.mjs','search-worker.mjs','library.mjs','navigation.mjs','personal-tools.mjs','content-library.mjs','source-format.mjs','source-structure.mjs','source-references.mjs','session.mjs','listening-plan.mjs','audio.mjs','recording.mjs','recordings.mjs','offline.mjs','offline-store.mjs','offline-view.mjs','integrity.mjs','manifest.webmanifest','icon-192.png','icon-512.png','../range.mjs','books/catalog.json'];
const catalog=JSON.parse(readFileSync(new URL('books/catalog.json',import.meta.url),'utf8'));
const sourceNotes=[...new Set(catalog.books.flatMap(book=>{const pack=JSON.parse(readFileSync(new URL(book.path,import.meta.url),'utf8'));return [...pack.sourceReferences.entries.map(row=>row.localNotes.path),...(book.introduction?[book.introduction.notes.path]:[]),...(book.chapters||[]).filter(c=>c.sourceContext).map(c=>c.sourceContext.notes.path)];}))];
const noteManifest=JSON.parse(readFileSync(new URL('source-notes.json',import.meta.url),'utf8'));
const notePages=checkSourceNotePublication(noteManifest,{read:path=>readFileSync(new URL(path,import.meta.url),'utf8')});
const reading=[...new Set([...sourceNotes,...notePages]),'source-notes.mjs','source-notes.json','source-record.json','prototype-inputs.json',...catalog.books.filter(b=>b.id!=='opening-revelation').map(b=>b.id+'-inputs.json'),'audio-review.html','audio-review.mjs',...new Set(recordings.map(r=>r.provenance)),'audio/catalog.json',...catalog.books.map(b=>b.path),'assets/garden-day.jpg','assets/garden-night.jpg','assets/detail-day.jpg','assets/detail-night.jpg'];
const comparisons=['audio/hadith-1-cedar-alternate-v1.mp3'];
const files=[...core,...reading,...recordings.flatMap(r=>[r.src,...(r.chapterFiles||[]).map(f=>f.src)]),...comparisons].map(path=>{const bytes=readFileSync(new URL(path,import.meta.url));return {path,bytes:bytes.length,sha256:hash(bytes),core:core.includes(path),audio:/\.(m4a|mp3)$/.test(path)};});
const packs=[
 {id:'reading',kind:'reading',title:'All reading material',description:`${catalog.entries.length} available hadith, source notes and artwork.`,requires:[],files:[...core,...reading]},
 ...recordings.map(recording=>({id:recording.packId,kind:'audio',title:recording.title,description:'Complete narrator chains; includes chapter files where available for session endings.',recordingId:recording.id,entryNumbers:recording.chapters.map(c=>c.number),requires:['reading'],files:[recording.src,...(recording.chapterFiles||[]).map(f=>f.src)]})),
 {id:'narration-review',kind:'review',title:'Narration review clips',description:'The Take B comparison. Take A originals are included with Hadith 1–2 audio.',requires:['reading'],files:comparisons}
].map(p=>({...p,bytes:p.files.reduce((sum,path)=>sum+files.find(f=>f.path===path).bytes,0)}));
const release={schemaVersion:2,id:'opening-'+hash(JSON.stringify({files,packs})).slice(0,12),bytes:files.reduce((sum,f)=>sum+f.bytes,0),files,packs};
validatePacks(release);
writeFileSync(new URL('release.mjs',import.meta.url),releaseModuleSource(release));
const workerURL=new URL('sw.js',import.meta.url),worker=readFileSync(workerURL,'utf8').replace(/^\/\/ Reader release: .*\n/,'');
writeFileSync(workerURL,'// Reader release: '+release.id+'\n'+worker);
writeFileSync(new URL('../reader-version.json',import.meta.url),JSON.stringify({release:release.id,label:'Session reader'},null,2)+'\n');
console.log(`${release.id}: ${files.length} checked files, ${(release.bytes/1e6).toFixed(2)} MB`);
for(const pack of packs)console.log(`${pack.title}: ${(pack.bytes/1e6).toFixed(2)} MB`);
