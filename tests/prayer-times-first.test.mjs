import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-times-wikisource/catalog.json'),read('content/review/prayer-times-first-review.json'),read('content/sources/wikisource-prayer-times/manifest.json'),BOOK_CONFIGS['prayer-times']];
const entry=n=>buildBookBatch(...input()).entries.find(e=>e.number===n);
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const mutate=(n,fn)=>{const a=input(),r=a[1].entries.find(r=>r.number===n);fn(r);rehash(r);return a;};
test('Prayer Times admission preserves full text, all prior books and complete narration scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:16},(_,i)=>499+i));assert.equal(batch.chapters.length,10);assert.deepEqual(source.entries.filter(e=>e.book==='Prayer'),read('reader/books/prayer-9cd174e568b06a5f.json').entries);
 for(const row of a[1].entries){const e=batch.entries.find(e=>e.number===row.number),original=row.paragraphIds.map(id=>a[0].blocks.find(b=>b.htmlId===id).text);for(const [index,id]of row.paragraphIds.entries())assert.equal(row.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join(''),e.arabic_blocks[index]);if(!row.arabicCorrections)assert.deepEqual(e.arabic_blocks,original);assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===e.number).script,e.english_blocks.join('\n\n'));assert.equal((original.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('499 and 511 cannot silently correct the original or lose either printed witness',()=>{
 for(const n of [499,511]){const row=input()[1].entries.find(r=>r.number===n);assert.equal(row.arabicCorrections.length,1);const changes=[r=>delete r.arabicCorrections,r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].witnesses[0].reading+='x',r=>r.arabicCorrections[0].originalParagraphSha256='0'.repeat(64),r=>r.arabicCorrections[0].start++,r=>r.contextNotes=[]];for(const change of changes)assert.throws(()=>buildBookBatch(...mutate(n,change)));}
 assert.match(input()[0].blocks.find(b=>b.htmlId==='mwBw').text,/ييلسلشعبة/);assert.match(entry(499).arabic_blocks[0],/المغيرة بن شعبة/);assert.doesNotMatch(entry(499).arabic_blocks[0],/ييلسلشعبة/);assert.match(input()[0].blocks.find(b=>b.htmlId==='mwLg').text,/إذن مؤذن/);assert.match(entry(511).arabic_blocks[0],/أذن مؤذن/);
});
test('499 retains every repeated prayer and the separately attributed Aisha account',()=>{
 const e=entry(499),text=e.english_blocks.join(' ');assert.equal((text.match(/and the Messenger of Allah, may Allah bless him and grant him peace, prayed/g)||[]).length,5);assert.equal(sourceSegments(e,'english')[2].kind,'transmission-note');assert.match(e.english_blocks[2],/Bashir ibn Abi Mas‘ud.*‘A’ishah related to me/);assert.match(e.english_blocks[3],/before it rose out of it/);assert.doesNotMatch(e.english_blocks[1],/Fajr|Dhuhr|Maghrib|‘Isha/);assert.throws(()=>buildBookBatch(...mutate(499,r=>r.segments.pop())));
});
test('506 and 507 map different parts of one exact English reference without losing their variants',()=>{
 const a=input(),rows=a[1].entries.filter(r=>[506,507].includes(r.number)),parts=rows.map(r=>r.comparisons[1]);assert(parts.every(c=>c.reference==='1.10.507'));assert.deepEqual(parts.map(c=>c.part),[{index:1,count:2},{index:2,count:2}]);assert.match(entry(506).english_blocks[1],/neglected what you have neglected/);assert.match(entry(507).english_blocks.at(-1),/Bakr said: Muhammad ibn Bakr.*related to us.*informed us/);
 for(const change of [r=>delete r.comparisons[1].part,r=>r.comparisons[1].part.index=1,r=>delete r.comparisons[1].referenceEvidence,r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64)])assert.throws(()=>buildBookBatch(...mutate(507,change)));
});
test('502 and 504 keep narrator uncertainty and attribution visible without importing explanations',()=>{
 const e=entry(502);assert.match(e.english_blocks[1],/him—or about it/);assert.match(e.english_blocks[1],/his child and his neighbour/);assert.match(e.english_blocks[1],/commanding and forbidding/);assert.match(e.english_blocks[2],/tonight comes before tomorrow/);assert.match(e.english_blocks[2],/Masruq.*The door is ‘Umar/);assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');assert(narrationHTML(entry(504)).includes('The owner of this house'));assert.equal(sourceSegments(entry(504),'english')[1].kind,'transmission-note');assert.match(entry(504).english_blocks[2],/Prayer at its time/);assert.doesNotMatch(entry(504).english_blocks[2],/early|fixed/);
});
test('508 keeps the full appended transmissions and the plural/singular foot distinction',()=>{
 const e=entry(508);assert.deepEqual(sourceSegments(e,'english').map(s=>s.kind),['chain','report','transmission-note','transmission-note','report']);assert.match(e.english_blocks[2],/Sa‘id said, from Qatadah/);assert.match(e.english_blocks[2],/under his feet/);assert.match(e.english_blocks[2],/Shu‘bah.*under his foot/);assert.match(e.english_blocks[3],/Humayd said, from Anas, from the Prophet/);assert.match(e.english_blocks[4],/toward the qiblah/);
});
test('510–514 keep complete routes, uncertainty, seasons and the closing lexical note',()=>{
 assert.match(entry(510).english_blocks[0],/Al-A‘raj ‘Abd al-Rahman and others.*Nafi‘.*the two of them related to him/);assert.doesNotMatch(entry(510).english_blocks[1],/Dhuhr/);assert.match(entry(511).english_blocks[1],/cooler, let it become cooler.*Wait, wait/);assert.equal(entry(511).english_blocks.at(-1),'Until we saw the shadows of the hillocks.');assert.equal(sourceSegments(entry(511),'english').at(-1).kind,'transmission-note');assert.match(entry(512).english_blocks[0],/We memorized it/);assert.match(entry(512).english_blocks[1],/a breath in winter and a breath in summer/);assert.match(entry(513).english_blocks.at(-1),/Sufyan, Yahya and Abu ‘Awanah/);assert.equal(entry(514).english_blocks.at(-1),'And Ibn ‘Abbas said: “Yatafayya’u” means “it inclines.”');assert.equal(sourceSegments(entry(514),'english').at(-1).kind,'transmission-note');
});
test('new book preserves the saved session while new plans cross the Prayer boundary',()=>{
 const {source,files}=collectionFiles(),a=input(),intro=a[0].blocks.find(b=>b.htmlId==='mwBg').text;assert(files.get('reader/prayer-times-review.html').includes(intro));assert(source.entries.every(e=>!e.arabic_blocks.includes(intro)));assert.equal(a[1].chapters.filter(c=>c.contextIds.length).length,1);const saved={numbers:[498],cursor:498,ended:true};assert.deepEqual(resolveSession(source.entries,saved,5,514),saved);assert.equal(nextSession(source.entries,saved,5).cursor,499);assert.equal(nextSession(source.entries,{numbers:[514],cursor:514,ended:true},5),null);for(const minutes of [5,10])for(let n=499;n<=514;n++)assert(planSession(source.entries,n,minutes).numbers.every(number=>source.entries.some(e=>e.number===number)));assert(!source.entries.some(e=>e.number===515));
});
