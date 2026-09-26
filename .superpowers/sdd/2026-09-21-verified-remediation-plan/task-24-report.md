# Task 24 — explicit-actor AI reservations retain spendable credits

Implemented against base `76a15d8a01d6cc3b297db5e7cfa9e350f5193075` on `codex/project-remediation-20260921`. Independent review remains the next gate. No deployment or provider action occurred.

## Change

CLI-created forward migration `20260926233914_restore_ai_reservation_spendable_credits.sql` replaces only `public.reserve_ai_quota_for_user(uuid,text)`. It removes the unused available-credit variable/read and obtains the ceiling from existing `public.get_ai_call_monthly_limit` after the unchanged actor/bucket/UTC-month advisory lock. Base lookup remains for the existing addon flag. Inputs, error envelope, count, insertion/returned id, trigger credit consumption, signature and caller paths are unchanged. No historical migration, grant, other helper, quota row, application/Edge caller, dependency manifest or lockfile changed.

The installed function remains VOLATILE, SECURITY DEFINER, owner postgres, search_path public, ACL `{postgres=X/postgres,service_role=X/postgres}`. The reused helper remains STABLE with the same owner/search path/ACL. Its existing formula is base + available + greatest(current-month used minus base, 0), with the admin sentinel unchanged. Captured relation constraints, triggers and ACLs are identical before/after. Replacement relies on the existing source posture; it does not broaden permissions when replacing the function.

## Local source and RED binding

Only disposable `maiprop_task24_ai_20260927` was created from immutable `maiprop_replay_current_20260921`, using Ubuntu PG16.15/main local socket `/var/run/postgresql:5432` as postgres. No template mutation and no other task clone access. Only the selected forward migration was applied to the source clone, then reapplied successfully for idempotency. The disposable database was dropped after zero-residue verification; catalog verification returns 0.

Historical RED is reused from `task-13-billing-multicredit-probe.md` and its saved SQL/log/metadata. `task-24-source-check.mjs` verifies the pre-upgrade reservation, status and consumption-trigger source MD5s exactly equal that RED metadata. Thus the old denial at call7 with used6/limit6, status still allowed at limit7 and one credit left, is bound to the actual pre-upgrade body rather than inferred from old migration filenames.

`db/task-24-before.json` and `task-24-after.json` capture 35 effective routines, full definitions, raw source MD5s, owners/ACLs, relation constraints/triggers and real limit row. The source checker binds 33 application bodies to migration source; two managed auth shims are recorded but have no application migration. It verifies only the intended reservation body changes and that all captured other routines/ACLs/owners and relations remain unchanged. Matching is normalized, trimmed body substring provenance, not a claim of full DDL lineage for every dependency.

Normalized-body SHA256:

| Routine | SHA256 |
|---|---|
| `reserve_ai_quota_for_user(uuid,text)` | `be53a602ce7d2a3051e5b80a6b2825ee4b2300db4e1105fb10eeb1be0e0c8aa2` |
| `get_ai_call_monthly_limit(uuid,text)` | `ead8ba4519ab88582cce712e973ced3d7fa530dfc05de68787b91b88182a3c04` |

## Focused behavior results

`supabase/tests/ai_reservation_spendable_credits_test.sql`: **33/33 pgTAP assertions**, exit0, no failures. Same backend runs consecutively in default live runtime and explicit test runtime: **33 + 33**, exit0, no duplicate TAP state or temp helper/table left over. No action/identity trigger was disabled.

- Actual SET ROLE service_role with empty subject and role-only claims calls the installed reservation and batch status. An invoker-only temp helper asserts the role and auth context at every scenario. Successful receipts are inserted into a temporary test table; postgres separately verifies every returned id/actor/bucket against persisted usage. This temporary receipt INSERT grant is not an application grant.
- Onboarded free buyer has real base5, normal purchase quantity2 derives credits2. Calls1–5 consume none; calls6 and7 each consume exactly one; call8 denies. Status before/after every action matches ceiling and used count. Both property-valuation and neighbourhood-report reach7, then deny. Repeated exhausted requests preserve every field of all usage and purchase rows. Two paid attempts produce separate reservation ids.
- Real durable investor subscription gives Pro base50 with two below-base requests consuming no credits. Synthetic admin profile has sentinel999999 and no add-on consumption. Unpaid developer is onboarded through the actual developer path (including display name/city), gets base0, can use two purchased credits and then denies. The admin is an explicit postgres fixture INSERT after replacing its normal empty profile, with normal triggers; this is not claimed to be self-onboarding elevation. No force-Pro flag, limit modification or invented plan was used.
- Another actor's usage and credits survive target actions. Another mapped bucket and a consistent opposite-runtime purchase cannot subsidize valuation; the opposite-runtime quantity9 remains unconsumed. The entire contract also passes when active runtime is test.
- Historical state is generated by six normal reservations, including a real trigger-driven consumed credit, then the synthetic purchase and usage timestamps are aged to the previous UTC month. This is a controlled persisted-state fixture, not a time-travel claim. The new month's count starts0, only one purchased credit remains, five base calls and one paid call succeed, then denial. No historical credit reset occurs.
- A successful overage inside a savepoint is rolled back: both usage count and consumed counter restore. This is separately proved from the committed race.
- Null actor, null/blank/oversized bucket envelopes and unknown valid bucket behavior stay intact. Actual anon and authenticated EXECUTE attempts fail with42501. Service/no-sub succeeds.

