import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{BOOK_CONFIGS,buildBookBatch,collectionFiles}from'../scripts/build-collection.mjs';import{objectHash,buildBooks}from'../scripts/publish-books.mjs';import{narrationPlan}from'../scripts/build-audio.mjs';import{sourceSegments}from'../reader/source-structure.mjs';import{planSession,resolveSession,nextSession}from'../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url))),input=()=>[read('content/staging/bukhari-prayer-times-wikisource/catalog.json'),read('content/review/prayer-times-second-review.json'),read('content/sources/wikisource-prayer-times/manifest.json'),BOOK_CONFIGS['prayer-times']];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer Times 515–530 preserves each complete source paragraph, exact segments and full script',()=>{
 const a=input(),b=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(b.entries.map(e=>e.number),Array.from({length:16},(_,i)=>515+i));assert.equal(b.chapters.length,6);
 for(const row of a[1].entries){const e=b.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(p=>p.htmlId===id).text);assert.deepEqual(e.arabic_blocks,original);for(const id of row.paragraphIds)assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),a[0].blocks.find(p=>p.htmlId===id).text);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===row.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('new source admission refuses a missing closing transmission, altered source and stale comparison witness',()=>{
 for(const change of [r=>r.entries.find(e=>e.number===516).segments.pop(),r=>r.entries.find(e=>e.number===520).segments.at(-1).arabic+=' ',r=>r.entries.find(e=>e.number===529).printedWitnesses.pop(),r=>r.entries.find(e=>e.number===530).comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.chapters.shift()]){const a=input();change(a[1]);a[1].entries.forEach(rehash);assert.throws(()=>buildBookBatch(...a));}
});
test('narrator comments and alternative wording remain visible outside expandable chains',()=>{
 const b=buildBookBatch(...input()),get=n=>b.entries.find(e=>e.number===n);
 for(const[n,index]of[[516,2],[516,4],[518,2],[520,2],[521,2],[522,2],[529,2]])assert.equal(sourceSegments(get(n),'english')[index].kind,'transmission-note');
 assert.match(get(516).english_blocks[3],/we did not mind.*third.*half/);assert.match(get(516).english_blocks[4],/Mu‘adh.*Shu‘bah.*Or a third/);assert.doesNotMatch(get(518).english_blocks[2],/Anas/);assert.match(get(520).english_blocks[2],/Abu Usamah.*Hisham/);assert.match(get(521).english_blocks[2],/Malik, Yahya ibn Sa‘id, Shu‘ayb and Ibn Abi Hafsah/);assert.doesNotMatch(get(527).english_blocks[1],/intentionally/);
});
test('next sessions cross the old endpoint while saved sessions and chapter-only material stay separate',()=>{
 const {source,files}=collectionFiles(),a=input(),saved={numbers:[514],cursor:514,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,530),saved);assert.equal(nextSession(source.entries,saved,5).cursor,515);const sample=source.entries.filter(e=>e.number<=530);assert.equal(nextSession(sample,{numbers:[530],cursor:530,ended:true},5),null);
 const intro=a[0].blocks.find(p=>p.htmlId==='mwOg').text;assert(files.get('reader/prayer-times-review.html').includes(intro));assert(source.entries.every(e=>!e.arabic_blocks.includes(intro)));for(const n of [514,515,527,530])for(const minutes of[5,10]){const plan=planSession(sample,n,minutes);assert.equal(plan.numbers[0],n);assert(plan.numbers.every(x=>sample.some(e=>e.number===x)));}
});
