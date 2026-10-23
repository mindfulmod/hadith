import json
from pathlib import Path
# Shared explicit expectation; independent of generated reader output.
_FIXTURE=json.loads((Path(__file__).parent/'fixtures/published-collection.json').read_text())
BOOK_RANGES={b['id']:range(b['first'],b['last']+1) for b in _FIXTURE['books']}
BOOK_IDS=list(BOOK_RANGES)
ENTRY_NUMBERS=[n for numbers in BOOK_RANGES.values() for n in numbers]
LAST_NUMBER=ENTRY_NUMBERS[-1]
