import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from 'node:fs';
import {narrationPlan,buildAudioCatalog,audioFiles,audioHash}from '../scripts/build-audio.mjs';
import {recordingCoverage,recordingForNumber}from '../reader/recording.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const inputs=()=>[json('reader/source-record.json'),json('content/audio/recordings.json')];
const options={readOriginal:read,readEvidence:read,readAsset:p=>read('reader/'+p)};
test('all prepared narration scripts contain every English block exactly, including later chains and notes',()=>{
 const [source]=inputs(),copy=structuredClone(source),plan=narrationPlan(source);
 assert.deepEqual(source,copy);assert.equal(plan.entries.length,191);
 for(const e of source.entries){const row=plan.entries.find(r=>r.number===e.number);assert.equal(row.script,e.english_blocks.join('\n\n'));assert.equal(row.scriptSha256,audioHash(row.script));}
 const incomplete=structuredClone(source);incomplete.entries[9].english_blocks.pop();assert.throws(()=>narrationPlan(incomplete));
});
test('published recordings bind exact input scripts and media without claiming speech accuracy',()=>{
 const [source,ledger]=inputs(),{catalog}=buildAudioCatalog(source,ledger,options);
 assert.deepEqual(catalog.coverage.recorded,[1,2,3,4,5,6]);assert.equal(catalog.coverage.unrecorded.length,185);
 assert.equal(catalog.recordings[0].review.wording,'pending');assert.equal(catalog.recordings[0].review.pronunciation,'pending');
 assert.equal(catalog.recordings[0].id,'cedar-opening-v1');assert.deepEqual(audioFiles({check:true}).catalog,catalog);
});
test('source changes cannot leave old narration silently available',()=>{
 for(const change of [source=>source.entries[0].english_blocks[0]+=' Added words.',source=>source.entries[0].id='different:1',source=>source.entries[0].english_blocks.reverse()]){
  const [source,ledger]=inputs();change(source);assert.throws(()=>buildAudioCatalog(source,ledger,options));
 }
 const [source,ledger]=inputs();source.entries[0].english_blocks[1]+=' Added words.';
 const changed=narrationPlan(source).entries[0];Object.assign(ledger.recordings[0].chapters[0],{scriptSha256:changed.scriptSha256,englishBlocksSha256:changed.englishBlocksSha256,presentationSha256:changed.presentationSha256});
 assert.throws(()=>buildAudioCatalog(source,ledger,options),/Submitted script/);
});
test('changed audio bytes, generation evidence and unsafe paths are rejected',()=>{
 const [source,ledger]=inputs();assert.throws(()=>buildAudioCatalog(source,ledger,{...options,readAsset:()=>Buffer.from('changed media')}),/Audio file/);
 assert.throws(()=>buildAudioCatalog(source,ledger,{...options,readEvidence:()=>Buffer.from('{}')}),/generation evidence/);
 for(const src of ['../private.mp3','https://example.com/a.mp3','audio/../a.mp3']){const l=structuredClone(ledger);l.recordings[0].src=src;assert.throws(()=>buildAudioCatalog(source,l,options),/audio path/);}
});
test('ambiguous records, repeated entries and chapter timing changes cannot publish',()=>{
 for(const change of [l=>l.recordings=[],l=>l.recordings.push(structuredClone(l.recordings[0])),l=>l.recordings[0].chapters[1].number=1,l=>l.recordings[0].chapters[1].start+=1,l=>l.recordings[0].duration+=1,l=>l.recordings[0].chapters.reverse()]){
  const [source,ledger]=inputs();change(ledger);assert.throws(()=>buildAudioCatalog(source,ledger,options));
 }
});
test('audio production requires two separate human reviews bound to the exact recording and script',()=>{
 const [source,ledger]=inputs(),row=ledger.recordings[0];ledger.recordings=[row];
 assert.throws(()=>buildAudioCatalog(source,ledger,{...options,production:true}),/spoken-word/);
 row.wordingReview={status:'approved',reviewerKind:'ai'};assert.throws(()=>buildAudioCatalog(source,ledger,{...options,production:true}),/spoken-word/);
 const clean=inputs()[1],subject=buildAudioCatalog(source,clean,options).catalog.recordings[0].review.subjectSha256;
 const fixture={status:'approved',reviewerKind:'human',reviewer:'Synthetic test reviewer — not an actual sign-off',evidence:'Synthetic test evidence',subjectSha256:subject};
 row.wordingReview=fixture;assert.equal(buildAudioCatalog(source,ledger,options).catalog.recordings[0].review.status,'personal-prototype');assert.throws(()=>buildAudioCatalog(source,ledger,{...options,production:true}),/pronunciation/);
 row.pronunciationReview={...fixture,subjectSha256:'wrong'};assert.throws(()=>buildAudioCatalog(source,ledger,{...options,production:true}),/pronunciation/);
 row.pronunciationReview=fixture;assert.equal(buildAudioCatalog(source,ledger,{...options,production:true}).catalog.recordings[0].review.status,'independently-reviewed');
});
test('session audio availability reports gaps without substituting a different hadith',()=>{
 assert.deepEqual(recordingCoverage([1,2,3,4,5,6,7]).recorded,[1,2,3,4,5,6]);assert.deepEqual(recordingCoverage([1,2,3,4,5,6,7]).missing,[7]);
 assert.equal(recordingCoverage([8,9]).completeRecording,null);assert.equal(recordingCoverage([1,2]).completeRecording.id,'cedar-opening-v1');
 for(const n of [7,8,999,'1',null])assert.equal(recordingForNumber(n),null);
});

