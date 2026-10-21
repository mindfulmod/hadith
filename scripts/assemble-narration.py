"""Assemble unchanged downloaded narration segments using macOS Core Audio.

Requires Python 3.12+ for Core Audio WAVE_EXTENSIBLE output.
Input is a segmentation record with entries/parts/original path, bytes and sha256.
This verifies files and frame order, not the words spoken by the model.
"""
import argparse
import array
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import wave


def sha(data):
    return hashlib.sha256(data).hexdigest()


def join_waves(paths, target):
    parts = []
    frames = 0
    pcm_hash = hashlib.sha256()
    with wave.open(str(target), 'wb') as output:
        output.setparams((1, 2, 44100, 0, 'NONE', 'not compressed'))
        for path in paths:
            with wave.open(str(path), 'rb') as source:
                if (source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getcomptype()) != (1, 2, 44100, 'NONE'):
                    raise ValueError('Unexpected decoded audio format')
                pcm = source.readframes(source.getnframes())
                if len(pcm) != source.getnframes() * 2:
                    raise ValueError('Incomplete decoded audio')
                samples = array.array('h', pcm)
                if sys.byteorder != 'little':
                    samples.byteswap()
                if not samples:
                    raise ValueError('Empty decoded segment')
                parts.append({'startFrame': frames, 'frames': len(samples), 'pcmSha256': sha(pcm), 'peak': max(abs(s) for s in samples), 'fullScaleSamples': sum(s in (-32768, 32767) for s in samples)})
                frames += len(samples)
                pcm_hash.update(pcm)
                output.writeframesraw(pcm)
    return {'sampleRate': 44100, 'channels': 1, 'bitsPerSample': 16, 'frames': frames, 'duration': frames / 44100, 'pcmSha256': pcm_hash.hexdigest(), 'parts': parts}


def assemble(plan, root, output):
    if output.exists() or output.with_suffix('.assembly.json').exists():
        raise ValueError('Output already exists; choose a new recording version')
    parts = [part for entry in plan['entries'] for part in entry['parts']]
    originals = []
    for part in parts:
        asset = part['original']
        if not re.fullmatch(r'content/audio/raw/[a-z0-9-]+\.mp3', asset['path']):
            raise ValueError('Unsafe original recording path')
        path = root / asset['path']
        data = path.read_bytes()
        if len(data) != asset['bytes'] or sha(data) != asset['sha256']:
            raise ValueError('Original recording differs from generation record')
        originals.append(path)
    if not originals or len(set(originals)) != len(originals):
        raise ValueError('Missing or repeated original recording')
    with tempfile.TemporaryDirectory(prefix='cedar-assembly-', dir=output.parent) as work:
        work = Path(work)
        decoded = []
        for i, path in enumerate(originals):
            wav = work / f'{i}.wav'
            subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', str(path), str(wav)], check=True)
            decoded.append(wav)
        joined = work / 'complete.wav'
        evidence = join_waves(decoded, joined)
        encoded = work / 'complete.m4a'
        subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', '-q', '127', str(joined), str(encoded)], check=True)
        # Decode the published encode as a separate numerical check.
        roundtrip = work / 'roundtrip.wav'
        subprocess.run(['/usr/bin/afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', str(encoded), str(roundtrip)], check=True)
        evidence['encodedCheck'] = join_waves([roundtrip], work / 'checked.wav')
        if evidence['frames'] != evidence['encodedCheck']['frames']:
            raise ValueError('Encoded recording changes the decoded duration')
        media = encoded.read_bytes()
        evidence['file'] = {'file': output.name, 'bytes': len(media), 'sha256': sha(media)}
        output.write_bytes(media)
        output.with_suffix('.assembly.json').write_text(json.dumps(evidence, indent=2) + '\n')
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--segments', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = assemble(json.loads(args.segments.read_text()), args.root, args.output)
    print(json.dumps({'seconds': result['duration'], 'segments': len(result['parts']), 'bytes': result['file']['bytes']}))
