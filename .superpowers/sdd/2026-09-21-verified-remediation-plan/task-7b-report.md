# Task7b — disabled project/storage capability bundle

Status: local disabled-bundle preparation complete; independent review pending. Base `40391e744fc0e4d3f318abfd92f5dd52280ce038`, branch `codex/project-remediation-20260921`. No deployment, provider/customer operation, scheduler change, historical object adoption, dependency installation, full build/suite/coverage, or whole-project completion claim.

## Changes and dependency graph

- `supabase/migrations/20260927005313_restore_project_storage_capabilities_disabled.sql`, created by installed Supabase CLI `migration new restore_project_storage_capabilities_disabled`: one transactional forward group, explicit ACLs, final queue/ledger schema, existing-layout checks, and owner-only durable rollout control.
- `src/lib/uploadValidation.ts`: shared `PROJECT_MEDIA_MAX_BYTES=20971520` and seven captured project-media MIME types. Helper, wizard selection and editor use these exports; PDF brochures remain PDF-only and listing-images remains 5 MiB. Generic image/video types are unchanged.
- Focused client tests at the three boundaries; worker tests plus its existing test double add a controlled provider timeout and delayed-request barrier.
- `supabase/tests/fixtures/project_storage_captured_mutation_surface.sql`: independently reconstructs captured application mutation metadata, with explicit exclusions below.
- `supabase/tests/project_storage_disabled_upgrade_test.sql`: 82 rollback-only permission/transaction/lifecycle assertions; explicit matching disposable local socket database marker required. It composes in one psql backend with D0; it is not a D0 bootstrap/default-ACL repair.

Selected dependency order and provenance:

1. Final path validator (`20260726234925`) precedes queue CHECK; service-role EXECUTE remains necessary for direct queue updates. Queue final columns/status/path/URL constraints and indexes come from `20260726222529`, `20260726224342`, and `20260726234925`, compared against the source clone's final catalog.
2. Tenant graph: `private.can_manage_project`, management context and delete (`20260726181627`); compatible final `private.can_manage_listing` (`20260726211816`); base atomic graph (`20260726182846`). They reach existing has_org_permission/has_platform_admin/has_developer_listing_access, profiles/memberships/organizations, project graph and its real DML trigger chain.
3. Service-request predicate/requeue (`20260726233830`), canonical URL helper, registration, stage/settle, claim/committed/prepare, explicit principal quota helpers, strict graph wrapper and media/cover attachments (`20260726234925`). Browser registration -> external upload -> service verification -> registered wrapper -> base graph and job settlement in one transaction. Upload itself is not a DB transaction.
4. Dead-job notification (`20260726224342`) reaches profiles/notifications. Final invocation ledger, reconciliation/prune and invoker (`20260726234925`) reach net response/Vault surfaces only when deliberately enabled. No scheduling block is copied.

No shared `check_listing_limit`, editor publication routine, application raw-table policy, tenant owner guard, or unrelated role/billing helper is replaced. The final Storage SELECT correction below supersedes the initial no-Storage-policy draft. The existing captured owner guards/project unlinking/listing trigger chain runs normally during graph tests. Additional browser child-writer conversion/immutability is outside this selected RPC bundle. Existing function overloads are not dropped; captured one-argument private.create_listing_for_actor remains, and source overloads remain. No unneeded two-argument creation helper is assumed or installed: the selected base graph uses explicit INSERTs.

Registration alone grants authenticated EXECUTE. Public service routines grant service_role only, including explicit prepare permissions that the historical final migration inherited. Private helpers are owner-only except management/path predicates needed by existing service calls/CHECKs and the two Storage SELECT predicates granted to authenticated/service_role. Queue/ledger retain RLS and service CRUD only; rollout control has no API-role access or setter. Default PUBLIC function execution is revoked explicitly. Definitions/argument names/defaults/results/owners/ACLs of all 26 selected routines are byte-identical across the two final baselines (`task-7b-final-functions-*.json`). Table preflight checks column types/nullability/defaults, required exact validated constraints, and valid/ready/live exact indexes; postflight catches same-name indexes skipped during creation. Gate layout is checked. Return-type/argument incompatibilities fail transactionally through CREATE OR REPLACE.

## Disabled contract and preserved semantics

