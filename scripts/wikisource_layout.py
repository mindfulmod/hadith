"""Exact layout evidence for candidate Wikisource books; never normalizes or approves text."""
import collections,hashlib,re

def sha(text):return hashlib.sha256(text.encode('utf-8')).hexdigest()
MARKER=re.compile(r'\[(\d+)\]')
HEADING=re.compile(r'={2,}[^=\n]+={2,}')

def inspect_blocks(blocks):
    markers=[];issues=[];segments=[];counts=collections.Counter();previous=None
    for block in blocks:
        text=block['text'];bid=block['htmlId'];matches=list(MARKER.finditer(text));headings=list(HEADING.finditer(text))
        cuts={0,len(text)}
        for match in matches:
            label=match[1];number=int(label);counts[number]+=1;start=match.start();cuts.add(start)
            marker={'id':f'{bid}:{start}','blockId':bid,'start':start,'end':match.end(),'label':label,'number':number,'occurrence':counts[number]}
            markers.append(marker)
            if block['tag']!='p':issues.append({'code':'number-marker-in-heading','markerId':marker['id'],'blockId':bid})
            if start:
                issues.append({'code':'leading-whitespace-before-number'if not text[:start].strip()else 'embedded-number-marker','markerId':marker['id'],'blockId':bid,'offset':start})
            if not re.fullmatch(r'[0-9]+',label):issues.append({'code':'non-ascii-number-label','markerId':marker['id'],'blockId':bid,'label':label})
            if text[match.end():match.end()+1]!=' ':issues.append({'code':'number-marker-without-space','markerId':marker['id'],'blockId':bid})
            if counts[number]>1:issues.append({'code':'duplicate-number-label','markerId':marker['id'],'blockId':bid,'number':number})
            if previous is not None and number<=previous:issues.append({'code':'non-increasing-number-label','markerId':marker['id'],'blockId':bid,'previous':previous,'number':number})
            previous=number
        for match in headings:
            cuts.update([match.start(),match.end()]);issues.append({'code':'unparsed-wikitext-heading','blockId':bid,'start':match.start(),'end':match.end()})
        # A bracketed digit with no supported closing marker must not disappear from the audit.
        for match in re.finditer(r'\[\d',text):
            if not any(m.start()==match.start()for m in matches):issues.append({'code':'malformed-number-marker','blockId':bid,'offset':match.start()})
        starts={m.start()for m in matches};heading_spans={(h.start(),h.end())for h in headings};points=sorted(cuts)
        for start,end in zip(points,points[1:]):
            value=text[start:end]
            kind='heading'if block['tag']=='h3'else 'unparsed-heading'if(start,end)in heading_spans else 'numbered-marker-text'if start in starts else 'blank'if not value.strip()else 'text'
            segments.append({'blockId':bid,'start':start,'end':end,'kind':kind,'sha256':sha(value)})
        if not text:segments.append({'blockId':bid,'start':0,'end':0,'kind':'blank','sha256':sha('')})
    labels=[m['number']for m in markers];seen=set(labels)
    return {'offsetUnit':'Unicode code points, end exclusive; original text and label glyphs unchanged','markers':markers,'segments':segments,'issues':issues,'summary':{'blocks':len(blocks),'htmlHeadings':sum(b['tag']=='h3'for b in blocks),'unparsedHeadings':sum(i['code']=='unparsed-wikitext-heading'for i in issues),'numberedMarkers':len(markers),'uniqueNumericLabels':len(seen),'numericRange':[min(labels),max(labels)]if labels else None,'unobservedLabelsWithinRange':[n for n in range(min(labels),max(labels)+1)if n not in seen]if labels else [],'duplicateLabels':[{'number':n,'occurrences':count}for n,count in sorted(counts.items())if count>1],'sourceCodePoints':sum(len(b['text'])for b in blocks),'coveredCodePoints':sum(s['end']-s['start']for s in segments)}}

def require_simple_layout(blocks):
    findings=inspect_blocks(blocks)
    if findings['issues']:
        brief='; '.join(i['code']+' at '+i['blockId']for i in findings['issues'])
        raise ValueError('Source layout needs explicit boundary review: '+brief)
