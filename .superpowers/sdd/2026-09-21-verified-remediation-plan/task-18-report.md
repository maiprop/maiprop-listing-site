# Task 18 implementation report — durable new-build enquiry replay

Date: 23 September 2026

Base: `a8f39bd021f63ec7f9df96cffb03b243428eb425`

Branch: `codex/project-remediation-20260921`

## Result

The new website path opens or reuses the conversation first, then calls the exact seven-argument `submit_new_build_enquiry` RPC. The mounted controller freezes one canonical payload and UUID key through an uncertain response, reuses both on **Retry these details**, and rotates the identity only after a confirmed result or an explicitly confirmed new enquiry. It accepts only one current-scope row with a UUID id, matching listing id and parseable creation time. It never falls back to a raw insert after RPC uncertainty.

The additive migration keeps historical keyless raw inserts available. It adds nullable `submission_key`, ordinary unique `(user_id, submission_key)` identity, an immutable accepted-payload trigger and a SECURITY INVOKER RPC. The RPC binds `p_user_id` to `auth.uid()`, canonicalizes the request, uses `INSERT ... DO NOTHING RETURNING`, then performs a separate actor/key SELECT for replay or conflict. It does not call downstream helpers itself. Only authenticated receives RPC EXECUTE.

The selected migration also creates the adopted exact-owner predicate `private.current_user_owns_listing(uuid)` and alters only one recognized enquiry SELECT policy. Captured `TO PUBLIC`/no-admin and current-source authenticated/private-admin meanings remain distinct. Raw listing privileges, table ACLs, INSERT policy and the absence of UPDATE/DELETE policies remain unchanged. The migration wraps preflight, helper/policy work, identity and RPC creation in one explicit transaction.

## RED and focused frontend proof

The pre-implementation focused card run used:

```powershell
node scripts/project-runtime.mjs -- npm exec vitest run -- src/test/RegisterInterestCard.test.tsx
```

The three new durable-state expectations failed and two retained cases passed: the old card had no uncertain/read-only retry state, explicit new-enquiry confirmation or factual missing-key fallback. The initial targeted page contract run against the old raw-insert callback failed both new RPC expectations: it did not retain a key for response-loss replay and still called the raw table path.

Final focused command:

```powershell
node scripts/project-runtime.mjs -- npm exec vitest run -- src/test/NewBuildDetail.test.tsx src/test/RegisterInterestCard.test.tsx
```

Result: `2` files passed, `38` tests passed, `0` failed. The amended cases cover conversation-before-RPC order, no raw fallback, first known rejection, unknown then definite retry retaining uncertainty, empty and malformed receipts, frozen payload across profile changes, synchronous duplicate admission, actor-scope late-result discard, explicit identity rotation, form read-only/retry/new-enquiry controls and the missing-translation factual conversation fallback. Existing page valuation, contact, owner, listing and card definite-retry protections remain green.

## Database proof

All database work used local PostgreSQL `16.15`, normal execution triggers for actions, synthetic identities and actual database roles/JWT claims. The source fixture was a disposable clone of `maiprop_replay_current_20260921`. The selected-upgrade fixture began from the same bounded source clone, verified the named captures described below, replaced only captured-varying raw-table ACL/policies, then applied the exact same migration. These are scoped fixture results, not production or complete live-schema equivalence.

Commands followed this form, with the named disposable database substituted:

```powershell
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -d <database> -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/<file>'
```

