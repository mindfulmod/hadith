/* References identify entries; catalogue positions determine reading order. */
export const validNumber = value => Number.isSafeInteger(value) && value > 0 && value <= 10000000;
export function validReference(value) {
 return validNumber(value) || typeof value === 'string' && /^[1-9][0-9]*[a-z]$/.test(value) && validNumber(Number(value.slice(0,-1)));
}
// Parse UI strings explicitly. Stored references must already be canonical values.
export function parseReference(value,{ignoreCase=false}={}) {
 if(typeof value !== 'string')return null;
 const text=ignoreCase?value.toLowerCase():value;
 if(/^[0-9]+$/.test(text)){const number=Number(text);return validNumber(number)?number:null;}
 return validReference(text)?text:null;
}
export function referenceBase(value) {
 if(!validReference(value))throw new Error('Invalid entry reference');
 return typeof value==='number'?value:Number(value.slice(0,-1));
}
export function compareReferences(a,b) {
 return referenceBase(a)-referenceBase(b) || (typeof a==='number'?'':a.slice(-1)).localeCompare(typeof b==='number'?'':b.slice(-1),'en');
}
export function referenceSpan(references,first,last) {
 if(!validReference(first)||!validReference(last))throw new Error('Invalid reference range');
 const start=references.indexOf(first),end=references.indexOf(last);
 if(start<0||end<start)throw new Error('References are outside source order');
 return references.slice(start,end+1);
}
export function contiguousReferences(numbers,all) {
 if(!Array.isArray(numbers)||!numbers.length||!numbers.every(validReference)||new Set(numbers).size!==numbers.length||!Array.isArray(all))return false;
 const start=all.indexOf(numbers[0]);return start>=0&&numbers.every((n,i)=>all[start+i]===n);
}