The migration seeds false without overwriting an existing operator value. Missing row also disables execution. Claim returns zero with no lease/attempt changes; prepare returns `lost` before delete authorization; invoker returns NULL before reconciliation, Vault or net. Registration, graph creation, attachment and hold/settlement remain usable. An existing source cron therefore reaches an inert invoker; no cron implementation/schedule is changed or claimed executed.

Fixtures demonstrate zero mutation of a preexisting processing row after gate closure. They temporarily enable the gate only within a rollback-only transaction, or in the two explicitly named disposable race databases, with finally cleanup restoring false. Both retained databases finish disabled. Closing a gate cannot recall a Storage request already authorized/in flight.

Controller ruling on inherited registration: final explicit re-registration intentionally resets same-owner/project completed/dead rows to pending, subject to its existing quota/path checks. Held/processing and foreign paths remain rejected. Strict attachment/cover still require pending and clearly reject completed/dead/held/processing; no automatic catch-and-re-register fallback was added. Tests distinguish these contracts. Direct committed-cover reuse is rejected; the actual current ProjectDetail UI uploads a fresh UUID path before replacing cover, so no existing-cover UI failure/new design was inferred.

## Baselines and limits

Local runtime: PostgreSQL 16.15 (WSL Ubuntu 16/main, Unix socket5432, postgres), Node20.20.2 through project-runtime, installed Supabase CLI2.116.0, Deno2.7.12. Frozen dependencies were not changed.

- `maiprop_t7b_source_20260927` cloned only from immutable `maiprop_replay_current_20260921`. This is a source-derived template clone, NOT new all-history replay, captured live, or PG17 proof. Task7a DBs/template/shared roles were not changed.
- `maiprop_t7b_captured_20260927` built independently from saved live-a6 tables/routines/prerequisites/triggers and live-a6-mutation tables/transitive/reference/routine/type captures. Final fixture was rebuilt cleanly and the migration plus 82 checks passed. It uses captured generated-column helpers, graph constraints/indexes, application trigger bodies/attachments/ACLs, and reached billing/entitlement definitions. No customer rows are present.
- Explicit managed boundaries: auth.users is a captured relation shape seeded synthetically; provisioning triggers on auth/users, addon_purchases and user_roles are excluded. Vault's decrypted view is represented by an empty relation; net.http_post is a throwing no-external-call stub; cron/net/Storage internals and outbound OH notification are not reproduced. Notification trigger keeps its attachment with a labeled no-network body. Ordinary application table policies are not reproduced for browser raw-DML equivalence: tests exercise security-definer selected boundaries and actual role ACLs, not all browser RLS. Captured table grants are bounded API-principal simulations, not blanket grants. PG17 MAINTAIN/managed administrative owners are omitted. All graph FKs resolved in the captured relation closure.
- Synthetic identity/profile/organization seed setup explicitly disables triggers only for those seed rows; graph actions run normal triggers. Fault-injection triggers are additional AFTER INSERT test failures, not substitutes for application triggers. Assertions on private graph rows are labeled privileged observations; actual service/browser calls use SET ROLE plus realistic claims.
- Source clone lacks some historical managed table privileges (known unfinished D0). A fixture initially queried listings as service_role to obtain an argument and got 42501 on source while captured succeeded. Fixed the test to read the fixture ID with a labeled owner observation; no grants were patched. This does NOT establish every old direct service writer against the incomplete source bootstrap.
- Shared quota preservation is verified against exact captured prosrc and template MD5 (`task-7b-shared-quota-preserved.json`). Source's active/principal trigger and captured legacy trigger retain their original differing behavior.

## Evidence and exact commands

All paths below are relative to the repository. Raw logs/harnesses remain reviewable in ignored `.superpowers/sdd/2026-09-21-verified-remediation-plan/` (SDD); only scoped source/tests/report are committed.

Client:

`node scripts/project-runtime.mjs -- node node_modules/vitest/vitest.mjs run src/test/buildingListingUploads.test.ts src/test/ProjectDetail.test.tsx src/test/CreateNewBuildingListing.test.tsx src/test/uploadValidation.test.ts --reporter=dot`

69/69 pass (`task-7b-client-final.log`). Exactly20MiB accepted at helper/wizard/editor, +1 rejected before registration/upload/state selection, allowed video/PDF/GIF, unsupported broader generic MIME, brochure restriction, unchanged listing 5MiB. Initial red matrix had seven genuine boundary failures (`task-7b-client-red.log`). Initial edit left duplicate constants due CRLF-sensitive script replacement; two failures exposed it, corrected, no hidden test weakening (`client-green.log`, `client-green2.log`).

