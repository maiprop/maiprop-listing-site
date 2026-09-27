# Task 7c — additive role-switch compatibility bridge

Implemented on `codex/project-remediation-20260921`, base `83ad746a2a5ebe11021a417a19f88213504b4436`, using the adopted `task-7c-design.md` Design B and corrected fixture handoff. **Local implementation/proof complete; release and provider execution remain blocked by the explicit activation gates below.** No deployment, hosted application API, provider, email, customer-data, scheduler activation, dependency installation, lockfile, GitHub, or workflow mutation occurred.

## Changes

- CLI-created `supabase/migrations/20260927013928_restore_role_switch_compatibility_bridge.sql` adds the owner-only singleton with strict enrollment/reconciliation false and legacy begin true. An invariant prohibits simultaneous strict and legacy admission. Missing controls fail closed. Reapply preserves operator values; existing column/default/check, history/default, FK and index definitions are checked, rather than silently accepted or rewritten. New validity checks/FK remain NOT VALID; existing source-valid checks/indexes survive. Index creation uses source's 128 MiB threshold, NOWAIT table locks, and migration lock/statement limits; larger absent indexes require separately reviewed online prebuild.
- Old record6, begin1 and complete6 names/arguments/defaults/results remain service-only. Captured record6 INSERT semantics are retained. Private legacy begin/completion bodies are pinned from saved definitions, never copied from the target public functions. Strict5/begin2 coexist. No historical normalization, backfill, old-overload drop, cron install/alter, or provider lane was copied.
- New monotonic `profiles.role_switch_audit_required` defaults false. A SECURITY INVOKER trigger rejects direct API-role INSERT/UPDATE of marker/binding and every true-to-false transition, including owner DML. Owner-held bridge functions can enroll. Existing profile guard/GUC mechanisms remain intact. Authenticated column UPDATE grants exclude new fields.
- Record locks the profile, checks identity/source/destination/kind, rejects legacy UUID collisions and unresolved partial-baseline inference, then creates intent and enrollment together. Closed enrollment permits exact admitted retries but denies new UUIDs even for enrolled actors. Begin2 cannot enroll an unbound actor directly. Existing valid bound/marker-false rows remain strict and gain the marker only through successful explicit operations.
- Finalization remains SECURITY INVOKER, service-only, with profile-first locking and worker-token exclusion. A test exposed the original source routine's ability to overwrite finalized counts on same-outcome replay; exact finalized retries now return without changing facts, and conflicting finalized facts fail. Gate closure does not block admitted finalization or worker release/settlement.
- Claim and private invoker return before provider/Vault/net work while reconciliation is disabled. No scheduler changes. Source SKIP LOCKED, lease, stale-token, retry budget and settlement rules remain.
- Both completion interfaces delegate to one private transaction helper. It locks profile then professional before audit access, narrowly dispatches genuine unbound legacy-in-progress completion, and otherwise uses the strict helper. It validates optional JSON keys/types/required fields/lengths/category in SQL, upserts only actor-owned approved professional fields, and completes role/archival/projections atomically. The new distinct RPC is `complete_onboarding_role_with_profile_for_user(uuid,user_role,text,text,text,text,jsonb) RETURNS jsonb` with `professionalId` UUID/null. Existing complete6 remains void with its three defaults.
- `complete-onboarding-role/index.ts` retains the validated HTTP contract/contact requirements, verified JWT actor, fallback display/city, optional profile for nonprofessional roles, response and post-success audit event. It now makes one atomic completion RPC instead of a separate professional upsert. No extra actor is read from the body. Log/begin/worker production modules are unchanged.
- Added focused SQL/Edge regression fixtures and capability evidence, leaving candidate/group readiness false. Adapted the existing source-specific 27-check suite only to require an explicit disposable local database and select synthetic reconciliation inside its existing rolled-back transaction.

## Baseline construction and limits

### Independently reconstructed saved captured baseline

`supabase/tests/fixtures/role_switch_captured_mutation_surface.sql` builds an empty template0 database from saved relation/type/routine/trigger metadata, not by subtracting migrations from a source clone. It includes the captured profiles/history/professionals and bounded transitive archive/cleanup relations, actual archive/unarchive/cleanup bodies, three professional guards/notification triggers, profile guards and `profiles_public` projection, plus captured profile RLS and column grants. The old profile has no binding/marker; old history has no strict billing columns. Captured schema/table/function ACLs are explicit. The final committed fixture and final migration were replayed independently into `maiprop_t7c_captured_verify_20260927`, then passed the same 119 checks. Development proof used `maiprop_t7c_captured_20260927`.

