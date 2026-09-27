# Task 25 — Restore the existing viewing-create policy contract

Date: 24 September 2026

## Result

The authenticated viewing-create policy now checks the existing listing visibility contract through `private.can_request_viewing_for_listing(uuid, uuid)`. The helper is fail-closed, uses the existing active/non-off-market, owner, and organization `listing:view` paths, and does not accept a caller-supplied actor. The outer platform-admin branch, viewing read/update policies, table ACLs, quotas, transitions, client payload, and downstream warning-catching triggers remain unchanged.

## Evidence

The saved D6 SQL-role probe remains the RED evidence: a legitimate under-limit authenticated insert failed with `42501: permission denied for table listings`, with no viewing, lead, or notification row and a clean rollback.

On disposable clone `maiprop_t25_source`, the forward migration and focused matrix passed pgTAP `1..24` with all 24 assertions green. It covered helper grants and NULL behavior, active/paused/off-market eligibility, owner override, active organization `listing:view`, unrelated-actor denial, raw listing id/owner column denial, the existing direct `INSERT ... RETURNING *` shape, exact requester/owner/status persistence, participant read, lead and notification triggers, the unchanged free viewing-limit error, requester spoof denial, and the existing platform-admin outer branch.

The drift guard was exercised on a separate disposable clone by changing `viewings_insert` to an unsupported predicate before applying the migration. The migration failed with `unsupported_viewings_insert_policy`; a follow-up query confirmed the helper was absent and the drifted policy remained unchanged. This proves the preflight is atomic for that drift case.

Focused coupled frontend checks passed: `useViewings`, viewing entitlement migration, viewing status transition, and interaction-modal suites completed **31/31**. App typecheck and `git diff --check` passed. Source binding also confirmed helper owner `postgres`, ACL only for `postgres` and `authenticated`, unchanged `viewings`/`listings` table ACLs, and the intended authenticated-only policy role.

Logs: `db/task-25-source-upgrade.log`, `db/task-25-green-policy.log`, `db/task-25-drift-reject.log`, and `db/task-25-drift-state.log`.

## Files changed

- `supabase/migrations/20260924130000_restore_viewing_create_visibility.sql`
- `supabase/tests/viewing_create_policy_test.sql`

## Limits

This is local PostgreSQL 16.15 source-clone evidence plus focused frontend tests. No local PostgREST round-trip, hosted production query, cached managed-policy upgrade fixture, provider, customer data, deployment, or GitHub state was touched, so no API compatibility or live-parity claim is made. No coverage percentage is claimed. The repository chronology checker still reports the two earlier violations in `20260923193844_durable_new_build_enquiry_replay.sql`; this migration introduces neither. Independent agent rereview remains unavailable because reviewer seats have exhausted their usage window.

## 27 September 2026 followup — independent-review acceptance gaps

Bound to controller BASE `9e08dca302621f45eb5b377a43bda21eeb1951e1`. The preceding September24 section is historical, including its **incorrect checker attribution**: plain CREATE FUNCTION in the original Task25 candidate was an additional idempotency violation. This followup changes that single keyword sequence to CREATE OR REPLACE FUNCTION, retaining exact-signature collision rejection. No helper/policy semantics, frontend transport, grants, entitlements, notification behavior, or unrelated migration were changed. The candidate is unshipped; this is its authorized in-place correction.

The saved D6 RED and original24 assertions retain their original scope. New proof is a separate **64-assertion** suite, `supabase/tests/viewing_create_followup_test.sql`, passing against both the source-derived baseline and the bounded captured policy/ACL baseline. These are clones of immutable local `maiprop_replay_current_20260921`, **not fresh all-history replays**. PostgreSQL16.15/WSL Ubuntu16/main, Node20.20.2 through the project-runtime wrapper and frozen dependencies were used. Only `maiprop_t25_followup_20260927` and `maiprop_t25_source_followup_20260927` were created/mutated/dropped. D0 defaults/storage acceptance remains separate; no blanket grant repair or template modification occurred.

### New SQL proof and context

Viewing INSERT/RETURNING and UPDATE actions execute as actual authenticated or anon roles with normal origin triggers. Each action context is printed. The temporary error-capture function is SECURITY INVOKER and records the actual role, SQLSTATE, message and hint; it neither changes application helpers nor swallows assertion failures. Synthetic identity/listing seeding uses replica mode, as disclosed in the fixture. The separate owner-quota fixture switches two synthetic profile roles under replica mode because direct profile-role updates are independently guarded, then restores origin before every viewing action. Privileged sessions are used only for fixture setup/cleanup, authoritative allowance observations and complete-state snapshots/assertions.

