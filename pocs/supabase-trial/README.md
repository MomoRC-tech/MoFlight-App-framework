# Independent early Supabase Cloud Free trial

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
up only this run's UUID row IDs and identified `synthetic.json` objects. The bucket
and trial schema remain for reruns; inspect failed cleanup before retrying. Use
accounts dedicated to the trial so `synthetic.json` has no existing content.

SQL policies use `USING` plus `WITH CHECK`, composite ownership FKs, explicit
grants, caller RLS and a server command without a client owner parameter.
This is a bounded authorization test, not a production mutation/sync protocol.
No Edge Function, AI budget reservation, job lifecycle or stream is implemented.

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

Official documentation rechecked 2026-10-08:

- [RLS and explicit grants](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage RLS and caller folder scope](https://supabase.com/docs/guides/storage/security/access-control)
- [Invoker database functions and execution privileges](https://supabase.com/docs/guides/database/functions)
- [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)

Actual local result: preflight emitted `blocked`, exit 2, no requests sent. SQL
and hosted behavior are **not tested**; do not treat prepared code as passed RLS.