Fixture boundaries: no customer rows; seven omitted auth/users/add-on/user-role provisioning trigger bodies remain omitted, and synthetic identity setup alone uses replication-role bypass. Normal triggers are restored before every tested role/professional mutation. The omitted outbound open-house notification is an explicit fail-if-called stub, as is `net.http_post`. Auth helpers use captured GUC-based definitions; managed auth provisioning, Vault/net/cron internals and outbound delivery are not emulated. Other raw-table RLS policies are omitted; only the captured profiles policies used by actual authenticated write probes are installed. Service/owner role mutations do not claim raw-table tenant-policy coverage. PostgreSQL17 MAINTAIN is omitted on PG16. Local postgres is superuser+BYPASSRLS, whereas captured managed postgres was nonsuperuser+BYPASSRLS; that is a disclosed equivalence limit.

Pinned input SHA256 checks passed:

| File | SHA256 |
| --- | --- |
| live-a6-routines.json | fd94d98aa672e97dddcdcfa48bfc9e3a7a29c176c3331cec1f5e3bd9eb0e9161 |
| live-a6-tables.json | 4348133518b338ff44345ba97b268dbdc74f4b864478d7d7027ea33dafc0e941 |
| live-a6-mutation-routines.json | 12b1a82c5ade55357067ed7d911d13d20b27366c562cc410c419f408be562f54 |
| live-a6-triggers.json | 34adb8e36d13671d15a0d6502a9ae24245e0824cf32b0f09338afa914f6a022f |
| live-a6-mutation-tables.json | 861770a69641c7163cd670f58a4657ead95b86e0a915b41634ef5f378d0ea34c |

The three legacy definition-string hashes were asserted before composition: record6 `be8af5ae31ce3bbce19d3d92e652d387b41b48fe99fa01529998ec2327fffce8`; begin1 `4cb36a24eff5ce7142edb3e014cc35326c6e0f63d6ae5e272f098f2b6e3014a6`; complete6 `d78f0b0cd8f5f1145addacc5e83c39e5223f2188e902c7aedbdf0d54e4f6f016`. Capture timestamp is 2026-09-21 17:14:45Z. Supporting saved inputs are live-a6-prerequisites, mutation-types-context, mutation-tables-transitive, mutation-reference-identities, mutation-managed-objects and mutation routine/member-helper captures enumerated by the fixture generator. They supply definitions and identities only.

### Source-derived regression, explicitly not fresh D0

`maiprop_t7c_source_20260927` is cloned from immutable `maiprop_replay_current_20260921`; the shared template was never changed. Only this task's migration was applied. No Task18/23 prerequisite migration was required by reached role/profile/professional paths, and their broader current-HEAD behavior is not claimed. Source's additional updated_at triggers remained enabled.

The template lacks historical managed service table grants. Original source-only proof failed at invoker finalization; the retained final source-only diagnostic has 11 failures of 119, including expected downstream failures and direct service marker probes denied at table ACL instead of trigger. This is not hidden as a runtime fix. `role_switch_source_captured_acl_simulation.sql` grants, **inside the proof transaction only**, service_role SELECT/UPDATE on profiles/history plus profiles INSERT for the INSERT guard probe, all subsets of captured service `arwdDxtm`. It changes no anon/authenticated grants. The 119-check proof then passes and ROLLBACK restores the template ACLs exactly:

| Relation | Template and final post-proof ACL | Simulated service rights |
| --- | --- | --- |
| profiles | postgres=arwdDxt; authenticated=ar; service_role absent | SELECT, UPDATE, INSERT |
| role_switch_history | postgres=arwdDxt; authenticated=r; anon=r; service_role absent | SELECT, UPDATE |

An initial broader diagnostic grant simulation was explicitly undone to these original ACLs before the final rollback-only runs. No application migration repairs ACLs. Final metadata and the one-backend composition assertion confirm service rights are absent again. The full historical managed-default repair and fresh all-history source replay remain the separate D0 gate.

`maiprop_t7c_source_prebound_20260927`, another untouched-template clone, was seeded with a finalized bound profile **before** applying the migration (marker column confirmed absent). Four checks prove the migration preserves the old binding with marker=false, closed-admission complete6 succeeds, successful completion persists marker=true before clearing the binding, and no replacement audit is generated. Its synthetic rows were removed afterward.

## Executed proof

