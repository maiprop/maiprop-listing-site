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
| `supabase/tests/new_build_enquiry_failure_compat_test.sql` | `18/18`; malformed/FK/RLS/unrelated-unique and unhandled-trigger rollback, same-key recovery, old keyless `2 raw / 1 CRM / 1 project / 2 notifications`, caught-warning persistence/no repair, keyed immutability and legacy unrelated update |
| `supabase/tests/new_build_enquiry_conversation_first_test.sql` | first run `5/6` because the synthetic auth user omitted the email needed for canonical contact identity; corrected captured-realistic seed then `6/6`: `1 conversation / 1 raw / 1 CRM / 1 project / 1 notification / 0 messages` |
| `supabase/tests/new_build_enquiry_source_policy_test.sql` | `4/4`; name/role/private-admin/exact-owner retained |
| captured setup plus `new_build_enquiry_captured_policy_variant.sql` | setup exit 0 and `6/6`; PUBLIC role/no admin retained, anon NULL-sub evaluation returned zero without adding anon private-schema usage |
| collision setup, migration, then rollback variant | migration failed as intended at the pre-existing trigger after creating earlier objects inside the transaction; `8/8` proved the column, helpers and RPC absent, original source policy restored and collision trigger unchanged |
| final exact migration on newly recreated source and captured-policy clones | both exit 0 through `COMMIT`; prior unchanged green matrices were not repeated |

The main role matrix distinguishes anon EXECUTE denial, authenticated missing subject, mismatched expected actor, requester, outsider, listing owner and owner-as-self. It proves the exact owner helper for owner/nonowner/NULL/absent id plus paused/off-market/type-changed/org-associated listings, direct raw listing denial, independent same UUID keys for different actors, one receipt, replay identity, payload conflicts and unchanged raw/CRM/project/notification counts.

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
