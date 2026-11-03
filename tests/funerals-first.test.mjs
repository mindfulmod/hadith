import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateChapterDifferences} from '../scripts/chapter-source-differences.mjs';
import {validateDamagedBewleyComparison} from '../scripts/damaged-bewley-comparisons.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/funerals-first-review.json');
const inv=read('content/staging/bukhari-funerals-wikisource/catalog.json'),manifest=read('content/sources/wikisource-funerals/manifest.json'),config=BOOK_CONFIGS.funerals;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),numbers=Array.from({length:14},(_,i)=>1180+i),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const refs=n=>ledger.sourceReferences.entries.find(e=>e.number===n);
const rehash=e=>{for(const s of e.segments){s.arabicSha256=sha(s.arabic);s.englishSha256=sha(s.english);}e.englishSha256=sha(e.segments.map(s=>s.english).join('\n\n'));delete e.reviewRecordSha256;e.reviewRecordSha256=hash(e);};

test('Funerals admits only its first fourteen entries, six chapters and three separate context paragraphs',()=>{
 assert.deepEqual(book.entryNumbers,numbers);assert.equal(book.sourceEntryCount,150);assert.equal(book.chapters.length,6);assert.equal(review().entries.reduce((n,e)=>n+e.segments.length,0),36);assert.deepEqual(review().chapters.flatMap(c=>c.contextIds),['mwBg','mwJQ','mwKg']);assert.equal(inv.records.filter(r=>!numbers.includes(r.number)).length,136);assert.equal(get(1194),undefined);assert.equal(get('1200b'),undefined);
});
test('complete original Arabic and mapped origins cannot be replaced by resealing the review',()=>{
 for(const e of review().entries){const original=e.paragraphIds.map(id=>inv.blocks.find(b=>b.htmlId===id).text);assert.equal(e.segments.map(s=>s.arabic).join(''),original.join(''));assert.deepEqual(get(e.number).arabic_blocks,original);assert.equal(e.arabicCorrections,undefined);}
 for(const mutate of [e=>e.segments.pop(),e=>e.segments[1].start++,e=>e.sourceLayout.paragraphs[0].origin.start++]){const r=review();mutate(r.entries[0]);rehash(r.entries[0]);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
 const r=review();delete r.sourceLayout;assert.throws(()=>buildBookBatch(inv,r,manifest,config),/layout review/);
});
test('all source honorifics survive the English working translation',()=>{
 for(const e of review().entries){const a=e.segments.map(s=>s.arabic).join(''),t=text(e.number);assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,(a.match(/ﷺ/g)||[]).length,e.number);assert.equal((t.match(/may Allah Most High be pleased/g)||[]).length,(a.match(/رضى الله تعالى/g)||[]).length,e.number);}
});
test('1180 keeps its uncertainty and repeated questions; 1181 keeps the narrator statement separate',()=>{
 assert.match(text(1180),/informed me—or he said, gave me good news/);assert.equal((text(1180).match(/even if he has stolen/gi)||[]).length,2);
 assert.equal(get(1181).presentation.english.at(-1).kind,'transmission-note');assert.match(get(1181).english_blocks.at(-1),/^And I said:/);assert(refs(1181).contextNotes.some(c=>c.text.includes('‘Abdullah')));
});
test('1182 retains the stated seven and the six named prohibitions without supplying another item',()=>{
 const t=text(1182);assert.match(t,/instructed us to do seven things and forbade us seven/);assert.match(t,/fulfil an oath, return the greeting of peace/);assert.equal(t.split('He forbade us ')[1],'silver vessels, a gold ring, silk, brocade, qassi cloth and thick brocade.');assert.doesNotMatch(t,/our oaths|saddle|sitting/);
});
test('1183 keeps all five rights and both closing transmission routes',()=>{
 assert.match(text(1183),/are five: returning.*visiting.*following.*answering.*invoking/s);assert.equal(get(1183).presentation.english.at(-1).kind,'transmission-note');assert.match(text(1183),/‘Abd al-Razzaq corroborated it.*Ma‘mar informed us.*Salamah also related it from ‘Uqayl/s);
});
test('1184 and 1185 retain exact contiguous narrator-delimited parts of the shared EPUB body',()=>{
 const parts=review().entries.filter(e=>[1184,1185].includes(e.number)).map(e=>e.comparisons[1]);const body=Array.from(parts[0].checkedBody.join('\n\n'));let end=0;
 for(const [i,p]of parts.entries()){const s=p.spanEvidence.span;assert.equal(s.start,end);assert.equal(sha(body.slice(s.start,s.end).join('')),s.sha256);assert.deepEqual(p.part,{index:i+1,count:2});end=s.end;}
 assert.equal(end,body.length);assert(body.slice(parts[1].spanEvidence.span.start).join('').startsWith('Narrated Abu Salama from Ibn Abbas :'));
 const r=review();r.entries[4].comparisons[1].spanEvidence.span.end++;rehash(r.entries[4]);assert.throws(()=>buildBookBatch(inv,r,manifest,config),/exact inspected span/);
 assert.match(text(1184),/May my father be your ransom/);assert.doesNotMatch(text(1184),/my mother|knelt/);
});
test('1185 links the preceding chain and preserves repetitions and the selected abbreviated Quran quote',()=>{
 assert(refs(1185).contextNotes.some(c=>c.related.some(x=>x.id==='bukhari:1184'&&x.target==='chain')));assert.equal((text(1185).match(/Sit down/g)||[]).length,2);assert.equal((text(1185).match(/but he refused/g)||[]).length,2);assert.equal((text(1185).match(/may Allah Most High be pleased/g)||[]).length,5);assert.match(text(1185),/‘And Muhammad is only a messenger,’ up to ‘the thankful.’/);assert.doesNotMatch(text(1185),/messengers have passed|Tashah-hud/);
});
test('1186 retains with-me and with-him alternatives with every closing route',()=>{
 assert.match(text(1186),/what will be done with me/);assert.match(get(1186).english_blocks.at(-1),/Sa‘id ibn ‘Ufayr related to us\. Al-Layth related to us.*Nafi‘ ibn Yazid said, from ‘Uqayl: “What will be done with him.” Shu‘ayb, ‘Amr ibn Dinar and Ma‘mar corroborated it/s);
 const c=review().entries[6].comparisons[1];assert.equal(c.splitReferences[1].status,'inline-back-reference-only');assert.deepEqual(c.splitReferences[1].segmentIds,['1186-4']);assert.deepEqual(c.splitReferences[1].checkedBody,['Narrated Al-Laith as above. ']);
});
test('an inline English pointer rejects a changed body, invented target, missing status or claimed report coverage',()=>{
 for(const mutate of [p=>p.checkedBody[0]+=' altered',p=>p.referencedReference='2.23.334',p=>p.continuedByReference='2.23.336',p=>delete p.status,p=>p.status='invented-pointer',p=>p.segmentIds=['1186-3','1186-4'],p=>p.note='']){const r=review(),e=r.entries[6];mutate(e.comparisons[1].splitReferences[1]);rehash(e);assert.throws(()=>buildBookBatch(inv,r,manifest,config));}
});
test('1187 keeps Ghundar, the person lifted and the complete Ibn Jurayj closing route',()=>{
 assert.match(text(1187),/Ghundar related to us/);assert.match(text(1187),/until you lifted him/);assert.doesNotMatch(text(1187),/until you removed it/);assert.match(get(1187).english_blocks.at(-1),/Ibn Jurayj corroborated it: Ibn al-Munkadir informed me that he heard Jabir, may Allah Most High be pleased with him/);
});
test('1188 preserves singular transmission and four takbirs; 1189 retains its intervening narrator statement',()=>{
 assert.match(text(1188),/Malik related to me/);assert.match(text(1188),/pronounced the takbir four times/);assert.doesNotMatch(text(1188),/behind him/);assert.equal((text(1189).match(/was struck down/g)||[]).length,3);assert.match(text(1189),/”—and the eyes of the Messenger of Allah, may Allah bless him and grant him peace, were indeed shedding tears—“then/);assert.doesNotMatch(text(1189),/martyr|Mu’tah|beforehand/);
});
test('1190 preserves the night and darkness explanation and the visit to the grave',()=>{
 assert.match(text(1190),/He died at night, and they buried him at night/);assert.match(text(1190),/It was night—and dark—and we disliked causing you hardship/);assert.match(text(1190),/went to his grave and prayed over him/);
});
test('1192 keeps both printed occurrences in one selected entry including the full Sharik route',()=>{
 const row=review().entries.find(e=>e.number===1192);assert(row.additionalCitations.some(c=>c.locator.includes('1249 / 1250')));assert.match(text(1192),/Sharik said, from Ibn al-Asbahani: Abu Salih related to me, from Abu Sa‘id and Abu Hurayrah/);assert.match(text(1192),/Abu Hurayrah said: “They had not reached puberty.”/);assert.match(text(1191),/before reaching puberty/);
});
test('1193 keeps the compiler quotation without importing a puberty qualifier or a theological explanation',()=>{
 assert.match(text(1193),/except to fulfil the oath/);assert.equal(get(1193).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(1193).english_blocks.at(-1),'Abu ‘Abdullah said: “And there is none of you but will come to it.”');assert.doesNotMatch(text(1193),/puberty|bridge|crossing/);
});
test('comparison limitations and chapter variants remain bound and visible',()=>{
 for(const e of review().entries)if(e.comparisons[0].status){assert(validateDamagedBewleyComparison(e.comparisons[0],e,config,review().sources));const c=structuredClone(e.comparisons[0]);delete c.damageEvidence;assert.throws(()=>validateDamagedBewleyComparison(c,e,config,review().sources));}
 const r=review();assert.equal(r.chapters.reduce((n,c)=>n+validateChapterDifferences(c,inv,r).length,0),6);delete r.chapters[0].contextDifferences;assert.throws(()=>validateChapterDifferences(r.chapters[0],inv,r));
 assert.equal(read('research/funerals-first-wording-review.json').reviewSha256,hash(review()));
});
test('new source notes remain downloadable while prior holds and six complete recordings remain unchanged',()=>{
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='funerals');for(const route of notes.routes)assert(release.files.some(f=>f.path===route.path));assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);assert.deepEqual(ledger.books.flatMap(b=>(b.pendingEntries||[]).map(p=>p.number)),[926,957,1104,1115]);
});