| File / operation | Result |
| --- | --- |
| `supabase/migrations/20260923193844_durable_new_build_enquiry_replay.sql` on fresh source | exit 0; explicit `BEGIN` through `COMMIT` |
| `supabase/tests/new_build_enquiry_replay_test.sql` on source | `24/24` |
| same role/replay test on captured-policy upgrade | `24/24` |
| `supabase/tests/new_build_enquiry_replay_race_test.sql` | `10/10`; two actual dblink sessions proved block/commit replay, rollback winner and changed-payload PT409; three physical winners produced three notifications; both connections disconnected and committed synthetic rows were explicitly deleted |
| `supabase/tests/new_build_enquiry_failure_compat_test.sql` | `18/18`; malformed/FK/missing-subject and unhandled-trigger rollback, same-key recovery, old keyless `2 raw / 1 CRM / 1 project / 2 notifications`, caught-warning persistence/no repair, keyed immutability and legacy unrelated update. The original report incorrectly included an unrelated-unique case; that case was absent from this 18-assertion run. |
| `supabase/tests/new_build_enquiry_conversation_first_test.sql` | first run `5/6` because the synthetic auth user omitted the email needed for canonical contact identity; corrected captured-realistic seed then `6/6`: `1 conversation / 1 raw / 1 CRM / 1 project / 1 notification / 0 messages` |
| `supabase/tests/new_build_enquiry_source_policy_test.sql` | `4/4`; name/role/private-admin/exact-owner retained |
| captured setup plus `new_build_enquiry_captured_policy_variant.sql` | setup exit 0 and `6/6`; PUBLIC role/no admin retained, anon NULL-sub evaluation returned zero without adding anon private-schema usage |
| collision setup, migration, then rollback variant | migration failed as intended at the pre-existing trigger after creating earlier objects inside the transaction; `8/8` proved the column, helpers and RPC absent, original source policy restored and collision trigger unchanged |
| final exact migration on newly recreated source and captured-policy clones | both exit 0 through `COMMIT`; prior unchanged green matrices were not repeated |

The initial 24-assertion role matrix proved function grants, direct raw-listing denial, requester replay and changed-notes conflict, mismatched actor rejection, paused-listing owner visibility and owner-as-buyer rejection, outsider isolation, independent same UUID keys and keyed immutability. The original report overstated this run: it did not execute owner-as-self, actual anonymous RPC denial, missing-subject reads, independent email/name/phone/listing conflicts, or the full NULL/absent/off-market/type/org exact-owner helper matrix. Those missing boundaries were added and executed in the 24 September fix round below rather than retroactively relabeling the 24/24 result.

The ordinary current-source collection discovers the self-contained `new_build_enquiry_{replay,replay_race,failure_compat,conversation_first,source_policy}_test.sql` files. The captured-policy and failed-migration assertions are named `*_variant.sql`; each documents and requires its explicit setup entrypoint, so ordinary `*_test.sql` discovery cannot run a captured-only assertion without its fixture. No meaningful proof is excluded.

## Captured-input binding

Authoritative raw capture: `.superpowers/sdd/2026-09-21-verified-remediation-plan/live-task18-enquiry-metadata.json`, captured `2026-09-23T14:34:05.616Z`, SHA-256 `4b694f84be088c2aed2be4d1b8024cf200c331b518c105700cb67898617394c2` (raw transport artifact `1e04077b59b2ee38ffbc794c1437d66ac54848424360b7afc9791cf8907bd4ab`). Reused dependency captures:

- `live-a6-mutation-tables.json` SHA-256 `861770a69641c7163cd670f58a4657ead95b86e0a915b41634ef5f378d0ea34c`
- `live-a6-triggers.json` SHA-256 `34adb8e36d13671d15a0d6502a9ae24245e0824cf32b0f09338afa914f6a022f`
- `live-a6-mutation-routines-side-effects.json` SHA-256 `515789f7a03ce75dbe255ad38c77ab90734a43b5872f5e9d278157123dc7871e`

`new_build_enquiry_captured_upgrade_setup.sql` SHA-256 `2d1ecbeb6ff303a90395c785b2105e4f569bff77fed036399bdb435a1991380f`. Before replacement it binds the 11 raw column names/types/nullability/defaults as MD5 `e1464523ba5ae208b80b5127994643bf`, the three captured constraint names, three captured index names, exactly two raw triggers, the captured trigger-function definitions (`55c21aa1fb29891a96f6645a0fa467c5`, `80fc78a65276167ddeb37f91ab630ac9`) and final downstream helper definitions (`668ec39a33c903c75fa398a5e429462c`, `3c36f5596a586efc974e7a90180ca6a1`, `50cb297c75f1fba7db7cf928632046e1`). The named capture records the constraints as validated and indexes as valid; the source clone retains those definitions unchanged. The setup then replaces the source policy pair with the captured names/roles/expressions and replaces only the raw-table ACL with its PostgreSQL 16 representation.

