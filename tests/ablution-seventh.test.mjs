import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {resolveSession,nextSession,planSession} from '../reader/session.mjs';
import {searchEntries} from '../reader/search.mjs';
import {sourceContextHTML} from '../reader/source-references.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-ablution-wikisource/catalog.json'),read('content/review/ablution-seventh-review.json'),read('content/sources/wikisource-ablution/manifest.json'),BOOK_CONFIGS.ablution];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('seventh batch preserves all 191 prior entries and every original Arabic input',()=>{
 const args=input(),before=structuredClone(args.slice(0,3)),batch=buildBookBatch(...args),{source,ledger,files}=collectionFiles();
 const previous=['opening-revelation-0a534f10d205292c','faith-ad873aab8759ca02','knowledge-e3d5ef7956421322','ablution-715a3974a42d6319'].flatMap(p=>read('reader/books/'+p+'.json').entries);
 assert.deepEqual(source.entries.slice(0,191),previous);assert.equal(source.entries.length,224);assert.deepEqual(args.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:17},(_,i)=>192+i));assert.equal(batch.chapters.length,8);
 for(const e of batch.entries){const r=args[1].entries.find(r=>r.number===e.number);assert.deepEqual(sourceSegments(e,'english').map(s=>s.text),r.segments.map(s=>s.english));if(e.number!==202)assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(id=>args[0].blocks.find(b=>b.htmlId===id).text));}
 const book=ledger.books.find(b=>b.id==='ablution');assert.equal(book.entryNumbers.length,90);assert.equal(book.chapters.length,64);const inputs=JSON.parse(files.get('reader/ablution-inputs.json'));assert.equal(inputs.selectedBlocks.length,216);assert.equal(inputs.sourceLayout.originalBlocks.length,213);
});
test('194 and 195 remain separate exact spans of one original paragraph without gaps or overlap',()=>{
 const args=input(),rows=args[1].entries.filter(e=>[194,195].includes(e.number)),blocks=rows.map(r=>args[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]));
 assert.deepEqual(rows.map(r=>r.paragraphIds[0]),['mwAQM@0-237','mwAQM@237-797']);assert.equal(blocks[0].origin.end,blocks[1].origin.start);assert.equal(blocks[0].origin.blockId,blocks[1].origin.blockId);
 const {files}=collectionFiles(),original=JSON.parse(files.get('reader/ablution-inputs.json')).sourceLayout.originalBlocks.find(b=>b.htmlId==='mwAQM');assert.equal(blocks.map(b=>b.text).join(''),original.text);
 const bad=input();bad[1].entries.find(r=>r.number===195).paragraphIds=['mwAQM@0-237'];rehash(bad[1].entries.find(r=>r.number===195));assert.throws(()=>buildBookBatch(...bad));
});
test('195 keeps the intervening conversation, pronoun and seven tied waterskins in source order',()=>{
 const {source}=collectionFiles(),e=source.entries.find(e=>e.number===195),s=sourceSegments(e,'english');assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','report']);assert.match(s[2].text,/‘Ubaydullah.*‘Abdullah ibn ‘Abbas.*It was ‘Ali/s);assert.match(s[3].text,/after he entered his house/);assert.match(s[3].text,/seven waterskins whose ties have not been undone/);assert.match(s[3].text,/may Allah Most High be pleased with her/);assert(!s[3].text.includes('wells'));assert(!s[3].text.includes('brass'));
 assert.equal(narrationPlan(source).entries.find(e=>e.number===195).script,e.english_blocks.join('\n\n'));
});
test('202 correction is evidence-bound and visible while its abbreviated closing transmission remains selected',()=>{
 const args=input(),r=args[1].entries.find(e=>e.number===202),original=args[0].blocks.find(b=>b.htmlId==='mwARo'),{source,ledger,files}=collectionFiles(),e=source.entries.find(e=>e.number===202);
 assert(!original.text.includes('عمامته وخفيه'));assert(e.arabic_blocks[0].includes('على عمامته وخفيه'));assert.notEqual(r.originalArabicSha256,r.arabicSha256);assert.equal(r.sourceLayout.paragraphs[0].textSha256,original.textSha256);assert(files.get('reader/ablution-review.html').includes(original.text));assert.match(sourceContextHTML(ledger.sourceReferences,202),/Both Arabic prints include/);
 const s=sourceSegments(e,'english');assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note']);assert.match(s[1].text,/turban and his leather socks/);assert.equal(s[2].text,'Ma‘mar corroborated it, relating from Yahya, from Abu Salamah, from ‘Amr, who said: I saw the Prophet, may Allah bless him and grant him peace.');
 for(const change of [r=>{delete r.arabicCorrections;delete r.originalArabicSha256;},r=>r.arabicCorrections[0].witnesses[0].pdfPage=63,r=>r.arabicCorrections[0].witnesses[1].sourceSha256='0'.repeat(64),r=>r.arabicCorrections[0].englishSegmentId='202-3',r=>r.contextNotes=[]]){const a=input(),row=a[1].entries.find(e=>e.number===202);change(row);rehash(row);assert.throws(()=>buildBookBatch(...a));}
});
test('abbreviated and closing transmissions survive reading, search and complete script construction',()=>{
 const {source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n),plan=narrationPlan(source);
 assert.match(get(192).english_blocks.at(-1),/Eighty and more/);assert.match(get(199).english_blocks.at(-1),/that Sa‘d \.\.\. Then ‘Umar/);assert.match(get(201).english_blocks.at(-1),/Harb ibn Shaddad and Aban/);assert.match(get(208).english_blocks.at(-1),/Yunus and Salih ibn Kaysan/);
 for(const n of [192,199,201,202,208])assert.equal(plan.entries.find(e=>e.number===n).script,get(n).english_blocks.join('\n\n'));
 assert(searchEntries(source.entries,'Yunus and Salih ibn Kaysan').results.some(r=>r.entry.number===208));
 const bad=input(),row=bad[1].entries.find(e=>e.number===208);row.segments.pop();rehash(row);assert.throws(()=>buildBookBatch(...bad));
});
test('source alternatives and limits are not replaced by additions in comparison translations',()=>{
 const {source}=collectionFiles(),get=n=>source.entries.find(e=>e.number===n).english_blocks.join(' ');
 assert.match(get(192),/Humayd/);assert.match(get(194),/each of his hands twice/);assert(!get(194).includes('elbows'));assert.match(get(196),/backward and forward/);assert.match(get(196),/My uncle used to perform ablution a great deal/);assert(!get(196).includes('earthenware'));assert.match(get(198),/wash—or used to bathe/);assert.match(get(198),/a sa‘ up to five mudds/);assert(!get(198).includes('litre'));assert.match(get(207),/a shoulder while with her/);assert(!get(207).includes('sheep'));assert(!get(207).includes('home'));assert.match(get(208),/^Yahya ibn Bukayr and Qutaybah related to us/);
});
test('new chapter context stays outside numbered sessions and the former endpoint continues at 192',()=>{
 const args=input(),{source,ledger,files}=collectionFiles(),book=ledger.books.find(b=>b.id==='ablution');assert.deepEqual(args[1].chapters.map(c=>c.id),Array.from({length:8},(_,i)=>'chapter-'+(45+i)));
 const text=args[0].blocks.find(b=>b.htmlId==='mwASE').text;assert(files.get('reader/ablution-review.html').includes(text));assert(!source.entries.some(e=>e.arabic_blocks.includes(text)));assert.equal(book.chapters.find(c=>c.id==='chapter-50').sourceContext.introduction.arabicParagraphs,1);
 const saved={numbers:[191],cursor:191,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,208),saved);assert.equal(nextSession(source.entries,saved,5).cursor,192);assert(planSession(source.entries,191,5).numbers.includes(192));assert.deepEqual(planSession(source.entries,224,5).numbers,[224]);assert.equal(nextSession(source.entries,{numbers:[224],cursor:224,ended:true},5),null);
 const built=buildBooks(source,ledger);for(const path of ['books/opening-revelation-0a534f10d205292c.json','books/faith-ad873aab8759ca02.json','books/knowledge-e3d5ef7956421322.json'])assert.equal(built.files.get(path),readFileSync(new URL('../reader/'+path,import.meta.url),'utf8'));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
