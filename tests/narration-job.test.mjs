import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareNarrationJob,validateNarrationJob,recordNarrationSegment,completedSegmentation} from '../scripts/narration-job.mjs';
import {audioHash,buildAudioCatalog} from '../scripts/build-audio.mjs';
import {isPublicFile} from '../scripts/build-site.mjs';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root)),json=path=>JSON.parse(read(path));
const source=json('reader/source-record.json'),jobPath='content/audio/jobs/hadith-7-cedar-v1.json';
const saved=()=>json(jobPath);

test('saved Hadith 7 generation preserves all current English and identifies the exact missing final segment',()=>{
 const job=saved(),status=validateNarrationJob(job,source),entry=source.entries.find(e=>e.number===7);
 assert.deepEqual(status.saved,[1,2,3,4,5,6,7,8,9]);assert.deepEqual(status.missing,[10]);assert.equal(status.complete,false);
 assert.equal(job.script,entry.english_blocks.join('\n\n'));
 assert.equal(job.segmentation.entries[0].parts.map(p=>p.text).join(''),job.script);
 assert(job.script.endsWith('Salih ibn Kaysan, Yunus and Ma‘mar related it from al-Zuhri.'));
 assert.equal(job.delivery.instructions,json('reader/audio/hadith-6-provenance.json').instructions);
 assert.throws(()=>completedSegmentation(job,source),/Incomplete recording; missing segment\(s\): 10/);
});

test('a resumed job does not silently adopt changed English, voice, delivery, reference or segment order',()=>{
 for(const change of [j=>j.script+=' Words.',j=>j.entry.number=8,j=>j.entry.presentationSha256='wrong',j=>j.delivery.voice='Marin',j=>j.delivery.instructions+=' Faster.',j=>j.segmentation.entries[0].parts.reverse(),j=>j.segmentation.entries[0].parts.pop(),j=>j.segmentation.entries[0].parts[0].text=j.segmentation.entries[0].parts[0].text.trim(),j=>j.segmentation.limit=1000]){
  const job=saved();change(job);assert.throws(()=>validateNarrationJob(job,source));
 }
 const changed=structuredClone(source);changed.entries.find(e=>e.number===7).english_blocks[0]+=' Different words.';
 assert.throws(()=>validateNarrationJob(saved(),changed));
 assert.throws(()=>prepareNarrationJob(source,7,{readEvidence:()=>Buffer.from('{}')}),/Selected delivery evidence/);
});

test('a job remains valid when later content is added without changing the recorded entry',()=>{
 const earlier={...source,entries:source.entries.slice(0,7)};
 assert.deepEqual(validateNarrationJob(saved(),earlier),validateNarrationJob(saved(),source));
});

test('missing, substituted, duplicated or unsafe original media cannot pass resume checks',()=>{
 assert.throws(()=>validateNarrationJob(saved(),source,{readOriginal:()=>Buffer.from('different audio')}),/bytes changed/);
 for(const change of [j=>j.segmentation.entries[0].parts[0].original.path='../private.mp3',j=>j.segmentation.entries[0].parts[0].original=null,j=>delete j.segmentation.entries[0].parts[0].original,j=>j.segmentation.entries[0].parts[1].original=j.segmentation.entries[0].parts[0].original,j=>j.segmentation.entries[0].parts[0].receipt.inputSha256='wrong']){
  const job=saved();change(job);assert.throws(()=>validateNarrationJob(job,source));
 }
});

test('recording another segment is immutable and cannot overwrite preserved work or reuse the same audio',()=>{
 const job=saved(),before=structuredClone(job),part=job.segmentation.entries[0].parts[0];
 assert.throws(()=>recordNarrationSegment(job,source,1,part.original),/already recorded/);
 assert.throws(()=>recordNarrationSegment(job,source,11,part.original),/missing/);
 assert.throws(()=>recordNarrationSegment(job,source,10,part.original),/repeated original path/);
 const duplicate={...part.original,path:'content/audio/raw/synthetic-duplicate.mp3'};
 assert.throws(()=>recordNarrationSegment(job,source,10,duplicate,{readOriginal:path=>path===duplicate.path?read(part.original.path):read(path)}),/different segments/);
 assert.deepEqual(job,before);
});

test('a complete synthetic job can export ordered assembly inputs without approving or admitting audio',()=>{
 const job=prepareNarrationJob(source,6,{date:'2026-11-02'}),bytes=Buffer.from('synthetic unit-test media, not a recording');
 const options={readOriginal:()=>bytes},original={path:'content/audio/raw/synthetic-six.mp3',bytes:bytes.length,sha256:audioHash(bytes)};
 const result=recordNarrationSegment(job,source,1,original,options);
 assert.equal(validateNarrationJob(result,source,options).complete,true);
 assert.deepEqual(completedSegmentation(result,source,options),result.segmentation);
 assert.equal(result.publication,'not-admitted');assert.equal(result.review.wording,'pending');
 assert(!job.segmentation.entries[0].parts[0].original);
 result.review.wording='approved';assert.throws(()=>validateNarrationJob(result,source,options),/cannot approve/);
});

test('partial generation is excluded from public assets and existing complete narration stays unchanged',()=>{
 const job=saved();assert.equal(isPublicFile(jobPath),false);
 for(const part of job.segmentation.entries[0].parts.filter(p=>p.original))assert.equal(isPublicFile(part.original.path),false);
 const {catalog}=buildAudioCatalog(source,json('content/audio/recordings.json'),{readEvidence:read,readOriginal:read,readAsset:path=>read('reader/'+path)});
 assert.deepEqual(catalog.coverage.recorded,[1,2,3,4,5,6]);assert(catalog.coverage.unrecorded.includes(7));
 assert(!catalog.recordings.some(row=>row.chapters.some(chapter=>chapter.number===7)));
});

test('the audio catalogue refuses a partial job even if a caller supplies a claimed complete media file',()=>{
 const job=saved(),row=structuredClone(json('content/audio/recordings.json').recordings.at(-1));
 const media=Buffer.from('synthetic incomplete assembly, not actual speech');
 Object.assign(row,{id:'synthetic-seven',packId:'synthetic-seven',src:'audio/synthetic-seven.m4a',duration:10,bytes:media.length,sha256:audioHash(media)});
 row.chapters=[{number:7,start:0,duration:10,entryId:job.entry.id,...Object.fromEntries(['scriptSha256','englishBlocksSha256','presentationSha256'].map(key=>[key,job.entry[key]]))}];
 const proof=Buffer.from(JSON.stringify({voice:job.delivery.voice,scripts:[job.script],segmentation:job.segmentation,chapters:[{number:7,start:0,duration:10}],files:[{file:'synthetic-seven.m4a',sha256:row.sha256}]}));
 row.evidence={path:'reader/audio/synthetic-seven.json',sha256:audioHash(proof)};
 assert.throws(()=>buildAudioCatalog(source,{schemaVersion:1,recordings:[row]},{readEvidence:()=>proof,readOriginal:read,readAsset:()=>media}),/original audio path/);
});

test('the assembly export command fails without creating a file for incomplete work',()=>{
 const dir=mkdtempSync(join(tmpdir(),'narration-job-test-')),output=join(dir,'segments.json');
 try{
  const status=JSON.parse(execFileSync(process.execPath,['scripts/narration-job.mjs','--check',jobPath],{cwd:root,encoding:'utf8'}));
  assert.deepEqual(status.missing,[10]);
  assert.throws(()=>execFileSync(process.execPath,['scripts/narration-job.mjs','--segments',jobPath,output],{cwd:root,stdio:'pipe'}));
  assert.equal(existsSync(output),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