The source clone supplies unchanged listings/projects/project_leads/leads/notifications/conversations storage and trigger surroundings. The fixture does not claim those entire relations are a freshly captured live clone: it binds the named path's final helper bodies and executes the actual trigger/conversation behavior against them. September 21 dependency captures were not refreshed on September 23. PostgreSQL 16 cannot represent PostgreSQL 17's `MAINTAIN` (`m`) ACL bit, so the fixture uses `arwdDxt` rather than captured `arwdDxtm`; this is the only intentional raw ACL omission and is not described as byte-equivalent. No customer rows or live metadata request was used.

The migration preflight accepts only the two recorded SELECT/INSERT policy pairs, including exact predicate hashes, roles and permissive mode. Unknown helper or policy drift aborts before mutation. Source lineage for the private admin spelling is `20260716211023_restore_browser_safe_admin_policy_predicates.sql`, SHA-256 `2951b30f427603c80a263b71c95b8c419d43bdc2a4d796ebc74caf5620b1327d`.

## Other checks

```powershell
node scripts/project-runtime.mjs -- npm run typecheck
```

The first final run found one stale unused `supabase` import in `NewBuildDetail.tsx`; after removal the same command exited 0.

```powershell
node scripts/project-runtime.mjs -- npm exec eslint -- src/components/new-build/NewBuildInterestController.tsx src/components/new-build/RegisterInterestCard.tsx src/pages/NewBuildDetail.tsx src/test/NewBuildDetail.test.tsx src/test/RegisterInterestCard.test.tsx src/integrations/supabase/types.ts
```

The first scoped run found one unused test render binding at `NewBuildDetail.test.tsx:361`; after removing the binding the same command exited 0 with no findings. Repository-wide `eslint .` was not run because the recorded Task 9 residual benchmark artifact remains outside this task. No build or broad/full suite was run.

The tracked remediation plan now contains pending Tasks 22, 23 and 24 plus the Task 18/23 shared-helper dependency and policy distinction. The verified issue review appends the three dated executed source findings. Task 17's prior evidence now correctly describes `116` as the combined AuthContext + Pricing result.

## Privacy, compatibility and remaining limits

No enquiry key, email, phone, notes or receipt is logged, persisted in browser storage or sent to telemetry. Tests use synthetic values. Full reload/remount, route departure and account switch intentionally abandon the local retry UI; server replay remains durable only when the same key is supplied again. The UI warns users to keep the page open.

Existing downstream CRM/project/notification helpers still catch some failures as warnings. The RPC guarantees one durable raw row and no repeated INSERT trigger effects for a replayed key; it does not guarantee complete downstream delivery or repair a missed warning-caught projection. Conversation creation and enquiry insertion remain separate operations, and no message is invented.

Rollout must apply the additive database contract and refresh its API schema before the new frontend. Old clients retain keyless raw inserts and their historical retry behavior. New clients fail honestly when the RPC is absent or rejected and do not raw-insert as a fallback. No local PostgREST HTTP/schema-cache run, PostgreSQL 17 execution, production comparison, provider call, customer write, deployment, GitHub action, dependency change, build or broad acceptance/coverage claim was made.

All five disposable Task 18 databases and dblink sessions were removed after proof.

## Fix round 1 — 24 September 2026

Fix base: `51f6a9d1d1570f08954bb0ab205260f732cb7f3f`. This section appends the independent-review repairs; every preceding 23 September date, diagnostic and count remains historical evidence.

### I1 — owned success-toast lifetime

RED used the amended page suite. Three cases failed because actor replacement, listing replacement/unmount, and a second same-scope confirmation produced zero calls to dismiss the controller-owned toast:

```powershell
node scripts/project-runtime.mjs -- npm exec vitest run -- src/test/NewBuildDetail.test.tsx src/test/RegisterInterestCard.test.tsx
```

RED result: `4` failed, `38` passed (`3` I1 cases and the I2 card case below). The controller now retains the exact ID returned by its own `toast.success`, dismisses that ID on scope teardown, and dismisses/replaces the prior owned ID when the same scope confirms another enquiry. It never calls an unscoped dismissal and the tests retain an unrelated toast ID as a negative control. A valid same-scope confirmation remains visible until replacement or teardown; late pending completion remains suppressed by the existing mounted/attempt identity guards.

### I2 — confirmed retry resets the real form

