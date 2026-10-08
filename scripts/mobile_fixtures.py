"""Bundle canonical synthetic CSV/page evidence bytes for Metro; --check detects drift."""
import argparse
import csv
import json
from pathlib import Path

folder = Path(__file__).resolve().parents[1] / 'tests/fixtures/local-logbook'
with (folder / 'flights.csv').open(newline='') as source:
    rows = list(csv.DictReader(source, delimiter=';'))
flights = []
for row in rows:
    f = {k: v if v else None for k, v in row.items()}
    for key in ('minutes', 'landings'):
        f[key] = int(row[key]) if row[key] else None
    f['crew'] = json.loads(row['crew'])
    flights.append(f)
raw_page = (folder / 'page.json').read_bytes().decode()
bundle = dict(label='Synthetic prepared fixtures: no OCR or live retrieval',
              source=dict(flights=flights, raw_csv=(folder / 'flights.csv').read_bytes().decode(),
                          retrieved_at='2026-06-02T12:00:00Z', successful=True,
                          coverage={'from': '2026-01-01', 'through': '2026-06-01', 'complete': False},
                          transport='synthetic-prepared-csv'), page=json.loads(raw_page), raw_page=raw_page)
text = json.dumps(bundle, indent=2, ensure_ascii=False) + '\n'
output = folder / 'mobile.json'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if args.check:
    if not output.exists() or output.read_text() != text:
        raise SystemExit('Mobile fixture drift; run python3 scripts/mobile_fixtures.py')
    print('Mobile fixtures match canonical synthetic CSV and page bytes')
else:
    output.write_text(text)
