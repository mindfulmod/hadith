"""Protect the exact source intake and the EPUB occurrence gap."""
import importlib.util
import json
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
book = module('fear_book', 'import-wikisource-book.py')
english = module('fear_english', 'import-english.py')
def read(path):
    return json.loads((ROOT / path).read_text())

class FearPrayerIntakeTests(unittest.TestCase):
    def test_every_block_and_character_is_preserved_once(self):
        inv = book.build(ROOT / 'content/sources/wikisource-fear-prayer')
        self.assertEqual(inv, read('content/staging/bukhari-fear-prayer-wikisource/catalog.json'))
        self.assertEqual(len(inv['blocks']), 16)
        self.assertEqual(sum(len(b['text']) for b in inv['blocks']), 3372)
        self.assertEqual([r['number'] for r in inv['records']], list(range(900,906)))
        owners = inv['blankIds'] + [p for c in inv['chapters'] for p in [c['headingId'], *c['contextIds']]] + [p for r in inv['records'] for p in r['paragraphIds']]
        self.assertEqual(len(owners), len(set(owners)))
        self.assertEqual(set(owners), {b['htmlId'] for b in inv['blocks']})
        self.assertFalse(inv['readerEligible'])

    def test_context_and_heading_difference_are_not_normalized_away(self):
        inv = read('content/staging/bukhari-fear-prayer-wikisource/catalog.json')
        self.assertEqual([p for c in inv['chapters'] for p in c['contextIds']], ['mwBg','mwFA','mwGA'])
        blocks = {b['htmlId']: b['text'] for b in inv['blocks']}
        self.assertTrue(blocks['mwBg'].startswith('وقول الله تعالى'))
        self.assertTrue(blocks['mwFA'].startswith('وقال الأوزاعي'))
        self.assertTrue(blocks['mwGA'].startswith('وقال الوليد'))
        self.assertIn('التبكير', blocks[inv['chapters'][-1]['headingId']])
        self.assertNotIn('التكبير', blocks[inv['chapters'][-1]['headingId']])

    def test_epub_bodies_establish_the_gap_by_content_not_offset(self):
        inv = read('content/staging/bukhari-en-islamhouse/catalog.json')
        rows = [r for r in inv['records'] if r['reference']['volume']==2 and r['reference']['book']==14]
        self.assertEqual([r['reference']['number'] for r in rows], ['64','65','66','67','68'])
        with zipfile.ZipFile(ROOT / 'content/sources/islamhouse-bukhari/source.epub') as z:
            section = english.parse_section(z.read('OPS/section-0016.html'))
        bodies = [''.join(section['paragraphs'][i] for i in r['bodyParagraphs']) for r in rows]
        self.assertIn("Jabir bin 'Abdullah", bodies[3]); self.assertIn('Khandaq', bodies[3])
        self.assertIn('Anas bin Malik', bodies[4]); self.assertIn('Khaibar', bodies[4])
        self.assertFalse(any('Quraiza' in s or 'Quray' in s for s in bodies))
        self.assertIn('the sun has set', bodies[3])
        self.assertNotIn('Thabit', bodies[4])

if __name__ == '__main__':
    unittest.main()
