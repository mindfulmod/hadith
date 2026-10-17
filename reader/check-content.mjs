import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const input=JSON.parse(readFileSync(new URL('../research/bukhari-opening-review.json',import.meta.url),'utf8'));
const context={window:{}};vm.runInNewContext(readFileSync(new URL('./content.js',import.meta.url),'utf8'),context);
const output=JSON.parse(JSON.stringify(context.window.HadithContent));
assert.deepEqual(JSON.parse(readFileSync(new URL('./source-record.json',import.meta.url),'utf8')),input,'Offline source record must match the reviewed input.');
assert.deepEqual(output,input,'Published content must equal reviewed input, including source metadata.');
for(const entry of output.entries){assert.equal(createHash('sha256').update(entry.arabic_blocks.join('\n\n')).digest('hex'),entry.arabic_sha256);assert.equal(entry.english_blocks.length,2);assert.equal(entry.arabic_blocks.length,2);}
console.log('Both entries match the complete source record; Arabic integrity hashes pass.');
