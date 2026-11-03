/* Resumable, local generation evidence. A saved segment is never a published recording. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {narrationPlan,audioHash} from './build-audio.mjs';
import {splitNarration,validateSegmentedEvidence} from './narration-segments.mjs';

const root=new URL('../',import.meta.url);
const deliveryPath='reader/audio/hadith-3-provenance.json';
const deliveryHash='0c332a9627b13ef48afe0a11049eb5871d3678d808769656acd0dcc56055d705';
const entryKeys=['id','number','scriptSha256','englishBlocksSha256','presentationSha256'];
const partKeys=['index','start','end','text','sha256'];
const pick=(object,keys)=>Object.fromEntries(keys.map(key=>[key,object[key]]));
const pendingReviews={wording:'pending',pronunciation:'pending',deliveryAndJoins:'pending',iphoneOffline:'pending'};
const read=path=>readFileSync(new URL(path,root));

function acceptedDelivery(readEvidence){
 const bytes=readEvidence(deliveryPath);
 assert.equal(audioHash(bytes),deliveryHash,'Selected delivery evidence changed');
 const evidence=JSON.parse(bytes);
 return {source:evidence.source,modelLabel:evidence.model_label,voice:evidence.voice,instructions:evidence.instructions,evidence:{path:deliveryPath,sha256:deliveryHash}};
}

export function prepareNarrationJob(source,number,{readEvidence=read,date=new Date().toISOString().slice(0,10),version=1}={}){
 assert(Number.isSafeInteger(version)&&version>0,'Invalid recording version');
 const entry=narrationPlan(source).entries.find(entry=>entry.number===number);
 assert(entry,'Unknown narration reference');
 return {
  schemaVersion:1,id:`hadith-${number}-cedar-v${version}`,version,createdAt:date,
  publication:'not-admitted',entry:pick(entry,entryKeys),delivery:acceptedDelivery(readEvidence),
  script:entry.script,
  segmentation:{schemaVersion:1,limit:999,offsetUnit:'utf16-code-units',entries:[{number,scriptSha256:entry.scriptSha256,parts:splitNarration(entry.script)}]},
  review:{...pendingReviews},
 };
}

export function validateNarrationJob(job,source,{readEvidence=read,readOriginal=read,requireComplete=false}={}){
 assert(job?.schemaVersion===1&&job.publication==='not-admitted','Generation jobs cannot claim publication');
 assert(/^\d{4}-\d{2}-\d{2}$/.test(job.createdAt),'Missing generation date');
 const expected=prepareNarrationJob(source,job.entry?.number,{readEvidence,date:job.createdAt,version:job.version});
 assert.equal(job.id,expected.id,'Generation identity changed');
 assert.deepEqual(job.entry,expected.entry,'Generation job is stale for current source');
 assert.deepEqual(job.delivery,expected.delivery,'Selected voice or delivery changed');
 assert.equal(job.script,expected.script,'Generation job differs from complete current English');
 assert.deepEqual(job.review,pendingReviews,'Generation evidence cannot approve spoken wording');
 const segment=job.segmentation,planned=expected.segmentation;
 assert.equal(segment?.schemaVersion,planned.schemaVersion,'Missing segmentation');
 assert.equal(segment.limit,planned.limit,'Studio input limit changed');
 assert.equal(segment.offsetUnit,planned.offsetUnit,'Segmentation offset unit changed');
 assert.equal(segment.entries?.length,1,'Generation jobs contain one complete hadith');
 const entry=segment.entries[0],expectedEntry=planned.entries[0];
 assert.equal(entry.number,expectedEntry.number,'Segmented reference changed');
 assert.equal(entry.scriptSha256,expectedEntry.scriptSha256,'Segmented script changed');
 assert.equal(entry.parts?.length,expectedEntry.parts.length,'Missing or extra planned segment');
 const paths=new Set(),hashes=new Set(),saved=[],missing=[];
 for(const [index,part]of entry.parts.entries()){
  assert.deepEqual(pick(part,partKeys),expectedEntry.parts[index],'Segment reordered, shortened or changed');
  if(!Object.hasOwn(part,'original')){
   assert(!Object.hasOwn(part,'receipt'),'Receipt without original recording');missing.push(part.index);continue;
  }
  const original=part.original;
  assert(/^content\/audio\/raw\/[a-z0-9-]+\.mp3$/.test(original?.path)&&!paths.has(original.path),'Invalid or repeated original path');
  assert(Number.isSafeInteger(original.bytes)&&original.bytes>0&&/^[a-f0-9]{64}$/.test(original.sha256),'Invalid original recording metadata');
  const bytes=readOriginal(original.path);
  assert(bytes.length===original.bytes&&audioHash(bytes)===original.sha256,'Original recording bytes changed');
  assert(!hashes.has(original.sha256),'One downloaded recording cannot satisfy different segments');
  assert.deepEqual(part.receipt,{inputSha256:part.sha256,deliverySha256:audioHash(JSON.stringify(job.delivery)),method:'openai-fm-download'},'Segment receipt differs from submitted input or delivery');
  paths.add(original.path);hashes.add(original.sha256);saved.push(part.index);
 }
 if(requireComplete)assert.equal(missing.length,0,`Incomplete recording; missing segment(s): ${missing.join(', ')}`);
 if(!missing.length)validateSegmentedEvidence({scripts:[job.script],segmentation:job.segmentation},[{number:job.entry.number}],{readOriginal});
 return {id:job.id,number:job.entry.number,total:entry.parts.length,saved,missing,complete:missing.length===0,publication:'not-admitted'};
}

export function recordNarrationSegment(job,source,index,original,options={}){
 validateNarrationJob(job,source,options);
 assert(Number.isSafeInteger(index)&&index>0,'Invalid segment index');
 const next=structuredClone(job),part=next.segmentation.entries[0].parts[index-1];
 assert(part&&!Object.hasOwn(part,'original'),'Segment is missing or already recorded; preserve existing evidence');
 part.original=structuredClone(original);
 part.receipt={inputSha256:part.sha256,deliverySha256:audioHash(JSON.stringify(job.delivery)),method:'openai-fm-download'};
 validateNarrationJob(next,source,options);
 return next;
}

export function completedSegmentation(job,source,options={}){
 validateNarrationJob(job,source,{...options,requireComplete:true});
 return structuredClone(job.segmentation);
}

// This tool reads existing originals; it never generates speech, contacts a service or admits audio.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [command,path,...args]=process.argv.slice(2);
 assert(['--check','--segments'].includes(command)&&path,'Use --check <job.json> or --segments <job.json> <new-output.json>');
 const job=JSON.parse(readFileSync(path)),source=JSON.parse(read('reader/source-record.json'));
 const status=validateNarrationJob(job,source);
 if(command==='--segments'){
  assert(args.length===1&&!existsSync(args[0]),'Choose a new output path');
  const segmentation=completedSegmentation(job,source);
  writeFileSync(args[0],JSON.stringify(segmentation,null,2)+'\n',{flag:'wx'});
 }
 console.log(JSON.stringify(status));
}