| Check | Result |
| --- | --- |
| New atomic RPC/control absent on captured baseline | expected RED, undefined function/relation |
| Completion consumer regression before implementation | 5 expected failures; 4 existing cases passed |
| Conflicting finalized fact replay before fix | expected RED, no exception; now rejected |
| Captured SQL suite, normal reached triggers/actual API roles | 119/119 |
| Source + explicit rollback-only service ACL simulation | 119/119 |
| Fresh final captured fixture + final migration | 119/119 |
| Pre-migration bound source row preservation | 4/4 |
| Old source suite against closed gate | expected RED, 4/27 failures |
| New119 + adapted old27, one source backend | 146/146; post-proof role/gates/ACLs/fixture cleanup verified |
| Captured local PostgREST16.3 named calls | 19/19 |
| Routine convergence | 16 definitions, exact arguments/defaults/results, owner/ACL/config match across captured/source |
| Competing transactions | 6 races with observed pg_blocking_pids/Lock waits; 2 simultaneous SKIP LOCKED claimers |
| Focused Deno tests | 46 total; final changed-file run 12/12 |
| Unmocked completion entrypoint type check, focused ESLint, migration lint, whitespace | passed |
| Reapply with explicit operator flags | preserved, rolled back |
| Control default, marker default, index and FK definition drift | expected failures, rolled back |

SQL assertions cover old begin/record/completion compatibility and post-fence completion; new admission closed; persisted enrollment; exact owner/source/destination/kind; legacy UUID collision; null validation; pending/failed/foreign/null-destination/missing-finalization bindings; admin lock; first onboarding/same-role replay/unaudited change; professional/developer requirements; malformed JSON; API INSERT/UPDATE guards; helper/service ACLs; returned/existing professional id; upsert failure; after-upsert audit rejection; and an AFTER-profile-trigger failure after real professional archive and public projection effects. That failure restores professional title/ownership/verification/archive state and the profile/projection graph. Injection triggers exist only in rolled-back tests; the real captured chain remains installed.

Worker coverage includes disabled invoker/claims, fresh/stale/wrong-user/wrong-token leases, two claimers, provider attempt budget, gate closure with valid settlement/release, and finalize exclusion. Races observe actual blocked server PIDs before releasing the holder transaction: legacy wins versus strict admission, strict wins versus legacy begin, competing strict intents, finalization versus begin, competing completion destinations, and worker claim versus finalization. Two additional open transactions demonstrate SKIP LOCKED claims distinct audits without stealing a live lease. No elapsed-time-only contention assertion is used.

HTTP evidence is **captured-baseline-only**, not claimed twice: old record6/begin1/complete6 and strict record5/begin2 resolve by exact JSON parameter names, default complete6 returns void/204, new named completion returns JSON id/null, service-role JWT without a user subject can supply its verified actor, malformed profile actor injection is rejected, and actual anon/authenticated calls are denied. Source equivalence is the SQL/metadata evidence above.

Provider tests use real handler/billing/worker code with transport/provider stubs and deny-net. They cover 103 core subscriptions over multiple pages, add-on exclusion, partial failure, response loss after successful period-end cancellation, already-pending recovery, stable exact `role-switch:<audit>:<subscription>` keys, request deadline/late result handling, test/live durable lookup constrained to actor/runtime/livemode, and foreign-owner exclusion. Only existing period-end cancellation updates are admitted by the stub; unexpected provider mutations throw. A valid strict HTTP request whose record RPC rejects closed admission returns 503 before any provider request. Existing malformed-ID tests reject before business/provider work.

## Commands, artifacts and diagnostics

All Node commands used `node scripts/project-runtime.mjs -- node ...`, resolving Node20.20.2. Installed Supabase CLI2.116.0 `migration new --help` and `migration new restore_role_switch_compatibility_bridge` created the filename. Deno2.7.12; PostgreSQL16.15 via WSL Ubuntu local socket `/var/run/postgresql:5432`; PostgREST16.3. No shared login/password/role was changed. Official Supabase function documentation was read; no hosted application execution was used.

Ignored evidence helpers under this report directory: `task-7c-local.mjs baseline|apply|test`, `task-7c-deno.mjs`, `task-7c-http.mjs`, `task-7c-races.mjs`, `task-7c-drift.mjs`, `task-7c-prebound.mjs`, `task-7c-composed-tests.mjs`, `task-7c-final.mjs`, `task-7c-compare.mjs`. Select the exact owned DB with TASK7C_DATABASE. Durable test files do not require these helpers: SET `maiprop.test_disposable_database` to the exact disposable local socket DB in the same backend, then run the SQL test. The source ACL simulation is inserted after BEGIN only for this known deficient template; D0 must establish correct historical defaults rather than treating that simulation as its fix. The old27 suite requires source cron metadata and is not a captured-managed-cron claim.

