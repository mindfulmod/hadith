import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch} from '../scripts/build-collection.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-fifth-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};
const batch=()=>buildBookBatch(...input());
const get=(b,n)=>b.entries.find(e=>e.number===n);
const text=(b,n)=>get(b,n).english_blocks.join('\n');
const row=(a,n)=>a[1].entries.find(e=>e.number===n);

test('candidate 651–669 preserves complete chapters, source coverage and narration, keeping introductions separate',()=>{
 const a=input(),b=buildBookBatch(...a),p=narrationPlan(b);
 assert.deepEqual(b.entries.map(e=>e.number),Array.from({length:19},(_,i)=>651+i));
 assert.equal(b.chapters.length,14);assert.equal(a[1].entries.reduce((n,r)=>n+r.segments.length,0),46);
 for(const r of a[1].entries){
  const e=get(b,r.number),original=r.paragraphIds.map(id=>a[0].blocks.find(x=>x.htmlId===id).text);
  assert.deepEqual(e.arabic_blocks,deriveArabicBlocks(r,original,a[1].sources));
  assert.deepEqual(r.paragraphIds.map(id=>r.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),e.arabic_blocks);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));
  assert.equal(p.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join('').match(/may Allah bless him and grant him peace/g)||[]).length);
 }
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),5);
 assert.deepEqual(b.chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs).map(c=>c.id),['chapter-48','chapter-51','chapter-52','chapter-54','chapter-56']);
 assert(b.chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs).every(c=>c.sourceContext.introduction.englishStatus==='pending'));
 assert.equal(p.entries.length,19);assert(b.entries.every(e=>e.audio_status==='No recording yet.'));
});

test('651–655 preserve separate attributions, repeated requests, honorifics and the later identification',()=>{
 const b=batch();assert.equal(sourceSegments(get(b,651),'english').at(-1).kind,'transmission-note');assert(narrationHTML(get(b,651)).includes('‘Urwah said'));
 const t=text(b,655);assert.equal((t.match(/Have the people prayed\?/g)||[]).length,4);assert.equal((t.match(/Put water for me in the basin/g)||[]).length,3);assert.equal((t.match(/but fainted/g)||[]).length,3);
 assert.equal((t.match(/may Allah bless him and grant him peace/g)||[]).length,10);assert.equal((t.match(/peace be upon him/g)||[]).length,1);
 assert(t.includes('later ‘Isha’ prayer'));assert(t.includes('for the Zuhr prayer'));assert(t.includes('They seated him beside Abu Bakr'));
 const s=sourceSegments(get(b,655),'english');assert(!s.filter(x=>x.kind==='report').some(x=>x.text.includes('‘Ali')));assert(s.at(-1).text.includes('He was ‘Ali'));assert(!t.includes('‘Ali ibn Abi Talib'));
 assert(text(b,652).includes('may Allah Most High be pleased with him'));assert.equal((text(b,653).match(/such-and-such a prayer at such-and-such a time/g)||[]).length,2);
 for(const phrase of ['Ma‘mar informed us','Mahmud ibn al-Rabi‘ informed me','I heard ‘Itban ibn Malik'])assert(text(b,654).includes(phrase));
});

test('656–657 keep the selected edition’s omissions, repeated instruction and attributed closing comment',()=>{
 const b=batch();assert(!text(b,656).includes('Allah hears whoever praises Him'));
 assert.equal((text(b,657).match(/When he prays standing, pray standing/g)||[]).length,2);
 assert(text(b,657).includes('Our Lord, and to You belongs praise'));
 const s=sourceSegments(get(b,657),'english').at(-1);assert.equal(s.kind,'transmission-note');assert(s.text.startsWith('Abu ‘Abd Allah said: Al-Humaydi said:'));
 assert(s.text.includes('the latest, then the latest'));assert(narrationHTML(get(b,657)).includes('Al-Humaydi said'));assert(!text(b,657).includes('abrogated'));
});

test('658 binds the unnumbered comparison pointer without inventing a target or replacing the closing route',()=>{
 const a=input(),b=buildBookBatch(...a),r=row(a,658),c=r.comparisons[1],pointer=c.splitReferences[1],t=text(b,658);
 assert.equal(c.splitReferences[0].reference,'1.11.658');assert.equal(pointer.reference,'1.11.659');assert.equal(pointer.status,'unnumbered-back-reference-only');
 assert.deepEqual(pointer.segmentIds,['658-3']);assert.deepEqual(pointer.checkedBody,['Narrated Abu Ishaq: ','as above. ']);assert.equal(pointer.referencedReference,undefined);
 assert.equal((t.match(/related to me/g)||[]).length,3);assert(t.includes('and he was not a liar'));assert(t.endsWith('Abu Nu‘aym related to us, from Sufyan, from Abu Ishaq, something similar to this.'));
 assert.equal((t.match(/none of us bent his back/g)||[]).length,1);assert(narrationHTML(get(b,658)).includes('Abu Nu‘aym related to us'));
 for(const mutate of [
  p=>p.checkedBody[1]='as above (658). ',
  p=>p.referenceEvidence.recordSha256='0'.repeat(64),
  p=>p.referencedReference='1.11.658',
  p=>p.referencedReferenceEvidence=c.splitReferences[0].referenceEvidence,
  p=>p.continuedByReference='1.11.660',
  p=>p.segmentIds=['658-2','658-3'],
  p=>delete p.note,
 ]){const z=input(),r=row(z,658);mutate(r.comparisons[1].splitReferences[1]);rehash(r);assert.throws(()=>buildBookBatch(...z));}
 // Keep coverage valid to prove a pointer cannot masquerade as a complete report body.
 const z=input(),zr=row(z,658);zr.comparisons[1].splitReferences[0].segmentIds=['658-1'];zr.comparisons[1].splitReferences[1].segmentIds=['658-2','658-3'];rehash(zr);assert.throws(()=>buildBookBatch(...z),/cannot stand in for a report body/);
});

