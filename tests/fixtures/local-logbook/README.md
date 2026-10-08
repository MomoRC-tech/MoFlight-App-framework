# Synthetic logbook fixtures

Every person, aircraft reference, flight, date and paper row here is invented.
`flights.csv` is a **prepared normalized fixture**, not an official Vereinsflieger
export schema or evidence of live retrieval. IDs use the `fixture:` namespace.
`page.json` contains **manually prepared observations and confirmations**,
not OCR output, a real photo or successful handwriting analysis.

The first page has nine known rows numbered 61–69 on page 7. Only the anchor
f69 is linked to the synthetic source history; rows 61–68 are prepared paper
context. Their general matching/deduplication into effective history is not
implemented. One old source flight deliberately precedes the anchor and never
changes new numbering. Source f69 has DG-1000 S versus paper ASK 21, yielding
one scoped historical aircraft-model warning. CSV includes a repeated f70 row
and repeated p1 crew links. p1 and p2 both display `Example Alex`, with distinct IDs.

Expected source/effective query basis before any override:

| Filter | Supporting IDs | Count / latest |
| --- | --- | --- |
| Registration D-EX01 | f69, f70 | 2; latest f70 |
| Model ASK 21 | older, f70, f71 | 3; latest f71 |
| Person p1 / instructor | older, f69 | 2; latest f69 |
| Person p2 / instructor | f71 | 1; latest f71 |

All IDs in the table are prefixed `fixture:`. Ignore changes no facts. An explicit
f69 aircraft-model override to ASK 21 changes effective model count to 4 while
source count stays 3. Reversal returns effective count to 3. Import freshness
alone does not stale the aircraft decision; a changed relevant model does.

Writing expectations: f70 is number 70, page 7 row 10, solo PIC 20 minutes.
f71 is number 71, page 8 row 1, Dual 30 minutes, instructor p2.
The nine context rows contribute 90 Dual minutes. Page 7 totals are
110 total / 20 PIC / 90 Dual / 0 FI minutes and 10 landings. Known carryovers
are 600 / 400 / 200 / 0 minutes and 60 landings, giving cumulative
710 / 420 / 290 / 0 minutes and 70 landings. Page 8 carries those values;
its page/cumulative total fields all remain blank because it is partial.

Bounded lab: known UTC daytime solo/Dual flights only. Unknown decisive fields,
carryovers, overlapping candidates, non-UTC conversion and FI/FE presentation
need feedback or later implementation; no guessed UTC/DST conversion. The
fixture does not represent lifetime-complete history or validate all paper rows.
