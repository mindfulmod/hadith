/* Artificial bilingual runtime load, served only by a loopback benchmark.
   No source text, admissions, approvals or website files are written. */
import {publisherScaleFixture} from './publisher-scale-fixture.mjs';
import {buildBooks,objectHash,digest} from '../../scripts/publish-books.mjs';
export function readerScaleFixture(count=8000,bookCount=93){
 const {source,ledger}=publisherScaleFixture(count,bookCount);
 source.sources=[];source.license={name:'Synthetic benchmark only; not a hadith source',url:'https://example.invalid/synthetic-benchmark'};
 ledger.sourceRecordSha256=objectHash(source);ledger.rights.sha256=ledger.sourceRecordSha256;
 ledger.sourceReferences.sourceRecordSha256=ledger.sourceRecordSha256;
 ledger.referencesSha256=objectHash(ledger.sourceReferences);ledger.referencesReview.sha256=ledger.referencesSha256;
 const {catalog,files}=buildBooks(source,ledger);
 files.set('fixture-review.html','<!doctype html><title>Synthetic benchmark only</title><p>Artificial nonreligious text. Never source material.</p>');
 const descriptors=[...files].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 return {source,catalog,files,descriptors,scope:'Artificial repeated nonreligious English and Arabic. Stress volume, not an estimate of the full Bukhari text or an admission to the reader.'};
}
