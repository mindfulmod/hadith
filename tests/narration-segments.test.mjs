import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitNarration,validateSegmentedEvidence} from '../scripts/narration-segments.mjs';
import {buildAudioCatalog,audioHash} from '../scripts/build-audio.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const proof=()=>json('reader/audio/hadith-3-provenance.json');
test('paragraph segmentation preserves all text, whitespace and Unicode at the input boundary',()=>{
 const script='🙂 first\n\nsecond\n\nthird';const parts=splitNarration(script,12);
 assert.equal(parts.map(p=>p.text).join(''),script);assert.equal(parts[0].end,10);
 assert(parts.every(p=>p.text.length<=12));
 // Longer unrecorded paragraphs may exceed the demo limit; refusal must never shorten them.
 assert.throws(()=>splitNarration('A paragraph too long',8),/paragraph/);
 assert.throws(()=>splitNarration('🙂'.repeat(500)),/paragraph/);
 assert.throws(()=>splitNarration('',999),/Empty/);assert.throws(()=>splitNarration('abc',0),/limit/);
});
test('the complete Hadith 3 generation matches its current script and preserved originals',()=>{
 const p=proof();validateSegmentedEvidence(p,p.chapters,{readOriginal:read});
 assert.equal(p.segmentation.entries[0].parts.length,4);
 assert.equal(p.assembly.parts.reduce((n,p)=>n+p.frames,0),p.assembly.frames);
 assert.equal(p.assembly.frames,p.assembly.encodedCheck.frames);
 assert.equal(p.assembly.encodedCheck.parts[0].fullScaleSamples,0);
});
test('missing, duplicated, reordered, shortened or relabelled segments fail even with complete top-level script',()=>{
 const changes=[p=>p.segmentation.entries[0].parts.pop(),p=>p.segmentation.entries[0].parts.reverse(),p=>p.segmentation.entries[0].parts.push(p.segmentation.entries[0].parts[0]),p=>p.segmentation.entries[0].parts[1].text=p.segmentation.entries[0].parts[1].text.trim(),p=>p.segmentation.entries[0].number=4,p=>delete p.segmentation];
 for(const change of changes){const p=proof();change(p);assert.throws(()=>validateSegmentedEvidence(p,p.chapters,{readOriginal:read}));}
});
test('original audio substitutions and unsafe original paths cannot pass input checks',()=>{
 const p=proof();assert.throws(()=>validateSegmentedEvidence(p,p.chapters,{readOriginal:()=>Buffer.from('different recording')}),/bytes changed/);
 p.segmentation.entries[0].parts[0].original.path='../private.mp3';assert.throws(()=>validateSegmentedEvidence(p,p.chapters,{readOriginal:read}),/path/);
 const duplicate=proof();duplicate.segmentation.entries[0].parts[1].original=duplicate.segmentation.entries[0].parts[0].original;
 assert.throws(()=>validateSegmentedEvidence(duplicate,duplicate.chapters,{readOriginal:read}),/repeated/);
});
test('publication checks segment evidence even if a changed evidence file has been rehashed',()=>{
 const source=json('reader/source-record.json'),ledger=json('content/audio/recordings.json'),p=proof();delete p.segmentation;
 const raw=Buffer.from(JSON.stringify(p)),row=ledger.recordings.find(r=>r.generationFormat==='segmented-v1');row.evidence.sha256=audioHash(raw);
 assert.throws(()=>buildAudioCatalog(source,ledger,{readOriginal:read,readAsset:p=>read('reader/'+p),readEvidence:p=>p===row.evidence.path?raw:read(p)}),/segmented generation/);
});
