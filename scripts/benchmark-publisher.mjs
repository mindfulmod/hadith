/* Optional reproducible benchmark. Synthetic entries remain in memory only. */
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publisherScaleFixture} from '../tests/helpers/publisher-scale-fixture.mjs';
const count=Number(process.argv[2]||7600),modulePath=process.argv[3];
const startImport=performance.now();
const {buildBooks}=await import(modulePath?pathToFileURL(resolve(modulePath)):new URL('./publish-books.mjs',import.meta.url));
const imported={milliseconds:performance.now()-startImport};
const {source,ledger}=publisherScaleFixture(count,Math.min(count,93)),timings=[];
let output;
for(let i=0;i<5;i++){
 globalThis.gc?.();
 const start=performance.now(),result=buildBooks(source,ledger);timings.push(performance.now()-start);
 const fingerprint=createHash('sha256');let bytes=0;
 for(const [path,body]of result.files){fingerprint.update(path+'\0'+body+'\0');bytes+=Buffer.byteLength(body);}
 const current={files:result.files.size,bytes,sha256:fingerprint.digest('hex')};
 if(output&&JSON.stringify(output)!==JSON.stringify(current))throw new Error('Nondeterministic synthetic build');
 output=current;
}
console.log(JSON.stringify({fixture:'synthetic-bilingual-not-hadith',entries:count,books:ledger.books.length,node:process.version,platform:process.platform,architecture:process.arch,import:imported,buildMilliseconds:timings,medianMilliseconds:[...timings].sort((a,b)=>a-b)[2],maxRSSKiB:process.resourceUsage().maxRSS,output}));
