/* Synthetic in-memory approvals exercise publisher gates; never write them to content. */
import {readFileSync} from 'node:fs';
import {digest,objectHash} from '../../scripts/publish-books.mjs';
export function referenceFixture(numbers=[619,'619b',620]) {
 const source=JSON.parse(readFileSync(new URL('../../research/bukhari-opening-review.json',import.meta.url)));
 const ledger=JSON.parse(readFileSync(new URL('../../content/review/opening-ledger.json',import.meta.url)));
 source.entries=numbers.map(number=>{
  const english_blocks=['TEST FIXTURE CHAIN — not hadith content.',`Synthetic reference ${number}. Exact test words.`],arabic_blocks=['سند تجريبي ليس حديثاً.',`نص تجريبي ${number}.`];
  return {id:`fixture:${number}`,number,book:'TEST FIXTURE ONLY',english_blocks,arabic_blocks,arabic_sha256:digest(arabic_blocks.join('\n\n')),presentation:{schemaVersion:1,...Object.fromEntries(Object.entries({english:english_blocks,arabic:arabic_blocks}).map(([lang,blocks])=>[lang,blocks.map((s,i)=>({block:i,start:0,end:Array.from(s).length,kind:i?'report':'chain'}))]))}};
 });
 ledger.publication='production';ledger.sourceRecordSha256=objectHash(source);
 ledger.books=[{id:'fixture',number:1,title:'TEST FIXTURE ONLY',entryNumbers:numbers,chapters:[{id:'fixture-chapter',title:'Synthetic chapter',entryNumbers:numbers}]}];ledger.catalogContextSha256=objectHash(ledger.books);
 const approved=sha256=>({status:'approved',reviewerKind:'human',reviewer:'SYNTHETIC TEST ONLY',reviewedAt:'2026-10-29',sha256,evidence:['Synthetic test; no real approval']});
 ledger.rights=approved(ledger.sourceRecordSha256);ledger.collectionReview=approved(ledger.catalogContextSha256);
 ledger.entries=source.entries.map(e=>{const row={id:e.id,number:e.number,entrySha256:objectHash(e),arabicSha256:e.arabic_sha256,englishSha256:digest(e.english_blocks.join('\n\n')),status:'approved',unresolvedDiscrepancies:[]};return {...row,arabicReview:approved(row.arabicSha256),englishReview:approved(row.englishSha256),contextReview:approved(row.entrySha256)};});
 ledger.sourceReferences={schemaVersion:1,sourceRecordSha256:ledger.sourceRecordSha256,sources:[{id:'fixture',label:'TEST SOURCE',kind:'arabic-input',format:'web',url:'https://example.invalid/fixture'}],entries:source.entries.map((e,i)=>({id:e.id,number:e.number,entrySha256:objectHash(e),translation:{label:'TEST ONLY',description:'Synthetic text; not a hadith or translation.'},citations:[{id:'base',sourceId:'fixture',locator:'Fixture '+e.number,scope:'TEST ONLY'}],localNotes:{path:'fixture-review.html',fragment:'hadith-'+e.number,label:'Fixture notes'},contextNotes:i===1?[{label:'TEST CONTEXT',text:'Synthetic chain link.',citations:['base'],related:[{id:source.entries[0].id,number:source.entries[0].number,label:'Previous fixture',target:'chain'}]}]:[]}))};
 ledger.referencesSha256=objectHash(ledger.sourceReferences);ledger.referencesReview=approved(ledger.referencesSha256);
 return {source,ledger};
}
