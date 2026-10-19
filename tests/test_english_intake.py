"""Checks intake fidelity and known defects; never asserts scholarly accuracy."""
import hashlib
from html.parser import HTMLParser
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('english_intake', ROOT / 'scripts/import-english.py')
intake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intake)


class IndependentParagraphReader(HTMLParser):
    def __init__(self, data):
        super().__init__(convert_charrefs=True)
        self.paragraphs = []
        self.active = None
        self.feed(data.decode('utf-8'))
        self.close()

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            if self.active is not None:
                raise AssertionError('Nested paragraphs')
            self.active = []

    def handle_data(self, text):
        if self.active is not None:
            self.active.append(text)

    def handle_endtag(self, tag):
        if tag == 'p':
            self.paragraphs.append(''.join(self.active))
            self.active = None


def section(paragraphs, extra=''):
    return ('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fixture</title></head><body>' +
            ''.join('<p>' + text + '</p>' for text in paragraphs) + extra + '</body></html>').encode()


class EnglishIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = intake.generate()

    def test_pinned_inventory_and_independent_decoding_cover_every_paragraph(self):
        self.assertEqual(intake.encoded(self.result), intake.OUTPUT.read_bytes())
        self.assertFalse(self.result['readerEligible'])
        self.assertEqual(self.result['audit']['paragraphCount'], 29530)
        self.assertEqual(self.result['audit']['recordCount'], 7111)
        self.assertEqual(self.result['audit']['books'], list(range(1, 94)))
        records = {r['id']: r for r in self.result['records']}
        with zipfile.ZipFile(intake.SOURCE / 'source.epub') as archive:
            for item in self.result['sections']:
                data = archive.read(item['path'])
                paragraphs = IndependentParagraphReader(data).paragraphs
                self.assertEqual(len(paragraphs), len(item['paragraphSpans']))
                self.assertEqual(intake.text_digest(paragraphs), item['textSha256'])
                used = []
                for reference in item['references']:
                    entry = records[reference]
                    self.assertEqual(item['paragraphRoles'][entry['headingParagraph']], 'reference')
                    self.assertTrue(entry['bodyParagraphs'])
                    used.extend(entry['bodyParagraphs'])
                    self.assertEqual(intake.text_digest([paragraphs[i] for i in entry['bodyParagraphs']]), entry['textSha256'])
                self.assertEqual(sorted(used), [i for i, role in enumerate(item['paragraphRoles']) if role == 'body'])
                self.assertEqual(len(used), len(set(used)))
                for index, (start, end, expected) in enumerate(item['paragraphSpans']):
                    raw = data[start:end]
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), expected)
                    self.assertEqual(IndependentParagraphReader(raw).paragraphs, [paragraphs[index]])

    def test_original_suffixes_split_books_and_known_missing_bodies_survive(self):
        references = {r['id'] for r in self.result['records']}
        self.assertIn('islamhouse-bukhari-epub-2010:1.3.97g', references)
        self.assertIn('islamhouse-bukhari-epub-2010:9.93.532v', references)
        for book in [59, 60]:
            self.assertEqual(len({r['section'] for r in self.result['records'] if r['reference']['book'] == book}), 2)
        anomalies = self.result['audit']['anomalies']
        self.assertEqual(len(anomalies), 7)
        self.assertTrue(all(a['reason'] == 'narrator-only-body' for a in anomalies))
        self.assertIn('islamhouse-bukhari-epub-2010:3.29.74', {a['reference'] for a in anomalies})

    def test_words_spaces_entities_paragraphs_and_raw_bytes_are_preserved(self):
        data = section(['  Before <span>ﷺ &amp; after</span>&nbsp; ', 'next\nline &lt;ok&gt;'])
        result = intake.parse_section(data)
        self.assertEqual(result['paragraphs'], ['  Before ﷺ & after\u00a0 ', 'next\nline <ok>'])
        for start, end, digest in result['spans']:
            self.assertEqual(hashlib.sha256(data[start:end]).hexdigest(), digest)
        self.assertIn(b'&nbsp;', data)

    def test_missing_text_and_unrecognized_reference_are_findings_not_repairs(self):
        data = section(['Context', '_' * 40, 'Volume 1, Book 1, Number 1:', 'Narrated Name:',
                        '_' * 40, 'Volume 1, Book 1, Number 2:', '_' * 40,
                        'Volume 1, Book 1, Number 3a:', 'Exact text.', '_' * 40,
                        'Volume 1, Book 1, Number unexpected:', 'More text.'])
        result, records = intake.inventory_section('test.html', data, 'fixture')
        reasons = {a['reason'] for a in result['anomalies']}
        self.assertIn('empty-body', reasons)
        self.assertIn('narrator-only-body', reasons)
        self.assertIn('unexpected-text-after-separator', reasons)
        self.assertEqual([r['id'] for r in records], ['fixture:1.1.1', 'fixture:1.1.2', 'fixture:1.1.3a'])

    def test_unaccounted_markup_or_text_is_refused(self):
        for data in [section(['Hello'], '<div>lost text</div>'), section(['Hello'], 'lost text'),
                     section(['Hello<script>bad()</script>']), section(['Hello &unknown;']),
                     section(['Hello<p>nested</p>'])]:
            with self.subTest(data=data), self.assertRaises((ValueError, intake.ET.ParseError)):
                intake.parse_section(data)

    def test_changed_source_and_policy_fail_before_import(self):
        original = json.loads((intake.SOURCE / 'manifest.json').read_text())
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / 'manifest.json').write_text(json.dumps(original))
            for entry in original['files']:
                (path / entry['path']).write_bytes((intake.SOURCE / entry['path']).read_bytes())
            for entry in original['files']:
                target = path / entry['path']
                old = target.read_bytes()
                target.write_bytes(old + b'changed')
                with self.assertRaisesRegex(ValueError, 'differs from its recorded bytes'):
                    intake.generate(path)
                target.write_bytes(old)

    def test_stale_inventory_check_refuses_without_rewriting(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'catalog.json'
            path.write_text('{"readerEligible":true}')
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/import-english.py'), '--check', '--output', str(path)], capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('absent or stale', result.stderr)
            self.assertEqual(path.read_text(), '{"readerEligible":true}')

    def test_missing_reading_order_member_is_refused(self):
        output = io.BytesIO()
        with zipfile.ZipFile(intake.SOURCE / 'source.epub') as original, zipfile.ZipFile(output, 'w') as altered:
            for member in original.infolist():
                data = original.read(member.filename)
                if member.filename == 'OPS/content.opf':
                    data = data.replace(b'<itemref idref="section-0003"/>', b'')
                    self.assertTrue(data != original.read(member.filename), 'Fixture removed the intended spine entry')
                altered.writestr(member, data)
        with self.assertRaisesRegex(ValueError, 'absent from the reading order'):
            intake.inventory(output.getvalue(), 'fixture')


if __name__ == '__main__':
    unittest.main()
