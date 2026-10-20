"""Extract pinned opening-book paragraphs without repairing or publishing text."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/sources/wikisource-opening'
OUTPUT = ROOT / 'content/staging/bukhari-opening-wikisource/catalog.json'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()


def encoded(value):
    return json.dumps(value,ensure_ascii=False,indent=2)+'\n'


class SourceParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack=[]
        self.content_depth=None
        self.capture=None
        self.blocks=[]

    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'mw-parser-output' in attrs.get('class','').split():
            if self.content_depth is not None:
                raise ValueError('Nested source container')
            self.content_depth=len(self.stack)
        if self.content_depth is not None and tag in {'p','h3'}:
            if self.capture is not None:
                raise ValueError('Nested text block')
            self.capture={'htmlId':attrs.get('id'),'tag':tag,'text':''}
        if self.capture is not None and tag in {'script','style'}:
            raise ValueError('Executable/style content in source text')
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_data(self,data):
        if self.capture is not None:
            self.capture['text']+=data

    def handle_endtag(self,tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1]!=tag:
            raise ValueError('Unbalanced HTML at '+tag)
        if self.capture is not None and tag==self.capture['tag']:
            self.blocks.append(self.capture)
            self.capture=None
        self.stack.pop()
        if self.content_depth is not None and len(self.stack)==self.content_depth:
            self.content_depth=None


def extract(raw,manifest):
    if len(raw)!=manifest['file']['bytes'] or digest(raw)!=manifest['file']['sha256']:
        raise ValueError('Pinned HTML integrity failed')
    html=raw.decode('utf-8',errors='strict')
    if not re.search(r'"wgRevisionId"\s*:\s*'+str(manifest['revision'])+r'\b',html):
        raise ValueError('Unexpected Wikisource revision')
    parser=SourceParser();parser.feed(html);parser.close()
    if parser.stack or parser.capture is not None:
        raise ValueError('Unclosed HTML')
    blocks=parser.blocks
    if len(blocks)!=17 or len({b['htmlId'] for b in blocks})!=17:
        raise ValueError('Unexpected source block coverage')
    records=[];context=[];current=None
    for index,block in enumerate(blocks):
        block['ordinal']=index
        block['textSha256']=digest(block['text'])
        match=re.match(r'^\[(\d+)\] ',block['text'])
        if match:
            current={'number':int(match[1]),'paragraphIds':[],'status':'unreviewed'}
            records.append(current)
        if current is None:
            context.append(block['htmlId'])
        else:
            if block['tag']!='p':
                raise ValueError('Unassigned heading between reports')
            current['paragraphIds'].append(block['htmlId'])
    if [r['number'] for r in records]!=list(range(1,8)):
        raise ValueError('Unexpected numbered records')
    if [len(r['paragraphIds']) for r in records]!=[2,2,2,2,2,2,3]:
        raise ValueError('Unexpected paragraph assignment')
    return {'schemaVersion':1,'sourceId':manifest['id'],'revision':manifest['revision'],'sourceSha256':digest(raw),'status':'candidate-not-approved','readerEligible':False,'textPolicy':'HTML character references decoded. No trimming, Unicode normalization, spelling correction or paragraph rewriting.','contextIds':context,'blocks':blocks,'records':records}


def build():
    manifest=json.loads((SOURCE/'manifest.json').read_text())
    return extract((SOURCE/'source.html').read_bytes(),manifest)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args();result=build();text=encoded(result)
    if args.check:
        if OUTPUT.read_text()!=text:
            raise ValueError('Stale opening-book extraction')
    else:
        OUTPUT.parent.mkdir(parents=True,exist_ok=True);OUTPUT.write_text(text)
    print(f"{len(result['records'])} records, {len(result['blocks'])} exact text blocks; not published")


if __name__=='__main__':
    main()
