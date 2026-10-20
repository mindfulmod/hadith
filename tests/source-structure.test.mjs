import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceSegments,validateSourceStructure,narrationHTML} from '../reader/source-structure.mjs';
import {buildBooks,digest,objectHash} from '../scripts/publish-books.mjs';
import {createContentLibrary} from '../reader/content-library.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const source=read('research/bukhari-opening-review.json'),ledger=read('content/review/opening-ledger.json');
const length=text=>Array.from(text).length;
function fixture(){
 // Non-religious structural fixture, never written to a source/review record.
 const blocks=['First chain 🪷, ','continuation. Report one. ','<Letter & quotation> Report two. Later chain. Final report. Note.  '];
 const parts=[['chain',0,'First chain 🪷, '],['chain',1,'continuation. '],['report',1,'Report one. '],['letter',2,'<Letter & quotation> '],['report',2,'Report two. '],['chain',2,'Later chain. '],['report',2,'Final report. '],['transmission-note',2,'Note.  ']];
 const offsets=blocks.map(()=>0),ranges=parts.map(([kind,block,text])=>{const start=offsets[block];offsets[block]+=length(text);return {block,start,end:offsets[block],kind};});
 return {id:'fixture:7',number:7,english_blocks:blocks,arabic_blocks:blocks,presentation:{schemaVersion:1,english:ranges,arabic:structuredClone(ranges)}};
}
function reconstructedHTML(html){
 const values=[...html.matchAll(/<p data-source-block="english-(\d+)"[^>]*>(.*?)<\/p>/gs)];
 const blocks=[];
 for(const [,block,markup] of values){const text=markup.replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));blocks[block]=(blocks[block]||'')+text;}
 return blocks;
}
test('existing source blocks render exactly, including smaller honorifics and complete chains',()=>{
 for(const entry of source.entries){validateSourceStructure(entry);assert.deepEqual(sourceSegments(entry,'english').map(s=>s.text),entry.english_blocks);assert.deepEqual(reconstructedHTML(narrationHTML(entry)),entry.english_blocks);}
});
test('multi-paragraph chains, embedded letters, later chains and notes keep every source character in order',()=>{
 const entry=fixture(),segments=sourceSegments(entry,'english');validateSourceStructure(entry);
 assert.equal(segments.map(s=>s.text).join(''),entry.english_blocks.join(''));
 const html=narrationHTML(entry);assert.deepEqual(reconstructedHTML(html),entry.english_blocks);
 assert.equal((html.match(/<details class="chain">/g)||[]).length,2);
 assert(html.indexOf('Report two.')<html.indexOf('Later chain.'));assert(html.indexOf('Final report.')<html.indexOf('Transmission note'));
 assert(!html.includes('<Letter & quotation>'));assert(html.includes('&lt;Letter &amp; quotation&gt;'));
});
test('single-paragraph reports and exact Arabic code points do not need a fabricated chain',()=>{
 const text='  نَصٌّ 🪷 كامل.  ',entry={id:'fixture:9',number:9,english_blocks:[text],arabic_blocks:[text],presentation:{schemaVersion:1}};
 for(const language of ['english','arabic'])entry.presentation[language]=[{block:0,start:0,end:length(text),kind:'report'}];
 validateSourceStructure(entry);assert.deepEqual(reconstructedHTML(narrationHTML(entry)),[text]);assert(!narrationHTML(entry).includes('<details'));
 entry.presentation.arabic[0].end=text.length;assert.throws(()=>validateSourceStructure(entry),/exactly once/);
});
test('ambiguous unlabelled records and incomplete or reordered ranges are refused',()=>{
 const changes=[e=>delete e.presentation,e=>e.presentation.schemaVersion=2,e=>delete e.presentation.arabic,e=>e.presentation.english[0].kind='summary',e=>e.presentation.english[1].start++,e=>e.presentation.english[1].start--,e=>e.presentation.english.pop(),e=>e.presentation.english.push({...e.presentation.english[0]}),e=>e.presentation.english.reverse(),e=>e.presentation.english[0].end=999,e=>e.presentation.english[0].end=1.5,e=>e.presentation.english.forEach(s=>s.kind='chain')];
 for(const change of changes){const e=fixture();change(e);assert.throws(()=>validateSourceStructure(e));}
 assert.throws(()=>validateSourceStructure({id:'fixture:3',number:3,english_blocks:['chain','report'],arabic_blocks:['chain','report']}),/Explicit/);
});
function approvedFixture(){
 const s=structuredClone(source),l=structuredClone(ledger),e=s.entries[0],f=fixture();
 Object.assign(e,{english_blocks:f.english_blocks,arabic_blocks:f.arabic_blocks,presentation:f.presentation});
 e.arabic_sha256=digest(e.arabic_blocks.join('\n\n'));
 // Synthetic sign-offs exercise validation only, not real approval of any hadith.
 const approved=sha256=>({status:'approved',reviewerKind:'human',reviewer:'TEST FIXTURE ONLY',reviewedAt:'2026-10-20',sha256,evidence:['test fixture only']});
 l.publication='production';l.sourceRecordSha256=objectHash(s);l.rights=approved(l.sourceRecordSha256);l.collectionReview=approved(l.catalogContextSha256);
 for(const entry of s.entries){const row=l.entries.find(r=>r.number===entry.number);Object.assign(row,{entrySha256:objectHash(entry),arabicSha256:digest(entry.arabic_blocks.join('\n\n')),englishSha256:digest(entry.english_blocks.join('\n\n')),status:'approved',unresolvedDiscrepancies:[]});row.arabicReview=approved(row.arabicSha256);row.englishReview=approved(row.englishSha256);row.contextReview=approved(row.entrySha256);}
 l.sourceReferences.sourceRecordSha256=l.sourceRecordSha256;for(const row of l.sourceReferences.entries)row.entrySha256=objectHash(s.entries.find(e=>e.id===row.id));l.referencesSha256=objectHash(l.sourceReferences);l.referencesReview=approved(l.referencesSha256);
 return {s,l};
}
test('presentation metadata is bound to the review, even when no wording changes',()=>{
 const {s,l}=approvedFixture();assert.equal(buildBooks(s,l).catalog.entries.length,2);
 s.entries[0].presentation.english.at(-1).kind='report';l.sourceRecordSha256=objectHash(s);l.rights.sha256=l.sourceRecordSha256;
 assert.throws(()=>buildBooks(s,l),/Entry or context changed/);
 l.entries[0].entrySha256=objectHash(s.entries[0]);assert.throws(()=>buildBooks(s,l),/approval is stale/);
});
test('publisher and loader reject incomplete presentation even with valid text/file hashes',async()=>{
 const {s,l}=approvedFixture(),good=buildBooks(s,l),pack=JSON.parse(good.files.get(good.catalog.books[0].path));
 pack.entries[0].presentation.english.pop();
 const catalog=structuredClone(good.catalog),body=JSON.stringify(pack),sha256=digest(body),path=`books/${pack.book.id}-${sha256.slice(0,16)}.json`;
 Object.assign(catalog.books[0],{path,bytes:Buffer.byteLength(body),sha256});
 const responses=new Map([[path,body],['books/catalog.json',JSON.stringify(catalog)],['source-review.html','<p>Fixture notes</p>']]),files=[...responses].map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:digest(body)}));
 const library=await createContentLibrary({files,base:new URL('https://example.com/reader/'),fetcher:async url=>new Response(responses.get(url.pathname.slice('/reader/'.length)))});
 await assert.rejects(library.loadForNumber(1),/omits text/);assert.equal(library.getEntry(1),undefined);
 s.entries[0].presentation.english.pop();l.sourceRecordSha256=objectHash(s);l.rights.sha256=l.sourceRecordSha256;
 assert.throws(()=>buildBooks(s,l),/omits text/);
});
