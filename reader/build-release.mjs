/* Run after all source/asset changes, before publishing. No dependencies. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recording} from './recording.mjs';
import {validatePacks,releaseModuleSource} from './offline-store.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const core=['index.html','about.html','about.mjs','reader.css','reader.js','store.js','personal-state.mjs','backup.mjs','search.mjs','library.mjs','navigation.mjs','personal-tools.mjs','content-library.mjs','source-format.mjs','source-structure.mjs','source-references.mjs','session.mjs','audio.mjs','recording.mjs','offline.mjs','offline-store.mjs','offline-view.mjs','integrity.mjs','manifest.webmanifest','icon-192.png','icon-512.png','../range.mjs','books/catalog.json'];
const catalog=JSON.parse(readFileSync(new URL('books/catalog.json',import.meta.url),'utf8'));
const sourceNotes=[...new Set(catalog.books.flatMap(book=>JSON.parse(readFileSync(new URL(book.path,import.meta.url),'utf8')).sourceReferences.entries.map(row=>row.localNotes.path)))];
const reading=[...sourceNotes,'source-record.json','prototype-inputs.json','audio-review.html','audio-review.mjs','audio/provenance.json',...catalog.books.map(b=>b.path),'assets/garden-day.jpg','assets/garden-night.jpg','assets/detail-day.jpg','assets/detail-night.jpg'];
const comparisons=['audio/hadith-1-cedar-v1.mp3','audio/hadith-2-cedar-v1.mp3','audio/hadith-1-cedar-alternate-v1.mp3'];
const files=[...core,...reading,recording.src,...comparisons].map(path=>{const bytes=readFileSync(new URL(path,import.meta.url));return {path,bytes:bytes.length,sha256:hash(bytes),core:core.includes(path),audio:/\.(m4a|mp3)$/.test(path)};});
const packs=[
 {id:'reading',kind:'reading',title:'All reading material',description:`${catalog.entries.length} available hadith, source notes and artwork.`,requires:[],files:[...core,...reading]},
 {id:'cedar-opening',kind:'audio',title:'Hadith 1–2 · Cedar',description:'The continuous recording used by the reader.',recordingId:recording.id,entryNumbers:recording.chapters.map(c=>c.number),requires:['reading'],files:[recording.src]},
 {id:'narration-review',kind:'review',title:'Narration review clips',description:'The original Take A recordings and the Take B comparison.',requires:['reading'],files:comparisons}
].map(p=>({...p,bytes:p.files.reduce((sum,path)=>sum+files.find(f=>f.path===path).bytes,0)}));
const release={schemaVersion:2,id:'opening-'+hash(JSON.stringify({files,packs})).slice(0,12),bytes:files.reduce((sum,f)=>sum+f.bytes,0),files,packs};
validatePacks(release);
writeFileSync(new URL('release.mjs',import.meta.url),releaseModuleSource(release));
const workerURL=new URL('sw.js',import.meta.url),worker=readFileSync(workerURL,'utf8').replace(/^\/\/ Reader release: .*\n/,'');
writeFileSync(workerURL,'// Reader release: '+release.id+'\n'+worker);
writeFileSync(new URL('../reader-version.json',import.meta.url),JSON.stringify({release:release.id,label:'Session reader'},null,2)+'\n');
console.log(`${release.id}: ${files.length} checked files, ${(release.bytes/1e6).toFixed(2)} MB`);
for(const pack of packs)console.log(`${pack.title}: ${(pack.bytes/1e6).toFixed(2)} MB`);
