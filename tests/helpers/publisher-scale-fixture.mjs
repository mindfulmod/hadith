/* Artificial bilingual load. Never a source, review, admission or website artifact. */
import {createHash} from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest('hex');
const hash=value=>digest(JSON.stringify(value));
export function publisherScaleFixture(count=7600,bookCount=93){
 if(!Number.isSafeInteger(count)||count<bookCount||!Number.isSafeInteger(bookCount)||bookCount<1)throw new Error('Invalid synthetic fixture size');
 const approved=sha256=>({status:'approved',reviewerKind:'human',reviewer:'SYNTHETIC TEST ONLY',reviewedAt:'2026-10-29',sha256,evidence:['Artificial load-test data, not human approval of hadith.']});
 const source={label:'SYNTHETIC LOAD TEST ONLY',entries:[]},books=[];
 for(let i=0;i<count;i++){
  const bookIndex=Math.floor(i*bookCount/count),number=i%128===127?`${i+1}b`:i+1;
  if(!books[bookIndex])books[bookIndex]={id:`fixture-${bookIndex+1}`,number:bookIndex+1,title:'SYNTHETIC TEST ONLY',entryNumbers:[]};
  books[bookIndex].entryNumbers.push(number);
  const english_blocks=['SYNTHETIC CHAIN — not a hadith.',`Artificial report ${number}. `+'This is repeated nonreligious test wording for measuring a large bilingual catalogue and its exact publication checks. '.repeat(12)];
  const arabic_blocks=['سند تجريبي ليس حديثاً.',`نص تجريبي ${number}. `+'هذه كلمات تجريبية لا تمثل حديثاً وتستخدم فقط لقياس أداء البرنامج دون أي محتوى ديني. '.repeat(12)];
  source.entries.push({id:'fixture:'+number,number,book:'SYNTHETIC TEST ONLY',english_blocks,arabic_blocks,arabic_sha256:digest(arabic_blocks.join('\n\n')),presentation:{schemaVersion:1,...Object.fromEntries(Object.entries({english:english_blocks,arabic:arabic_blocks}).map(([language,blocks])=>[language,blocks.map((text,block)=>({block,start:0,end:Array.from(text).length,kind:block?'report':'chain'}))]))}});
 }
 const sourceRecordSha256=hash(source),catalogContextSha256=hash(books);
 const entries=source.entries.map(entry=>{
  const row={id:entry.id,number:entry.number,entrySha256:hash(entry),arabicSha256:entry.arabic_sha256,englishSha256:digest(entry.english_blocks.join('\n\n')),status:'approved',unresolvedDiscrepancies:[]};
  return {...row,arabicReview:approved(row.arabicSha256),englishReview:approved(row.englishSha256),contextReview:approved(row.entrySha256)};
 });
 const sourceReferences={schemaVersion:1,sourceRecordSha256,sources:[{id:'fixture',label:'SYNTHETIC TEST ONLY',kind:'arabic-input',format:'web',url:'https://example.invalid/fixture'}],entries:entries.map(row=>({id:row.id,number:row.number,entrySha256:row.entrySha256,translation:{label:'NOT A HADITH',description:'Artificial load-test wording.'},citations:[{id:'base',sourceId:'fixture',locator:'Fixture '+row.number,scope:'Synthetic test only'}],localNotes:{path:'fixture-review.html',fragment:'hadith-'+row.number,label:'Synthetic notes'},contextNotes:[]}))};
 const referencesSha256=hash(sourceReferences);
 return {source,ledger:{schemaVersion:1,namespace:'bukhari-opening-v1',publication:'production',sourceRecordSha256,catalogContextSha256,books,entries,sourceReferences,referencesSha256,rights:approved(sourceRecordSha256),collectionReview:approved(catalogContextSha256),referencesReview:approved(referencesSha256)}};
}
