import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {publishBooks} from '../scripts/publish-books.mjs';
const input=JSON.parse(readFileSync(new URL('../research/bukhari-opening-review.json',import.meta.url),'utf8'));
const {catalog,files}=publishBooks({check:true});
const packs=catalog.books.map(b=>JSON.parse(files.get(b.path)));
const output={...packs[0].sourceRecord,entries:packs.flatMap(p=>p.entries)};
assert.deepEqual(JSON.parse(readFileSync(new URL('./source-record.json',import.meta.url),'utf8')),input,'Offline source record must match the reviewed input.');
const legacy={window:{}};vm.runInNewContext(readFileSync(new URL('./content.js',import.meta.url),'utf8'),legacy);
assert.deepEqual(JSON.parse(JSON.stringify(legacy.window.HadithContent)),input,'Archived design concepts must retain the same source.');
assert.deepEqual(output,input,'Published content must equal reviewed input, including source metadata.');
for(const entry of output.entries){assert.equal(createHash('sha256').update(entry.arabic_blocks.join('\n\n')).digest('hex'),entry.arabic_sha256);assert.equal(entry.english_blocks.length,2);assert.equal(entry.arabic_blocks.length,2);}
console.log('Published book packs match the complete source record; Arabic integrity hashes pass.');
