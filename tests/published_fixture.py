import json
from pathlib import Path
# Shared explicit expectation; independent of generated reader output.
_FIXTURE=json.loads((Path(__file__).parent/'fixtures/published-collection.json').read_text())
assert _FIXTURE['schemaVersion']==2
BOOK_RANGES={b['id']:b.get('references',list(range(b['first'],b['last']+1))) for b in _FIXTURE['books']}
for b in _FIXTURE['books']:
 refs=BOOK_RANGES[b['id']]
 assert refs[0]==b['first'] and refs[-1]==b['last'] and len(set(refs))==len(refs)
BOOK_IDS=list(BOOK_RANGES)
ENTRY_NUMBERS=[n for numbers in BOOK_RANGES.values() for n in numbers]
LAST_NUMBER=ENTRY_NUMBERS[-1]
