/* Local prototype scope only. This archive never supplies human or publication approval. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const root=new URL('../content/review/',import.meta.url);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const key=row=>row.sourceRecordSha256+':'+row.catalogContextSha256;
const json=value=>JSON.stringify(value,null,2)+'\n';
const bookPath=sha256=>'prototype-books/'+sha256+'.json';
const scopePath=sha256=>'prototype-scopes/'+sha256+'.json';
const scopeChunkSize=128;
function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);
  Object.freeze(value);
 }
 return value;
}
function validateRecord(record){
 assert(record&&isHash(record.sourceRecordSha256),'Invalid prototype source hash');
 assert.equal(record.status,'personal-prototype-only','Prototype status must remain explicit');
 assert(Array.isArray(record.entryIds)&&record.entryIds.length&&record.entryIds.every(id=>typeof id==='string'&&id.trim()),'Missing prototype scope');
 assert.equal(new Set(record.entryIds).size,record.entryIds.length,'Duplicate prototype source ID');
 assert(Array.isArray(record.books)&&record.books.length,'Missing prototype book context');
 assert(typeof record.basis==='string'&&record.basis.trim(),'Missing prototype admission basis');
 if(record.catalogContextSha256!==undefined)assert.equal(record.catalogContextSha256,hash(record.books),'Prototype context admission is stale');
}

// Only the selected admission's book contexts are read by a normal buildBooks call.
// The complete archive is checked separately by CI and the site publisher.
export function createPrototypeAdmissionStore({read=path=>readFileSync(new URL(path,root),'utf8')}={}){
 let rows;
 const books=new Map(),scopes=new Map(),resolved=new Map();
 function index(){
  if(!rows){
   const value=JSON.parse(read('prototype-admissions.json'));
   assert.equal(value.schemaVersion,2,'Unsupported prototype admission archive');
   assert(Array.isArray(value.admissions)&&value.admissions.length,'Empty prototype admission archive');
   const keys=new Set();
   for(const row of value.admissions){
    assert(isHash(row.sourceRecordSha256)&&isHash(row.catalogContextSha256)&&isHash(row.recordSha256),'Invalid prototype admission index');
    assert(!keys.has(key(row)),'Duplicate prototype admission');keys.add(key(row));
    assert(row.record&&row.record.sourceRecordSha256===row.sourceRecordSha256&&!Object.hasOwn(row.record,'books')&&!Object.hasOwn(row.record,'entryIds'),'Conflicting prototype admission index');
    assert(Array.isArray(row.record.bookContextHashes)&&row.record.bookContextHashes.length&&row.record.bookContextHashes.every(isHash),'Invalid prototype book reference');
    assert(Array.isArray(row.record.entryIdChunks)&&row.record.entryIdChunks.length&&row.record.entryIdChunks.every(isHash),'Invalid prototype scope reference');
   }
   rows=value.admissions;
  }
  return rows;
 }
 function resolve(row){
  if(!row)return undefined;
  if(!resolved.has(key(row))){
   const selected=row.record.bookContextHashes.map(sha256=>{
    if(!books.has(sha256)){
     const value=JSON.parse(read(bookPath(sha256)));
     assert.equal(hash(value),sha256,'Prototype book context hash mismatch');
     books.set(sha256,value);
    }
    return books.get(sha256);
   });
   const entryIds=row.record.entryIdChunks.flatMap(sha256=>{
    if(!scopes.has(sha256)){
     const ids=JSON.parse(read(scopePath(sha256)));
     assert(Array.isArray(ids)&&ids.length>0&&ids.length<=scopeChunkSize,'Invalid prototype scope chunk');
     assert.equal(hash(ids),sha256,'Prototype scope hash mismatch');
     scopes.set(sha256,ids);
    }
    return scopes.get(sha256);
   });
   // Preserve every original field, its order, optional hashes and admission basis.
   const record=Object.fromEntries(Object.entries(row.record).map(([name,value])=>name==='bookContextHashes'?['books',selected]:name==='entryIdChunks'?['entryIds',entryIds]:[name,value]));
   validateRecord(record);
   assert.equal(hash(selected),row.catalogContextSha256,'Prototype context admission is stale');
   assert.equal(hash(record),row.recordSha256,'Prototype admission record changed');
   resolved.set(key(row),freeze(record));
  }
  return resolved.get(key(row));
 }
 return {
  get:(sourceHash,contextHash)=>resolve(index().find(row=>row.sourceRecordSha256===sourceHash&&row.catalogContextSha256===contextHash)),
  forSource:sourceHash=>index().filter(row=>row.sourceRecordSha256===sourceHash).map(resolve),
  all:()=>index().map(resolve)
 };
}

export function packPrototypeAdmissions(legacy){
 assert.equal(legacy.schemaVersion,1,'Migration requires the original version-one archive');
 assert(Array.isArray(legacy.admissions)&&legacy.admissions.length,'Empty prototype admission archive');
 const files=new Map(),admissions=legacy.admissions.map(record=>{
  validateRecord(record);
  assert(!Object.hasOwn(record,'bookContextHashes')&&!Object.hasOwn(record,'entryIdChunks'),'Conflicting prototype archive references');
  const hashes=record.books.map(book=>{
   const sha256=hash(book),path=bookPath(sha256),body=json(book);
   if(files.has(path))assert.equal(files.get(path),body,'Conflicting prototype context');
   files.set(path,body);return sha256;
  });
  const scopeHashes=[];
  for(let offset=0;offset<record.entryIds.length;offset+=scopeChunkSize){
   const ids=record.entryIds.slice(offset,offset+scopeChunkSize),sha256=hash(ids);
   files.set(scopePath(sha256),json(ids));scopeHashes.push(sha256);
  }
  return {sourceRecordSha256:record.sourceRecordSha256,catalogContextSha256:hash(record.books),recordSha256:hash(record),record:Object.fromEntries(Object.entries(record).map(([name,value])=>name==='books'?['bookContextHashes',hashes]:name==='entryIds'?['entryIdChunks',scopeHashes]:[name,value]))};
 });
 files.set('prototype-admissions.json',json({schemaVersion:2,admissions}));
 const reconstructed=createPrototypeAdmissionStore({read:path=>files.get(path)}).all();
 assert.deepEqual(reconstructed,legacy.admissions,'Migration changed a historical admission');
 return {index:{schemaVersion:2,admissions},files};
}

// Explicit authoring operation: a complete proposed admission must be supplied.
// It neither invents a basis nor promotes the source to production.
export function appendPrototypeAdmission(record,{directory=root}={}){
 const read=path=>readFileSync(new URL(path,directory),'utf8');
 const existing=read('prototype-admissions.json'),store=createPrototypeAdmissionStore({read});
 store.all();
 const added=packPrototypeAdmissions({schemaVersion:1,admissions:[record]});
 const index=JSON.parse(existing),row=added.index.admissions[0],prior=index.admissions.find(item=>key(item)===key(row));
 if(prior){assert.equal(prior.recordSha256,row.recordSha256,'Conflicting admission for this exact source and context');return false;}
 index.admissions.push(row);
 added.files.set('prototype-admissions.json',json(index));
 writeArchive(added.files,{directory,expectedIndex:existing});
 return true;
}
function writeArchive(files,{directory=root,expectedIndex}){
 // Write reusable immutable contexts first, then atomically replace the index.
 mkdirSync(new URL('prototype-books/',directory),{recursive:true});
 mkdirSync(new URL('prototype-scopes/',directory),{recursive:true});
 for(const [path,body]of files){
  if(path==='prototype-admissions.json')continue;
  const target=new URL(path,directory);
  if(existsSync(target))assert.deepEqual(JSON.parse(readFileSync(target,'utf8')),JSON.parse(body),'Existing prototype context differs');
  else writeFileSync(target,body,{flag:'wx'});
 }
 const target=new URL('prototype-admissions.json',directory);
 assert.equal(readFileSync(target,'utf8'),expectedIndex,'Prototype archive changed during authoring');
 const temporary=new URL('prototype-admissions.json.tmp-'+process.pid,directory);
 writeFileSync(temporary,files.get('prototype-admissions.json'),{flag:'wx'});
 renameSync(temporary,target);
}

export const prototypeAdmissions=createPrototypeAdmissionStore();
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [operation,path,...extra]=process.argv.slice(2);
 assert(!extra.length&&['--check','--migrate','--add'].includes(operation)&&((operation==='--add')===Boolean(path)),'Use --check, --migrate, or --add /path/to/proposed-admission.json');
 if(operation==='--migrate'){
  const original=readFileSync(new URL('prototype-admissions.json',root),'utf8');
  const packed=packPrototypeAdmissions(JSON.parse(original));
  writeArchive(packed.files,{expectedIndex:original});
 }else if(operation==='--add')appendPrototypeAdmission(JSON.parse(readFileSync(path,'utf8')));
 const records=createPrototypeAdmissionStore().all();
 console.log(`${records.length} exact personal-prototype admissions checked; independent review and publication approval remain separate.`);
}
