import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOOK_CONFIGS,buildBookBatch,combineBookReviews} from '../scripts/build-collection.mjs';
import {deriveArabicBlocks} from '../scripts/arabic-corrections.mjs';
import {narrationPlan} from '../scripts/build-audio.mjs';
import {sourceSegments,narrationHTML} from '../reader/source-structure.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const input=()=>[read('content/staging/bukhari-adhan-wikisource/catalog.json'),read('content/review/adhan-final-review.json'),read('content/sources/wikisource-adhan/manifest.json'),BOOK_CONFIGS.adhan];
const row=(a,n)=>a[1].entries.find(r=>r.number===n);
const get=(b,n)=>b.entries.find(e=>e.number===n);
const text=(b,n)=>get(b,n).english_blocks.join('\n');
const batch=()=>buildBookBatch(...input());
const rehash=r=>{delete r.reviewRecordSha256;r.reviewRecordSha256=hash(r);};

test('final Adhan candidate preserves all selected source spans, honorifics and complete narration',()=>{
 const a=input(),b=buildBookBatch(...a),p=narrationPlan(b);
 assert.deepEqual(b.entries.map(e=>e.number),Array.from({length:29},(_,i)=>670+i));assert.equal(a[1].chapters.length,20);assert.equal(b.chapters.length,21);
 assert.equal(a[1].entries.reduce((n,r)=>n+r.segments.length,0),69);
 for(const r of a[1].entries){
  const e=get(b,r.number),original=r.paragraphIds.map(id=>a[0].blocks.find(x=>x.htmlId===id).text);
  assert.deepEqual(e.arabic_blocks,deriveArabicBlocks(r,original,a[1].sources));
  assert.deepEqual(r.paragraphIds.map(id=>r.segments.filter(s=>s.paragraphId===id).map(s=>s.arabic).join('')),e.arabic_blocks);
  assert.deepEqual(e.english_blocks,r.segments.map(s=>s.english));assert.equal(p.entries.find(x=>x.number===r.number).script,e.english_blocks.join('\n\n'));
  assert.equal((e.arabic_blocks.join('').match(/ﷺ/g)||[]).length,(e.english_blocks.join('').match(/may Allah bless him and grant him peace/g)||[]).length);
  assert.equal(r.comparisons[1].reference,`1.11.${r.number}`);
 }
 assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),5);
 assert.deepEqual(b.chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs).map(c=>c.id),['chapter-63','chapter-67','chapter-69','chapter-75','chapter-79']);
 assert(b.chapters.filter(c=>c.sourceContext.introduction.arabicParagraphs).every(c=>c.sourceContext.introduction.englishStatus==='pending'));
 assert(b.entries.every(e=>e.audio_status==='No recording yet.'));
});

test('the printed chapter before 674 is separately browseable, evidenced and excluded from narration',()=>{
 const a=input(),b=buildBookBatch(...a),r=row(a,674),p=narrationPlan(b);
 assert.deepEqual(a[1].chapters.find(c=>c.id==='chapter-63').entryNumbers,[672,673,674]);
 assert.deepEqual(b.chapters.find(c=>c.id==='chapter-63').entryNumbers,[672,673]);
 const c=b.chapters.find(c=>c.id==='chapter-63-print-64');assert.deepEqual(c.entryNumbers,[674]);assert.equal(c.sourceContext.printedHeading.sourceChapterId,'chapter-63');
 assert.deepEqual(r.printedHeading.witnesses.map(w=>w.pdfPage),[184,176]);assert.equal(c.title,r.printedHeading.english);
 assert(!p.entries.some(e=>e.script.includes(r.printedHeading.english)));assert(!r.segments.some(s=>s.paragraphId===r.printedHeading.id));
 for(const mutate of [r=>r.printedHeading.witnesses.pop(),r=>r.contextNotes=[],r=>r.printedHeading.beforeEntry=673,r=>r.printedHeading.digitalArabicSha256='0'.repeat(64),r=>r.printedHeading.witnesses[0].chapterNumber=65]){const z=input(),r=row(z,674);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...z));}
});