Scoped ESLint command: `node scripts/project-runtime.mjs -- node node_modules/eslint/bin/eslint.js src/lib/uploadValidation.ts src/lib/buildingListingUploads.ts src/pages/CreateNewBuildingListing.tsx src/pages/ProjectDetail.tsx src/test/buildingListingUploads.test.ts src/test/CreateNewBuildingListing.test.tsx src/test/ProjectDetail.test.tsx` — passed (`task-7b-eslint.log`).

From `supabase/functions`:

`deno test --cached-only --frozen --node-modules-dir=none --import-map=coverage-import-map.json --allow-env --allow-read --deny-net create-new-building-listing/index.test.ts project-management/index.test.ts process-storage-cleanup/index.test.ts`

46/46 pass (`task-7b-edge-final.log`): verified actor/request contracts, strict transaction/no fallback, missing/wrong-owner Storage, commit response retry, delete success/failure/ambiguity holds, actor/owner collector behavior, token-scoped worker outcomes; controlled provider timeout after removal and delayed old remove. Provider model assumes idempotent absent deletion and is explicitly not managed Storage evidence. The delayed-delete test reproduces lost replacement content despite token-safe settlement: activation remains blocked. First repo-root Deno command selected inherited root lock/package mismatch and failed frozen validation; proper existing functions config/import-map passed without changing any lock (`task-7b-edge.log`, `edge2.log`).

Database construction:

`wsl -d Ubuntu -u postgres -- createdb -T maiprop_replay_current_20260921 maiprop_t7b_source_20260927`

`wsl -d Ubuntu -u postgres -- createdb maiprop_t7b_captured_20260927`

`wsl -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -d maiprop_t7b_captured_20260927 -c "SET maiprop.test_disposable_database='maiprop_t7b_captured_20260927'" -f <absolute-WSL-repo>/supabase/tests/fixtures/project_storage_captured_mutation_surface.sql -f <absolute-WSL-repo>/supabase/migrations/20260927005313_restore_project_storage_capabilities_disabled.sql`

Final clean rebuild: `task-7b-captured-clean-final.log`. Initial fixture construction failed on omitted unrelated catalogue return type, function-return table dependency ordering and missing pg_trgm operator class. Excluded the unrelated catalogue reader; delayed captured routine creation until after relations; enabled existing locally available pg_trgm extension. Attempts preserved in `task-7b-captured-attempt1..4.log`. No missing application trigger was bypassed to make graph actions pass.

Durable suite execution (one psql session): set matching `maiprop.test_disposable_database`, then `-f supabase/tests/project_storage_disabled_upgrade_test.sql`. Exact local runner:

`node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7b-tests.mjs maiprop_t7b_captured_20260927`

Repeat with `maiprop_t7b_source_20260927`. Runner uses psql -X -At -h /var/run/postgresql -p5432 -v ON_ERROR_STOP=1 and captures stdout/stderr/exit. Final 82/82 each: `task-7b-captured-final3.log`, `task-7b-source-final2.log`, plus `db/task-7b-maiprop_t7b_*.{stdout,stderr,exit}`. Matrix covers actual anon/auth/service ACLs, missing/false gates, five graph-stage rollback, stable-ID retry, personal/org permissions, manager != owner, viewer/outsider/admin context, strict attachment states, hold/cancel/delete/release, wrong/stale/expired leases, token-conditional settlement, explicit registration lifecycle, wrong origin/bucket/traversal and known project-cover reference gap. No full-matrix hosted behavior is inferred.

Genuine races:

`node scripts/project-runtime.mjs -- node <SDD>/task-7b-race.mjs <own-baseline-db>` and `node scripts/project-runtime.mjs -- node <SDD>/task-7b-attach-race.mjs <own-baseline-db>`.

Both run against each named baseline. `task-7b-race-*.json` and `task-7b-attach-race-*.json` retain exact SQL, actual backend blocker graph, stdout/stderr/exit. Claimer one holds row lock while waiting on controller barrier; claimer two skips that row and obtains another. Attacher two is observed blocked on attacher one's backend; first commits, second rejects completed ticket; exactly one media row. No elapsed-time-only race inference. Synthetic race fixtures are removed; control gate is restored false.