The same RED run showed **Buyer One**, phone and message still present after uncertain → confirmed → **Make another enquiry**. `RegisterInterestCard` now clears its controlled fields whenever the current scope becomes confirmed, including controller-driven retry confirmation. It continues to retain the draft for uncertain → explicitly abandoned **Confirm new enquiry**, which is the intentional warning path.

Final real card/controller command:

```powershell
node scripts/project-runtime.mjs -- npm exec vitest run -- src/test/NewBuildDetail.test.tsx src/test/RegisterInterestCard.test.tsx src/test/NewBuildInterestController.test.tsx
```

Result: `3` files, `43/43` tests passed. The integration case drives the actual card through lost response, frozen retry, valid receipt, **Make another enquiry**, empty controls, current edits and a third RPC call. It proves retry reuses the frozen key/conversation, while the new enquiry uses a different key, new notes and a new conversation.

### I3 — fail-closed selected-upgrade preflight

Three clean clones of `maiprop_replay_current_20260921` received one unsupported policy drift each via `supabase/tests/new_build_enquiry_policy_drift_setup.sql`: a catalog-NULL SELECT predicate, catalog-NULL INSERT check, or an extra permissive `FOR ALL` policy. Before the repair, all three exact migrations exited `0` and reached `COMMIT`. Raw RED logs:

- `.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-18-fix1-red-null_select.log`
- `.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-18-fix1-red-null_insert.log`
- `.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-18-fix1-red-extra_all.log`

The preflight now requires the complete raw-table policy set to contain exactly the recognized SELECT and INSERT pair and uses `IS DISTINCT FROM` for predicate hashes, roles, names and permissive mode. No `ALL` policy can remain outside its command-specific counts and a NULL predicate cannot make an `IF` condition unknown.

For each `null_select`, `null_insert` and `extra_all` case, the focused command sequence was:

```powershell
wsl.exe -d Ubuntu -u postgres -- createdb -h /var/run/postgresql -p5432 -T maiprop_replay_current_20260921 maiprop_t18fix_green_<case>
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -v drift_case=<case> -h /var/run/postgresql -p5432 -d maiprop_t18fix_green_<case> -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/new_build_enquiry_policy_drift_setup.sql'
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -p5432 -d maiprop_t18fix_green_<case> -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/migrations/20260923193844_durable_new_build_enquiry_replay.sql'
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -v drift_case=<case> -h /var/run/postgresql -p5432 -d maiprop_t18fix_green_<case> -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/new_build_enquiry_policy_drift_rollback_variant.sql'
```

Each migration now exited `3` at preflight. Each finalizer exited `0` with `7/7`, proving the exact injected policy shape remained and the helper, column, constraint/RPC and identity trigger were absent. GREEN migration/finalizer logs use `task-18-fix1-green-<case>-{migration,finalizer}.log` in the same SDD `db` directory. Fixture hashes are `a8e5606a270a370f106ad197e31e44fc8631d0dae84ab5b176f02fa69bc0fc04` (setup) and `55488e373f2bb79b6ff024e5ed0868d3216418c544157b3692734ca842d09e98` (finalizer).

Fresh supported upgrades were then executed, rather than inferred from the rejection fixtures:

- source setup/migration: exit `0`; expanded replay `42/42`; failure/compatibility `23/23`;
- captured-policy setup and migration: exit `0`; expanded replay `42/42`; captured-policy variant `6/6`.

Raw logs are `task-18-fix1-source-{upgrade,replay,failure}.log` and `task-18-fix1-captured-{setup,upgrade,replay,policy}.log` in the SDD `db` directory.

### I4 — race TAP/session composition

The race test still commits only the seed and remote-session winners needed for real concurrency. Its local plan, receipt temp table and assertions now run inside a transaction rolled back after `finish()`. Both dblink sessions are explicitly disconnected before that rollback, after which the existing committed application-fixture cleanup runs.

This single-backend composition command was executed:

```powershell
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -p5432 -d maiprop_t18fix_source -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/new_build_enquiry_replay_race_test.sql' -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/new_build_enquiry_source_policy_test.sql'
```

Result: exit `0`; race `10/10`, then the ordinary source-policy suite `6/6` in the same backend. Its first two assertions prove no retained dblink connections and zero `e185…`/`e187…` enquiry fixtures before the ordinary policy checks. Raw log: `.superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-18-fix1-race-composition.log`. Remote dblink executions are concurrency proof; they are not claimed as main-backend coverage hits.

