#!/usr/bin/env python3
"""Inventory a pinned EPUB candidate. Never publishes reader text or approves it.

Only XML character-reference decoding and XML newline rules are applied to text.
Raw EPUB bytes and paragraph byte spans remain authoritative. No spelling fixes,
punctuation changes, whitespace trimming, deduplication or cross-edition matching.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/sources/islamhouse-bukhari'
OUTPUT = ROOT / 'content/staging/bukhari-en-islamhouse/catalog.json'
XHTML = '{http://www.w3.org/1999/xhtml}'
OPF = '{http://www.idpf.org/2007/opf}'
REFERENCE = re.compile(r'Volume (\d+), Book (\d+), Number (\d+[A-Za-z]?):')
PARAGRAPH = re.compile(rb'<p(?=[\s>])[^>]*>.*?</p\s*>', re.DOTALL)
PINNED_SHA = '94c74a5f9c0054193fd557cd6f2ab8cdaae14bc8703ec9e26e74ee7af2344c3c'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def text_digest(paragraphs):
    # A JSON array preserves paragraph boundaries as well as every text character.
    return sha(json.dumps(paragraphs, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))


def xml(data):
    text = data.decode('utf-8')
    if '<!ENTITY' in text or '<!DOCTYPE' in text and '[' in text.split('<!DOCTYPE', 1)[1].split('>', 1)[0]:
        raise ValueError('Internal XML entities are unsupported')
    # The EPUB uses XHTML's named nbsp. Resolve only that known character in the
    # parser view; never rewrite the source. ElementTree does not fetch its DTD.
    names = set(re.findall(r'&([A-Za-z][A-Za-z0-9]+);', text))
    if names - {'amp', 'lt', 'gt', 'quot', 'apos', 'nbsp'}:
        raise ValueError('Unsupported named character reference')
    return ET.fromstring(text.replace('&nbsp;', '&#160;'))


def parse_section(data):
    root = xml(data)
    body = root.find(XHTML + 'body')
    if body is None or (body.text or '').strip():
        raise ValueError('Missing body or unaccounted body text')
    paragraphs = []
    for child in body:
        if child.tag != XHTML + 'p' or (child.tail or '').strip():
            raise ValueError('Unaccounted body element/text')
        if any(e.tag not in {XHTML + 'p', XHTML + 'span'} for e in child.iter()):
            raise ValueError('Unsupported paragraph markup')
        paragraphs.append(''.join(child.itertext()))
    raw_spans = list(PARAGRAPH.finditer(data))
    if len(raw_spans) != len(paragraphs):
        raise ValueError('Raw paragraph spans do not cover the parsed paragraphs')
    spans = []
    for match, text in zip(raw_spans, paragraphs):
        raw = match.group()
        if ''.join(xml(raw).itertext()) != text:
            raise ValueError('Raw span text differs from parsed paragraph')
        spans.append([match.start(), match.end(), sha(raw)])
    title = root.find(XHTML + 'head/' + XHTML + 'title')
    return {'title': ''.join(title.itertext()) if title is not None else '',
            'paragraphs': paragraphs, 'spans': spans}


def inventory_section(path, data, namespace):
    parsed = parse_section(data)
    paragraphs = parsed['paragraphs']
    records = []
    roles = []
    anomalies = []
    current = None
    after_separator = False
    for index, text in enumerate(paragraphs):
        stripped = text.strip()  # Classification only: stored/extracted text stays exact.
        match = REFERENCE.fullmatch(stripped)
        if match:
            volume, book, number = match.groups()
            reference = '.'.join(match.groups())
            current = {'id': namespace + ':' + reference,
                       'reference': {'volume': int(volume), 'book': int(book), 'number': number},
                       'section': path, 'headingParagraph': index, 'bodyParagraphs': []}
            records.append(current)
            roles.append('reference')
            after_separator = False
        elif not stripped:
            roles.append('blank')
        elif stripped == '_' * 40:
            roles.append('separator')
            after_separator = True
        elif current is None:
            roles.append('context')
            if stripped.startswith('Volume '):
                anomalies.append({'paragraph': index, 'reason': 'unrecognized-reference'})
        else:
            roles.append('body')
            current['bodyParagraphs'].append(index)
            if after_separator or stripped.startswith('Volume '):
                anomalies.append({'paragraph': index, 'reason': 'unexpected-text-after-separator' if after_separator else 'unrecognized-reference'})
    for record in records:
        texts = [paragraphs[i] for i in record['bodyParagraphs']]
        record['textSha256'] = text_digest(texts)
        if not texts:
            anomalies.append({'reference': record['id'], 'reason': 'empty-body'})
        elif len(texts) == 1 and texts[0].strip().startswith('Narrated ') and texts[0].strip().endswith(':'):
            anomalies.append({'reference': record['id'], 'reason': 'narrator-only-body'})
    return {
        'path': path, 'bytes': len(data), 'sha256': sha(data), 'title': parsed['title'],
        'textSha256': text_digest(paragraphs),
        'paragraphSpans': parsed['spans'], 'paragraphRoles': roles,
        'references': [record['id'] for record in records], 'anomalies': anomalies,
    }, records


def safe_member(path):
    parts = PurePosixPath(path).parts
    if not parts or path.startswith('/') or '\\' in path or any(p in {'.', '..'} for p in parts):
        raise ValueError('Unsafe EPUB member path')
    return path


def inventory(source_bytes, namespace):
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as archive:
        members = archive.infolist()
        if len({m.filename for m in members}) != len(members):
            raise ValueError('Duplicate ZIP members')
        for member in members:
            safe_member(member.filename)
            if member.file_size > 12_000_000 or member.flag_bits & 1:
                raise ValueError('Oversized or encrypted EPUB member')
        if sum(m.file_size for m in members) > 30_000_000:
            raise ValueError('EPUB exceeds intake limit')
        if archive.read('mimetype') != b'application/epub+zip':
            raise ValueError('Unexpected EPUB media type')
        package = xml(archive.read('OPS/content.opf'))
        manifest = {item.attrib['id']: item.attrib for item in package.findall(OPF + 'manifest/' + OPF + 'item')}
        spine = package.findall(OPF + 'spine/' + OPF + 'itemref')
        spine_paths = []
        for item in spine:
            resource = manifest[item.attrib['idref']]
            spine_paths.append(safe_member('OPS/' + resource['href']))
        if len(set(spine_paths)) != len(spine_paths):
            raise ValueError('Duplicate reading-order resources')
        all_sections = {m.filename for m in members if re.fullmatch(r'OPS/section-\d+\.html', m.filename)}
        sections_in_spine = [p for p in spine_paths if p in all_sections]
        if set(sections_in_spine) != all_sections:
            raise ValueError('A source section is absent from the reading order')
        xhtml_resources = {safe_member('OPS/' + m['href']) for m in manifest.values() if m.get('media-type') == 'application/xhtml+xml'}
        if xhtml_resources != set(spine_paths) or xhtml_resources != {m.filename for m in members if m.filename.endswith('.html')}:
            raise ValueError('Unaccounted XHTML resource')
        # Cover and contents are inventoried but never interpreted as reports.
        auxiliary = []
        sections = []
        records = []
        for path in spine_paths:
            data = archive.read(path)
            if path not in all_sections:
                if path not in {'OPS/CoverPage.html', 'OPS/TableOfContents.html'}:
                    raise ValueError('Unrecognized non-section resource')
                auxiliary.append({'path': path, 'bytes': len(data), 'sha256': sha(data)})
                continue
            section, entries = inventory_section(path, data, namespace)
            sections.append(section)
            records.extend(entries)
        ids = Counter(r['id'] for r in records)
        books = sorted({r['reference']['book'] for r in records})
        return {
            'schemaVersion': 1, 'namespace': namespace, 'status': 'candidate-not-approved',
            'readerEligible': False, 'sourceSha256': sha(source_bytes),
            'textHashFormat': 'UTF-8 SHA-256 of JSON array of decoded paragraph strings; no ASCII escaping; comma/colon separators; no trailing newline',
            'spanFormat': '[startByte, endByteExclusive, sha256] in uncompressed UTF-8 XHTML; paragraph indices are zero-based',
            'scope': 'Complete structural inventory of the pinned EPUB; not a completeness comparison against an edition, translation review, narrator-chain review or permission to publish in the reader.',
            'auxiliary': auxiliary, 'sections': sections, 'records': records,
            'audit': {
                'sectionCount': len(sections), 'reportSectionCount': sum(bool(s['references']) for s in sections),
                'paragraphCount': sum(len(s['paragraphSpans']) for s in sections),
                'paragraphRoles': dict(sorted(Counter(role for s in sections for role in s['paragraphRoles']).items())),
                'recordCount': len(records), 'uniqueReferences': len(ids), 'books': books,
                'duplicateReferences': [key for key, count in ids.items() if count > 1],
                'suffixedReferences': [r['id'] for r in records if not r['reference']['number'].isdigit()],
                'anomalies': [{'section': s['path'], **a} for s in sections for a in s['anomalies']],
            },
        }


def generate(source_dir=SOURCE):
    manifest = json.loads((source_dir / 'manifest.json').read_text())
    for entry in manifest['files']:
        name = safe_member(entry['path'])
        data = (source_dir / name).read_bytes()
        if len(data) != entry['bytes'] or sha(data) != entry['sha256']:
            raise ValueError('Source or policy differs from its recorded bytes: ' + name)
    raw = (source_dir / 'source.epub').read_bytes()
    if sha(raw) != PINNED_SHA:
        raise ValueError('Source differs from the intake pin; review a new version separately')
    return inventory(raw, manifest['id'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = generate()
    data = encoded(result)
    if args.check:
        if not args.output.exists() or args.output.read_bytes() != data:
            raise ValueError('Staged English inventory is absent or stale')
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(data)
    print(json.dumps({'verified' if args.check else 'generated': str(args.output.relative_to(ROOT)) if args.output.is_relative_to(ROOT) else str(args.output), 'audit': result['audit']}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
