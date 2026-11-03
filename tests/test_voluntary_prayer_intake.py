"""Protect complete source occurrences, including the nonnumeric EPUB label 275t."""
import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('voluntary_check', ROOT / 'scripts/check-voluntary-prayer-intake.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class SourceParagraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.key = None
        self.texts = {}
        self.ids = []
        self.fragments = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href', '').startswith('#'):
            self.fragments.append(attrs['href'][1:])
        if tag == 'p' and ('data-source' in attrs or 'data-block' in attrs):
            self.key = attrs.get('data-source', attrs.get('data-block'))
            if self.key in self.texts:
                raise ValueError('Repeated rendered source block')
            self.texts[self.key] = ''

    def handle_data(self, text):
        if self.key is not None:
            self.texts[self.key] += text

    def handle_endtag(self, tag):
        if tag == 'p':
            self.key = None


class VoluntaryPrayerIntakeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.values = check.load()

    def changed(self, mutate):
        values = copy.deepcopy(self.values)
        mutate(values[0])
        return values

    def rejected(self, mutations):
        for mutate in mutations:
            with self.assertRaises(ValueError):
                check.validate(*self.changed(mutate))

    def test_complete_intake_and_actual_epub_bodies(self):
        self.assertTrue(check.validate(*self.values))
        self.assertEqual(check.verify_epub(self.values[0], self.values[2]), 13)
        self.assertEqual([p for r in self.values[0]['records'] for p in r['printedReferences']],list(range(1172,1188)))

    def test_occurrences_cannot_be_dropped_duplicated_or_reordered(self):
        self.rejected([lambda a:a['records'].pop(3),lambda a:a['records'].__setitem__(2,copy.deepcopy(a['records'][1])),
                       lambda a:a['records'].reverse(),lambda a:a['records'][12].update(sourceRecordId=a['records'][11]['sourceRecordId'])])

    def test_combined_print_divisions_do_not_create_missing_reports(self):
        self.rejected([lambda a:a['combinedDigitalReferences'].clear(),lambda a:a['missingPrintedReports'].append({'reference':'1130b'}),
                       lambda a:a['records'][0].update(printedReferences=[1172]),lambda a:a['records'][7].update(printedReferences=[1180]),
                       lambda a:a['records'][11].update(printedReferences=[1186]),lambda a:a['combinedDigitalReferences'][2]['boundaries'][0].update(start=0)])

    def test_275t_cannot_be_erased_or_replaced_by_275(self):
        rows=self.values[0]['records']
        self.assertEqual([r['englishComparisons']['khan']['reference']for r in rows[5:8]],['2.21.274','2.21.275t','2.21.275'])
        self.rejected([lambda a:a['records'][6]['englishComparisons']['khan'].update(reference='2.21.275'),
                       lambda a:a['records'][6]['englishComparisons']['khan'].update(reference=None,status='absent-from-checked-interval'),
                       lambda a:a['englishComparisons']['khan'].update(absentReferences=[1125]),
                       lambda a:a['englishComparisons']['khan'].update(irregularReferenceMap={})])
        bad=self.changed(lambda a:a['records'][6]['englishComparisons']['khan'].update(bodySha256=rows[7]['englishComparisons']['khan']['bodySha256']))[0]
        with self.assertRaisesRegex(ValueError,'English body'):
            check.verify_epub(bad,self.values[2])

    def test_actual_epub_binding_rejects_changed_body_and_record(self):
        for field in ['bodySha256','recordSha256']:
            bad=self.changed(lambda a:a['records'][11]['englishComparisons']['khan'].update({field:'0'*64}))[0]
            with self.assertRaisesRegex(ValueError,'English body'):
                check.verify_epub(bad,self.values[2])

    def test_275t_record_order_is_checked_in_the_inventory(self):
        inventory=copy.deepcopy(self.values[2]);records=inventory['records']
        a=next(i for i,r in enumerate(records)if r['id'].endswith(':2.21.275t'))
        records[a],records[a+1]=records[a+1],records[a]
        with self.assertRaisesRegex(ValueError,'275t occurrence'):
            check.verify_epub(self.values[0],inventory)

    def test_long_report_retains_objection_vow_and_rechecking(self):
        inv=copy.deepcopy(self.values[1]);block=next(b for b in inv['blocks']if b['htmlId']=='mwLA')
        self.assertIn('فأنكرها على أبو أيوب',block['text'])
        self.assertIn('فأهللت بحجة أو بعمرة',block['text'])
        self.assertTrue(block['text'].endswith('فحدثنيه كما حدثنيه أول مرة'))
        block['text']=block['text'].split('قال محمود فحدثتها')[0]
        block['textSha256']=check.sha(block['text'])
        audit=copy.deepcopy(self.values[0]);audit['source']['inventorySha256']=check.hashjson(inv)
        with self.assertRaises(ValueError):
            check.validate(audit,inv,self.values[2])

    def test_all_variants_remain_bound_and_unapplied(self):
        for i in range(13):
            self.rejected([lambda a:a['unresolvedTextualDifferences'].pop(i),
                           lambda a:a['unresolvedTextualDifferences'][i].update(status='resolved'),
                           lambda a:a['unresolvedTextualDifferences'][i]['witnesses'][0].update(pdfPage=999),
                           lambda a:a['unresolvedTextualDifferences'][i].update(sourceBlockSha256='0'*64)])

    def test_english_limitations_cannot_be_erased_or_promoted(self):
        for provider,refs in check.LIMITED.items():
            for n in refs:
                self.rejected([lambda a:a['records'][n-1119]['englishComparisons'][provider].update(limitations=[]),
                               lambda a:a['records'][n-1119]['englishComparisons'][provider].update(status='approved')])
        self.rejected([lambda a:a['records'][0]['englishComparisons']['khan'].update(limitations=['No limitation'])])

    def test_two_chapter_comments_stay_separate_and_pending(self):
        self.rejected([lambda a:a['source']['separateContextIds'].pop(),lambda a:a['chapterMaterial'][4]['context'].clear(),
                       lambda a:a['chapterMaterial'][7].update(readerEligible=True),lambda a:a['chapterMaterial'][7].update(englishStatus='approved'),
                       lambda a:a['records'][10]['paragraphIds'].append('mwKg')])

    def test_boundary_cannot_absorb_the_next_printed_book(self):
        self.rejected([lambda a:a['sectionBoundary'].update(selectedLastReference=1139),
                       lambda a:a['sectionBoundary'].update(nextSelectedReference=1133),
                       lambda a:a['sectionBoundary'].update(printedNextReferences=[1189]),
                       lambda a:a['sectionBoundary']['printedPages'].update(**{'dar-ibn-kathir-2002':[286]})])

    def test_intake_cannot_approve_or_correct_the_source(self):
        self.rejected([lambda a:a.update(readerAdmission=True),lambda a:a.update(independentReview='approved'),
                       lambda a:a['source'].update(arabicChanged=True),lambda a:a['proposedCorrections'].append({'reference':1124}),
                       lambda a:a['printedComparisons'][0].update(sha256='0'*64),lambda a:a['englishComparisons']['bewley'].update(sha256='0'*64)])

    @staticmethod
    def synthetic_bewley():
        return ('<p>1118. Previous subsection'+''.join(f'<P><a>{n}</a>. Body &amp; {n}. See 1132.\nSee 1119.<P>Continuation {n}.' for n in check.REFERENCES)+'<p>1132. Next subsection<p>1133. Outside').encode()

    def test_web_locator_preserves_inline_refs_and_multiblock_bodies(self):
        bodies=check.locate_bewley(self.synthetic_bewley());self.assertEqual(list(bodies),check.REFERENCES)
        for n,body in bodies.items():self.assertEqual(body['body'],f'Body & {n}. See 1132. See 1119. Continuation {n}.')
        audit=copy.deepcopy(self.values[0])
        for r in audit['records']:r['englishComparisons']['bewley']['bodySha256']=check.sha(bodies[r['reference']]['body'])
        check.verify_bewley_bodies(audit,bodies);bodies[1130]['body']+=' Modified'
        with self.assertRaisesRegex(ValueError,'pinned locator'):check.verify_bewley_bodies(audit,bodies)

    def test_web_locator_rejects_missing_duplicate_and_unbounded_labels(self):
        raw=self.synthetic_bewley()
        for old,new in [(b'<a>1120</a>',b'<a>1119</a>'),(b'<a>1125</a>',b'<a>1126</a>'),(b'<a>1119</a>',b'Other'),
                        (b'<p>1132.',b'<p>Other.'),(b'<p>1133.',b'<p>1132.')]:
            with self.assertRaises(ValueError):check.locate_bewley(raw.replace(old,new))

    def test_review_page_preserves_all_arabic_and_fragment_targets(self):
        audit,inventory,_=self.values;rendered=check.render(audit,inventory)
        self.assertEqual(rendered,(ROOT/'research/voluntary-prayer-source-review.html').read_text())
        parser=SourceParagraphs();parser.feed(rendered);blocks={b['htmlId']:b['text']for b in inventory['blocks']}
        expected={str(r['number']):'\n\n'.join(blocks[p]for p in r['paragraphIds'])for r in inventory['records']}
        expected.update({p:blocks[p]for c in inventory['chapters']for p in [c['headingId'],*c['contextIds']]})
        self.assertEqual(parser.texts,expected);self.assertEqual(len(parser.ids),len(set(parser.ids)))
        self.assertTrue(set(parser.fragments)<=set(parser.ids))
        for phrase in ['Candidate evidence only','Printed 1172 / 1173','Printed 1180 / 1181','Printed 1185 / 1186','2.21.275t','English pending','later rechecking']:
            self.assertIn(phrase,rendered)


if __name__ == '__main__':
    unittest.main()