test('659–664 bind shifted comparison identities, local absence and the abbreviated Abu Dharr comparison',()=>{
 const a=input(),b=buildBookBatch(...a);
 for(let n=659;n<=662;n++)assert.equal(row(a,n).comparisons[1].reference,`1.11.${n+1}`);
 assert.equal((text(b,659).match(/Does one of you not fear/g)||[]).length,2);assert(text(b,659).includes('or turn his form'));
 assert(text(b,660).includes('freedman'));assert(!text(b,661).includes('slave'));assert(!text(b,662).includes('reward'));assert(!text(b,662).includes('sin'));
 const c=row(a,663).comparisons[1];assert.equal(c.reference,null);assert.equal(c.status,'not-present-in-checked-sequence');assert.deepEqual(c.checkedReferences,['1.11.663','1.11.664']);
 const d=row(a,664).comparisons[0];assert.equal(d.status,'cross-reference-with-transmission-note');assert.equal(d.referencedReference,'661');assert(text(b,664).includes('said to Abu Dharr'));
 for(const mutate of [r=>r.comparisons[1].checkedReferences=['1.11.662','1.11.664'],r=>r.comparisons[1].reference='1.11.663',r=>r.comparisons[1].checkedReferenceEvidence[0].recordSha256='0'.repeat(64)]){const z=input(),r=row(z,663);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...z));}
});

test('663 preserves the original spelling, requires both correction witnesses and keeps the narrator comment visible',()=>{
 const a=input(),r=row(a,663),b=buildBookBatch(...a),e=get(b,663),original=a[0].blocks.find(x=>x.htmlId===r.paragraphIds[0]).text;
 assert(original.includes('المحنث'));assert.equal(e.arabic_blocks[0],original.replace('المحنث','المخنث'));
 assert.deepEqual(r.arabicCorrections[0].witnesses.map(w=>w.pdfPage),[181,174]);
 const s=sourceSegments(e,'english');assert.equal(s.at(-1).kind,'transmission-note');assert(s.at(-1).text.startsWith('And al-Zubaydi said: Al-Zuhri said:'));
 assert(narrationHTML(e).includes('al-Zubaydi said'));assert(text(b,663).includes('Abu ‘Abd Allah said: And Muhammad ibn Yusuf said to us'));assert(!text(b,663).includes('The Prophet'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.contextNotes=[],r=>r.arabicCorrections[0].witnesses[1].reading='المحنث',r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].englishRendering='a different word']){const z=input(),r=row(z,663);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...z));}
});

test('665–669 retain prayer counts, uncertain words, the complete repeated opening and closing routes',()=>{
 const b=batch();for(const s of ['four rak‘ahs','five rak‘ahs','two rak‘ahs','ghatit, or he said: khatit'])assert(text(b,665).includes(s));assert(!text(b,665).includes('Fajr'));
 assert(text(b,666).includes('thirteen rak‘ahs'));assert(text(b,666).includes('When he slept, he would breathe audibly'));assert(!text(b,666).includes('maternal aunt'));
 assert(narrationHTML(get(b,666)).includes('Kurayb related to me that account'));assert(!text(b,667).includes('Maymunah'));
 assert(!text(b,668).includes('‘Isha’'));assert(text(b,668).includes('from Jabir ibn ‘Abd Allah'));assert(text(b,668).includes('Mu‘adh ibn Jabal used to pray'));
 const t=text(b,669);assert(t.includes('Mu‘adh ibn Jabal used to pray'));assert(t.includes('it seemed that Mu‘adh spoke against him'));
 assert.equal((t.match(/One who repeatedly causes trial!/g)||[]).length,3);assert.equal((t.match(/One who causes trial!/g)||[]).length,3);assert(t.includes('three times—or he said'));
 assert(t.includes('two surahs from the middle of the Mufassal'));assert(narrationHTML(get(b,669)).includes('I do not remember them'));
 assert.equal(row(input(),669).comparisons[0].referencedReference,'668');
});

test('candidate rejects changed source boundaries, reporting verbs and incomplete chapter coverage',()=>{
 for(const mutate of [r=>r.sourceLayout.paragraphs[0].origin.start++,r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.segments[0].arabic+=' ',r=>r.segments[0].english=r.segments[0].english.replace('related to us','related to me')]){const a=input(),r=row(a,651);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const a=input();a[1].entries.splice(1,1);assert.throws(()=>buildBookBatch(...a));
 const z=input();z[1].chapters.find(c=>c.id==='chapter-56').entryNumbers=[663];assert.throws(()=>buildBookBatch(...z));
});