test('separate continuous recordings can cover different source entries without changing their bindings',()=>{
 const [source,original]=inputs(),plan=narrationPlan(source),bytes=new Map(),evidence=new Map();
 const rows=[1,2].map(number=>{
  const entry=plan.entries.find(e=>e.number===number),row=structuredClone(original.recordings[0]);
  delete row.chapterFiles;row.id='synthetic-'+number;row.packId=row.id;row.src='audio/'+row.id+'.m4a';row.duration=10;
  row.chapters=[{number,start:0,duration:10,entryId:entry.id,scriptSha256:entry.scriptSha256,englishBlocksSha256:entry.englishBlocksSha256,presentationSha256:entry.presentationSha256}];
  const media=Buffer.from('SYNTHETIC TEST BYTES — not speech '+number);bytes.set(row.src,media);row.bytes=media.length;row.sha256=audioHash(media);
  const proof=Buffer.from(JSON.stringify({voice:row.voice,scripts:[entry.script],chapters:[{number,start:0,duration:10}],files:[{file:row.src.slice(6),sha256:row.sha256}]}));
  row.evidence={path:'reader/audio/'+row.id+'.json',sha256:audioHash(proof)};evidence.set(row.evidence.path,proof);return row;
 });
 const result=buildAudioCatalog(source,{schemaVersion:1,recordings:rows},{readAsset:p=>bytes.get(p),readEvidence:p=>evidence.get(p)});
 assert.equal(result.catalog.recordings.length,2);assert.deepEqual(result.catalog.coverage.recorded,[1,2]);
});
test('rebinding every input still cannot label a recording with a skipped source entry as continuous',()=>{
 const [source,ledger]=inputs(),plan=narrationPlan(source),row=ledger.recordings[0],entry=plan.entries.find(e=>e.number===3);
 Object.assign(row.chapters[1],{number:3,entryId:entry.id,scriptSha256:entry.scriptSha256,englishBlocksSha256:entry.englishBlocksSha256,presentationSha256:entry.presentationSha256});
 const proof=json(row.evidence.path);proof.chapters[1].number=3;proof.scripts[1]=entry.script;const raw=Buffer.from(JSON.stringify(proof));row.evidence.sha256=audioHash(raw);
 assert.throws(()=>buildAudioCatalog(source,ledger,{...options,readEvidence:()=>raw}),/skip or reorder/);
});

test('chapter playback originals are bound to entry-specific evidence and exact media bytes',()=>{
 for(const change of [l=>l.recordings[0].chapterFiles[0].number=2,l=>l.recordings[0].chapterFiles[0].duration++,l=>l.recordings[0].chapterFiles[0].sha256='wrong',l=>l.recordings[0].chapterFiles[0].src='../private.mp3']){
  const [source,ledger]=inputs();change(ledger);assert.throws(()=>buildAudioCatalog(source,ledger,options));
 }
 const [source,ledger]=inputs();assert.throws(()=>buildAudioCatalog(source,ledger,{...options,readAsset:p=>p.endsWith('.mp3')?Buffer.from('changed original'):options.readAsset(p)}),/Chapter audio differs/);
});
