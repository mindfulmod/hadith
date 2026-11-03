import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {validateSharedEnglishSpan} from '../scripts/english-shared-spans.mjs';
import {validateEnglishOccurrence} from '../scripts/english-occurrences.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {resolveSession} from '../reader/session.mjs';
import {release} from '../reader/release.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),hash=o=>sha(JSON.stringify(o));
const review=()=>read('content/review/shortening-final-review.json'),inv=read('content/staging/bukhari-shortening-wikisource/catalog.json'),manifest=read('content/sources/wikisource-shortening/manifest.json'),config=BOOK_CONFIGS.shortening;
const {source,ledger}=collectionFiles(),book=ledger.books.find(b=>b.id===config.id),get=n=>source.entries.find(e=>e.number===n),text=n=>get(n).english_blocks.join('\n\n');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('all 39 Shortening occurrences remain distinct, with 52 newly translated spans and full narration scripts',()=>{
 assert.deepEqual(book.entryNumbers,Array.from({length:39},(_,i)=>1030+i));assert.equal(review().entries.reduce((a,r)=>a+r.segments.length,0),52);
 const plan=narrationPlan(source);
 for(const r of review().entries){const e=get(r.number);assert.equal(r.segments.map(s=>s.arabic).join(''),e.arabic_blocks.join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(plan.entries.find(p=>p.number===r.number).script,text(r.number));if(r.number!==1064)assert.deepEqual(e.arabic_blocks,r.paragraphIds.map(p=>inv.blocks.find(b=>b.htmlId===p).text));}
 assert.deepEqual(read('reader/audio/catalog.json').coverage.recorded,[1,2,3,4,5,6]);
});
test('shared English references require exact spans, complete ordered parts and preserved limitations',()=>{
 const r=review();for(const n of [1046,1047,1052,1053,1055,1056,1057]){const row=r.entries.find(e=>e.number===n),c=row.comparisons[1];assert(validateSharedEnglishSpan(c,row,config));for(const change of [x=>delete x.spanEvidence,x=>x.spanEvidence.span.start++,x=>x.part.index++,x=>x.spanEvidence.auditSha256='0'.repeat(64),x=>x.reference='2.20.210']){const bad=structuredClone(c);change(bad);assert.throws(()=>validateSharedEnglishSpan(bad,row,config));}}
 for(const change of [r=>r.entries.splice(r.entries.findIndex(x=>x.number===1056),1),r=>delete r.entries.find(x=>x.number===1057).comparisons[1].status]){const bad=review();change(bad);for(const row of bad.entries)rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});
test('mislabelled English occurrences retain 1054, first 1055 and second 1055 separately',()=>{
 for(const [n,label,index]of [[1053,'1054',1],[1054,'1055',1],[1055,'1055',2]]){const r=review(),row=r.entries.find(e=>e.number===n),c=row.comparisons[0];assert.equal(c.reference,label);validateEnglishOccurrence(c,row,config,r.sources);const located=read('content/review/english-occurrence-locators.json').locators.find(l=>l.id===c.occurrenceLocator.id);assert.equal(located.occurrence,index);for(const mutate of [c=>delete c.occurrenceLocator,c=>c.reference='1056',c=>c.occurrenceLocator.sha256='0'.repeat(64)]){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateEnglishOccurrence(bad,row,config,r.sources));}}
});
test('mount reports retain obligatory exceptions, the distinct Salim account and full closing corroboration',()=>{
 assert.match(text(1046),/gesturing with his head.*did not do this in the obligatory prayer/s);assert.match(text(1047),/Al-Layth.*Yunus.*Ibn Shihab.*Salim.*at night.*Witr.*did not perform the obligatory/s);assert.doesNotMatch(get(1048).english_blocks[1],/voluntary/);
 assert.match(get(1049).english_blocks[0],/Habban related to us/);assert.doesNotMatch(text(1049),/Hibban/);assert.match(get(1049).english_blocks.at(-1),/Ibn Tahman.*Hajjaj.*Anas ibn Sirin.*Anas.*Prophet/s);assert.equal(get(1049).presentation.english.at(-1).kind,'transmission-note');
});
test('voluntary-prayer accounts retain source-specific names, qualification and Quran endpoint',()=>{
 assert.match(text(1050),/Ibn ‘Umar.*travelled.*did not see.*exalted be His mention.*excellent example/s);assert.doesNotMatch(text(1050),/33:21|Last Day/);
 assert.match(text(1051),/‘Isa ibn Hafs ibn ‘Asim.*Abu Bakr, ‘Umar and ‘Uthman.*pleased with them/s);
 assert.match(text(1052),/from ‘Amr, from Ibn Abi Layla.*No one informed us.*except Umm Hani.*eight rak‘ahs.*bowing and prostration/s);assert.doesNotMatch(text(1052),/ibn Murrah/);
});
test('the inherited chain has a separate link and both closing corroborators, without invented chain words',()=>{
 const r=review().entries.find(e=>e.number===1057);assert.match(text(1057),/^And from Husayn/);assert.deepEqual(r.contextNotes[0].related,[{id:'bukhari:1056',number:1056,target:'chain',label:'View the preceding chain · 1056'}]);assert.match(get(1057).english_blocks.at(-1),/‘Ali ibn al-Mubarak and Harb.*Yahya.*Hafs.*Anas.*combined the prayers/s);
 assert.match(text(1058),/three rak‘ahs.*taslim.*iqamah.*two rak‘ahs.*taslim.*single voluntary rak‘ah.*nor a prostration.*middle of the night/s);
});
test('timing reports keep their distinct clauses and seated followers do not inherit the erroneous English reading',()=>{
 assert.doesNotMatch(get(1060).english_blocks[1],/dismount/);assert.match(get(1061).english_blocks[1],/dismount.*before he set out/s);
 assert.match(text(1062),/ill.*sitting.*standing.*gestured.*sit/s);assert.match(text(1063),/scratched, or grazed.*he prayed sitting, so we prayed sitting.*takbir.*bows.*rises.*Our Lord, and to You/s);assert.doesNotMatch(text(1063),/we prayed standing/);
 const c=review().entries.find(r=>r.number===1063).comparisons[1];assert.equal(c.damagedExcerpt,'we prayed while standing');
});
test('1064 preserves two routes and original input, and rejects altered correction evidence',()=>{
 const r=review().entries.find(e=>e.number===1064);assert.deepEqual(get(1064).presentation.english.map(p=>p.kind),['chain','report','chain','report']);assert.equal(r.arabicCorrections.length,1);assert(get(1064).arabic_blocks[0].includes('عن ابن بريدة'));assert(inv.blocks.find(b=>b.htmlId==='mwaA').text.includes('عن أبي بريدة'));
 for(const mutate of [r=>delete r.originalArabicSha256,r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].before='عن ابن بريدة',r=>r.contextNotes=[]]){const bad=review(),row=bad.entries.find(e=>e.number===1064);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(inv,bad,manifest,config));}
});
test('reward reports keep the alternate introduction, attributed gloss and two separate half-reward clauses',()=>{
 assert.match(text(1064),/If he prays standing.*half the reward.*half the reward/s);assert.match(text(1065),/Abu Ma‘mar once said, “from ‘Imran”.*Whoever prays standing.*half the reward.*half the reward/s);assert.equal(get(1065).presentation.english.at(-1).kind,'transmission-note');assert.equal(get(1065).english_blocks.at(-1),'Abu ‘Abdullah said: In my view, nā’iman here means lying down.');assert.doesNotMatch(get(1064).english_blocks[2],/hemorrhoids/);assert.match(get(1064).english_blocks[3],/^He had hemorrhoids/);assert.doesNotMatch(get(1065).english_blocks[0],/hemorrhoids/);assert.match(get(1065).english_blocks[1],/^‘Imran ibn Husayn, who was a man with hemorrhoids/);assert.match(text(1066),/I had hemorrhoids.*Pray standing.*If you cannot.*sitting.*If you cannot.*on your side/s);
});
test('the final Aishah accounts retain about thirty or forty and the complete awake/asleep ending',()=>{
 assert.match(text(1067),/Mother of the Believers.*grew old.*about thirty verses or forty verses/s);assert.match(text(1068),/‘Abdullah ibn Yazid and Abu al-Nadr.*‘Umar ibn ‘Ubayd Allah.*thirty or forty.*second rak‘ah.*awake.*talk with me.*asleep.*lie down/s);assert.doesNotMatch(text(1068),/last days|grew old/);
});
test('all twenty chapters retain six separate context blocks, a pending heading and the posture-order difference',()=>{
 assert.equal(book.chapters.length,20);assert.equal(book.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),6);assert.equal(book.chapters[11].sourceContext.headingStatus,'heading-translation-pending');assert.equal(book.chapters[19].sourceContext.textualDifferences.status,'unresolved');
 const bad=review();delete bad.chapters.at(-1).contextDifferences;assert.throws(()=>buildBookBatch(inv,bad,manifest,config),/Known chapter differences/);
 for(const id of ['mwRQ','mwXA','mwbw','mwcw'])assert(!source.entries.some(e=>e.arabic_blocks.includes(inv.blocks.find(b=>b.htmlId===id).text)));
});
test('offline source routes include every new occurrence and saved sessions remain exact',()=>{
 const saved={numbers:[1044,1045],cursor:1045,ended:false};assert.deepEqual(resolveSession(source.entries,saved,5,1046),saved);
 const notes=read('reader/source-notes.json').books.find(b=>b.id==='shortening');for(const r of review().entries){const route=notes.routes.find(p=>p.id==='hadith-'+r.number);assert(release.files.some(f=>f.path===route.path));}
});

test('pending chapter titles are described as app status in both chapter and hadith source notes',()=>{
 for(const [bookId,chapter,reference]of [['shortening','chapter-12',1052],['rain-prayer','chapter-27',991]]){
  const inputs=read('reader/'+bookId+'-inputs.json');assert.equal(inputs.review.chapters.find(c=>c.id===chapter).status,'heading-translation-pending');
  const notes=read('reader/source-notes.json').books.find(b=>b.id===bookId);
  for(const id of [chapter,'hadith-'+reference]){const route=notes.routes.find(r=>r.id===id);const html=readFileSync(new URL('../reader/'+route.path,import.meta.url),'utf8'),article=html.match(new RegExp('<article id="'+id+'">[\\s\\S]*?</article>'))?.[0];assert(article);assert(article.includes('app status'));assert(!article.includes('The heading’s English is provisional.'));assert(!article.includes('The English heading is an AI-assisted working translation'));}
 }
});