test('673 retains source alternatives, the narrator’s uncertainty and every supplementary route',()=>{
 const b=batch(),s=sourceSegments(get(b,673),'english'),t=text(b,673);
 assert.deepEqual(s.map(s=>s.kind),['chain','report','transmission-note','transmission-note']);assert(t.includes('two water-carrying camels'));assert(t.includes('he left his camel'));assert(!t.includes('camels kneel'));
 assert(t.includes('al-Baqarah or al-Nisa'));assert(t.includes('repeatedly causes trial—or one who causes trial'));assert(t.includes('three times'));
 assert(!s[1].text.includes('I think'));assert.equal(s[2].text,'I think this is in the hadith.');assert(narrationHTML(get(b,673)).includes(s[2].text));
 for(const name of ['Abu ‘Abd Allah','Sa‘id ibn Masruq','Mis‘ar','al-Shaybani','‘Amr','‘Ubayd Allah ibn Miqsam','Abu al-Zubayr','Al-A‘mash','Muharib'])assert(s[3].text.includes(name),name);
 assert(s[3].text.includes('Mu‘adh recited al-Baqarah in ‘Isha’'));assert(!s[1].text.includes('Most High'));
 assert(!text(b,672).includes('By Allah'));assert(text(b,670).includes('By Allah'));
});

test('675–679 preserve the distinct full reports, abbreviated-comparison notice and named closing chains',()=>{
 const b=batch();for(const name of ['Bishr ibn Bakr','Ibn al-Mubarak','Baqiyyah','al-Awza‘i'])assert(narrationHTML(get(b,675)).includes(name));
 assert(text(b,676).includes('I never prayed'));assert(text(b,677).includes('Anas ibn Malik related to him'));
 const r=row(input(),678),t=text(b,678);assert.equal(r.comparisons[0].status,'cross-reference-with-transmission-note');assert.equal(r.comparisons[0].referencedReference,'677');
 assert(t.includes('I begin the prayer and wish to prolong it'));assert.equal((t.match(/I begin the prayer/g)||[]).length,1);
 assert(narrationHTML(get(b,678)).includes('Aban related to us. Qatadah related to us. Anas related to us'));
 assert(text(b,679).startsWith('Sulayman ibn Harb and Abu al-Nu‘man related to us. They said:'));assert(!text(b,679).includes('‘Isha’'));
});

test('680–684 preserve dialogue repetitions, uncertain counts, individual forms and source discrepancies',()=>{
 const b=batch(),t=text(b,680),u=text(b,681),v=text(b,684);
 assert(t.includes('someone came'));assert(!t.includes('Bilal'));assert(row(input(),680).contextNotes[0].text.includes('Bilal'));assert(t.includes('third or fourth'));assert.equal((t.match(/Tell Abu Bakr to lead the prayer/g)||[]).length,3);assert(narrationHTML(get(b,680)).includes('Muhadir followed him'));
 assert.equal((u.match(/Tell Abu Bakr to lead the people in prayer/g)||[]).length,3);assert.equal((u.match(/If only you would instruct ‘Umar/g)||[]).length,2);assert(!u.includes('Hafsah did so'));assert(u.includes('gestured to him.'));assert(u.includes('on Abu Bakr’s left'));
 assert(!text(b,682).includes('two prostrations'));assert(text(b,683).includes('two prostrations'));
 assert.equal(row(input(),684).comparisons[0].status,'abbreviated-report');assert.equal(row(input(),684).comparisons[0].referencedReference,'647');
 assert.equal((v.match(/Tell Abu Bakr to lead the people in prayer/g)||[]).length,3);assert.equal((v.match(/because of his weeping/g)||[]).length,2);assert(v.includes('Hafsah did so'));assert(v.includes('Stop!'));assert(v.includes('I was never to get any good from you'));assert(!v.includes('tender-hearted'));
});

test('681 correction binds both prints and original input, and cannot lose its visible notice',()=>{
 const a=input(),r=row(a,681),b=buildBookBatch(...a),original=a[0].blocks.find(x=>x.htmlId===r.paragraphIds[0]).text;
 assert(original.includes('ذهب أبا بكر'));assert.equal(get(b,681).arabic_blocks[0],original.replace('ذهب أبا بكر','ذهب أبو بكر'));
 assert.deepEqual(r.arabicCorrections[0].witnesses.map(w=>w.pdfPage),[186,178]);assert(text(b,681).includes('When Abu Bakr heard his approach, Abu Bakr began to move back'));
 for(const mutate of [r=>r.arabicCorrections[0].witnesses.pop(),r=>r.contextNotes=[],r=>r.arabicCorrections[0].witnesses[0].reading='ذهب أبا بكر',r=>r.arabicCorrections[0].start++,r=>r.arabicCorrections[0].englishRendering='someone moved forward']){const z=input(),r=row(z,681);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...z));}
});

