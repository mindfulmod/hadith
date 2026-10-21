/* Bind generated speech to exact reader English; input checks are not a listening review. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateSourceStructure,sourceSegments} from '../reader/source-structure.mjs';
import {validateSegmentedEvidence} from './narration-segments.mjs';
const root=new URL('../',import.meta.url);
export const audioHash=value=>createHash('sha256').update(value).digest('hex');
const objectHash=value=>audioHash(JSON.stringify(value));
const encoded=value=>JSON.stringify(value,null,2)+'\n';
const requireValue=(condition,message)=>assert(condition,message);
export function narrationPlan(source){
 const ids=new Set(),numbers=new Set();
 const entries=source.entries.map(entry=>{
  requireValue(!ids.has(entry.id)&&!numbers.has(entry.number),'Duplicate narration reference');ids.add(entry.id);numbers.add(entry.number);
  validateSourceStructure(entry);
  requireValue(entry.english_blocks.every(text=>typeof text==='string'&&text.trim()),'Empty English segment');
  const script=entry.english_blocks.join('\n\n');
  return {id:entry.id,number:entry.number,script,scriptSha256:audioHash(script),englishBlocksSha256:objectHash(entry.english_blocks),presentationSha256:objectHash(sourceSegments(entry,'english').map(({text,...range})=>range)),characters:Array.from(script).length,status:'script-prepared-not-audio-reviewed'};
 });
 return {schemaVersion:1,policy:'Complete English blocks, in source order, joined by two newlines. No trimming, substitution, omitted chains, phonetic spelling or added words. This checks the submitted script, not generated speech.',entries};
}
function signoff(review,sha,label){
 requireValue(review?.status==='approved'&&review.reviewerKind==='human'&&typeof review.reviewer==='string'&&review.reviewer.trim()&&typeof review.evidence==='string'&&review.evidence.trim()&&review.subjectSha256===sha,'Missing independent '+label+' review');
}
export function buildAudioCatalog(source,ledger,{readEvidence,readAsset,readOriginal,production=false}){
 const plan=narrationPlan(source),byNumber=new Map(plan.entries.map(e=>[e.number,e]));
 requireValue(ledger.schemaVersion===1&&Array.isArray(ledger.recordings)&&ledger.recordings.length>0,'Invalid audio ledger');
 const ids=new Set(),packIds=new Set(),paths=new Set(),covered=new Set(),recordings=[];
 for(const row of ledger.recordings){
  requireValue(/^[a-z0-9-]+$/.test(row.id)&&!ids.has(row.id),'Duplicate or invalid recording ID');ids.add(row.id);
  requireValue(/^[a-z0-9-]+$/.test(row.packId)&&!['reading','narration-review'].includes(row.packId)&&!packIds.has(row.packId),'Duplicate or invalid audio pack ID');packIds.add(row.packId);
  requireValue(/^audio\/[a-z0-9-]+\.(m4a|mp3)$/.test(row.src)&&!paths.has(row.src),'Invalid or reused audio path');paths.add(row.src);
  for(const key of ['title','album','voice','status'])requireValue(typeof row[key]==='string'&&row[key].trim(),'Missing recording '+key);
  requireValue(Number.isFinite(row.duration)&&row.duration>0&&Array.isArray(row.chapters)&&row.chapters.length,'Invalid recording duration');
  requireValue(/^reader\/audio\/[a-z0-9-]+\.json$/.test(row.evidence.path),'Invalid audio evidence path');
  const evidenceBytes=readEvidence(row.evidence.path);requireValue(audioHash(evidenceBytes)===row.evidence.sha256,'Changed generation evidence');
  const evidence=JSON.parse(evidenceBytes);requireValue(evidence.voice===row.voice&&Array.isArray(evidence.scripts),'Generation voice or scripts mismatch');
  requireValue(objectHash(evidence.chapters)===objectHash(row.chapters.map(({number,start,duration})=>({number,start,duration}))),'Chapter timing differs from generation evidence');
  requireValue(evidence.scripts.length===row.chapters.length,'Generation script coverage differs');
  if(row.generationFormat==='segmented-v1'||evidence.segmentation)validateSegmentedEvidence(evidence,row.chapters,{readOriginal});
  const audio=readAsset(row.src);requireValue(audio.length===row.bytes&&audioHash(audio)===row.sha256,'Audio file differs from ledger');
  requireValue(evidence.files.some(f=>f.file===row.src.slice(6)&&f.sha256===row.sha256),'Audio file missing from generation evidence');
  let end=0,previous=-1;
  for(const [i,chapter]of row.chapters.entries()){
   const entry=byNumber.get(chapter.number),index=plan.entries.findIndex(e=>e.number===chapter.number);
   requireValue(entry&&entry.id===chapter.entryId&&!covered.has(chapter.number),'Unknown, changed or duplicate recorded entry');covered.add(chapter.number);
   requireValue(i===0||index===previous+1,'A continuous recording may not skip or reorder hadith');previous=index;
   requireValue(Number.isFinite(chapter.start)&&Number.isFinite(chapter.duration)&&chapter.duration>0&&Math.abs(chapter.start-end)<0.000001,'Gap or overlap in chapter timing');end=chapter.start+chapter.duration;
   requireValue(chapter.scriptSha256===entry.scriptSha256&&chapter.englishBlocksSha256===entry.englishBlocksSha256&&chapter.presentationSha256===entry.presentationSha256,'Recording is stale for the current text');
   requireValue(evidence.scripts[i]===entry.script,'Submitted script differs from complete current English');
  }
  requireValue(Math.abs(end-row.duration)<0.000001,'Recording duration omits or exceeds its chapters');
  const subjectSha256=objectHash({id:row.id,src:row.src,sha256:row.sha256,voice:row.voice,duration:row.duration,chapters:row.chapters,evidence:row.evidence});
  if(production){signoff(row.wordingReview,subjectSha256,'spoken-word');signoff(row.pronunciationReview,subjectSha256,'pronunciation');}
  else {
   requireValue(row.publication==='personal-prototype','Audio prototype publication mismatch');
   for(const [review,label]of [[row.wordingReview,'spoken-word'],[row.pronunciationReview,'pronunciation']]){if(review?.status==='approved')signoff(review,subjectSha256,label);else requireValue(review?.status==='pending','Audio review must be pending or independently approved');}
  }
  recordings.push({...Object.fromEntries(['id','packId','title','album','src','voice','duration','status','bytes','sha256'].map(k=>[k,row[k]])),provenance:row.evidence.path.slice(7),chapters:structuredClone(row.chapters),review:{status:production?'independently-reviewed':'personal-prototype',subjectSha256,wording:row.wordingReview.status,pronunciation:row.pronunciationReview.status}});
 }
 const catalog={schemaVersion:1,recordings,coverage:{recorded:plan.entries.filter(e=>covered.has(e.number)).map(e=>e.number),unrecorded:plan.entries.filter(e=>!covered.has(e.number)).map(e=>e.number)}};
 return {plan,catalog};
}
export function audioFiles({check=false,production=false}={}){
 const json=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
 const result=buildAudioCatalog(json('reader/source-record.json'),json('content/audio/recordings.json'),{production,readOriginal:p=>readFileSync(new URL(p,root)),readEvidence:p=>readFileSync(new URL(p,root)),readAsset:p=>readFileSync(new URL('reader/'+p,root))});
 const files=new Map([['content/audio/narration-plan.json',encoded(result.plan)],['reader/audio/catalog.json',encoded(result.catalog)],['reader/recordings.mjs','// Generated by scripts/build-audio.mjs; do not edit recording bindings by hand.\nexport const recordings = '+JSON.stringify(result.catalog.recordings,null,2)+';\n']]);
 for(const [path,body]of files){const target=new URL(path,root);if(check)assert.equal(readFileSync(target,'utf8'),body,'Stale audio artifact: '+path);else writeFileSync(target,body);}
 return {...result,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=audioFiles({check:process.argv.includes('--check'),production:process.argv.includes('--production')});
 console.log(`${result.plan.entries.length} complete narration scripts; ${result.catalog.coverage.recorded.length} recorded hadith bound to exact text; spoken-word and pronunciation reviews remain separate.`);
}
