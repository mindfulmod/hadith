import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {pendingForNumber,pendingBefore} from '../reader/navigation.mjs';
import {sourceParts,sourceHTML} from '../reader/source-format.mjs';
import {startSession,resolveSession} from '../reader/session.mjs';
import {release} from '../reader/release.mjs';
import {pendingEntryView} from '../reader/library.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8')),hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const inv=read('content/staging/bukhari-witr-wikisource/catalog.json'),manifest=read('content/sources/wikisource-witr/manifest.json'),review=()=>read('content/review/witr-complete-review.json'),catalog=read('reader/books/catalog.json');
const expected=[946,947,948,949,950,951,952,953,954,955,956,958,959];
const {source,ledger}=collectionFiles(),entries=source.entries.filter(e=>e.book==='Witr'),plan=narrationPlan(source),get=n=>entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');

test('Witr preserves all available spans and accounts for its complete source including a mixed pending chapter',()=>{
 const b=ledger.books.find(b=>b.id==='witr');assert.deepEqual(entries.map(e=>e.number),expected);assert.equal(b.sourceEntryCount,14);assert.equal(b.chapters.length,7);assert.deepEqual(b.pendingEntries.map(e=>e.number),[957]);
 assert.deepEqual(b.chapters.at(-1).entryNumbers,[956,958,959]);assert.equal(b.chapters.at(-1).sourceContext.numberedReports,'present');assert.equal(b.chapters[1].sourceContext.introduction.arabicParagraphs,1);
 for(const row of review().entries){const e=get(row.number);assert.deepEqual(e.arabic_blocks,row.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text));assert.equal(row.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,row.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===row.number).script,e.english_blocks.join('\n\n'));assert.equal(e.audio_status,'No recording yet.');}
 assert(!plan.entries.some(e=>e.number===957));assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),32);
});
test('full additional occurrence, six pairs, separate source glosses and statement attribution survive',()=>{
 assert.deepEqual(get(946).presentation.english.map(s=>s.kind),['chain','report','chain','report']);assert.match(text(946),/between the single unit and the two units/);assert.match(text(946),/instructions about some need/);
 assert.equal(get(947).arabic_blocks.join('').split('ثم ركعتين').length-1,5);assert.match(text(947),/two units, then two units, then two units, then two units, then two units, then two units/);assert.match(text(947),/midnight, or close to it/);assert.doesNotMatch(text(947),/last ten|five times/);
 assert.equal(get(948).presentation.english.at(-1).kind,'transmission-note');assert.match(text(948),/Al-Qasim said/);assert.doesNotMatch(text(948),/consecutive/);
 assert.equal(get(949).english_blocks[2],'She means at night.');assert.equal(get(949).presentation.english[2].kind,'transmission-note');assert.equal(get(950).english_blocks.at(-1),'Hammad said: Meaning, quickly.');
 assert.match(text(951),/every part of the night/);assert.doesNotMatch(text(951),/every night|until he died/);assert.match(text(956),/After bowing, for a short time/);assert.doesNotMatch(text(956),/month/);
 assert.match(text(958),/^Ahmad ibn Yunus informed us/);assert.doesNotMatch(text(958),/Fajr/);assert.equal(get(959).english_blocks[1],'Qunut was performed in the sunset and dawn prayers.');assert.doesNotMatch(text(959),/Prophet|Messenger|bless/);
});
test('damaged comparison is bound to the real EPUB body and never presented as complete confirmation',()=>{
 const row=review().entries.find(e=>e.number===953),c=row.comparisons[1];assert.equal(c.status,'damaged-comparison');assert.equal(c.reference,'2.16.112');assert(c.checkedBody[1].includes('Make s your last prayer at night.'));assert.match(get(953).english_status,/damaged wording/);assert.match(text(953),/Make Witr/);
 for(const mutate of [c=>c.checkedBody[1]=c.checkedBody[1].replace('Make s','Make Witr'),c=>c.damagedExcerpt='not in the source',c=>c.reference='2.16.113',c=>delete c.note,c=>c.part={index:1,count:2}]){
  const bad=review(),e=bad.entries.find(e=>e.number===953);mutate(e.comparisons[1]);delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);assert.throws(()=>buildBookBatch(inv,bad,manifest,BOOK_CONFIGS.witr));
 }
});
test('957 stays a reserved pending reference, with source evidence and normal navigation to 958',()=>{
 const held=pendingForNumber(catalog,957);assert(held);assert(pendingEntryView(catalog,held).includes(held.reason));assert(pendingEntryView(catalog,{...held,reason:'<script>not markup</script>'}).includes('&lt;script&gt;not markup&lt;/script&gt;')); assert.deepEqual(pendingBefore(catalog,958).map(e=>e.number),[957]);assert.equal(pendingForNumber(catalog,956),undefined);assert.equal(pendingForNumber(catalog,926).number,926);
 const s=startSession(catalog.entries,956,5);assert.deepEqual(s.numbers.slice(0,3),[956,958,959]);assert(!s.numbers.includes(957));assert.deepEqual(resolveSession(catalog.entries,{numbers:[944,945],cursor:945,ended:false},10,959),{numbers:[944,945],cursor:945,ended:false});
 for(const mutate of [r=>delete r.pendingReferences,r=>r.pendingReferences=[957,958],r=>r.pendingReferences=[],r=>r.chapters.at(-1).entryNumbers.push(957)]){const r=review();mutate(r);assert.throws(()=>buildBookBatch(inv,r,manifest,BOOK_CONFIGS.witr));}
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='witr'),route=notes.routes.find(r=>r.id==='hadith-957');assert(release.files.some(f=>f.path===route.path));const html=readFileSync(new URL('reader/'+route.path,root),'utf8');assert(html.includes(inv.blocks.find(b=>b.htmlId==='mwJw').text));assert(html.includes('No English translation or recording is supplied'));assert(html.includes('Ibn Hajar explicitly calls the Witr phrase unclear'));
});
test('short honorific uses smaller presentation spans without changing existing text or full scripts',()=>{
 for(const n of [907,946]){const e=source.entries.find(e=>e.number===n),text=e.english_blocks.join('\n\n');assert(text.includes('peace be upon him'));assert(sourceParts(text).some(p=>p.honorific&&p.text==='peace be upon him'));assert.equal(sourceParts(text).map(p=>p.text).join(''),text);assert(sourceHTML(text).includes('<span class="honorific">peace be upon him</span>'));assert(plan.entries.find(p=>p.number===n).script.includes('peace be upon him'));}
});