test('685–695 retain selected lexical choices, narrator observations and original directions',()=>{
 const b=batch();assert(text(b,685).includes('faces'));assert(!text(b,685).includes('hearts'));assert(row(input(),685).contextNotes.length);
 const t=text(b,688);for(const phrase of ['one who drowns','one who dies of plague','one who dies of an abdominal illness','one who dies under a collapsed structure','going early','even crawling','foremost row'])assert(t.includes(phrase));
 assert(!t.includes('Zuhr'));assert(!t.includes('call'));assert(!t.includes('path of Allah'));assert(text(b,689).includes('Our Lord, to You belongs praise'));
 assert(text(b,691).includes('Al-Fadl ibn Musa informed me'));assert(narrationHTML(get(b,691)).includes('‘Uqbah ibn ‘Ubayd'));assert(narrationHTML(get(b,691)).includes('with this account'));
 const s=sourceSegments(get(b,692),'english');assert.equal(s.at(-1).kind,'transmission-note');assert(!s.find(x=>x.kind==='report').text.includes('shoulder'));assert(s.at(-1).text.includes('shoulder against his companion’s shoulder'));assert(narrationHTML(get(b,692)).includes('foot against his foot'));
 assert(text(b,693).includes('placed me on his right'));assert(!text(b,694).includes('One night'));assert(text(b,694).includes('our house'));
 assert(text(b,695).includes('my hand—or my upper arm'));assert(text(b,695).includes('from behind me'));assert(!text(b,695).includes('from behind him'));assert(row(input(),695).contextNotes.length);
});

test('696–698 retain night uncertainty, the mat’s uses and the complete interleaved final transmission',()=>{
 const b=batch();assert(text(b,696).includes('two or three nights'));assert(text(b,696).includes('remained seated and did not come out'));assert(text(b,697).includes('spread out by day and used to enclose a space by night'));
 const s=sourceSegments(get(b,698),'english');assert.deepEqual(s.map(x=>x.kind),['chain','report','transmission-note','report','transmission-note']);assert.equal(s[2].text,'He said: “I think he said: of a mat”—');
 assert(s[3].text.startsWith('in Ramadan.'));assert(s[3].text.includes('except the prescribed prayer'));assert(s[4].text.startsWith('‘Affan said: Wuhayb related to us. Musa related to us: I heard Abu al-Nadr'));
 assert(s[4].text.includes('from Busr, from Zayd, from the Prophet'));assert(narrationHTML(get(b,698)).includes('I think he said'));assert(narrationHTML(get(b,698)).includes('‘Affan said'));
 const script=narrationPlan(b).entries.find(e=>e.number===698).script;assert(script.indexOf(s[2].text)<script.indexOf(s[3].text));assert(script.endsWith(s[4].text));assert(!script.includes('Sa‘id said'));
});

test('all six registered review packets cover the complete selected Adhan inventory',()=>{
 const registry=read('content/review/adhan-batches.json'),saved=JSON.stringify(registry);
 assert.equal(registry.batches.length,6);
 const review=combineBookReviews(registry,BOOK_CONFIGS.adhan),inventory=input()[0],b=buildBookBatch(inventory,review,input()[2],BOOK_CONFIGS.adhan);
 assert.equal(b.entries.length,122);assert.deepEqual(b.entries.map(e=>e.number),inventory.records.map(r=>r.number));assert.equal(b.chapters.length,81);assert.equal(b.chapters.reduce((n,c)=>n+c.sourceContext.introduction.arabicParagraphs,0),20);
 assert.equal(b.entries.filter(e=>e.number==='619b').length,1);assert.equal(b.entries.at(-1).number,698);
 assert.equal(JSON.stringify(read('content/review/adhan-batches.json')),saved);assert.equal(read('content/review/adhan-batches.json').batches.at(-1).last,698);
});

test('final candidate rejects altered source evidence, reporting verbs and missing reports',()=>{
 for(const mutate of [r=>r.sourceLayout.paragraphs[0].origin.start++,r=>r.comparisons[1].referenceEvidence.recordSha256='0'.repeat(64),r=>r.segments[0].arabic+=' ',r=>r.segments[0].english=r.segments[0].english.replace('informed me','informed us')]){const a=input(),r=row(a,670);mutate(r);rehash(r);assert.throws(()=>buildBookBatch(...a));}
 const a=input();a[1].entries.splice(1,1);assert.throws(()=>buildBookBatch(...a));const z=input();z[1].chapters.at(-1).entryNumbers=[697];assert.throws(()=>buildBookBatch(...z));
});
