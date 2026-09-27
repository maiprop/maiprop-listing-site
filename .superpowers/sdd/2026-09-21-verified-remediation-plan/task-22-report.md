# Task 22 — Open Houses service RSVP quota enforcement

Date: 24 September 2026

## Result

The service-only `create_open_house_registration_for_user(...)` path now applies the existing monthly open-house RSVP entitlement for the explicit requester. The trigger still rejects an authenticated subject mismatch, and ordinary direct inserts still reach the unchanged RPC-only guard. No route, Edge Function, client hook, grant, policy, capacity rule, or status transition was broadened.

## RED evidence

The existing local replay database reproduced the defect with normal origin triggers: an active service-role call without an end-user JWT admitted four current-month RSVPs for a free buyer whose limit was three. The retained authenticated-subject comparison stopped at three. The probe rolled back all synthetic rows.

Log: `db/task-22-red-service-quota.log`

## GREEN evidence

The migration was applied to disposable clone `maiprop_t22_source` and the focused database checks passed:

- `open_house_rsvp_service_quota_test.sql`: pgTAP `1..20`, all 20 passed, rollback complete.
- `open_house_rsvp_service_quota_race_test.sql`: pgTAP `1..6`, all 6 passed, rollback and committed fixture cleanup complete. Two service sessions raced different listings for the same free buyer; the requester-month advisory lock blocked the contender and the committed winner caused the contender to receive `open_house_rsvp_limit_reached`.
- Source binding: function owner remained `postgres`; ACL remained `{postgres=X/postgres}`; quota trigger definition and `tgenabled='O'` remained unchanged. Only the function body hash changed as intended.
- Existing Open Houses frontend/error mapping checks: 77 Vitest tests passed across the hook, branch coverage, plan-limit mapping, and grant migration suites.
- Open Houses registration Edge Function suite: 7 Deno tests passed.
- App typecheck and `git diff --check` passed.

Logs: `db/task-22-source-upgrade.log`, `db/task-22-green-service-quota.log`, and `db/task-22-green-race.log`.

## Files changed

- `supabase/migrations/20260924110000_enforce_open_house_rsvp_service_quota.sql`
- `supabase/tests/open_house_rsvp_service_quota_test.sql`
- `supabase/tests/open_house_rsvp_service_quota_race_test.sql`

## Limits

Evidence is local and synthetic. The disposable clone was removed after verification; no hosted database, provider, customer data, deployment, or GitHub state was changed. No whole-repository coverage percentage is claimed. The repository chronology checker still reports two earlier violations in `20260923193844_durable_new_build_enquiry_replay.sql`; this Task 22 migration introduces neither violation. Independent agent rereview was unavailable because all reviewer seats had exhausted their usage window, so this task has local source/test verification but not a fresh independent approval.

## Evidence follow-up — 27 September 2026

The later independent scoped review accepted the Task 22 runtime repair but requested actual service-role raw INSERT denial, negative EXECUTE checks for the active service-only RPC, direct before/after migration metadata, and resets of simulated request state. This follow-up changes only `supabase/tests/open_house_rsvp_service_quota_test.sql` and local evidence. It does not change the migration, RPCs, grants, runtime, race test, Edge test, or hook test. The historical 40/40 ordinary, 7/7 race, 7+30 same-backend composition, Edge 8/8, and hook 46/46 counts remain the earlier evidence; the amended ordinary suite has its own 45 assertions.

The exclusive local PostgreSQL 16.15 clone `maiprop_t22_evidence_20260927` came from immutable `maiprop_replay_current_20260921`. The only applied migration was `20260924110000_enforce_open_house_rsvp_service_quota.sql`, with SHA-256 `CA669E801A2B7E328F017C97251782959D866378CA88A6CD0F7658106B2A29AB`; its psql output is BEGIN/CREATE FUNCTION/COMMIT, exit 0. Synthetic identity/listing setup uses replica mode, then restores origin before all registration actions. No grants or fixture authorization substitutions were applied.

The pre/post catalog captures in `db/task-22-followup-pre.stdout.log` and `db/task-22-followup-post.stdout.log` show all three exact routine signatures, owner `postgres`, ACL, SECURITY DEFINER flag, settings, effective service/anon/authenticated EXECUTE, and all relevant enabled registration trigger bindings. The quota function definition MD5 changes from `ccc0b3419665445faebd23bf80f5cd5a` to `1647660de3969d30316f833ea6855bde`; its owner remains `postgres`, ACL `{postgres=X/postgres}`, and `search_path=public, pg_temp` remains. Both RPC definition hashes and grants remain identical. The active explicit-user RPC has service EXECUTE and no anon/authenticated EXECUTE; the legacy RPC's pre-existing grants are treated separately. The quota and insert-guard triggers stay enabled and bound to the same functions. The actual service role has neither INSERT nor SELECT on the registration table in this source fixture.

The amended suite passed 45/45 pgTAP assertions, exit 0, and rolled back. The actual `SET LOCAL ROLE service_role` raw INSERT supplies contact and consent fields and is denied with SQLSTATE `42501`, exact message `permission denied for table open_house_registrations`; a privileged observer then verifies listing eight still has zero rows. This is the table-ACL boundary, before triggers. The distinct privileged observer raw INSERTs still demonstrate the unchanged missing/wrong-marker guard's exact `use_create_open_house_registration_rpc` denial. Simulated calls now clear and set JWT subject, role, claims and workflow marker before each request, including Pro/non-buyer and legacy loops, retries, exclusions and capacity calls. The authenticated mismatch test supplies a marker matching the proposed requester and still receives `open_house_rsvp_requester_mismatch`.

For same-backend hygiene, the final psql invocation ran the exact committed 45-check suite followed immediately by `db/task-22-followup-cleanup.sql` on backend PID 755. The follow-on new pgTAP plan 1/1 passed; the temporary receipt relation was gone and synthetic user, profile, listing and registration counts were all zero. The final upgrade, composition and cleanup outputs are `db/task-22-followup-final-*`. Earlier direct and composition executions each passed 45/45 and are retained as diagnostic evidence; self-review then made a small reset-order/role-claim cleanup, so the exclusive clone was recreated from the same immutable template and the final suite was rerun. A first metadata capture failed on a query alias in `ORDER BY` before migration; its stdout/stderr/exit are retained as `pre-attempt`, the evidence query was fixed, and the successful pre/post captures followed. Every invocation retains stdout, stderr and exit files. The final clone cleanup confirmed zero sessions before `dropdb`, successful drop, and zero catalog presence afterward (`pre=0 drop=0 post=0`). `git diff --check` passed.

The raw artifacts and their exact commands are represented by `db/task-22-followup-metadata.sql`, `db/task-22-followup-cleanup.sql`, and the `db/task-22-followup-*.stdout.log`, `.stderr.log`, and `.exit.txt` files. This is a selected local source upgrade on PostgreSQL 16.15. Fresh all-history replay, deployed definition/ACL/trigger reconciliation, and final coverage or 80% gates remain D0/release work; this follow-up does not establish production equivalence or deployment readiness.
