"""Exact source ownership and independently observed edition groupings."""
import importlib.util
import json
import unittest
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def module(name, file):
    spec=importlib.util.spec_from_file_location(name, ROOT/'scripts'/file)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
book=module('eids_book','import-wikisource-book.py')
en=module('eids_english','import-english.py')
def read(path): return json.loads((ROOT/path).read_text())

class TwoEidsIntakeTests(unittest.TestCase):
    def test_all_74_blocks_and_13730_characters_survive_once(self):
        inv=book.build(ROOT/'content/sources/wikisource-two-eids')
        self.assertEqual(inv,read('content/staging/bukhari-two-eids-wikisource/catalog.json'))
        self.assertEqual(len(inv['blocks']),74)
        self.assertEqual(sum(len(b['text'])for b in inv['blocks']),13730)
        self.assertEqual([r['number']for r in inv['records']],list(range(906,946)))
        owned=inv['blankIds']+[p for c in inv['chapters']for p in [c['headingId'],*c['contextIds']]]+[p for r in inv['records']for p in r['paragraphIds']]
        self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in inv['blocks']})
        self.assertFalse(inv['readerEligible'])

    def test_chapter_context_remains_separate_and_first_batch_ends_after_complete_chapter(self):
        inv=read('content/staging/bukhari-two-eids-wikisource/catalog.json')
        self.assertEqual(len(inv['chapters']),26)
        self.assertEqual([p for c in inv['chapters']for p in c['contextIds']],['mwOQ','mwPQ','mwQQ','mwRQ','mwVQ','mwdw','mwfw'])
        self.assertEqual(inv['chapters'][6]['entryNumbers'],[914,915,916,917,918])
        self.assertEqual(inv['chapters'][7]['entryNumbers'],[919,920,921,922])
        blocks={b['htmlId']:b['text']for b in inv['blocks']}
        self.assertIn('وكان يوم عيد',blocks['mwDQ'])
        self.assertIn('رسول الله عليه السلام',blocks['mwDQ'])

    def test_shared_epub_reference_is_matched_by_actual_four_part_body(self):
        inv=read('content/staging/bukhari-en-islamhouse/catalog.json')
        rows=[r for r in inv['records']if r['reference']['volume']==2 and r['reference']['book']==15]
        self.assertEqual(len(rows),36)
        row=next(r for r in rows if r['reference']['number']=='78')
        with zipfile.ZipFile(ROOT/'content/sources/islamhouse-bukhari/source.epub')as z:
            sec=en.parse_section(z.read(row['section']))
        text=''.join(sec['paragraphs'][i]for i in row['bodyParagraphs'])
        self.assertIn('offered the prayer before delivering the Khutba',text)
        self.assertIn('sent a message',text);self.assertIn('Ibn Abbas and Jabir',text)
        self.assertIn('Bilal was spreading his garment',text);self.assertIn('incumbent on Imams',text)
        self.assertIn('ï¿½',text)

if __name__=='__main__':unittest.main()
