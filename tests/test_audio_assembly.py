import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
import wave

spec=importlib.util.spec_from_file_location('assemble_audio',Path(__file__).resolve().parents[1]/'scripts/assemble-narration.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class AudioAssemblyTests(unittest.TestCase):
    def write_wave(self,path,samples,rate=44100):
        with wave.open(str(path),'wb') as f:
            f.setparams((1,2,rate,0,'NONE','not compressed'))
            f.writeframes(struct.pack('<'+'h'*len(samples),*samples))

    def test_every_frame_including_boundary_silence_is_preserved_in_order(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a.wav';b=d/'b.wav';out=d/'joined.wav'
            self.write_wave(a,[0,100,-200,0]);self.write_wave(b,[0,300,-400,0])
            result=module.join_waves([a,b],out)
            with wave.open(str(out),'rb') as f:
                self.assertEqual(struct.unpack('<8h',f.readframes(8)),(0,100,-200,0,0,300,-400,0))
            self.assertEqual([p['startFrame'] for p in result['parts']],[0,4])
            self.assertEqual(result['frames'],8)
            self.assertEqual(result['parts'][1]['peak'],400)

    def test_empty_segments_or_inconsistent_sample_rates_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a.wav';out=d/'out.wav'
            self.write_wave(a,[])
            with self.assertRaisesRegex(ValueError,'Empty'):module.join_waves([a],out)
            self.write_wave(a,[1,2],24000)
            with self.assertRaisesRegex(ValueError,'format'):module.join_waves([a],out)

    def test_clipping_is_reported_not_silently_filtered(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a.wav';self.write_wave(a,[-32768,32767,100])
            result=module.join_waves([a],d/'out.wav')
            self.assertEqual(result['parts'][0]['fullScaleSamples'],2)
            self.assertEqual(result['parts'][0]['peak'],32768)
