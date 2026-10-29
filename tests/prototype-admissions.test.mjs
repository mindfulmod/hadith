import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPrototypeAdmissionStore,packPrototypeAdmissions,appendPrototypeAdmission} from '../scripts/prototype-admissions.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
function fixture(){
 const books=[{id:'fixture-one',number:1,title:'Synthetic context',entryNumbers:[619,'619b',620]}];
 const record={sourceRecordSha256:hash('synthetic source'),entryIds:Array.from({length:260},(_,i)=>'fixture:'+i),books,status:'personal-prototype-only',basis:'Synthetic test, not approval of any hadith.'};
 const next={...record,sourceRecordSha256:hash('synthetic expansion'),entryIds:[...record.entryIds,'fixture:260']};
 const sameTextDifferentContext={...record,books:[{...books[0],title:'Different synthetic context'}],catalogContextSha256:hash([{...books[0],title:'Different synthetic context'}])};
 const legacy={schemaVersion:1,admissions:[record,next,sameTextDifferentContext]};
 return {legacy,...packPrototypeAdmissions(legacy)};
}
const storeFor=files=>createPrototypeAdmissionStore({read:path=>{assert(files.has(path),'Missing test archive file: '+path);return files.get(path);}});
function changeIndex(files,change){const index=JSON.parse(files.get('prototype-admissions.json'));change(index);files.set('prototype-admissions.json',JSON.stringify(index));}
test('all 54 pre-migration admissions retain every exact field, order, source ID and basis',()=>{
 const history=read('tests/fixtures/prototype-admissions-history.json'),all=createPrototypeAdmissionStore().all(),original=all.slice(0,history.recordCount);
 assert.equal(original.length,54);assert.equal(hash(original),history.admissionsSha256);
 assert.deepEqual(original.map(hash),history.recordSha256);
 assert(all.every(record=>record.status==='personal-prototype-only'));
});
test('migration reuses unchanged books and completed scope chunks without changing historical records',()=>{
 const {legacy,index,files}=fixture(),all=storeFor(files).all();
 assert.deepEqual(all,legacy.admissions);assert.equal(JSON.stringify(all),JSON.stringify(legacy.admissions));
 assert.equal([...files.keys()].filter(p=>p.startsWith('prototype-books/')).length,2);
 assert.equal([...files.keys()].filter(p=>p.startsWith('prototype-scopes/')).length,4);
 assert.deepEqual(index.admissions[0].record.entryIdChunks.slice(0,2),index.admissions[1].record.entryIdChunks.slice(0,2));
 assert.notEqual(index.admissions[0].record.entryIdChunks.at(-1),index.admissions[1].record.entryIdChunks.at(-1));
 const duplicate=structuredClone(legacy);duplicate.admissions.push(duplicate.admissions[0]);assert.throws(()=>packPrototypeAdmissions(duplicate),/Duplicate prototype admission/);
});
test('a lookup reads only its index, books and scope, caches immutable results and distinguishes changed context',()=>{
 const {legacy,index,files}=fixture(),reads=[];
 const store=createPrototypeAdmissionStore({read:path=>{reads.push(path);return files.get(path);}});
 assert.deepEqual(reads,[]);
 const first=index.admissions[0];assert.deepEqual(store.get(first.sourceRecordSha256,first.catalogContextSha256),legacy.admissions[0]);
 assert.equal(reads.length,5);assert.equal(new Set(reads).size,5);
 const same=store.get(first.sourceRecordSha256,first.catalogContextSha256);assert.equal(reads.length,5);
 assert.throws(()=>same.books[0].title='changed',TypeError);assert.throws(()=>same.entryIds.push('extra'),TypeError);
 assert.equal(store.get(first.sourceRecordSha256,hash('wrong context')),undefined);
 assert.equal(store.forSource(first.sourceRecordSha256).length,2);assert.equal(reads.length,6);
 assert.deepEqual(store.all(),legacy.admissions);assert.equal(reads.length,7);
});
test('missing or altered book and scope files cannot be silently skipped',()=>{
 for(const prefix of ['prototype-books/','prototype-scopes/'])for(const missing of [true,false]){
  const {files}=fixture(),path=[...files.keys()].find(p=>p.startsWith(prefix));
  if(missing)files.delete(path);else{const value=JSON.parse(files.get(path));if(Array.isArray(value))value[0]='altered';else value.title='altered';files.set(path,JSON.stringify(value));}
  assert.throws(()=>storeFor(files).all(),missing?/Missing test archive file/:/hash mismatch/);
 }
});
test('unsafe references, mismatched keys, reordered scope and altered basis fail closed',()=>{
 const mutations=[
  i=>i.admissions[0].record.bookContextHashes[0]='../outside',
  i=>i.admissions[0].record.entryIdChunks[0]='../outside',
  i=>i.admissions[0].sourceRecordSha256=hash('different'),
  i=>i.admissions[0].catalogContextSha256=hash('different'),
  i=>i.admissions[0].record.entryIdChunks.reverse(),
  i=>i.admissions[0].record.basis='A different basis',
  i=>i.admissions[0].record.status='production',
  i=>i.admissions[0].record.entryIds=['hidden alternative'],
  i=>i.admissions.push(i.admissions[0])
 ];
 for(const mutate of mutations){const {files}=fixture();changeIndex(files,mutate);assert.throws(()=>storeFor(files).all());}
});
test('a changed unused historical file is still rejected by the full-archive check',()=>{
 const {files,index}=fixture(),path='prototype-books/'+index.admissions[2].record.bookContextHashes[0]+'.json';
 files.delete(path);
 const store=storeFor(files),first=index.admissions[0];assert(store.get(first.sourceRecordSha256,first.catalogContextSha256));
 assert.throws(()=>store.all(),/Missing test archive file/);
});
test('explicit append preserves the archive, is idempotent and refuses conflicting admissions',()=>{
 const directoryPath=mkdtempSync(join(tmpdir(),'hadith-admission-test-')),directory=pathToFileURL(directoryPath+'/');
 try{
  const {legacy,files}=fixture();mkdirSync(new URL('prototype-books/',directory));mkdirSync(new URL('prototype-scopes/',directory));
  for(const [path,body]of files)writeFileSync(new URL(path,directory),body);
  const added={...legacy.admissions[1],sourceRecordSha256:hash('later synthetic source'),entryIds:[...legacy.admissions[1].entryIds,'fixture:261']};
  assert.equal(appendPrototypeAdmission(added,{directory}),true);
  const bytes=readFileSync(new URL('prototype-admissions.json',directory),'utf8');
  assert.equal(appendPrototypeAdmission(added,{directory}),false);assert.equal(readFileSync(new URL('prototype-admissions.json',directory),'utf8'),bytes);
  assert.throws(()=>appendPrototypeAdmission({...added,basis:'Different basis'},{directory}),/Conflicting admission/);
  assert.equal(readFileSync(new URL('prototype-admissions.json',directory),'utf8'),bytes);
  const store=createPrototypeAdmissionStore({read:path=>readFileSync(new URL(path,directory),'utf8')});assert.deepEqual(store.all(),[...legacy.admissions,added]);
 }finally{rmSync(directoryPath,{recursive:true,force:true});}
});