Raw outputs remain ignored under `db/task-7c-*`, including each DB's `fixture`, `apply`, `test`, `final-routine-metadata`, `final-state`, `source-pristine-acl-red`, `composed119-plus27`, the final-replay RED, drift failures, 19 HTTP responses, individual race transcripts and blocking evidence. `task-7c-edge-red.log`, `task-7c-deno-*.log`, `task-7c-final-changed-edge-tests.log`, `task-7c-admission-durable.log`, `task-7c-production-deno-check.log`, `task-7c-eslint.log`, and `task-7c-routine-convergence.txt` retain focused results. No large raw-log dump is committed.

Deno test invocation: `deno test --cached-only --frozen --node-modules-dir=none --import-map=coverage-import-map.json --allow-env --allow-read --allow-write --deny-net <focused files>` from supabase/functions. Production compilation uses `deno test --no-run --cached-only --frozen --node-modules-dir=none --deny-net complete-onboarding-role/index.ts`; installed `deno check` does not accept cached-only. ESLint lists only the five touched Edge/test files. The repository's exported lintMigration function checks only the new migration. No full suite/build was run.

Resolved diagnostic/setup mistakes were not runtime findings: initial command used the functions directory instead of repo root; a script replacement required literal dollar handling; pgTAP exception overload was corrected to distinguish description from expected error; admin fixture participant_type='admin' violated the legitimate check and was changed to NULL; provider stub environment was completed with explicit runtime/live opt-in while deny-net remained enforced. Source missing-ACL, old27 gate-assumption and finalized-replay RED evidence are retained separately from passing runs.

## Rollout, rollback and self-review

Strict enrollment and reconciliation remain false; candidate/A6c ready=false. The old three deployed bundles remain evidence only: log v78 `7d288ed98b7b391398095f054cef77682ba9e48aabddcd6a15f9f1df7c4af67e`, begin v32 `e64e00b0e3764c1fbc16c2a7d4dd4ab41baba325eb9b1d9c36d2973081bea905`, completion v52 `5e9b100a41d4608cac905f7bdb6ca6e1b86f0606b581019619835118f446b228`.

Release still requires independent review, fresh D0/default-ACL proof, reviewed additive deployment, immutable strict original-slug services, old ingress fence and **actual old-invocation drain evidence**. Closing old begin cannot recall v78 provider cancellation already in flight. No captured execution bound/drain observation exists. Old v52's separate professional upsert remains non-atomic until its invocations drain; the new DB signature cannot retroactively fix it. Post-success audit logging remains a separate event boundary. Null-destination legacy source bindings require explicit reconciliation, not automatic eligibility conversion. Accept an operator/retry recovery posture before strict activation; provider worker/scheduler activation is separately selected and proved.

Rollback closes new enrollment and reconciliation, retains marker/helpers/signatures, and permits admitted settlement/completion. Do not downgrade markers, restore unrestricted old provider HTTP for enrolled actors, rewrite audits as legacy, or reverse cancellations. Gate closure cannot recall dispatched provider requests.

Self-review checked captured helper pinning and interface convergence; no mutable eligibility/backfill/scheduler operations; narrow owner authority rather than nullable-JWT/GUC authority; sticky binding dispatch without exception fallback; profile-first lock order; transactional professional field allowlist; existing strict bindings; exact error paths; actual roles and normal reached trigger effects; scoped source ACL simulation and restoration; immutable dependencies and shared template/roles; no unsupported hosted equivalence claim. Four owned disposable DBs remain local review artifacts, with task synthetic rows removed/rolled back. Independent review follows this scoped commit. The controller-authorized per-command `git -c core.hooksPath=NUL commit` avoids the known unrelated broad artifact lint hook; all focused checks above ran first. The immutable commit SHA is returned to the controller after commit, rather than embedded circularly in this report.

## Independent-review fix round 1 — SQL/HTTP string parity (2026-09-27)

Fix base: `5b368e958b7faea72b1b898e9973bc68e3881f6e`. Read the complete `task-7c-independent-review-20260927.md`; reproduced its sole P2 before changing production SQL. The migration now uses one private `normalize_professional_profile_string(text,integer)` helper for professional title/displayName/city/licenseNumber. It explicitly trims all 25 ECMAScript WhiteSpace/LineTerminator code points, counts supplementary Unicode code points as two UTF-16 units, returns NULL for trimmed-empty optional strings, and raises the existing `22023 invalid_professional_profile` error above the existing 160/160/120/120 limits. The transaction rejects a NULL normalized required title. U+0085, U+180E and U+200B remain content, matching JavaScript. Category, field allowlist, actor binding, old public signatures, HTTP schema/payload and every Edge/provider path remain unchanged.

