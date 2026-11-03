/* Navigation follows reviewed catalogue order, never inferred subjects or number arithmetic. */
import {validReference,compareReferences} from './references.mjs';
export function validateChapters(book) {
 if(book.introduction!==undefined){
  const i=book.introduction,n=i?.notes;
  if(i?.schemaVersion!==1||!Number.isSafeInteger(i.arabicParagraphs)||i.arabicParagraphs<1||i.englishStatus!=='pending'||i.independentReview!=='pending'||!/^[a-f0-9]{64}$/.test(i.evidenceSha256)||n?.path!==book.id+'-review.html'||n?.fragment!=='book-introduction')throw new Error('Invalid book introduction context');
 }
 if(book.sourceEntryCount!==undefined&&(!Number.isSafeInteger(book.sourceEntryCount)||book.sourceEntryCount<book.entryNumbers.length))throw new Error('Invalid source entry count');
 const pending=book.pendingEntries||[];
 if(book.pendingEntries!==undefined&&(!Array.isArray(pending)||!pending.length))throw new Error('Invalid pending source entries');
 for(const [i,p]of pending.entries()){
  if(!validReference(p.number)||p.id!=='bukhari:'+p.number||p.status!=='source-review-pending'||book.entryNumbers.includes(p.number)||(i&&compareReferences(pending[i-1].number,p.number)>=0)||typeof p.reason!=='string'||!p.reason.trim())throw new Error('Invalid pending source identity');
  if(![p.sourceId,p.sourceRecordId].every(v=>typeof v==='string'&&v.trim())||![p.sourceSha256,p.arabicSha256,p.evidenceSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||p.notes?.path!==book.id+'-review.html'||p.notes?.fragment!=='hadith-'+p.number)throw new Error('Invalid pending source evidence');
  if(!book.chapters?.some(c=>c.id===p.chapterId&&c.sourceContext))throw new Error('Pending source chapter is missing');
 }
 if(pending.length&&(!Number.isSafeInteger(book.sourceEntryCount)||book.sourceEntryCount<book.entryNumbers.length+pending.length))throw new Error('Pending source coverage mismatch');
 if(book.chapters===undefined)return;
 if(!Array.isArray(book.chapters)||!book.chapters.length)throw new Error('Empty chapter context');
 const ids=new Set();
 for(const chapter of book.chapters){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.id)||ids.has(chapter.id)||typeof chapter.title!=='string'||!chapter.title.trim()||!Array.isArray(chapter.entryNumbers))throw new Error('Invalid chapter context');
  const context=chapter.sourceContext;
  if(context!==undefined){
   const notes=context?.notes,introduction=context?.introduction;
   if(context.schemaVersion!==1||!['ai-working-translation','heading-discrepancy-pending','heading-translation-pending','reviewed-translation'].includes(context.headingStatus)||!['present','none-in-source','pending-review'].includes(context.numberedReports))throw new Error('Invalid chapter source status');
   if(context.printedEmptyHeading!==undefined){
    const h=context.printedEmptyHeading,index=book.chapters.indexOf(chapter),previous=book.chapters[index-1],next=book.chapters[index+1];
    if(!h||h.afterChapterId!==previous?.id||h.afterReference!==previous?.entryNumbers.at(-1)||!validReference(h.beforeReference)||compareReferences(h.afterReference,h.beforeReference)>=0||!Number.isSafeInteger(h.printedChapterNumber)||h.printedChapterNumber<1||chapter.id!==h.afterChapterId+'-print-'+String(h.printedChapterNumber).padStart(2,'0')||!/^[a-f0-9]{64}$/.test(h.evidenceSha256)||context.numberedReports!=='none-in-source'||context.headingStatus!=='heading-translation-pending'||introduction?.arabicParagraphs!==0||context.printedHeading!==undefined||context.printedIntroduction!==undefined)throw new Error('Invalid empty printed chapter provenance');
    if(!/^chapter-[0-9]+$/.test(h.beforeChapterId)||(next?(next.id!==h.beforeChapterId||next.entryNumbers[0]!==h.beforeReference):!(book.sourceEntryCount>book.entryNumbers.length+pending.length)))throw new Error('Empty printed chapter boundary is misplaced');
   }else if(context.headingStatus==='heading-translation-pending'&&context.pendingHeading===undefined)throw new Error('Pending printed heading needs its provenance');
   if(context.pendingHeading!==undefined){
    const h=context.pendingHeading;
    if(!h||context.headingStatus!=='heading-translation-pending'||chapter.title!=='Chapter heading translation pending'||context.printedEmptyHeading!==undefined||context.printedHeading!==undefined||![h.sourceId,h.headingId,h.reason].every(v=>typeof v==='string'&&v.trim())||![h.sourceSha256,h.arabicSha256,h.evidenceSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw new Error('Invalid pending source heading provenance');
   }
   if(context.printedHeading!==undefined){
    const h=context.printedHeading;
    if(!ids.has(h.sourceChapterId)||!chapter.id.startsWith(h.sourceChapterId+'-print-')||h.beforeEntry!==chapter.entryNumbers[0]||!Number.isSafeInteger(h.printedChapterNumber)||h.printedChapterNumber<1||!/^[a-f0-9]{64}$/.test(h.evidenceSha256)||context.numberedReports!=='present'||introduction?.arabicParagraphs!==0)throw new Error('Invalid printed chapter provenance');
   }
   if(context.textualDifferences!==undefined){
    const d=context.textualDifferences;
    if(!d||!Number.isSafeInteger(d.count)||d.count<1||!/^[a-f0-9]{64}$/.test(d.evidenceSha256)||d.status!=='unresolved'||d.englishStatus!=='pending'||(d.includesHeading!==undefined&&d.includesHeading!==true)||(!d.includesHeading&&!introduction?.arabicParagraphs)||(introduction?.arabicParagraphs>0&&introduction.englishStatus!=='pending'))throw new Error('Invalid unresolved chapter wording');
   }
   if(context.printedIntroduction!==undefined){
    const p=context.printedIntroduction;
    if(!p||!Number.isSafeInteger(p.arabicParagraphs)||p.arabicParagraphs<1||p.arabicParagraphs>introduction?.arabicParagraphs||!/^[a-f0-9]{64}$/.test(p.evidenceSha256)||introduction?.englishStatus!=='pending'||context.printedHeading!==undefined)throw new Error('Invalid printed chapter introduction provenance');
   }
   if((context.numberedReports==='present')!==Boolean(chapter.entryNumbers.length))throw new Error('Chapter report status contradicts its entries');
   const hasPending=pending.some(p=>p.chapterId===chapter.id);
   if((context.numberedReports==='pending-review')!==(!chapter.entryNumbers.length&&hasPending)||(context.numberedReports==='none-in-source'&&hasPending))throw new Error('Pending chapter status contradicts its source');
   if(!Number.isSafeInteger(introduction?.arabicParagraphs)||introduction.arabicParagraphs<0||(introduction.arabicParagraphs===0?introduction.englishStatus!=='not-applicable':!['pending','reviewed-translation'].includes(introduction.englishStatus)))throw new Error('Invalid chapter introduction status');
   if(!notes||typeof notes.path!=='string'||!/^[a-z0-9][a-z0-9/_.-]*\.html$/.test(notes.path)||notes.path.split('/').some(p=>p==='..'||p==='.'||!p)||notes.fragment!==chapter.id)throw new Error('Invalid chapter source notes');
  }else if(!chapter.entryNumbers.length)throw new Error('A chapter without reports needs explicit source context');
  ids.add(chapter.id);
 }
 if(JSON.stringify(book.chapters.flatMap(c=>c.entryNumbers))!==JSON.stringify(book.entryNumbers))throw new Error('Chapter order must assign each available entry exactly once');
}
export function bookForNumber(catalog,number){const summary=catalog.entries.find(e=>e.number===number);return catalog.books.find(b=>b.id===summary?.bookId);}
export function chapterForNumber(book,number){return book?.chapters?.find(c=>c.entryNumbers.includes(number));}
export function pageItems(items,requested=1,size=30){
 const pages=Math.max(1,Math.ceil(items.length/size));
 const page=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,pages):1;
 const start=(page-1)*size;
 return {items:items.slice(start,start+size),page,pages,total:items.length,start:items.length?start+1:0,end:Math.min(start+size,items.length)};
}
export function libraryRoute(hash,catalog){
 const simple=hash.match(/^#(collection|saved)(?:\/page\/(\d+))?$/);
 if(simple)return {mode:simple[1],page:Number(simple[2]||1)};
 const match=hash.match(/^#book\/([a-z0-9-]+)(?:\/chapter\/([a-z0-9-]+))?(?:\/page\/(\d+))?$/);
 if(!match)return null;
 const book=catalog.books.find(b=>b.id===match[1]);
 const chapter=match[2]&&book?.chapters?.find(c=>c.id===match[2]);
 return book&&(!match[2]||chapter)?{mode:'book',book,chapter:chapter||null,page:Number(match[3]||1)}:{mode:'missing'};
}
export function bookRoute(book,chapter){return `#book/${book.id}${chapter?'/chapter/'+chapter.id:''}`;}

export function pendingForNumber(catalog,number){return catalog.books.flatMap(b=>b.pendingEntries||[]).find(p=>p.number===number);}
export function pendingBetween(catalog,before,after){
 return catalog.books.flatMap(b=>b.pendingEntries||[]).filter(p=>(before===undefined||compareReferences(p.number,before)>0)&&(after===undefined||compareReferences(p.number,after)<0));
}
export function pendingBefore(catalog,number){const index=catalog.entries.findIndex(e=>e.number===number);return index<0?[]:pendingBetween(catalog,catalog.entries[index-1]?.number,number);}
export function sessionPending(catalog,numbers){
 if(!numbers.length)return [];
 const index=catalog.entries.findIndex(e=>e.number===numbers[0]);
 return pendingBetween(catalog,catalog.entries[index-1]?.number,numbers.at(-1));
}
