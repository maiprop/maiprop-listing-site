# Task23 — scoped Open Houses listing boundary repair

Date: 27 September 2026. Base: `f4dc1b05`. Local implementation ready for independent review; no release is authorized or claimed.

## Selected change

One forward migration: `supabase/migrations/20260926224929_repair_open_house_listing_boundary.sql`. It requires the exact reviewed Task18 `private.current_user_owns_listing(uuid)` capability from `20260923193844_durable_new_build_enquiry_replay.sql`. Preflight verifies body MD5, return/argument contract, SQL/STABLE/SECURITY DEFINER, postgres ownership, empty search path, retained anon/authenticated execution and no PUBLIC execution. Task23 adds only service_role execution to that existing predicate. It does not redefine it or introduce a synonymous owner helper.

The migration replaces only the raw-listing clauses in eight existing child policies. Policy commands, roles, own-actor branches, INSERT and DELETE behavior, and UPDATE WITH CHECK remain intact. A separate settings visibility helper preserves active/open-house/non-off-market OR owner visibility. No raw table or schema grants change.

Submit stays invoker with its original signature and ACL. The offer trigger now performs its protected lookup as a constrained definer with non-NULL current actor and explicit owner OR active/non-off-market listing visibility. Accept/reopen retain host equality, signatures, locks, deadline/status/transition checks, atomic rival decisions and pause/reactivation behavior. Acceptance re-reads the offer after acquiring the listing advisory lock; both operations restore their transaction-local guard markers.

The new fixed-column context RPC returns only an owner's associated listing, or an actual requester/bidder's active non-off-market associated listing. It validates input, deduplicates IDs, limits requests to 100, returns ten scalar/settings columns, and uses the stricter settings visibility rule for its exact thirteen-key settings objects. Arbitrary public IDs, organization membership, platform administration and another person's participation grant no context.

`openHouseContextService.ts`, hook/constants changes remove MY and action-lookup raw listing embeds. MY hydration batches/deduplicates IDs, preserves row order and full child rows, retains the existing summary fields, and returns `listings:null` when context is unavailable. Action lookups fail with a handled unavailable/unauthorized error. Existing direct child mutation services and reveal's management-RPC-plus-owner check remain. No unsafe fallback, injected user JWT, duplicate quota logic, new reveal service, or broad catalogue change was added.

The admin panel now uses dedicated fixed eleven-column read/review RPCs. Authority is non-NULL auth.uid() plus authoritative private.has_platform_admin (profile.role), not the legacy flag. The review locks one proof-bearing row, validates decision/reason, compares the exact timestamp including NULL, rejects missing rows and stale versions, changes only POF decision/reason plus automatic updated_at, and returns a real updated row. The panel stores/passes the raw timestamp string/null unchanged. It retains Task21 loading/error/empty/data behavior and resets/gates old rows and rejection dialogs on listing scope changes. Late mutation completion from a different scope cannot update current rows or show success. Whitespace-only document paths are unavailable.

The registration trigger's special branch requires the exact marker, current authoritative admin, valid decision/reason and unchanged other row fields. An executed valid-review failure exposed a PostgreSQL detail: NEW.screening_score is NULL in a BEFORE trigger because it is STORED GENERATED. The comparison normalizes only that generated value to OLD after preflight verifies the exact generation expression (MD5 `30f0bb71baa769956e45f87b9ebcf322`). Its three source fields remain in the whole-row comparison. Five negative probes change each source field/contact/ID field under a matching marker and are rejected. A whole stored-row comparison after review confirms every unrelated column is unchanged. No approval actor/time fields are repurposed.

An actual trigger reproduction showed POF rejection notifications containing `ADMISSION_REASON` despite `POF_REASON` being present. The notification change replaces only that reason reference. Existing actor attribution and delivery architecture are preserved; no exactly-once delivery claim is made.

## Executed evidence

All database calls used PostgreSQL16.15 on the local WSL socket, synthetic fixtures, and actual authenticated/anon/service_role roles for application actions. Node work used the frozen `scripts/project-runtime.mjs` launcher (Node20.20.2); no dependency or runtime changes. Fixtures disable onboarding triggers only for synthetic setup where stated, then restore origin triggers for application operations.

