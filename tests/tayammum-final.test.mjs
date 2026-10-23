import {LAST_NUMBER} from './published-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-tayammum-wikisource/catalog.json'),read('content/review/tayammum-final-review.json'),read('content/sources/wikisource-tayammum/manifest.json'),BOOK_CONFIGS.tayammum];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const mutate=fn=>{const a=input();fn(a[1]);a[1].entries.forEach(rehash);return()=>buildBookBatch(...a);};
test('Tayammum final batch preserves complete source spans, ordered scripts and prior entry objects',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.equal(batch.entries.length,10);assert.equal(a[1].entries.flatMap(e=>e.segments).length,36);
 assert.deepEqual(source.entries.slice(326,331),read('reader/books/tayammum-9b7a0e742cfc0814.json').entries);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number);assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries[r.number-1].script,e.english_blocks.join('\n\n'));for(const [j,ar]of e.arabic_blocks.entries())assert.equal(r.segments.filter(s=>s.paragraphId===(j?r.arabicSupplements[0].id:r.paragraphIds[0])).map(s=>s.arabic).join(''),ar);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('shortened reports retain their actual bodies and do not import another edition’s fuller wording',()=>{
 const {source,ledger}=collectionFiles(),e=n=>source.entries[n-1];
 assert.match(e(332).english_blocks[1],/Shu‘bah struck.*near his mouth/);assert.match(e(332).english_blocks.at(-1),/I heard it also.*‘Ammar said\.$/);assert.doesNotMatch(e(332).english_blocks.join(' '),/sufficient means|clean earth|suffice/);
 assert.equal(e(335).english_blocks.at(-1),'And he related the hadith.');assert.equal(e(335).english_blocks.length,3);assert.doesNotMatch(e(335).english_status,/complete English comparison body/);
 assert.match(e(336).english_blocks[1],/with his hand and/);assert.match(e(333).english_blocks[0],/Ibn ‘Abd al-Rahman ibn Abza, from his father/);
 for(const n of [332,333,334,335,336])assert.equal(ledger.sourceReferences.entries.find(e=>e.number===n).contextNotes[0].related[0].number,n===335?334:331);
});
test('unnumbered comparison pointers cannot acquire a fabricated target or claim a full body',()=>{
 for(const change of [c=>c.referencedReference='1.7.337',c=>c.continuedByReference='1.7.339',c=>c.part={index:1,count:2},c=>c.checkedBody[1]='as above (337). ',c=>c.referenceEvidence.recordSha256='0'.repeat(64),c=>c.status='reference-only-body-absent'])assert.throws(mutate(r=>change(r.entries.find(e=>e.number===335).comparisons[1])));
 const {ledger}=collectionFiles();assert.match(ledger.sourceReferences.entries.find(e=>e.number===335).citations.find(c=>c.id==='khan').locator,/unnumbered backward pointer only/);
});
test('one selected entry maps to two Bewley references without changing selected numbering',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===340),{source,ledger}=collectionFiles(),c=ledger.sourceReferences.entries.find(e=>e.number===340).citations.find(c=>c.id==='bewley');
 assert.equal(c.locator,'Book of Tayammum · entries 340, 341');assert.deepEqual(r.comparisons[0].splitReferences.flatMap(p=>p.segmentIds),r.segments.map(s=>s.id));assert.equal(source.entries[339].english_blocks.length,6);assert.match(source.entries[339].english_blocks[4],/^And Ya‘la added/);assert.match(source.entries[339].english_blocks[3],/shook it off/);assert.doesNotMatch(source.entries[339].english_blocks[3],/right hand|blew on/);
 for(const change of [c=>c.splitReferences.reverse(),c=>c.splitReferences[1].reference='340',c=>c.splitReferences[1].segmentIds.pop(),c=>c.splitReferences[0].segmentIds.reverse(),c=>c.splitReferences[1].segmentIds.push('340-1'),c=>c.splitReferences[1].status='complete',c=>c.note='',c=>c.status='abbreviated-report'])assert.throws(mutate(r=>change(r.entries.find(e=>e.number===340).comparisons[0])));
});
test('printed closing notes retain both readings and never impersonate the digital source',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===337),e=buildBookBatch(...a).entries.find(e=>e.number===337),p=r.arabicSupplements[0];assert.equal(e.arabic_blocks[0],a[0].blocks.find(b=>b.htmlId==='mwPw').text);assert.equal(e.arabic_blocks[1],p.arabic);assert.equal(p.selectedWitnessId,'brill-1862');assert.match(p.witnesses[1].reading,/وفي نسخة الصابئون/);assert.deepEqual(p.englishComparisons.map(c=>c.status),['omits-note','includes-note']);assert.equal(e.presentation.english.at(-1).provenance.kind,'printed-supplement');
 assert.equal((e.english_blocks.join(' ').match(/or (?:two )?satihah water skins/g)||[]).length,2);assert.match(e.english_blocks.at(-2),/What I think is that/);assert.doesNotMatch(e.english_blocks.join(' '),/rinsed his mouth|watered the animals|behind me/);
 for(const change of [r=>r.arabicSupplements[0].witnesses.pop(),r=>delete r.arabicSupplements[0].witnesses[1].differenceNote,r=>r.arabicSupplements[0].selectedWitnessId='dar-ibn-kathir-2002',r=>r.contextNotes=[]])assert.throws(mutate(review=>change(review.entries.find(e=>e.number===337))));
});
test('the exact hamza correction at 339 needs both agreeing prints and an accessible original',()=>{
 const a=input(),r=a[1].entries.find(e=>e.number===339),original=a[0].blocks.find(b=>b.htmlId==='mwVQ').text,e=buildBookBatch(...a).entries.find(e=>e.number===339);assert.equal(e.arabic_blocks[0],original.replace('أنا لو','إنا لو'));assert.match(original,/أنا لو/);assert.equal(r.arabicCorrections.length,1);assert.deepEqual(r.arabicCorrections[0].witnesses.map(w=>w.pdfPage),[97,96]);
 for(const change of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].witnesses[0].reading='أنا',r=>r.arabicCorrections[0].start++,r=>r.contextNotes=[]])assert.throws(mutate(review=>change(review.entries.find(e=>e.number===339))));
});
test('all chapter context remains browsable without becoming a numbered report or narration',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='tayammum'),plan=narrationPlan(source);assert.equal(book.chapters.length,9);assert.deepEqual(book.entryNumbers,Array.from({length:15},(_,i)=>327+i));assert.equal(book.chapters.at(-1).id,'chapter-08-print-09');assert.equal(book.chapters.at(-1).title,'Chapter');assert.deepEqual(book.chapters.at(-1).entryNumbers,[341]);
 for(const chapter of a[1].chapters){for(const id of chapter.contextIds){const text=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>e.arabic_blocks.every(p=>!p.includes(text))));assert(plan.entries.every(e=>!e.script.includes(text)));}if(chapter.contextIds.length)assert.equal(book.chapters.find(c=>c.id===chapter.id).sourceContext.introduction.englishStatus,'pending');}
 const saved={numbers:[330,331],cursor:331,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,341),saved);assert.equal(nextSession(source.entries,saved,5).cursor,332);assert.deepEqual(planSession(source.entries,LAST_NUMBER,10).numbers,[LAST_NUMBER]);assert.equal(nextSession(source.entries,{numbers:[LAST_NUMBER],cursor:LAST_NUMBER,ended:true},5),null);
 assert.throws(mutate(r=>r.entries.find(e=>e.number===341).printedHeading.witnesses.pop()));
});
