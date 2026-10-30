import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,collectionFiles} from '../scripts/build-collection.mjs';
import {buildBooks,objectHash} from '../scripts/publish-books.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments} from '../reader/source-structure.mjs';
import {startSession,visitSession} from '../reader/session.mjs';
import {ENTRY_COUNT,BOOK_COUNT} from './published-fixture.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sha=s=>createHash('sha256').update(s).digest('hex');
const input=()=>[read('content/staging/bukhari-prayer-description-wikisource/catalog.json'),read('content/review/prayer-description-fourth-review.json'),read('content/sources/wikisource-prayer-description/manifest.json'),BOOK_CONFIGS['prayer-description']];
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=objectHash(r);};
const entry=(a,n)=>a[1].entries.find(e=>e.number===n);

test('759–778 preserve complete selected spans, chains, honorifics and unrecorded scripts',()=>{
 const a=input(),batch=buildBookBatch(...a),{source,ledger}=collectionFiles(),plan=narrationPlan(source);
 assert.deepEqual(batch.entries.map(e=>e.number),Array.from({length:20},(_,i)=>759+i));
 assert.equal(a[1].entries.flatMap(e=>e.segments).length,52);
 for(const r of a[1].entries){const e=batch.entries.find(e=>e.number===r.number),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text;
  assert.equal(e.arabic_blocks.join(''),r.segments.map(s=>s.arabic).join(''));assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  if(r.number!==766)assert.equal(e.arabic_blocks[0],raw);
  assert.equal(sourceSegments(e,'english')[0].kind,'chain');
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join(' ').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(plan.entries.find(e=>e.number===r.number).script,e.english_blocks.join('\n\n'));
 }
 assert.equal(source.entries.length,ENTRY_COUNT);assert.equal(ledger.books.length,BOOK_COUNT);
 assert.throws(()=>buildBooks(source,ledger,{production:true}),/Evaluation text cannot enter/);
});

test('766 restores only the evidenced praise word, preserves the original and rejects incomplete evidence',()=>{
 const a=input(),r=entry(a,766),raw=a[0].blocks.find(b=>b.htmlId===r.paragraphIds[0]).text,e=buildBookBatch(...a).entries.find(e=>e.number===766),c=r.arabicCorrections[0];
 assert.equal(e.arabic_blocks[0],raw.replace('حمدا طيبا','حمدا كثيرا طيبا'));assert.equal(r.originalArabicSha256,sha(raw));
 assert.equal(c.before,'حمدا طيبا');assert.equal(c.after,'حمدا كثيرا طيبا');assert.deepEqual(c.witnesses.map(w=>w.pdfPage),[205,196]);
 assert(e.english_blocks[1].includes('abundant, good, blessed praise'));assert(e.english_blocks[1].includes('thirty-odd angels'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.arabicCorrections[0].originalParagraphSha256='0'.repeat(64),r=>r.contextNotes=[],r=>r.arabicCorrections[0].englishRendering='Missing translation']){const b=input(),row=entry(b,766);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...b));}
});

test('764 has explicit absent-comparison evidence and 770/771 retain distinct parts of Khan 768',()=>{
 const a=input(),r=entry(a,764),c=r.comparisons[1];buildBookBatch(...a);
 assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['1.12.762','1.12.763']);assert.equal(c.checkedReferenceEvidence.length,2);
 for(const [n,reference,part] of [[759,'1.12.758'],[763,'1.12.762'],[765,'1.12.763'],[770,'1.12.768',1],[771,'1.12.768',2],[772,'1.12.769'],[778,'1.12.775']]){const c=entry(a,n).comparisons[1];assert.equal(c.reference,reference);assert.equal(c.part?.index,part);}
 for(const mutate of [r=>r.comparisons[1].checkedReferences[1]='1.12.764',r=>r.comparisons[1].checkedReferenceEvidence[0].recordSha256='0'.repeat(64),r=>r.comparisons[1].reference='1.12.762']){const b=input(),row=entry(b,764);mutate(row);rehash(row);assert.throws(()=>buildBookBatch(...b));}
 const b=input(),row=entry(b,771);row.comparisons[1].part.index=1;rehash(row);assert.throws(()=>buildBookBatch(...b),/part|duplicate/i);
});

test('771 links its preceding chain without fabricating a repeated chain or merging the historical close',()=>{
 const a=input(),r=entry(a,771),e=buildBookBatch(...a).entries.find(e=>e.number===771);
 assert.equal(r.contextNotes[0].related[0].id,'bukhari:770');assert.equal(r.contextNotes[0].related[0].target,'chain');
 assert(r.segments[0].english.startsWith('Both of them said'));assert(!r.segments[0].english.includes('Abu Bakr'));
 assert(r.segments[1].english.includes('‘Ayyash ibn Abi Rabi‘ah'));assert(!r.segments[1].english.includes('famine'));
 assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');assert(e.english_blocks.at(-1).startsWith('At that time'));
});