| Proof | Result / saved evidence |
| --- | --- |
| Exact original attended-bidder submit | RED42501 `permission denied for table listings`, unchanged offers/listing/notifications, seven fixture counts zero after rollback; `db/task-23-submit-red.sql/.log` |
| Coupled settings/upsert/child read-update/reveal/raw joins | Eight actual-role RED42501 probes; `db/task-23-coupled-red.sql/.log` |
| Old browser-shaped API calls | Seven PostgREST16.3 HTTP403/42501 responses for settings, children and four old embed/lookup shapes; `db/task-23-http-red.json` |
| Old admin boundary | Reused already completed `task-23-admin-pof-probe.md` and SQL/log/metadata; no invented second outage claim |
| Main role workflow and denials | 83 pgTAP assertions passed on source-derived clone and selected-upgrade clone, each rollback; `db/task-23-green.*` and `db/task-23-selected-green.*` |
| Context/required-field matrix | 20 assertions passed: organization admin exclusion, owner, historical type change, private settings, off-market participant absence, anon policy, six mandatory RSVP fields/consents, past-event denial and unchanged row count; `db/task-23-context-matrix.*` |
| Actual local HTTP upgrade | 28 responses asserted: full profile embed, ten/13/eleven-field JSON contracts, two named-argument submit calls, deadline rejection, host direct reveal, accept A, paused context, reopen, select B, exact-version admin verify/reject, stale40001, unrelated/anon/raw-listing denials; `db/task-23-http-green.json/.log`, final-state JSON |
| Two-session competing acceptance | A held its accepted transaction for2 seconds; B blocked2083ms then failed P0001 `only_revealed_offers_can_be_accepted`. Five final-state assertions: exactly one winner, one rejected rival, complete host decisions, paused listing, one eligible decision notification each. Both stdout/stderr/exit preserved in `db/task-23-race-a.json`/`race-b.json`; cleanup committed zero synthetic users/offers/registrations/notifications |
| Task18 regression |45 replay/returning assertions on both variants;6 source-policy checks and6 captured-PUBLIC-policy checks. Captured anon evaluates the stored policy without private schema usage. Only the old service-helper grant assertion is updated to the explicitly approved Task23 grant; all other45-suite behavior is unchanged |
| Task22 regression |40 quota/duplicate replay/venue/slot/rollback assertions on both variants; existing Task22 trigger/RPC behavior preserved |
| Durable single-backend composition | `supabase/tests/open_house_listing_boundary_test.sql` then Task18 test in one connection:83+20+45 assertions, zero failures, one explicit document-baseline skip. Transactions roll back TAP state and fixtures between groups; `db/task-23-durable-one-backend.*` |
| Client/component proof |83 tests passed across four focused files; `task-23-focused-final.log`. Existing act-environment warnings in the upsert-error test remain; no test failures |
| Static checks |App typecheck, scoped ESLint, git diff --check exit0; `task-23-static-status.json` and final logs |

The core suite records submit→reveal→accept A→paused reopen→select B snapshots of decisions, listing status and notifications. It asserts eight expected offer transition notifications; stale calls add none. It includes direct identity/status guards, requester proof reset/cancellation, POF/attendance/deadline gates, raw listing SELECT/UPDATE denial, null/no-sub/foreign/admin exclusion, invalid context input, missing/stale admin reviews, legacy NULL timestamp review and same-status notification suppression.

The component transport rewrite retains tests for empty results, errors/retry, refresh-to-empty, missing/malformed mutation receipts, verify/reject outcomes and cancellation, signed document helper use, tabs/reasons, nullable dates/amounts and zero amounts, late load results, StrictMode initial load, exact microsecond/null versions, scope-change failure/dialog reset and late mutation completion. No browser automation/full-page acceptance is claimed: these are real component/hook/service executions with mocked transport, supplemented by actual PostgREST requests.

## Definition and privilege comparison