Added the independently composable, guarded, rollback-only `supabase/tests/role_switch_professional_string_contract_test.sql`. All mutating RPC calls run as actual `service_role` with role-only JWT claims, through the existing public seven-argument RPC and normal reached profile/professional triggers. Its 51 checks cover each of the 25 blank-title trim characters, no insertion from rejected blank titles, full-set trimming around title/city and optional empty-to-NULL normalization, exact supplementary boundaries in each of four fields, mixed one-unit and supplementary overflow in each field, entire persisted professional-row equality after failures, nontrim-character preservation in all fields, and unchanged same-role profile/binding state. Its fixture is a single synthetic actor `7c090000-0000-4000-8000-000000000001`; no control flag is changed. Fixture provisioning alone uses replication role replica; every tested mutation runs after restoring origin.

Executed separately against existing owned captured `maiprop_t7c_captured_20260927` and source `maiprop_t7c_source_20260927` baselines, still with the construction/exclusion limits above. Source inserts only the existing evidenced `role_switch_source_captured_acl_simulation.sql` immediately after BEGIN; those grants roll back with the suite. Initial RED draft had 49 checks/36 failures; completing the individual-codepoint list with U+2009/U+200A produced the definitive pre-fix **51 checks/38 failures on each baseline**, with ROLLBACK. Both diagnostics are retained. After applying the revised migration to each database, the identical definitive suite produced **51/51 GREEN on each baseline**, with ROLLBACK. These are 102 focused assertions, not a new run of the earlier 119/27/146 suites or the named HTTP/provider/race suites.

Exact commands from the worktree root (the scripts below are retained local evidence harnesses, not runtime files):

```powershell
# With TASK7C_DATABASE unset: captured baseline. Repeat commands with:
$env:TASK7C_DATABASE='maiprop_t7c_source_20260927'
# RED was executed before production changes on each baseline:
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7c-fix1.mjs red-complete
# After the SQL fix, on each baseline:
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7c-local.mjs apply
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7c-fix1.mjs green
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7c-fix1-state.mjs
Remove-Item Env:TASK7C_DATABASE
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7c-fix1-static.mjs
```

The SQL runner writes exact input, stdout, stderr and process exit under `db/task-7c-<database>-fix1-string-{red,red-complete,green}.{sql,stdout,stderr,exit}`; apply artifacts are `db/task-7c-<database>-apply.*`; final metadata/state is `db/task-7c-<database>-fix1-final-state.*`. RED psql process exits 0 because pgTAP reports failed assertions; the Node wrapper detects `not ok` and fails as intended. GREEN/reapply/state processes exit 0. Frozen Node was v20.20.2; PostgreSQL remains local 16.15. `db/task-7c-fix1-static.json` records zero scoped migration-idempotency lint violations, the Node runtime's matching 25 trim characters/nontrim exclusions, and actual JS UTF-16 lengths 160/161/120. Both modified SQL routines compiled via full migration application and were executed through the focused actual-service RPC checks. No TypeScript production file changed, so no unchanged Edge type/provider tests were repeated.

New helper metadata matches on both baselines: owner postgres, IMMUTABLE, STRICT, SECURITY INVOKER, `search_path=pg_catalog`, ACL `{postgres=X/postgres}`, definition MD5 `0b3a24806d281fb2a76ba2d9abe1ab79`. Effective EXECUTE is false for anon, authenticated and service_role, with PUBLIC explicitly revoked; the owning completion definer invokes it. Final state on both databases shows controls false/true/false, zero synthetic auth/profile/professional rows, relevant triggers normally enabled, session replication role origin and postgres session with no JWT claims. Source exact restored table ACLs are profiles `{postgres=arwdDxt/postgres,authenticated=ar/postgres}` and history `{postgres=arwdDxt/postgres,anon=r/postgres,authenticated=r/postgres}`: service SELECT/INSERT/UPDATE false on both; anon and authenticated rights match the prior source baseline. Captured retains its original captured table ACLs, including service rights. No durable ACL simulation or application table grant was added.

Self-review: the helper is pure and private; normalization occurs once per field and its exact result is persisted; malformed JSON type checks precede normalization; supplementary boundaries use UTF-16 units rather than UTF-8 bytes or SQL codepoint length; failed RPCs preserve the entire existing row. Scope is the reviewed mismatch only. A6c evidence records these new counts separately and remains ready=false. Independent re-review, fresh all-history D0/default-ACL proof, managed/hosted equivalence and old-invocation drain remain required; this fix does not satisfy those release gates. Scoped commit uses the controller-authorized hook bypass described above; final SHA is returned after commit.