`task-7b-final.mjs` applies/repeats final SQL and records routine metadata. `task-7b-conflicts.mjs` proves altered column default and conflicting same-name index cause rollback, and rerun preserves an existing operator gate value; restores correct definitions and false. `task-7b-conflict-results.json` retains exact expected failure exit3/stderr. Test generation once collapsed dollar quotes through JS replacement syntax and failed parsing; fixed test artifact, recorded `task-7b-expanded-attempt1.log`, then 61/77/82-check expansions passed. No failing test output was relabeled as passing.

## Final Storage SELECT dependency correction (controller ruling)

Captured authenticated INSERT/DELETE already allow owner-folder paths in listing-images/project-media, and captured storage.objects grants authenticated SELECT. Captured combined SELECT has no branch for these buckets and uses raw conversation/listing subqueries for unrelated buckets. Installing those exact captured policies in the fixture reproduced actual authenticated SELECT failure: SQLSTATE42501, permission denied for listings. PostgreSQL checks those subquery permissions even for our intended bucket query. An additive owner-only policy could not solve that evaluation dependency; it was not retained.

The controller approved the bounded source-equivalent correction: install only `private.can_select_message_attachment(text)` and `private.can_select_open_house_document(text,text)` from20260726205309, then ALTER the existing combined SELECT policy to use their equivalent verified-actor predicates plus the two owner-folder branches. The helpers have empty search_path, stable SECURITY DEFINER, and only authenticated/service_role EXECUTE. Message access still requires participation; OH host access requires the exact requester/listing registration pair; requester-folder/admin and firesale branches preserve existing semantics. No INSERT/UPDATE/DELETE policy or table ACL changes, overwrite grant, bucket setting, or raw listings grant is added. Only recognized captured/final source combined policy shapes and exact existing helper body/argument/owner/ACL shapes are accepted; drift fails transactionally.

`supabase/tests/project_storage_select_policy_test.sql` is a separate 20-check rollback-only actual-role suite, distinct from the82 ordinary lifecycle checks. It uses only an explicitly documented rollback-only authenticated SELECT grant on storage.objects to simulate captured managed ACL on the deficient source bootstrap; the captured baseline already has that right. It does not broaden raw application SELECT. Own/foreign in both managed buckets, message A/B/nonparticipant/admin without override, OH requester/exact host/mismatched pair/outsider/admin, firesale owner/admin and an unrelated bucket all pass on both baselines.

Command: `node scripts/project-runtime.mjs -- node <SDD>/task-7b-policy-tests.mjs <own-baseline-db>`, using the same one-backend marker/psql discipline. Evidence: `task-7b-policy-captured-final.log`, `task-7b-policy-source.log`, and `db/task-7b-policy-maiprop_t7b_*.{stdout,stderr,exit}`. Final captured fixture + migration rebuilt successfully (`task-7b-captured-storage-clean-final.log`); that fixture includes exact captured Storage policies, labeled managed schema USAGE simulation, and captured function defaults. The first policy fixture attempt misinterpreted NULL ACL on storage.foldername as no EXECUTE. PostgreSQL NULL function ACL means default PUBLIC EXECUTE; copying that captured default fixed the fixture, not production permissions (`task-7b-policy-captured-attempt1/2.log`).

`task-7b-storage-final-metadata.json` proves captured non-SELECT policies unchanged, source entire original Storage policy/ACL set unchanged (its SELECT already had final source behavior), and both final combined SELECT definitions identical. The API ACL mapping omits PG17 MAINTAIN and managed administrator ownership only. `task-7b-policy-drift-results.json` retains expected exit3 for unknown SELECT shape and missing helper EXECUTE, restoration, then successful apply. Final routines metadata now includes26 routines, including these two helpers. No need to repeat unchanged client/Edge suites for this SQL-only amendment.

## Remaining activation/release gates

This is usable disabled capability preparation, not global reclamation or release readiness. All-writer/reference exclusion remains incomplete: projects.cover_image_url is absent from the predicate and its writer is direct; delayed provider deletes outlive leases; organization member uploads can be skipped by owner-based collector; explicit completed/dead re-registration is not a universal attachment ticket. Old v24/v25 writes/cached clients/service scripts/direct browser removals require inventory, conversion/fencing and drain before activation. No historical URL is adopted. See the separate source-only task-7b-writer-inventory-20260927.md, bound to base40391e74; it does not certify current deployed writers or drain.