`supabase/tests/ai_reservation_last_credit_race_test.sql`: **14/14 assertions**, exit0. It refuses any database except the exact disposable local clone; this is a dedicated committed-fixture harness, not a generic shared-baseline test. Two bounded dblink sessions use service/no-sub and normal triggers. A reserves the last credit and holds its transaction; B begins the same RPC. Observer captures A pid465, B pid466, `wait_event_type=Lock`, `wait_event=advisory`, `pg_blocking_pids(B)={465}`. After COMMIT A, B returns monthly_limit_reached/used6/limit6. Exactly one additional usage row and one consumed credit persist; winning receipt matches row; status is exhausted. B rolls back its denial, both sessions disconnect and exact fixture cleanup commits. The final database audit finds zero in seven fixture relations and zero remote sessions, before dropping the clone.

## Commands and retained evidence

All relative paths below use this worktree. WSL SQL paths are the same files mounted under `/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/`. Each final run saves stdout, stderr and exit separately in `db/task-24-<name>.*`; notices containing every quota observation are in stderr.

```text
node scripts/project-runtime.mjs -- npm exec -- supabase migration new restore_ai_reservation_spendable_credits
wsl -d Ubuntu -u postgres -- createdb -h /var/run/postgresql -T maiprop_replay_current_20260921 maiprop_task24_ai_20260927
wsl -d Ubuntu -u postgres -- psql -X -At -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <task-24-metadata.sql>
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <selected migration>
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <ai_reservation_spendable_credits_test.sql>
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <ai_reservation_last_credit_race_test.sql>
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <task-24-shared-backend.sql>
node scripts/project-runtime.mjs -- npm run lint:migrations
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-24-source-check.mjs
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_ai_20260927 -f <task-24-cleanup.sql>
wsl -d Ubuntu -u postgres -- dropdb -h /var/run/postgresql maiprop_task24_ai_20260927
```

The initial selected migration apply exited0 (tool output); its successful reapply has retained `task-24-reapply.*`. Final source checker on **Node v20.20.2** exits0, validates all113 recorded TAP assertions, unchanged metadata and source binding, scoped migration idempotency and chronology. Global migration lint exits1 for three pre-existing violations: `20260923193844_durable_new_build_enquiry_replay.sql` plain CREATE FUNCTION and trigger without preceding DROP, and `20260924130000_restore_viewing_create_visibility.sql` plain CREATE FUNCTION. None refers to this new migration; no historical edits were made to suppress them. Known broad precommit lint was not rerun; scoped commit uses the controller-approved per-command hooks override.

## Preserved failures and honest limits

Fixture attempts1–3 respectively hit guarded direct role change, missing explicit enum cast, and missing required developer display-name/city. Attempt4 exposed the incorrect admin fixture assumption and D0's service direct-table SELECT restriction; these rolled back. Attempt5 passed the then28 assertions. The final fixture uses real onboarding, explicit admin setup and privileged observation, with no application grants. `task-24-observer-acl.*` separately preserves the actual direct SELECT denial (exit1) so this local bootstrap limitation is not hidden or made a portable test requirement. Initial race attempt had13 passing checks and a stale pg_stat_activity snapshot causing a cleanup observer false failure; fixtures still cleaned. Final bounded observer clears its statistics snapshot and proves0 sessions.

Tooling deviation: an initial evidence-script invocation via `npm exec -- node` emitted an install warning for `node@22.23.3` and may have fetched npm cache content, contrary to the no-install constraint. That invocation completed, but the npm-exec-node workflow was not repeated; its stdout/stderr/exit are preserved as `task-24-source-check-attempt1.*`. No package.json/lockfile tracked diff changed and no cache cleanup was attempted. All accepted source checks were rerun using the project wrapper's direct `-- node` path, asserted Node20 and recorded v20.20.2. No dependency manifest was modified.

