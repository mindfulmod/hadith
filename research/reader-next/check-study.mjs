import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const base=new URL('./',import.meta.url),read=p=>readFileSync(new URL(p,base),'utf8');
const ledger=JSON.parse(read('references.json')),studies=JSON.parse(read('studies.json'));
assert.equal(ledger.references.length,208);
assert.equal(ledger.reviewed_count,ledger.references.length);
assert.equal(ledger.candidate_count,ledger.references.length+ledger.excluded.length);
assert.equal(new Set(ledger.references.map(r=>r.id)).size,ledger.references.length);
assert.equal(new Set(ledger.references.map(r=>r.name)).size,ledger.references.length);
const ids=new Set(ledger.references.map(r=>r.id));
assert.ok(ledger.excluded.every(r=>!ids.has(r.id)));
assert.equal(studies.length,20);assert.equal(new Set(studies.map(s=>s.id)).size,20);
assert.ok(studies.every(s=>ids.has(s.id)&&s.observed&&s.proposal&&s.limitations));
assert.equal(ledger.references.filter(r=>r.review==='Interaction sample').length,5);
for(const r of ledger.references){assert.equal(new URL(r.url).protocol,'https:');assert.ok(r.observed&&r.implication&&r.limitations);}
for(const name of readdirSync(base).filter(n=>n.endsWith('.html'))){for(const [,target] of read(name).matchAll(/(?:href|src)="([^"]+)"/g)){if(/^(https?:|#|data:)/.test(target))continue;const url=new URL(target,base);url.search='';url.hash='';assert.ok(existsSync(url),name+' has missing target '+target);}}
console.log('208 unique references, 20 related studies, 73 exclusions, 5 interaction samples; local HTML links resolve.');
