import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {objectHash,buildBooks} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {planSession,resolveSession,nextSession} from '../reader/session.mjs';
import {narrationHTML} from '../reader/source-structure.mjs';
import {sourceParts,sourceHTML} from '../reader/source-format.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const input=()=>[read('content/staging/bukhari-prayer-wikisource/catalog.json'),read('content/review/prayer-third-review.json'),read('content/sources/wikisource-prayer/manifest.json'),BOOK_CONFIGS.prayer];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
test('Prayer 364–377 retains exact Arabic, complete scripts and prior Prayer entries',()=>{
 const a=input(),before=structuredClone(a.slice(0,3)),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(a.slice(0,3),before);assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:14},(_,i)=>364+i));assert.equal(batch.chapters.length,11);
 const old=read('reader/books/prayer-d308e31ee636af74.json');assert.deepEqual(source.entries.filter(e=>e.number>=342&&e.number<=363),old.entries);
 for(const row of a[1].entries){const entry=batch.entries.find(e=>e.number===row.number),arabic=a[0].blocks.find(b=>b.htmlId===row.paragraphIds[0]).text;assert.equal(row.segments.map(s=>s.arabic).join(''),arabic);assert.equal(entry.arabic_blocks.join(''),arabic);assert.deepEqual(entry.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(e=>e.number===row.number).script,entry.english_blocks.join('\n\n'));assert.equal((arabic.match(/ﷺ/g)||[]).length,(entry.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);}
 assert.throws(()=>buildBooks(source,ledger,{production:true}));
});
test('two English comparison entries preserve one complete Arabic hadith and both transmissions',()=>{
 const a=input(),{source,ledger}=collectionFiles(),r=a[1].entries.find(e=>e.number===366),c=r.comparisons[1],entry=source.entries.find(e=>e.number===366);
 assert.deepEqual(c.splitReferences.map(p=>[p.reference,p.segmentIds]),[['1.8.369',['366-1','366-2']],['1.8.370',['366-3','366-4']]]);
 assert.deepEqual(entry.presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.match(entry.english_blocks[2],/Hisham ibn ‘Urwah.*his father.*‘A’ishah/);assert.match(entry.english_blocks[3],/I fear/);
 const citation=ledger.sourceReferences.entries.find(e=>e.number===366).citations.find(c=>c.id==='khan');assert.match(citation.locator,/Numbers 369, 370/);
 assert.equal(source.entries.filter(e=>e.number===366).length,1);
});
test('later compiler discussion is visible, complete and distinct, with reversible mercy styling',()=>{
 const {source}=collectionFiles(),entry=source.entries.find(e=>e.number===370),note=entry.english_blocks.at(-1),html=narrationHTML(entry);
 assert.equal(entry.presentation.english.at(-1).kind,'transmission-note');assert.match(note,/^Abu ‘Abd Allah said: ‘Ali ibn ‘Abd Allah said: Ahmad ibn Hanbal/);assert.match(note,/Did you not hear it from him\?” He said: “No\.”$/);
 assert.match(html,/<section class="source-note" aria-label="Transmission note">/);assert.match(html,/<span class="honorific">may Allah have mercy on him<\/span>/);
 assert.equal(sourceParts(note).map(p=>p.text).join(''),note);assert(sourceParts(note).some(p=>p.honorific&&p.text==='may Allah have mercy on him'));
 assert.equal(sourceHTML('May Allah have mercy on him'),'May Allah have mercy on him');assert.match(narrationPlan(source).entries.find(e=>e.number===370).script,/may Allah have mercy on him/);
});
test('comparison omissions and additions do not replace selected report details',()=>{
 const {source}=collectionFiles(),t=n=>source.entries.find(e=>e.number===n).english_blocks.join(' ');
 assert.match(t(364),/riding behind Abu Talhah/);assert.match(t(364),/‘Abd al-‘Aziz said: And some of our companions said/);assert.match(t(364),/Herself\. He freed her and married her/);assert.match(t(364),/I think he also mentioned sawiq/);
 assert.doesNotMatch(t(365),/dark/);assert.match(t(366),/glanced once/);assert.match(t(367),/she screened/);assert.match(t(369),/‘Awn ibn Abi Juhayfah, from his father/);assert.match(t(369),/two rak‘ahs/);
 assert.equal((t(370).match(/recited/g)||[]).length,1);assert.match(t(370),/stepped backwards/);assert.match(t(371),/lower leg or shoulder/);assert.match(t(371),/tree trunks/);assert.doesNotMatch(t(371),/date-palm|pray sitting|pray seated/);
 assert.match(t(373),/his grandmother Mulaykah/);assert.match(t(373),/mat of ours/);assert.match(t(373),/sprinkled/);assert.doesNotMatch(t(373),/washed|ibn Yusuf/);
 assert.match(t(375),/nudged me/);assert.match(t(376),/‘A’ishah informed him/);assert.match(t(377),/bed on which they both slept/);assert.doesNotMatch(source.entries.find(e=>e.number===377).english_blocks[0],/‘A’ishah/);
});
test('five introductions stay browse-only while sessions continue across the new chapters',()=>{
 const a=input(),{source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id==='prayer'),plan=narrationPlan(source),chapters=a[1].chapters.filter(c=>c.contextIds.length);
 assert.deepEqual(chapters.map(c=>c.id),['chapter-12','chapter-13','chapter-18','chapter-20','chapter-22']);
 for(const c of chapters){assert.equal(book.chapters.find(b=>b.id===c.id).sourceContext.introduction.englishStatus,'pending');for(const id of c.contextIds){const intro=a[0].blocks.find(b=>b.htmlId===id).text;assert(source.entries.every(e=>e.arabic_blocks.every(t=>!t.includes(intro))));assert(plan.entries.every(e=>!e.script.includes(intro)));}}
 const saved={numbers:[362,363],cursor:363,ended:true};assert.deepEqual(resolveSession(source.entries,saved,10,377),saved);assert.equal(nextSession(source.entries,saved,5).cursor,364);
 for(const minutes of [5,10])for(let n=364;n<=377;n++){const session=planSession(source.entries,n,minutes);assert.equal(session.numbers[0],n);assert(session.numbers.every(number=>source.entries.some(e=>e.number===number)));}
});
test('truncated discussion, broken split evidence and missing chapter context fail closed',()=>{
 for(const change of [r=>r.entries.find(e=>e.number===370).segments.pop(),r=>r.entries.find(e=>e.number===366).comparisons[1].splitReferences[1].segmentIds=['366-4'],r=>r.entries.find(e=>e.number===366).comparisons[1].splitReferences[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.entries[0].segments.reverse(),r=>r.chapters[0].contextIds=[]]){const a=input();change(a[1]);a[1].entries.forEach(rehash);assert.throws(()=>buildBookBatch(...a));}
});