- Actual-role INSERTs cover wrong owner, missing/NULL listing, NULL owner, spoofed requester, no subject, anon, paused/off-market/private outsiders, actual listing owner, active org listing:view member, suspended member and unrelated tenant. Valid privacy cases use unconsumed allowances. Direct raw listing id/owner SELECT remains42501. Effective authenticated schema/EXECUTE prerequisites and false-on-NULL/no-sub helper results are checked.
- **NULL owner reaches an earlier unchanged boundary:** its actual INSERT raises P0001 `viewing_limit_reached`, with `Listing owner has reached viewing limit. Upgrade to Pro for more.` because the authoritative NULL-owner allowance is0. It is not claimed as a42501 RLS proof. The actual authenticated helper separately returns false for NULL expected owner; viewing/lead/notification counts remain unchanged. Controller explicitly accepted preserving this ordering.
- The authoritative admin outer INSERT branch succeeds without RETURNING for a nonparticipant, while ordinary SELECT returns0 and the private-listing helper returns false. This does not create an admin SELECT entitlement.
- Exact success fields include requester/owner/type/scheduled timestamp/note/pending status. The canonical lead assertion binds owner, source, listing context key, requester name/email, message/status/follow-up time. Notification assertions bind exact recipient/title/body/type/link. Requester and owner participant reads and the current scoped reference succeed. Existing participants retain the reference after private/paused state; that relationship does not allow a new request.
- Independent requester exhaustion and owner exhaustion assert the exact P0001 message and distinct hints. The owner case uses authoritative host limit3 and a separate requester limit999. Denied-state viewing/lead/notification counts are unchanged. No month-boundary or concurrent quota claim is made.
- Runtime UPDATEs cover immutable identity, requester host-detail/confirm denial, requester pending cancellation, owner invalid pending-to-completed denial, permitted pending-to-confirmed-to-completed, completed reopen denial, same-status success with unchanged notification counts, and the two expected status notifications to the requester.

Raw final receipts: `db/task-25-followup-contract-final-source2.{sql,stdout,stderr,exit}` and `...contract-final-captured.*`, each1..64/exit0. The generic durable suite requires an explicitly supplied `maiprop.test_disposable_database` exactly equal to current_database and a local Unix socket, excludes template/baseline databases, and rolls all fixtures/TAP/temp state back. `...shared-backend.*` runs new64 then historical24 in backend445, with zero temp/helper/synthetic residue between and after. This composition rerun does not relabel the historical24 as new coverage.

### Source, ACL and migration rejection evidence

`task-25-followup-baselines.mjs` and its raw `db/task-25-followup-*` receipts preserve complete policy sets, table/column ACLs, schema ACLs, helper owner/security/config/ACL and relevant triggers/routine definitions. `...source-full-before.stdout` / `...source-full-after.stdout` include the complete schema/table/column metadata; `...source-full-check.*` verifies schema/table/trigger identity. `...source-binding-final.json` records raw effective body hashes and matching raw migration hashes. Application routines remain source-bound; managed auth stubs remain local bootstrap, not hosted parity.

Six independent drifts fail with exit3 and captured stderr, followed by exact before/after snapshot equality: NULL viewing INSERT predicate; extra overlapping ALL policy (rejected by complete-set guard); wrong INSERT role; wrong command (rejected by overlap count); exact helper collision; authenticated listing-predicate drift. All `...drift-<case>-{before,reject,after}.*` artifacts remain, including untouched colliding helper metadata. No partial helper/policy survives rejection.

Bounded captured fixture uses `live-a6-mutation-tables.json` (2026-09-21T17:32:38.072Z) for viewings and `live-a6-tables.json` (2026-09-21T17:14:45.845Z) for listings. Only those table policy/ACL inputs are reproduced; schema privileges and other objects stay the source-derived baseline. PostgreSQL17 MAINTAIN (`m`) cannot be represented by PostgreSQL16 and is explicitly omitted. Exact grants reproduce those named captured ACLs only; this is not a managed-default grant workaround. `...captured-before.stdout` and `...captured-after.stdout` prove all table/column/schema ACLs and non-INSERT policies unchanged. The same64 role suite passes that fixture.

