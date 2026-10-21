import test from 'node:test';
import assert from 'node:assert/strict';
import {chapterContextHTML,sourceHTML} from '../reader/source-format.mjs';
import {readFileSync} from 'node:fs';
test('the long source heading is complete in an accessible disclosure, without truncation or rewriting',()=>{
 const review=JSON.parse(readFileSync(new URL('../content/review/faith-next-review.json',import.meta.url),'utf8'));
 const title=review.chapters.find(c=>c.id==='chapter-18').title,html=chapterContextHTML(title,'#book/faith/chapter-18');
 assert(html.startsWith('<details'));assert(!html.includes(' open'));assert(html.includes(sourceHTML(title)));assert(html.includes('<summary>Chapter context'));
 const short=chapterContextHTML('Matters of faith','#book/faith/chapter-02');assert(short.startsWith('<p'));assert(!short.includes('<details'));
});