### I5 — missing executable boundaries

The expanded replay test runs on both supported policy baselines and now covers actual anonymous RPC denial, authenticated missing-subject empty reads and NULL-actor helper rejection, exact stored receipt identity, independent notes/email/name/phone/listing conflicts, owner-as-self persistence with retained self-notification suppression, and exact ownership for NULL/absent/paused/off-market/type-changed/org-associated inputs. An active org admin who is not `listings.owner_id` is denied by the helper. Both runs passed `42/42`.

The expanded failure suite adds a real partial unique index unrelated to actor/key identity. The RPC surfaces `23505`, preserves the existing row, consumes no key, and the same key succeeds once the injected index is removed. It passed `23/23`. The old `24/24` and `18/18` claims remain identified above as narrower historical runs.

### M1 — captured fixture definition binding

Without a new live read, the captured setup now binds normalized raw constraint definitions and validation (`9471e1aa8cc12f5842d65a261675a0aa`), index definitions/validity (`8e1c12a57e72ba920186af1d89a3e3f3`) and trigger attachment/timing/function/enabled status (`b1793e9c7e2f73dc1cf95e204e58aead`), in addition to the existing columns and function bodies. The amended setup SHA-256 is `2f43bf029a691e2925a58a4b7287f24d62a37c54c6a8bb4b2b4039f8cbfce5cd`; it exited `0` before the captured migration and matrix. This remains the same scoped captured-input upgrade with the documented PostgreSQL 16 `MAINTAIN` omission, not full live-schema equivalence.

### Fix-round self-review and limits

The repair changes no RPC arguments, actor/key identity, invoker security, helper semantics, grants, table ACLs, downstream warning handling, entitlement, schema module, or rollout order. It adds no raw-insert fallback. Only the controller-owned toast ID is dismissed. Drafts are cleared after confirmed persistence and retained only when the user deliberately abandons uncertainty. Policy failures occur before any migration mutation. The race proof remains discoverable and ordinary-suite composable.

Final static checks used the frozen project runtime:

```powershell
node scripts/project-runtime.mjs -- npm run typecheck
node scripts/project-runtime.mjs -- npm exec eslint -- src/components/new-build/NewBuildInterestController.tsx src/components/new-build/RegisterInterestCard.tsx src/test/NewBuildDetail.test.tsx src/test/RegisterInterestCard.test.tsx src/test/NewBuildInterestController.test.tsx
git diff --check
```

TypeScript exited `0`; scoped ESLint exited `0` with no findings. `git diff --check` exited `0`. The repository-wide lint hook was not rerun because the recorded Task 9 residual benchmark artifact is unchanged and outside this task; the scoped commit uses the previously authorized hook bypass only after these focused checks.

No PostgREST/schema-cache, PostgreSQL 17.6, provider, production/customer, browser-after, deployment, GitHub, build, full database suite or coverage claim is added here. All eight `maiprop_t18fix_*` disposable databases were removed after verification; a final catalog query returned zero matching databases. The ignored local raw logs remain at the paths above for scoped review.

## Fix round 2 — 24 September 2026

The residual I5 proof-context finding from the independent fix1 review was closed with test-only corrections. The replay fixture now sets and asserts `is_off_market=true`; its missing-subject SELECT control follows a real saved buyer enquiry and is paired with an authenticated positive read; the exact returned receipt tuple and independent email/name/phone/listing conflicts run under `SET LOCAL ROLE authenticated` with the buyer subject. The drift finalizer wording was narrowed from “byte-for-byte” to the predicate/policy presence it actually checks.

The amended replay ran separately on the source and captured-policy fix-round fixtures:

- source: pgTAP `1..45`, `45/45`, exit `0`, transaction rolled back;
- captured: pgTAP `1..45`, `45/45`, exit `0`, transaction rolled back.

The earlier fix1 `42/42` totals remain historical and are not relabelled. This round changed no runtime code, migration, policy, grant, frontend, or RPC behavior and did not repeat unchanged UI, browser, race, compatibility, HTTP, provider, deployment, GitHub, or coverage checks.
