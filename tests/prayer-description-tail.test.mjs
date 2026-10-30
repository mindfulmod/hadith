import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {collectionFiles} from '../scripts/build-collection.mjs';
import {compareReferences,validReference} from '../reader/references.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const candidate=()=>read('content/review/prayer-description-tail-candidate.json');

test('tail review remains outside the reader and preserves the original 837-entry source',()=>{
 const c=candidate(),{source}=collectionFiles(),plan=read('content/audio/narration-plan.json');
 assert.equal(c.readerEligible,false);assert.equal(c.insertion.decision,'pending');
 assert.equal(hash(JSON.stringify(source)),'e863527b25dc75d89adb6fed016d42b0a09859544af86fa65dd97f03aeccccb7');
 assert.equal(source.entries.length,837);assert(!source.entries.some(e=>c.entries.some(r=>r.sourceRecordId===e.review?.sourceRecordId)));
 assert(!plan.entries.some(e=>c.insertion.appReferences.includes(e.number)));
 assert(read('content/review/prayer-description-batches.json').batches.every(b=>b.path!=='content/review/prayer-description-tail-candidate.json'));
});

test('two independent occurrences retain exact chains and the feminine closing comment',()=>{
 const c=candidate();assert.deepEqual(c.entries.map(e=>e.printedReference),['874','875']);assert.deepEqual(c.entries.map(e=>e.secondPrintedReference),['884','885']);
 for(const e of c.entries){assert.equal(e.arabic,e.segments.map(s=>s.arabic).join(''));assert.equal(e.arabicSha256,hash(e.arabic));assert.equal(e.englishSha256,hash(JSON.stringify(e.segments.map(s=>s.english))));assert.equal(e.segments[0].kind,'chain');assert.equal(e.witnesses.length,2);assert.equal(new Set(e.witnesses.map(w=>w.sourceId)).size,2);assert(e.witnesses.every(w=>w.reading===e.arabic&&w.readingSha256===e.arabicSha256));assert.equal((e.arabic.match(/ﷺ/g)||[]).length,(e.segments.map(s=>s.english).join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 const tail=c.entries[1];assert(tail.segments[2].arabic.startsWith('قالت نرى'));assert(tail.segments[2].english.startsWith('She said: We think'));assert(!tail.arabic.includes('أحد من الرجال'));assert(!tail.segments[2].english.includes('al-Zuhri'));assert(!tail.arabic.includes('رضي الله'));
 assert(c.sources.find(s=>s.id==='qastallani-repeated-tail').excerpt.includes('بتاء التأنيث'));
});

test('proposed suffixes sort after the exact selected book end without shifting the next numeric reference',()=>{
 const c=candidate(),inventory=read('content/staging/bukhari-prayer-description-wikisource/catalog.json');
 assert.equal(inventory.records.at(-1).number,835);assert.equal(c.insertion.afterReference,835);assert.equal(c.digitalInventorySha256,hash(JSON.stringify(inventory)));
 assert.deepEqual(c.insertion.appReferences,['835b','835c']);assert(c.insertion.appReferences.every(validReference));
 assert.deepEqual([836,'835c',835,'835b'].sort(compareReferences),[835,'835b','835c',836]);
 assert.equal(new Set(c.entries.map(e=>e.sourceRecordId)).size,2);assert.equal(c.sources.find(s=>s.id==='dar-tasil-2012-v1').sha256,'0136ed57436e607acebf53d33fd89695230bd88e76d7c7c10bd4b54ff1f5f0e6');
});
