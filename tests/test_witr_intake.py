"""Independent source counts and exact comparison defects, not generated-reader expectations."""
import importlib.util,json,unittest,zipfile,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
book=module('witr_book','import-wikisource-book.py');english=module('witr_en','import-english.py')
def read(p):return json.loads((ROOT/p).read_text())
class WitrIntakeTests(unittest.TestCase):
 def test_source_ownership_preserves_all_23_blocks_and_3585_characters(self):
  i=book.build(ROOT/'content/sources/wikisource-witr');self.assertEqual(i,read('content/staging/bukhari-witr-wikisource/catalog.json'));self.assertEqual(len(i['blocks']),23);self.assertEqual(sum(len(b['text'])for b in i['blocks']),3585);self.assertEqual([r['number']for r in i['records']],list(range(946,960)))
  owned=i['blankIds']+[p for c in i['chapters']for p in [c['headingId'],*c['contextIds']]]+[p for r in i['records']for p in r['paragraphIds']];self.assertEqual(len(owned),len(set(owned)));self.assertEqual(set(owned),{b['htmlId']for b in i['blocks']});self.assertFalse(i['readerEligible']);self.assertEqual(i['blankIds'],['mwLg'])
  self.assertEqual([p for c in i['chapters']for p in c['contextIds']],['mwEA']);self.assertEqual(len(i['chapters']),7)
 def test_real_epub_has_the_recorded_count_difference_and_damaged_command(self):
  i=read('content/staging/bukhari-en-islamhouse/catalog.json');rows=[r for r in i['records']if r['reference']['volume']==2 and r['reference']['book']==16];self.assertEqual(len(rows),14)
  with zipfile.ZipFile(ROOT/'content/sources/islamhouse-bukhari/source.epub')as z:
   for ref,phrase in [('106','five times'),('112','Make s your last prayer at night.')]:
    r=next(r for r in rows if r['reference']['number']==ref);s=english.parse_section(z.read(r['section']));body=[s['paragraphs'][n]for n in r['bodyParagraphs']];h=hashlib.sha256(json.dumps(body,ensure_ascii=False,separators=(',',':')).encode()).hexdigest();self.assertEqual(h,r['textSha256']);self.assertIn(phrase,' '.join(body))
    if ref=='112':self.assertEqual(body,read('content/review/witr-complete-review.json')['entries'][7]['comparisons'][1]['checkedBody'])
if __name__=='__main__':unittest.main()
