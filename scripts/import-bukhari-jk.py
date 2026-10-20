"""Exact, edition-specific source inventory. Never writes reader content."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'content/sources/openiti-bukhari-jk'
OUTPUT = ROOT / 'content/staging/bukhari-ar-jk/catalog.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory(data, manifest):
    # Strict decoding and byte offsets make every extracted span reversible.
    data.decode('utf-8', errors='strict')
    lines, offset = [], 0
    for number, raw in enumerate(data.splitlines(keepends=True), 1):
        lines.append({'line': number, 'start': offset, 'end': offset + len(raw),
                      'text': raw.decode('utf-8')})
        offset += len(raw)
    if not lines or not lines[0]['text'].startswith('######OpenITI#'):
        raise ValueError('Missing OpenITI header')
    boundaries = [(0, {'kind': 'front-matter'})]
    sections, section, path, counters = [], None, {}, collections.Counter()
    numeric_headings = []
    for i, line in enumerate(lines):
        text = line['text'].rstrip('\r\n')
        heading = re.match(r'^### (\|+) (.+)$', text)
        numeric = re.match(r'^# (\d+) (.*)$', text)
        if text.startswith('### ') and not heading:
            raise ValueError(f'Unrecognized heading at line {line["line"]}')
        if re.match(r'^# \d', text) and not numeric:
            raise ValueError(f'Unrecognized numeric marker at line {line["line"]}')
        if heading and len(heading[1]) == 1:
            ordinal = len(sections) + 1
            section = {'id': f'{manifest["id"]}:s{ordinal}', 'ordinal': ordinal,
                       'headingLine': text, 'line': line['line'], 'start': line['start']}
            sections.append(section)
            path = {}
            boundaries.append((i, {'kind': 'section-context', 'sectionId': section['id'], 'level': 1}))
        elif heading or (numeric and re.match(r'^(?:ms\d+\s+)?باب(?:\s|$)', numeric[2])):
            if not section:
                raise ValueError('Chapter appears before a section')
            level = len(heading[1]) if heading else 2
            if level not in (2, 3):
                raise ValueError('Unexpected heading depth')
            block_id = f'{manifest["id"]}:l{line["line"]}'
            path = {k: v for k, v in path.items() if k < level}
            parents = list(path.values())
            path[level] = block_id
            extra = {'kind': 'heading-context', 'sectionId': section['id'], 'level': level,
                     'parentHeadingIds': parents, 'headingLine': text}
            if numeric:
                extra['issue'] = 'chapter-heading-uses-report-marker'
                numeric_headings.append({'line': line['line'], 'label': numeric[1], 'text': text})
            boundaries.append((i, extra))
        elif numeric:
            if not section:
                raise ValueError('Report appears before a section')
            suffix = 'م' if re.match(r'^م(?:\s|$)', numeric[2]) else ''
            label = numeric[1] + (' ' + suffix if suffix else '')
            counters[label] += 1
            boundaries.append((i, {'kind': 'report', 'sectionId': section['id'],
                'headingIds': list(path.values()),
                'reference': {'number': int(numeric[1]), 'suffix': suffix, 'label': label,
                              'occurrence': counters[label]}, 'status': 'unreviewed'}))
    if len(sections) != manifest['expectedSectionCount']:
        raise ValueError('Unexpected top-level section count')
    blocks = []
    for n, (i, details) in enumerate(boundaries):
        j = boundaries[n+1][0] if n+1 < len(boundaries) else len(lines)
        if i == j:
            raise ValueError('Overlapping source boundaries')
        first, last = lines[i], lines[j-1]
        raw = data[first['start']:last['end']]
        block = {'id': f'{manifest["id"]}:l{first["line"]}', **details,
                 'lineStart': first['line'], 'lineEnd': last['line'],
                 'start': first['start'], 'end': last['end'], 'sha256': digest(raw)}
        if details['kind'] == 'report':
            body = re.sub(r'^# \d+ (?:م )?', '', raw.decode('utf-8'), count=1)
            body = re.sub(r'PageV\d+P\d+|ms\d+|@[A-Z]+@', '', body)
            if not re.search(r'[\u0621-\u064a]', body):
                block['issue'] = 'empty-numbered-record'
        blocks.append(block)
    for i, section in enumerate(sections):
        section['end'] = sections[i+1]['start'] if i+1 < len(sections) else len(data)
        section['sha256'] = digest(data[section['start']:section['end']])
        section['reportCount'] = sum(b['kind'] == 'report' and b['sectionId'] == section['id'] for b in blocks)
    reports = [b for b in blocks if b['kind'] == 'report']
    observed = {b['reference']['number'] for b in reports}
    low, high = manifest['expectedNumberRange']
    if any(n < low or n > high for n in observed):
        raise ValueError('Number outside the declared edition range')
    return {'schemaVersion': 1, 'sourceId': manifest['id'], 'sourceSha256': digest(data),
            'offsetUnit': 'UTF-8 bytes, end exclusive', 'status': 'candidate-not-approved',
            'readerEligible': False, 'sections': sections, 'blocks': blocks,
            'audit': {'sourceBytes': len(data), 'coveredBytes': sum(b['end']-b['start'] for b in blocks),
                'sectionCount': len(sections), 'headingCount': sum(b['kind']=='heading-context' for b in blocks),
                'reportCount': len(reports), 'uniqueNumericLabels': len(observed),
                'missingNumericLabels': [n for n in range(low,high+1) if n not in observed],
                'duplicateReferences': [{'label': label, 'count': count} for label,count in counters.items() if count>1],
                'suffixedReferences': [b['reference']['label'] for b in reports if b['reference']['suffix']],
                'numericChapterHeadings': numeric_headings,
                'emptyRecords': [b['id'] for b in reports if b.get('issue')=='empty-numbered-record'],
                'limitations': ['A complete byte inventory is not a certification of Arabic transcription or narration completeness.',
                    'Section numbers and report labels belong to this edition; they are not a cross-edition reference map.',
                    'Heading context includes all intervening paragraphs. It is not silently folded into a report.',
                    'Upstream records a 2023 cleaning that removed editorial paratext and inconsistent heading annotation.']}}


def build_inventory(base=SOURCE):
    manifest = json.loads((base/'manifest.json').read_text())
    for item in manifest['files']:
        raw = (base/item['path']).read_bytes()
        if len(raw) != item['bytes'] or digest(raw) != item['sha256']:
            raise ValueError('Source integrity failed: '+item['path'])
    return inventory((base/'source.mARkdown').read_bytes(), manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build_inventory()
    serialized = json.dumps(result, ensure_ascii=False, indent=2)+'\n'
    if args.check:
        if OUTPUT.read_text() != serialized:
            raise ValueError('Staged JK inventory is stale')
    else:
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        OUTPUT.write_text(serialized)
    print(json.dumps(result['audit'],ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