Focused candidate lint and chronology pass. `...checker.json` records the combined checker categories: **two remaining Task18 idempotency findings, zero chronology findings, zero applied-future-source findings**. Task18 was not edited.

### Local HTTP and frontend proof

Existing local PostgREST16.3 ran on127.0.0.1:54345 against the bounded captured fixture. Config/key were reused without password-changing setup and are excluded from committed evidence. `task-25-followup-http.mjs` binds setup/cleanup to the exact named local socket database. `...http-results.json`, `...http.{stdout,stderr,exit}` and `...http-cleanup.*` show six HTTP checks, exit0:

1. POST viewings?select=* with the current six fields, `Prefer: return=representation` and singular-object Accept returns201 and one pending object with exact values, generated id, and all11 current columns.
2. Owner participant read returns that row.
3. Existing `get_listing_reference_catalogue` with the exact14-column frontend projection returns the scoped reference.
4. The same requester retains the reference after private/paused state.
5. An unrelated new private request returns403/42501.
6. Raw listing id/owner read returns403/42501.

Normal viewing triggers persisted the canonical lead and owner notification, recorded before explicit cleanup. This proves local HTTP representation/reference compatibility; it does not prove external delivery or hosted compatibility. Server was stopped, fixture rows removed, both named databases dropped, and `...drop-verify.stdout` records zero named databases/sessions. Source metadata completion used a new lifecycle of the same exclusively named source clone and dropped it successfully (`...source-full-drop.exit=0`).

Focused current frontend suites (`useViewings`, report/viewing entitlement migration, viewing transition migration, interaction modals) pass **31/31**, captured in `...frontend.*`. They preserve current error/upgrade mapping. No frontend code changed; no broad build, coverage or unrelated suites ran.

### Diagnostic history and self-review

All unsuccessful SQL attempts retain separate stdout/stderr/exit and exact SQL. Attempts1–2 hit an org guard because privileged fixture resets retained the previous JWT subject (attempt2 also followed a failed PowerShell file-write invocation). Attempt3 duplicated the owner membership automatically created by the organization trigger. Attempt4 encountered the protected profile-role update. Attempt5 exposed the genuine NULL-owner quota ordering and a pgTAP savepoint-counter issue; fixture isolation was changed to explicit synthetic cleanup so every final assertion is counted. Attempt6 passed62; the final64 adds exact canonical lead and actual-role NULL-owner-helper assertions.

The initial HTTP preparation accidentally dispatched the imported local runner's `prepare` branch; the collision guard rejected reapplication. Its overwritten intermediate outputs were retained as `...import-diagnostic-*`, the dispatcher was corrected, and a fresh source clone regenerated authoritative before/after receipts. A first server invocation used an extra `/postgrest` path component and failed exit1 before starting; the corrected path started16.3. First HTTP assertion incorrectly expected12 returned columns; the API actually returned the source-defined11. Its201 receipt, failed assertion, and successful cleanup remain in `...http-attempt1-*`; expectation was corrected. Final-check attempt1 had an incorrect relative checker import and was corrected. The first guarded SQL generation used JavaScript replacement-string `$$` collapsing to `$`; `...contract-final-source.*` records that syntax error, corrected with a callback before the final passing run.

Self-review confirms the sole application diff is CREATE OR REPLACE with the preceding collision guard intact. New SQL proof is transactional, role-labelled and reusable in D0's same-backend execution; captured ACL simulation is explicitly bounded; all denied-state/notification claims are local persisted-row claims. No fresh overall coverage, all-source replay, browser, hosted parity, provider, deployment, GitHub, or release approval is claimed. Final80/80 and frontend floors, D0 and selected release gates remain separate. Independent exact-diff review is the next acceptance gate.

Metadata completion also retained a source-full attempt1 import failure (Node eval has no argv[1]); optional dispatch detection was corrected, and source-full before/apply/after/schema-ACL comparisons then passed with exit0. The named clone was dropped after both attempts.

Scoped application/test/script/report whitespace checks pass after whitespace-only SQL cleanup. Raw stdout and failed-attempt SQL retain their original whitespace; a whole-evidence diff whitespace check reports those preserved artifacts. No evidence was reformatted to make that check green.
