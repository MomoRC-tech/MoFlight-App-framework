# Platform lab — first executable host slice

Tracking: #6/#4/#7/#9. **Host runner only; no Expo app/native build yet.**
The executable implementation is [the SQLite trial](../../pocs/local_logbook/lab.py).
It uses Python's standard library to evaluate product invariants before the
proposed mobile stack/driver is approved. It is not a Python mobile architecture.
The SQL/fixture/result contracts can inform the later single mobile implementation.

From the repository root, Python 3.12:

```bash
python3 -m unittest discover -s tests -v
python3 -m pocs.local_logbook.lab demo --data local-data/lab-a
python3 -m pocs.local_logbook.lab query --data local-data/lab-a --registration D-EX01
python3 -m pocs.local_logbook.lab query --data local-data/lab-a --person-id fixture:p1
python3 -m pocs.local_logbook.lab serve --data local-data/lab-a
```

Open `http://127.0.0.1:8765/` on the host running the lab. The read-only viewer
groups exact fields by paper page/row, labels existing context and new copying,
and displays carryovers/totals in h:mm. It binds to one stored snapshot and shows
review status when relevant source/finding values change. Viewing performs no
paper writes. Stop with Ctrl+C. This does not establish phone readability or
native airplane-mode behavior. No PDF or file renderer is adopted.

`demo` prints its fixed snapshot ID. Explicit confirmation is separate:

```bash
python3 -m pocs.local_logbook.lab confirm --data local-data/lab-a --snapshot SNAPSHOT_ID --flight-id fixture:f70
python3 -m pocs.local_logbook.lab template --data local-data/lab-a --snapshot SNAPSHOT_ID
```

Replace `SNAPSHOT_ID` with the ID printed by your own run. Only f70 advances;
f71 stays pending. The original snapshot remains available. This bounded slice
refuses a new continuation after paper advancement until a fresh confirmed page
is provided; a general editable paper-continuation workflow is future work.

Private host backup/restore, using a new archive and destination each time:

```bash
python3 -m pocs.local_logbook.lab backup --data local-data/lab-a --archive local-data/lab-a-backup.zip
python3 -m pocs.local_logbook.lab restore --data local-data/restored-a --archive local-data/lab-a-backup.zip
python3 -m pocs.local_logbook.lab query --data local-data/restored-a --registration D-EX01
```

Backup includes a SQLite consistent copy, record history, immutable templates,
source CSV and prepared-observation bytes, version and SHA-256 manifest. Restore
validates hashes, file paths, database version/identity/integrity and referenced
bytes before installing into a new directory. Existing datasets are never replaced.
Host directories/files use 0700/0600 when created. **Archives and SQLite are
unencrypted**; hashing detects accidental corruption, not malicious authenticity.
Use synthetic data only; native private storage/encryption/backup UI remain gates.

## Boundaries and evidence

| Trial | Current result |
| --- | --- |
| Host SQLite, query/decision/paper/template/restart/backup | 20 actual tests passed; [evidence](../../docs/verification/2026-10-08-host-local-slice.md) |
| Read-only host HTTP field view | HTTP/field parity tested; native visual acceptance not tested |
| Android / iOS | No app or native build; stack/driver approval and suitable runners needed |
| Supabase Auth/RLS/files/server command | [Prepared independent probe](../../pocs/supabase-trial/README.md); blocked without project/sessions; SQL not executed |
| Live own Vereinsflieger flights | [Access investigation](../../docs/architecture/vereinsflieger-access-investigation.md); blocked on supported documentation/permission |
| Handwriting | Prepared observations only; no recognition or paid AI calls |
| SPL retrieval / RAG | #3 remains planned; no retrieval/answer evaluation executed |
| Sync / account linking / two apps | Later gates; not implemented |

No dependency installer or third-party package is needed for this host runner.
The local environment used Python 3.12.14 / SQLite 3.53.1; CI selects Python 3.12
and reports its actual runtime. Expo/React Native/TypeScript/pnpm remains Proposed
in ADR 0002. Recommend `expo-sqlite` as the first mobile driver candidate because
it avoids adding a second SQLite writer; this requires approval/compatibility checks
and separate native evidence, and has not been adopted here.
