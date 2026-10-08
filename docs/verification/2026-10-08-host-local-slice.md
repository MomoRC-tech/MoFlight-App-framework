# Executed synthetic host local slice — 2026-10-08

Baseline main inspected: `f6bb6da01fcfe43abf6911b584d8d00b5fa17699`;
no newer main existed at start. AGENTS/README/ADRs 0002–0004, requested product
specifications and all ten open Issues read. Implementation/evidence are in the
commit containing this file; publication follow-up records the published SHA.

## Environment and commands actually run

- Linux x86_64, kernel 6.18.44, glibc 2.39.
- Python 3.12.14; Python SQLite runtime 3.53.1.
- Node 24.19.0 present but no mobile dependencies installed/adopted.
- docker, adb and xcodebuild unavailable on PATH; no native/cloud runner.
- No Supabase connector/project/two-user sessions configured in this session.

From repository root:

```bash
python3 -m unittest discover -s tests -v
python3 -m compileall -q pocs tests
git diff --check
python3 -m pocs.local_logbook.lab demo --data /tmp/moflight-host-demo
python3 pocs/supabase-trial/probe.py
```

Local suite: **20/20 passed**, exit 0, 0.214 s on the recorded final run.
Compile and whitespace checks: exit 0. Demo: exit 0 with real SQLite state and
fixed page instructions. Supabase probe: **blocked**, exit 2 before requests;
disposable test project/public key/two synthetic sessions are missing.
No paid calls, tokens, embeddings, photo analysis or hosting provisioned; $0
provider spend incurred by these host checks. No cloud/RAG latency measured.

## Actual evidence and boundaries

| Scenarios | Actual checks / results | Remaining limits |
| --- | --- | --- |
| E11 / #4 | Fresh subprocess reads identical stored query, decisions, paper and template with socket connections denied | Host restart only; Android/iOS airplane-mode and account linking not tested |
| E12/E14 / #7 | Ignore leaves counts unchanged; override changes only effective view; reversal reopens; timestamp/unrelated remark keeps decision; relevant model change stales it | Bounded flight/aircraft-field decisions; concurrent-device resolution and broad rules absent |
| E15/E16 / #9 | Exact aircraft instance/model/person/role/date lists, duplicate import/crew safety and distinct same-name p1/p2; dates/time ambiguity and partial coverage shown | Typed IDs only; no natural-language parser or general alias-resolution UI |
| E01/T01 host preparation | 70 at page 7 row 10, 71 at page 8 row 1; total 110 min and cumulative 710 min, role split/landings verified; partial-page totals absent | Prepared UTC solo/Dual fixture; no native T01/T02 or DST conversion evidence |
| E13/T03 host semantics | Preparing/reopening/viewing does not change paper; only selected f70 confirmed; f71 pending; changed flight cannot be confirmed silently | No actual paper/photo update, native app UI or automatic later continuation |
| Fixed presentation | Parsed all row fields, blank semantics, escaped markup, preserved exact snapshot after changes; actual localhost HTTP GET twice gave same content with no state writes | HTTP/content checks only; visual/native screen readability not inspected; no optional file export |
| Backup/restore / #4 | SQLite backup plus all record revisions/assets; new dataset restore preserves IDs, query, history, file bytes and rendered fixed instructions | Synthetic host files only; unencrypted; no native backup picker or cryptographic authenticity |
| Restore failures | Tampering, traversal and omitted evidence rejected before destination installation; existing destination protected | Untrusted backups need broader hardening before production; test size bound 10 MB |
| Dataset boundaries / #4/#9 | Separate host directories contain no other dataset rows/assets/counts; wrong expected identity rejected | Same OS owner can read host paths; no native secure-storage/user-auth proof |
| Version/writes | Unsupported schema refused; stale response revision rejected; copied-entry invalid scope atomic | Schema v1 only; no v1→v2 migration, tombstone/deletion, reset, sync or conflict engine |
| Early cloud / #1 | Real REST/RPC/Storage probe and SQL prepared; unconfigured preflight reports blocked | SQL not executed; Auth/recovery/RLS/private file/commands/expiry/idle restoration not verified |
| Own-flight / #2 | Official public site checked; official PDF read attempted and inaccessible in lookup tool | Current official docs/permissions/AppKey/transport unresolved; no login/live retrieval |
| SPL / #3 | Retained as independent framework gate, prerequisites documented | No corpus ingestion/retrieval/answer evidence collected |

Original CSV bytes and five raw rows (including repeated f70) are retained;
four distinct normalized source flights are queried. Paper context rows 61–68
do not enter the source/effective history; they have not been generally matched.
Failed import attempt is retained while last successful snapshot remains usable.
Relevant findings/source changes are surfaced without changing old template bytes.

Initial suite found differing dictionary render order across restore and treating
known solo flights as unknown crew. Both fixed and rerun. Later latest-date
ambiguity assertion was corrected to compare the unordered candidate set. All
20 tests pass in the final run. No failing check is described as passing.

## Native and architecture prerequisites

ADR 0002 mobile/workspace remains Proposed. [ADR 0005](../adr/0005-host-lab-before-mobile-approval.md)
records this host scope and recommends Expo/React Native/strict TypeScript/pnpm
with expo-sqlite as the single native lab writer, subject to Manuel's decision.
After that decision: compatible pinned versions, native builds and fixture parity.
This host harness is not a second production implementation or a mobile Python runtime.

Open Issues stay open. Full #1/#2/#3/#4/#6/#7/#8/#9 acceptance has not passed.
The [platform-lab runbook](../../apps/platform-lab/README.md),
[cloud trial](../../pocs/supabase-trial/README.md) and
[own-flight investigation](../architecture/vereinsflieger-access-investigation.md)
provide reproducible next actions. Push-to-main CI is added; its remote outcome
must be checked after publication and cannot be inferred from local success.