`db/task-23-selected-before-metadata.json`, `source-after-metadata.json`, `selected-after-metadata.json` save effective definitions, MD5s, owners, volatility/security/search paths/ACLs, policies, relation ACLs, schema ACL and storage privileges. Nineteen final routines and eleven Open Houses policies match across the source-derived and selected-upgrade variants. Table/schema ACLs are unchanged. Submit, quota trigger, existing document helper and authoritative role helpers are unchanged. The shared owner's definition is unchanged; only service-role EXECUTE is added. `db/task-23-catalog-comparison.json` records the programmatic assertions.

The selected-upgrade fixture uses the verified Task18 captured-policy setup on its own source-template clone, then selected Task18/22/23 migrations. It is a bounded selected-upgrade fixture, not a captured production database. Both clones derive from `maiprop_replay_current_20260921`; the template was never changed. A new all-history replay under corrected D0 bootstrap has not been executed in Task23.

`task-23-artifact-hashes.json` binds the migration, application and test files. `db/task-23-old-client-constants.ts.txt` is the exact BASE `f4dc1b05` constants source used to identify the old embed contract. This is source binding, not a claim about a deployed bundle.

The global migration-idempotency checker exits1 for three pre-existing violations: Task18's plain CREATE FUNCTION and trigger without DROP, and Task25's plain CREATE FUNCTION. Task23 introduces no reported violation. This is the idempotency checker, not a chronology or deployment success claim. Task23 preflight intentionally rejects unexpected existing boundary interface names.

## Local cleanup and remaining gates

All role/TAP suites rolled back. The separate race committed only synthetic fixtures, then deleted them and asserted zero counts. The HTTP final state was saved, PostgREST PID489 was stopped, and disposable HTTP database `maiprop_t23_http_0927` was dropped. Clean `maiprop_t23_impl_0927` and `maiprop_t23_selected_0927` remain temporarily for independent review, containing the candidate schema and no Task23 synthetic fixtures. No template, hosted database, provider, GitHub, deployment or customer state was changed. Local fake JWT/server config is not included in the commit.

Unmet gates are explicit:

1. Local storage.objects actual-role SELECT fails42501 before RLS because the existing bootstrap lacks its table ACL. The unchanged helper permits the exact owner and rejects a nonowner, but that does not prove the full storage policy or provider signing. `db/task-23-document-acl-block.log` and effective metadata retain this failure. The durable test skips that baseline-dependent check instead of granting access. D0's `task-13-d0-implementation-handoff-20260927.md` identifies the supported pre-replay correction from managed metadata; it is separate work.
2. Fresh all-source replay under corrected D0 managed-default/storage ACLs and the final full-plan acceptance remain pending. Source-derived and selected-upgrade proofs above are not substitutes for that gate.
3. PostgreSQL17.6/deployed-definition equivalence, managed signing/delivery and real-browser full-module acceptance were not executed. Best-effort webhook warnings explicitly state missing local secret; no provider delivery was attempted.
4. Independent review and any review fixes remain pending; no release action was taken.

Old submit/accept/reopen signatures and direct child calls recover through the SQL boundary. Old MY/action raw listing embeds still return403 after the SQL repair; old direct-table admin POF review remains unsupported. Ship the reviewed SQL/API schema before the upgraded frontend. Rolling the client back restores those known limits; SQL rollback reopens the submit defect. Do not restore raw listing grants as a workaround, and never drop the shared Task18 helper with CASCADE.

## Commit hook note

The first commit invoked the existing `.husky/pre-commit` (`node scripts/project-runtime.mjs -- npm run lint`) and failed exit1 on the retained ignored `perf-baseline-source` copy:20 errors and8 warnings, all outside this Task23 application diff. Errors were no-explicit-any in its seed scripts, no-empty-object-type in its old command/textarea components, and ban-ts-comment in its old smoke test. The already scoped ESLint result is exit0. The controller's existing ruling authorizes this scoped commit with per-command `core.hooksPath=NUL`; broad lint was not rerun and its sources were not edited. Raw aligned psql logs intentionally retain output whitespace, so `git diff --cached --check -- src supabase` is the clean implementation check; an all-evidence whitespace check additionally reports log alignment spaces.
