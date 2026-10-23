/* Navigation follows reviewed catalogue order, never inferred subjects or number arithmetic. */
export function validateChapters(book) {
 if(book.introduction!==undefined){
  const i=book.introduction,n=i?.notes;
  if(i?.schemaVersion!==1||!Number.isSafeInteger(i.arabicParagraphs)||i.arabicParagraphs<1||i.englishStatus!=='pending'||i.independentReview!=='pending'||!/^[a-f0-9]{64}$/.test(i.evidenceSha256)||n?.path!==book.id+'-review.html'||n?.fragment!=='book-introduction')throw new Error('Invalid book introduction context');
 }
 if(book.sourceEntryCount!==undefined&&(!Number.isSafeInteger(book.sourceEntryCount)||book.sourceEntryCount<book.entryNumbers.length))throw new Error('Invalid source entry count');
 if(book.chapters===undefined)return;
 if(!Array.isArray(book.chapters)||!book.chapters.length)throw new Error('Empty chapter context');
 const ids=new Set();
 for(const chapter of book.chapters){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(chapter.id)||ids.has(chapter.id)||typeof chapter.title!=='string'||!chapter.title.trim()||!Array.isArray(chapter.entryNumbers))throw new Error('Invalid chapter context');
  const context=chapter.sourceContext;
  if(context!==undefined){
   const notes=context?.notes,introduction=context?.introduction;
   if(context.schemaVersion!==1||!['ai-working-translation','heading-discrepancy-pending','reviewed-translation'].includes(context.headingStatus)||!['present','none-in-source'].includes(context.numberedReports))throw new Error('Invalid chapter source status');
   if(context.printedHeading!==undefined){
    const h=context.printedHeading;
    if(!ids.has(h.sourceChapterId)||!chapter.id.startsWith(h.sourceChapterId+'-print-')||h.beforeEntry!==chapter.entryNumbers[0]||!Number.isSafeInteger(h.printedChapterNumber)||h.printedChapterNumber<1||!/^[a-f0-9]{64}$/.test(h.evidenceSha256)||context.numberedReports!=='present'||introduction?.arabicParagraphs!==0)throw new Error('Invalid printed chapter provenance');
   }
   if((context.numberedReports==='present')!==Boolean(chapter.entryNumbers.length))throw new Error('Chapter report status contradicts its entries');
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