D0 managed-default ACL bootstrap remains unresolved. This proves local PG16.15 selected forward upgrade and concurrency, not hosted PG17.6 parity, production rollout, actual payment/provider completion, or global clean replay. No coverage run or exclusions were added; separate Edge>=80%, executable PL/pgSQL>=80% and frontend floors remain later gates. Remote dblink work is not main-backend coverage. Future deployment must preflight current reservation/helper definitions, owner/ACL and dependencies. Reverting the function would restore premature denial; rollback must never delete usage or refund consumed credits.

## Fix1 — explicit disposable target and race-to-contract composition

Addresses the P2 in `task-24-independent-review-20260927.md`, against base `a2905aa2581abe52b9764453db010fdb97bc1114`. Only the race harness guard changes; the runtime migration and ordinary33 suite are unchanged, so their original source/ACL/runtime evidence is reused. The old hardcoded-target behavior described above is superseded by this paragraph; all original outputs remain intact.

The controlling runner must first issue `SET maiprop.test_disposable_database='<its exact authorized disposable database>';` in the same backend. The guard uses `current_setting(...,true)` and requires nonempty exact equality with `current_database()`; there is no default, prefix-based acceptance or self-derived expected name. Missing/mismatch abort before extension creation, BEGIN, fixture insertion or commit. The existing local Unix socket, normal-origin triggers and collision safeguards remain. Known shared/bootstrap targets (`postgres`, `template0`, `template1`, `maiprop_replay_current_20260921`) are rejected even if explicitly named. This setting is an explicit runner assertion that its named target is disposable, not permission to run on arbitrary shared databases; D0 must supply its own authorized exact target. Bounded two-session mechanics and exact cleanup are unchanged.

Created only `maiprop_task24_fix1_20260927` from the immutable source template, applied only the already reviewed Task24 migration, then ran these focused checks on local PG16.15:

- Missing setting: psql exit3 at the guard; no BEGIN/INSERT/CREATE/COMMIT in stdout.
- Wrong setting (`maiprop_task24_fix1_wrong_20260927` while connected to the authorized fix1 clone): same exit3 before writes. A separate observer audit after these failures records zero across all seven fixture relations and zero remote sessions.
- Explicit correct setting: `task-24-fix1-composition.sql` runs the race14 then ordinary33 in one psql process/backend **pid455**, with the same pid printed before, between and after. **47/47 assertions pass, exit0**, plans1..14 then1..33, no TAP failure. A pid458 holds the admitted last credit, B pid459 demonstrably waits `Lock/advisory` with blocker `{458}`, then A commits and B denies. Assertions between suites confirm no temporary/TAP relations or dblink connections; final assertions confirm0 temp/TAP relations,0 temp helpers and0 dblink connections. The final audit records0 across seven fixture relations and0 remote sessions.
- Dropped only the fix1 clone (exit0); catalog check returns0 (exit0). No template, other clone, application grants, source runtime bodies, dependencies or hosted services changed. No npm/install invocation or broad suite was run during fix1.

Exact command forms (working directory is this worktree; `<mounted-root>` is `/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site`):

```text
wsl -d Ubuntu -u postgres -- createdb -h /var/run/postgresql -T maiprop_replay_current_20260921 maiprop_task24_fix1_20260927
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_fix1_20260927 -f <mounted-root>/supabase/migrations/20260926233914_restore_ai_reservation_spendable_credits.sql
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_fix1_20260927 -f <mounted-root>/supabase/tests/ai_reservation_last_credit_race_test.sql
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_fix1_20260927 -f <mounted-root>/.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-24-fix1-wrong.sql
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_fix1_20260927 -f <mounted-root>/.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-24-cleanup.sql
wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -d maiprop_task24_fix1_20260927 -f <mounted-root>/.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-24-fix1-composition.sql
wsl -d Ubuntu -u postgres -- dropdb -h /var/run/postgresql maiprop_task24_fix1_20260927
wsl -d Ubuntu -u postgres -- psql -X -At -h /var/run/postgresql -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='maiprop_task24_fix1_20260927';"
```

Every command has retained `db/task-24-fix1-<create|apply|missing|wrong|rejected-residue|composition|dropdb|dropdb-verify>.stdout/.stderr/.exit`. A separate output validator checked expected exit3/no write commands for both guards, exit0/no TAP failures and47 assertions for composition (`task-24-fix1-checks.stdout`). Raw psql whitespace is retained; scoped source diff checking excludes raw stdout. Independent rereview remains next; D0 and final coverage/release limitations above are unchanged.
