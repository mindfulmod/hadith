import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')),sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/funerals-seventh-review.json'),inv=read('content/staging/bukhari-funerals-wikisource/catalog.json'),manifest=read('content/sources/wikisource-funerals/manifest.json');
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='funerals'),numbers=Array.from({length:18},(_,i)=>1271+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=e=>{delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};
test('seventh Funerals batch keeps complete source spans, honorifics and chapter boundaries',()=>{
 const r=review();assert.deepEqual(r.entries.map(e=>e.number),numbers);assert.deepEqual(book.entryNumbers.slice(91,109),numbers);assert.deepEqual(r.chapters.flatMap(c=>c.entryNumbers),numbers);assert.equal(r.chapters.length,13);assert.equal(r.entries.reduce((n,e)=>n+e.segments.length,0),53);assert.deepEqual(r.chapters.flatMap(c=>c.contextIds),['mwAUs','mwAWE']);
 for(const e of r.entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);assert.deepEqual(get(e.number).arabic_blocks,original);assert.equal(e.segments.map(s=>s.arabic).join(''),original.join(''));assert.equal(e.arabicCorrections,undefined);assert.equal(e.arabicSupplements,undefined);const a=original.join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);}
});
test('1271–1273 preserve the transmission exchange, narrator appraisal, two routes and uncertainty',()=>{
 assert.match(text(1271),/with the Prophet/);assert.match(text(1271),/they prayed behind him/);assert.match(text(1271),/Who related this to you, Abu ‘Amr/);assert.doesNotMatch(text(1271),/your Prophet|formed rows/);
 assert.match(text(1272),/a man or a woman/);assert.equal(get(1272).presentation.english[2].kind,'transmission-note');assert.equal(get(1272).english_blocks[2],'they mentioned his story. He said: They considered him of little importance.');assert.match(get(1272).english_blocks[3],/^He said, “Then show me his grave/);
 assert.match(text(1273),/‘Ayyash related to us: ‘Abd al-A‘la/);assert.match(text(1273),/And Khalifah said to me: Ibn Zuray‘ related to us/);assert.match(text(1273),/disbeliever—or the hypocrite/);assert.match(text(1273),/struck once between his ears with an iron hammer/);assert.doesNotMatch(text(1273),/Yazid ibn Zuray|‘Ayyash ibn|Munkar|Nakir/);
});
test('1274–1277 preserve dual peace, elapsed night, singular image and both attributed closing glosses',()=>{
 assert.match(text(1274),/Musa, peace be upon them both/);assert.match(text(1274),/he struck him/);assert.match(text(1274),/Allah restored his eye/);assert.doesNotMatch(text(1274),/black eye|gouged|severely|I want to die/);assert.match(text(1275),/one night after he had been buried/);assert.match(text(1275),/Then they prayed over him/);assert.match(text(1276),/make that image in it/);assert.match(text(1276),/Umm Salamah and Umm Habibah, may Allah Most High be pleased with them both/);
 assert.match(text(1277),/Fulayh ibn Sulayman/);assert.doesNotMatch(text(1277),/Anas ibn Malik|with his wife|Ibn al-Mubarak/);assert.equal(get(1277).english_blocks[2],'Ibn Mubarak said: Fulayh said, “I think he means sin.”');assert.match(get(1277).english_blocks[3],/^Abu ‘Abd Allah said/);assert.deepEqual(get(1277).presentation.english.slice(-2).map(s=>s.kind),['transmission-note','transmission-note']);
});
test('parallel Uhud accounts retain their actual lengths, acts and quoted endings',()=>{
 assert.match(text(1278),/one garment/);assert.match(text(1278),/Day of Resurrection/);assert.match(text(1278),/They were not washed, nor were they prayed over/);
 assert.doesNotMatch(text(1280),/garment|grave|buried|martyrs|ibn Malik/);assert.deepEqual(get(1281).presentation.english.map(s=>s.kind),['chain','report','transmission-note','report']);assert.equal(get(1281).english_blocks[2],'meaning on the day of Uhud—');assert.equal(get(1281).english_blocks[3],'and he did not wash them.');assert.doesNotMatch(text(1281),/ibn Malik|Jabir, may Allah/);
 assert.match(text(1282),/Messenger of Allah/);assert.match(text(1282),/one garment/);assert.doesNotMatch(text(1282),/Day of Resurrection|Muhammad ibn Muqatil|al-Awza/);assert.match(text(1288),/Day of Resurrection/);assert.doesNotMatch(text(1288),/one garment|one grave|pray over/);
});
test('1279 and 1284 keep both keys alternatives and all three corroborations without supplied explanations',()=>{
 assert.match(text(1279),/treasures of the earth—or the keys of the earth/);assert.equal((text(1279).match(/By Allah/g)||[]).length,2);assert.match(text(1279),/compete over it/);assert.doesNotMatch(text(1279),/Kawthar|Kauthar|fight|after my death/);
 assert.match(text(1284),/fresh grass is not to be cut/);assert.match(text(1284),/game is not to be frightened away/);assert.match(text(1284),/Aban ibn Salih said, from al-Hasan ibn Muslim, from Safiyyah bint Shaybah: I heard/);assert.match(text(1284),/Mujahid said, from Tawus, from Ibn ‘Abbas/);assert.match(text(1284),/their smith and their houses/);assert.equal(get(1284).presentation.english.filter(s=>s.kind==='transmission-note').length,3);assert.doesNotMatch(text(1284),/thorn|uproot|fighting/);
});
test('1283 keeps its dependent route, singular companion and full unnamed-hearer closing',()=>{
 assert.match(get(1283).english_blocks[0],/^And al-Awza‘i informed us/);assert.match(text(1283),/before his companion/);assert.match(text(1283),/single striped cloak/);assert.match(text(1283),/Sulayman ibn Kathir said: Al-Zuhri related to me: One who heard Jabir/);assert.doesNotMatch(text(1283),/Ibn al-Mubarak|Abu ‘Abd Allah/);assert.deepEqual(ledger.sourceReferences.entries.find(e=>e.number===1283).contextNotes[0].related,[{id:'bukhari:1282',number:1282,target:'chain',label:'View the preceding chain · 1282'}]);
});
test('shared EPUB 431 bindings are contiguous, exact and independently enforced',()=>{
 const r=review(),a=read('research/funerals-seventh-wording-addendum.json'),parts=r.entries.filter(e=>[1282,1283].includes(e.number));let end=0;
 const all=parts[0].comparisons[1].checkedBody.join('\n\n');for(const e of parts){const c=e.comparisons[1],b=c.spanEvidence;assert.equal(c.reference,'2.23.431');assert.equal(b.auditSha256,hash(a));assert.equal(b.span.start,end);assert.equal(b.span.sha256,sha([...all].slice(b.span.start,b.span.end).join('')));end=b.span.end;}assert.equal(end,[...all].length);assert(all.slice(parts[0].comparisons[1].spanEvidence.span.end).startsWith('(Jabir bin Abdullah added):'));
 for(const mutate of[e=>delete e.comparisons[1].spanEvidence,e=>e.comparisons[1].spanEvidence.span.start++,e=>e.comparisons[1].part.index=1]){const changed=review(),e=changed.entries.find(e=>e.number===1283);mutate(e);rehash(e);assert.throws(()=>buildBookBatch(inv,changed,manifest,BOOK_CONFIGS.funerals));}
});
test('1285–1287 preserve separate voices, uncertainty, different expectations and the short repetition',()=>{
 assert.equal(get(1285).english_blocks[2],'Allah knows best.');assert.match(text(1285),/Abu Harun said/);assert.match(text(1285),/They consider that the Prophet/);assert.match(text(1285),/The son of ‘Abd Allah/);assert.doesNotMatch(text(1285),/Abu Hurayrah|Tubal/);
 assert.match(text(1286),/among the first/);assert.match(text(1286),/he was the first killed/);assert.match(text(1286),/Another was buried with him/);assert.match(text(1286),/after six months/);assert.match(text(1286),/small change at his ear/);assert.doesNotMatch(text(1287),/six months|ear/);assert.match(text(1287),/a grave apart/);
});
test('later source corrections qualify the historical audit without changing the selected Arabic',()=>{
 const a=read('research/funerals-seventh-wording-addendum.json'),w=read('research/funerals-seventh-wording-review.json'),old=read(a.priorAudit.path);assert.equal(a.priorAudit.sha256,hash(old));assert.equal(w.addendumSha256,hash(a));assert.equal(w.reviewSha256,hash(review()));assert.equal(a.priorEvidenceClarifications.length,4);const before=old.unresolvedTextualDifferences.find(v=>v.id==='1277-closing-attributions'),after=a.unresolvedTextualDifferences.find(v=>v.id==='1277-closing-attributions-reread');assert(before.witnesses[1].reading.includes('ابن المبارك'));assert(after.witnesses[1].reading.includes('ابن مبارك'));for(const v of a.unresolvedTextualDifferences)for(const wi of v.witnesses)assert.equal(wi.readingSha256,sha(wi.reading));assert.equal(a.proposedCorrections.length,0);assert(readFileSync(new URL('../research/funerals-third-source-review.html',import.meta.url),'utf8').includes('later-seventh-batch-corrections'));
});
test('chapter variants and comparison limits remain attached and cannot be dropped',()=>{
 const r=review();for(const id of['chapter-68','chapter-72']){const c=r.chapters.find(c=>c.id===id);assert(validateChapterDifferences(c,inv,r).length>0);delete c.contextDifferences;assert.throws(()=>validateChapterDifferences(c,inv,r));}
 for(const mutate of[e=>e.comparisons[0].damageEvidence.sha256='0'.repeat(64),e=>e.segments[1].arabic+=' ',e=>e.paragraphIds=[]]){const changed=review(),e=changed.entries.find(e=>e.number===1277);mutate(e);rehash(e);assert.throws(()=>buildBookBatch(inv,changed,manifest,BOOK_CONFIGS.funerals));}
});
