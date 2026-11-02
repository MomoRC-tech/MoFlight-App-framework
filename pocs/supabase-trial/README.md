# Independent early Supabase Cloud Free trial

**Parked — owner direction, 2 November 2026:** Supabase's need is being reconsidered. Preserve this prepared work, but do not provision, execute the hosted probe or continue integration until explicitly resumed. The hosted proposal below is inactive; project/mailbox questions no longer block local issue work. No replacement provider is selected.

**Scope clarification — owner confirmed 2 November 2026:** this trial targets the single MoFlight app. Cross-app identity/session sharing is excluded. Two synthetic users/sessions remain required for isolation testing. This clarification does not provision a project, authorize spending or establish deployed acceptance.

Tracking #1/#5/#7. **Prepared; no project provisioned or SQL/live tests executed.**
This does not persist or link the main app dataset. Requires a disposable Cloud
Free test project and two synthetic email/password accounts. No paid services,
billing activation, AI or service-role client key is authorized.

## Setup and executable probe

1. Connect/provide an existing disposable Cloud Free project or configure one
   in the owner Dashboard. Confirm it is Free and separate from any production
   database. Current session has no Supabase connector, configured project or
   authenticated test users; preparation is independent of mobile-stack approval.
2. Apply [schema.sql](schema.sql) once in that project. It creates only `mf_trial_*`
   tables, an invoker RPC and a private `moflight-trial` bucket. Do not apply to
   a shared/production project. Existing names deliberately fail rather than
   silently replacing existing policies. Existing permissive policies must be
   inspected; do not infer isolation from these definitions alone.
3. Register and confirm two synthetic test accounts through real Auth. Use
   approved free SMTP for ordinary addresses; the built-in sender is restricted.
   Set callback URLs deliberately. Capture access tokens locally, never in Git
   or chat. Use only a public publishable/anon key in the probe.