Actual canonical origin values, Storage object existence/read/remove permissions, managed pg_net response lifecycle and PG17 are separate authorized hosted proofs. Bucket size/MIME settings are not changed. The narrow Storage SELECT repair is included; actual provider remove behavior and all direct deletion writers remain explicit managed/activation gates. Full historical D0 bootstrap replay, real local PostgREST named-call integration, all quota saturation and every historical URL encoding remain outside the bounded checks; routine named arguments are captured and current service mocks pass, not a hosted gateway success claim.

Self-review: historical migrations/old overloads preserved; selected source definitions and explicit ACLs; no shared quota replacement; exact source/captured metadata distinction; no blanket grants/remote calls/dependencies; no schedule; gate false with null invoker; tests use actual roles and normal graph triggers; known races remain honest activation blockers. Independent review follows. Scoped commit uses controller-authorized `git -c core.hooksPath=NUL commit` after focused checks, avoiding the previously recorded unrelated broad precommit artifact-lint failure.

## Fix round 1 — eligible disabled-claim regression

Review base: `9f6e26efe758b9746eef5da63bae672a34807953`. Addresses the important P2 in `task-7b-independent-review-20260927.md`; no runtime/migration change. The P3 rollout-default compatibility check remains explicitly deferred to the controller's final minor-repair ledger.

The lifecycle suite now creates three eligible synthetic queue rows: due pending, expired processing (with existing token), and stale held. It verifies all three are eligible before each call, snapshots complete rows, invokes claim under the actual service_role/JWT context with both a false flag and a missing control row, then compares every row as full JSONB. Resetting only these synthetic rows from the snapshot between cases ensures missing-row proof is independent even when the false-gate call is deliberately broken. Rows are removed before later enabled-lease diagnostics; the entire suite remains BEGIN/ROLLBACK and uses the same explicit disposable-database marker/one-backend D0 composition.

Controlled mutation proof used the exact migration claim definition with only its closed-gate early return removed, inserted inside the suite transaction after the disposable-target guard. No gate was enabled, no provider was invoked, and ROLLBACK restored the original definition. Before/after snapshots compare the exact pg_get_functiondef text, ACL, owner, gate value and total queue count.

Exact commands (repository root):

`node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7b-fix1-proof.mjs maiprop_t7b_captured_20260927`

`node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7b-fix1-proof.mjs maiprop_t7b_source_20260927`

Each command uses `wsl.exe -d Ubuntu -u postgres -- psql -X -At -h /var/run/postgresql -p 5432 -v ON_ERROR_STOP=1 -d <own-baseline-db> -f <generated-local-file>`. The ignored harness requires one of the two exact owned Task7b database names and writes distinct fix-round evidence without overwriting earlier logs.

Both baselines produced exactly eight intended RED failures: closed/missing claim returned three instead of zero, and all three complete-row comparisons failed for each case (assertions10–13,24,27–29). PostgreSQL execution exited0 because pgTAP reports assertion failures as rows; the harness explicitly classified these as expected failing assertions, checked their exact count/labels, and required the plan `1..90`. It did not treat psql exit0 as a test pass.

GREEN against the unmodified current migration: **90/90 lifecycle checks on each baseline**, ending `1..90` and `ROLLBACK`, with no `not ok` results and psql exit0. Exact snapshots matched after RED and GREEN. Both databases remain retained with gate false and no fixture rows committed. This supersedes the initial82-check lifecycle result only; the separate20-check policy suite and prior client/Edge/race results were not rerun or relabeled.

Evidence under SDD:

- `task-7b-fix1-proof.mjs`: exact mutation/restoration/check harness.
- `task-7b-fix1-maiprop_t7b_{captured,source}_20260927-summary.json`: eight failure labels, GREEN90 count, exact-restoration verdict.
- `db/task-7b-fix1-maiprop_t7b_{captured,source}_20260927-{before,red,after-red,green,after-green}.{sql,stdout,stderr,exit}`: complete generated SQL and process results, including original/restored function text and permissions.

Self-review checked eligibility independent of the registered-upload delay, full-row rather than selected-column equality, both missing/false branches, actual service role, independent fixture reset, rollback-only mutation proof and unchanged runtime scope. Scoped diff whitespace check passed; commit remains test/report only.