test('769 and 772 keep the selected attested variants and every interleaved narrator exchange',()=>{
 const a=input(),batch=buildBookBatch(...a),get=n=>batch.entries.find(e=>e.number===n);
 assert(!entry(a,769).arabicCorrections);assert(get(769).english_blocks[1].includes('Abu Burayd'));assert(!get(769).english_blocks[1].includes('Abu Yazid'));
 assert(entry(a,769).contextNotes[0].text.includes('Abu Yazid'));
 assert(!entry(a,772).arabicCorrections);assert(get(772).arabic_blocks[0].includes('ساقه الأيمن'));
 const segments=sourceSegments(get(772),'english');assert.deepEqual(segments.map(s=>s.kind),['chain','report','transmission-note','report','transmission-note','report','transmission-note']);
 assert.equal(segments[2].text,'Sometimes Sufyan said, “From a horse.”');assert.equal(segments[4].text,'On one occasion Sufyan said, “We prayed sitting.”');
 for(const phrase of ['Ma‘mar','I said, “Yes.”','He remembered it well','I remembered','Ibn Jurayj','His right leg was grazed'])assert(segments[6].text.includes(phrase));
 assert(entry(a,772).contextNotes[0].text.includes('forearm'));assert(entry(a,772).additionalCitations.some(c=>c.sourceId==='irshad-prayer-description-772'));
});

test('773 remains one complete report with its repetition, elliptical prompt and both closing recollections',()=>{
 const a=input(),r=entry(a,773),{source}=collectionFiles(),e=source.entries.find(e=>e.number===773),text=e.english_blocks.join(' ');
 assert.equal(r.segments.length,6);assert.equal(sourceSegments(e,'english').at(-1).kind,'transmission-note');
 assert(text.includes('no veil before it'));assert(text.includes('cut to pieces'));assert(text.includes('silt carried by a flood'));
 assert.equal((text.match(/They come out of the Fire/g)||[]).length,2);assert(text.includes('They bring them out'));
 assert(text.includes('may I not be the most wretched'));assert(text.includes('do not make me the most wretched'));
 assert(text.includes('would you not ask for something else'));assert(text.includes('‘Of such and such.’'));
 assert.equal((text.match(/ten times its like/g)||[]).length,2);assert.equal((text.match(/the like of it with it/g)||[]).length,2);
 for(const addition of ['mere skeletons','steam','Ask more','stay forever'])assert(!text.includes(addition));
 assert.equal(narrationPlan(source).entries.filter(e=>e.number===773).length,1);
 const session=startSession(source.entries,773,5);assert.equal(session.numbers[0],773);assert(session.numbers.every(n=>typeof n==='number'));assert.deepEqual(visitSession(session,1),session);
});

test('untitled chapter 44, empty chapter 49 and three separate Arabic introductions remain intact',()=>{
 const a=input(),batch=buildBookBatch(...a);assert.equal(batch.chapters.length,13);
 assert.equal(a[1].chapters.find(c=>c.id==='chapter-44').titleArabic,'باب');
 const empty=batch.chapters.find(c=>c.id==='chapter-49');assert.deepEqual(empty.entryNumbers,[]);assert.equal(empty.sourceContext.introduction.arabicParagraphs,1);
 assert.equal(batch.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),3);
 for(const c of a[1].chapters)for(const id of c.contextIds){const raw=a[0].blocks.find(b=>b.htmlId===id).text;assert(!batch.entries.some(e=>e.arabic_blocks.includes(raw)));}
 const context=a[0].blocks.find(b=>b.htmlId==='mw2Q').text;assert(context.includes('جالسا'));
 assert(!narrationPlan(collectionFiles().source).entries.some(e=>e.number==='chapter-49'));
});

test('small textual distinctions, closing routes and uncertainty are not normalised across reports',()=>{
 const batch=buildBookBatch(...input()),get=n=>batch.entries.find(e=>e.number===n).english_blocks.join(' ');
 assert(get(759).startsWith('Badal ibn al-Muhabbar related to us.'));
 assert(get(759).includes('apart from the standing and sitting'));assert(!get(768).includes('apart from'));
 assert(get(762).includes('O Allah, our Lord, and to You'));assert(get(763).includes('O Allah, our Lord, to You'));assert(get(762).includes('two prostrations'));
 assert(get(774).includes('Al-Layth said: Ja‘far ibn Rabi‘ah related to me something similar.'));
 assert(get(775).includes('I think he said'));assert(get(775).includes('sunnah of Muhammad'));assert(!get(775).includes('natural disposition'));
 assert(get(776).includes('was commanded'));assert(get(776).includes('hair or clothing'));assert(get(777).includes('clothing or hair'));
 assert(get(778).includes('he was not a liar'));assert(!get(778).includes('nose'));
});