4. Supply these environment variables through your secure local environment:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MOFLIGHT_TRIAL_A_TOKEN`,
   `MOFLIGHT_TRIAL_B_TOKEN`, `MOFLIGHT_DISPOSABLE_TRIAL=yes`.
5. Run `python3 pocs/supabase-trial/probe.py` from the repository root. It prints
   check names/status only. Missing setup exits 2 / blocked before HTTP requests.
   A check/network/cleanup failure exits 1; success exits 0 for the probed subset.

The probe uses real Auth `/user`, REST/RPC and Storage requests with two user
sessions. It tests private own rows, foreign reads/writes, forged owners and
references, owner reassignment, repeat command/distinct rows, invalid payload,
anonymous/invalid-session denial, private upload/download and foreign signed
links. It uses small invented JSON; no page images or personal flights. It cleans
up only this run's UUID row IDs and identified
`<owner>/<run-dataset-uuid>/synthetic.json` objects. The bucket
and trial schema remain for reruns; inspect failed cleanup before retrying. Use
dedicated synthetic trial accounts; per-run paths preserve earlier runs/files.

SQL policies use `USING` plus `WITH CHECK`, composite ownership FKs, explicit
grants, caller RLS and a server command without a client owner parameter.
This is a bounded authorization test, not a production mutation/sync protocol.
No Edge Function, AI budget reservation, job lifecycle or stream is implemented.

## Single-app source preparation — 2 November 2026

The synthetic trial also includes `mf_trial_profile_settings` and
`mf_trial_learning_attempts`, each tied to this run's UUID dataset and verified
owner. Profile labels/settings are invented; learning records require version 1
in both their explicit version field and JSON payload. Missing/mismatched
versions are rejected. These records do not define production profile/learning
schemas or move data from the mobile app.

The probe checks returned own values, filtered foreign reads/writes and
target-owner readback, forged owners/references, unsupported versions/payloads,
and anonymous/invalid-session rejection. Dataset deletion cascades through only
this run's synthetic rows; existing profile rows and other runs are not replaced.
Local scripted HTTP tests exercise the probe's decisions/cleanup/preflight, not
PostgreSQL, Auth or hosted RLS. No project or SQL has been executed by this work.

Official source review on 2 November: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
distinguishes row filtering from rejected new row values; successful writes need
returned-value checks, and denied foreign writes need owner readback.
[Function privileges](https://supabase.com/docs/guides/database/functions) keep the
existing RPC under caller privileges. PostgreSQL [CHECK semantics](https://www.postgresql.org/docs/current/ddl-constraints.html)
accept a null expression, so the JSON-version comparison must reject missing
keys explicitly. This source review is not executed SQL acceptance.

Verification: four focused local [scripted-HTTP tests](../../tests/test_supabase_trial_probe.py)
and Python compilation pass.
They cover the complete probe path, rejection of incorrect returned ownership or
unexpected foreign-write rows, run-only cleanup and missing-configuration blocking
before network access. The parent reviewed the source changes and reused that
focused evidence; no app suite/build/device run or additional SQL simulator.
The publishing commit identifies these inputs. Actual SQL/Auth/RLS and the
manual gates below remain untested.

## Concrete next hosted trial — proposal, not provisioned

| Item | Prepared scope / prerequisite |
| --- | --- |
| Target | One disposable project named `moflight-feasibility` in an owner-selected EU region, or an existing dedicated test project; never a production/shared database |
| Cost boundary | Confirm an eligible Free organization/project slot in the Dashboard before creation; no card/billing/plan upgrade or paid SMTP/AI |
| Data | Only these reviewed `mf_trial_*` tables/private test bucket and two synthetic users; no phone history, private images or app-dataset linking |
| Auth mail | Two owner-controlled test addresses and an explicitly selected delivery arrangement; real registration/confirmation/recovery remain separate from REST/RLS probes |
| Secrets | Keep tokens/passwords local and out of chat/Git; public project configuration alone cannot establish two authenticated sessions |
| Acceptance | Save actual configuration/results/cost limits, clean only identified synthetic run data, and retain native/recovery/sync gates independently |

[Current pricing](https://supabase.com/pricing), checked 2 November, lists Free
at $0 with two active projects and pausing after a week without activity; actual
account eligibility is unverified. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
currently limit the default sender to project-team addresses and two messages
per hour, without delivery guarantees. No SMTP provider, team invitations,
account creation, hosted execution or spending is selected by this proposal.

## Manual gates that remain required

| Gate | Record evidence |
| --- | --- |
| Registration/confirmation | Real delivered email and account ID before/after confirmation, two users |
| Recovery | Real recovery email/link, change password, same user ID and same private data |
| Recovery links | Approved Android/iOS app-specific callback, stopped/running apps and expired links |
| Expiry/logout/token storage | Real expiry and account switch; secure storage on each native platform |
| Files | Foreign upload/overwrite/delete, size/type/hash negatives and public URL denial; signed URL expiry |
| Server commands/jobs | Payload bounds/reference negatives plus any future jobs; no secrets on phone |
| Pause/availability | Owner Dashboard restore, failed/missed DB probes, no lost local edits; multiweek return |
| Export/deletion/restore | Cloud records and actual bytes, preserved identities, deletion and private backup |
| Sync | Separate stream/filter/two-device tests after integration; RLS alone is insufficient |

Recovery is not simulated by changing users in the SQL editor. Hosted Auth/RLS
results cannot be inferred from host SQLite tests or SQL inspection. SMTP,
redirect configuration, project access and real-session execution are the next
prerequisites; no mobile choice is needed for the REST subset.

Original documentation review: 8 October 2026; the following references were
rechecked on 2 November alongside the new source preparation:

- [RLS and explicit grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage RLS and caller folder scope](https://supabase.com/docs/guides/storage/security/access-control)
- [Invoker database functions and execution privileges](https://supabase.com/docs/guides/database/functions)
- [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

Original local preflight: `blocked`, exit 2, no requests sent. SQL
and hosted behavior are **not tested**; do not treat prepared code as passed RLS.
