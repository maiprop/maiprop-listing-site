# Task 7 A6a — additive managed listing readers

Implemented locally against base `0110b0fe4c154f4f88f1d3551ca164ead28d99f0` on `codex/project-remediation-20260921`. The forward migration adds only the three final managed readers, their explicit function grants and two cursor indexes. No frontend production source changed. Local proof is green; **A6a and the candidate remain not ready for release** pending independent review, protected staging and the separate acceptance gates.

## Implementation and contract

- `supabase/migrations/20260927003528_restore_managed_listing_readers.sql` was created with the installed Supabase CLI 2.109.0 after checking `migration new --help`. Reader definitions and ACL statements are copied from the final reader section of `20260728093154_align_managed_catalogue_and_promotion_principal.sql`; promotion replacements are excluded.
- Both cursor indexes are created only if absent. Existing same-name objects must be valid, ready, live indexes with the exact expected PostgreSQL definition; mismatch raises an exception. Reapplication passed, and a transactional wrong-index probe failed as intended.
- `public.get_listing_management_catalogue()` and the captured `listing_management_catalogue` view are untouched. The old 123-column representation, ordered image aggregate and settings aggregate remain available. No old RPC overload or caller is removed.
- All three new readers remain `STABLE SECURITY DEFINER`, empty search path, explicit authenticated EXECUTE only; PUBLIC, anon and service_role are revoked. No blanket grants or default-ACL repairs were applied.
- Personal rows require actor ownership **and null organization_id**. Organization rows require `listing:manage`. Captured `private.has_org_permission` grants authoritative administrators organization authority. Thus a new-reader admin sees their own personal rows plus all organization rows, while the legacy admin reader continues seeing other users' personal rows too. No broad admin OR was introduced.

## Two distinct local baselines

### Captured, bounded read surface

`supabase/tests/fixtures/managed_listing_captured_read_surface.sql` constructs a new template0 database `maiprop_t7a_captured_20260927`. It is not an all-source-minus-migrations baseline. Its six tables are profiles, organizations, organization_memberships, listings, listing_images and open_house_settings, plus the captured management view.

Included: captured ordered columns/types/nullability/defaults/generated expressions; all 33 labels in the four required enums; non-FK constraints and FKs within this scope (including auth.users references); captured auth.uid/auth.jwt, location normalization/aliases, auction-tag extraction, private authoritative_role overloads, has_platform_admin and has_org_permission; captured view definition/options; legacy RPC; API-role/PUBLIC schema, table, function and applicable column UPDATE grants. Objects are explicitly revoked before captured grants are restored. RLS remains enabled on the six tables. The fixture requires an explicit matching `maiprop.test_disposable_database` and a local Unix socket, and rejects the shared template/system database names.

Input captures (metadata only, no customer rows):

| Saved input | Capture UTC | SHA-256 |
| --- | --- | --- |
| live-a6-tables.json | 2026-09-21 17:14:45.845 | 4348133518b338ff44345ba97b268dbdc74f4b864478d7d7027ea33dafc0e941 |
| live-a6-routines.json | 2026-09-21 17:14:45.827 | fd94d98aa672e97dddcdcfa48bfc9e3a7a29c176c3331cec1f5e3bd9eb0e9161 |
| live-a6-prerequisites.json | 2026-09-21 17:20:36.640 | 88bd4e2dd726b480ce82ac4cd2edc5a8d6413bce34d45dc84145af5e99a38325 |

Explicit exclusions: all unchanged DML triggers, raw-table RLS policies and unrelated indexes; the projects reference and listings_project_id FK; auth.users provisioning (identity/email stub instead); hosted administrative principals, ownership and PG17 MAINTAIN privilege. No fixture project_id is populated. Auth helper ownership is mapped to local postgres. These omissions do not model listing mutation, account provisioning, billing, archive, notification or project lifecycles. Raw-table RLS behavior is not claimed; these captured postgres-definer readers use explicit actor predicates and bypass table RLS. A6b/c are not covered.

Local API roles match the captured important attributes: authenticated/anon are nonsuperuser, non-BYPASSRLS, inheriting roles; service_role is nonsuperuser/BYPASSRLS. The existing local REST login is NOINHERIT and switches to those roles. Local postgres is superuser+BYPASSRLS; hosted postgres was captured as nonsuperuser+BYPASSRLS. That owner difference and mapping of managed Auth owners are explicit fixture limits, not a hosted permission-equivalence claim. No shared role was created, altered, or password-rotated.

### Source-derived regression baseline

`maiprop_t7a_source_20260927` was cloned from the immutable `maiprop_replay_current_20260921` template. This is separate all-source regression evidence, **not** fresh all-history migration replay or the captured live starting schema. Its existing managed interfaces were replaced by the same final reader bodies and passed the same 52 checks. The shared template was not changed. D0 historical managed defaults and PostgreSQL17 remain separate unfinished work; no grants were patched to conceal those limits.

## Executed proof

Every SQL action ran through WSL Ubuntu PostgreSQL16.15/main on the local socket. The owner seeds synthetic prerequisites with replication triggers disabled only during setup, then restores origin behavior before switching to the actual `authenticated`/`anon` action role. pgTAP observers run in the same transaction; no owner call is presented as an authenticated action.

| Proof | Result |
| --- | --- |
| Missing page RPC on captured baseline | Expected exit 3, undefined function |
| Missing summary RPC on captured baseline | Expected exit 3, undefined function |
| Additive migration and repeat application | Both exit 0 |
| Captured reader SQL suite | 52/52 pgTAP, exit 0 |
| Source-derived reader SQL suite | 52/52 pgTAP, exit 0 |
| Conflicting same-name cursor index | Expected exit 3; explicit mismatch error, transaction rolled back |
| Actual local PostgREST16.3 | 29/29 requests/assertions, exit 0 |
| Actual hooks + QueryClient and focused existing tests | 19/19 tests in 3 files, exit 0 |
| Scoped ESLint | exit 0 |
| Diff whitespace check | passed |

The role fixtures are deliberately distinct: owner (two personal rows plus an organization-owned row they cannot manage), organization viewer, organization member/manager, authoritative admin, outsider and anonymous. New managed counts are 2/0/2/4/0; legacy fixture counts are 4/2/2/7/0. Page, unpaged and summary totals agree; active counts and summed views match authorized rows. HTTP additionally verifies exact returned row IDs, so equal counts cannot disguise a substituted unauthorized row.

Pagination covers identical created_at timestamps with descending UUID ties; first/second/final page; accurate whole-authorized-set total after cursor; empty past-final page; zero/null limit behavior; both half-null cursor failures. HTTP uses the actual parameter names `p_limit`, `p_before_created_at`, `p_before_id`, verifies old/new RPC coexistence and old/new 123-field shape, and reuses an owner's cursor with an outsider JWT without leakage. Anonymous requests are denied by actual role ACLs; service_role summary invocation is also denied. Authenticated-without-subject summary fails with auth_required.

`src/test/useListings.managedSession.test.tsx` mounts useMyListings and useManageableListingSummary with a real QueryClient. Only the auth context value and RPC transport are controlled. It exercises the real transitionQueryIdentity/transitionQueryAuthorization boundary used by AuthContext: a pending owner page is aborted; late owner page/summary completions cannot populate an outsider session; same-user permission fingerprint changes discard the previous organization response; sign-out removes private results and preserves public cache. The summary transport itself does not consume an AbortSignal, but the existing shared boundary cancels/removes its query and prevents late cache/UI writes. These tests found no production defect requiring a frontend edit. This is focused hook/boundary proof, not an end-to-end Auth provider or hosted session/browser proof.

## Commands and retained diagnostics

All Node invocations used `node scripts/project-runtime.mjs -- node ...` (resolved Node20.20.2); dependencies remained frozen. No install/network/provider/GitHub/hosted operation or broad build/coverage run occurred. Existing saved Supabase changelog and historical-default documentation were consulted within the local-only constraint.

- Captured setup/proof: `node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7a-local.mjs baseline`, then `task-7a-tests.mjs` at the same path.
- Source clone: `wsl -d Ubuntu -u postgres -- createdb -T maiprop_replay_current_20260921 maiprop_t7a_source_20260927`; use TASK7A_DATABASE for that exact target and run the durable SQL suite through task-7a-local's SQL wrapper.
- HTTP: `node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7a-http.mjs`. Reuses the existing synthetic local REST login/config secret without printing or rotating it, points only to the captured disposable database on localhost:54347, uses synthetic JWTs, terminates only its recorded backend process, and deletes only its fixture rows.
- Focused frontend: `node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7a-checks.mjs`, running Vitest on useListings.managedSession, identityQueryBoundary and useListings.configuration; ESLint on the new hook test.
- Final metadata/zero counts: `node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task-7a-final.mjs`.

Raw stdout/stderr/exit files remain ignored under `db/task-7a-*`; final metadata includes definitions, owners, ACLs, options, index definitions and runtime role attributes. `task-7a-http-results.json` retains all 29 synthetic responses. Local helper scripts remain ignored working evidence; committed fixture/test SQL is independently runnable without them. To reuse the durable suite in D0, explicitly SET maiprop.test_disposable_database to the exact disposable local socket database name, then execute `supabase/tests/managed_listing_readers_upgrade_test.sql` in that same psql session. It performs its own BEGIN/ROLLBACK. Do not run the captured DDL fixture over a populated source schema.

Failed diagnostics were resolved without application changes: initial generator lacked the fixtures directory; initial source test expected seven total legacy admin rows but the template contained fifteen pre-existing synthetic personal listings (legacy fixture-count assertion is now scoped by fixture IDs); hook public-cache assertion initially used gcTime=0 and lost an unobserved public entry (test uses Infinity); HTTP launch initially treated the postgrest executable as a directory and then reused an absent extensions schema in its extra search path (correct executable and public search path are now explicit). Expected RED and wrong-index errors are retained; source failure and missing-extensions HTTP details remain in separate raw files. These are not erased or claimed as green attempts.

## Cleanup, rollout and self-review

SQL tests roll back. HTTP setup is removed in a finally block; final count across all seven fixture relations is zero. The owned PostgREST process was terminated. The two exact named disposable databases are retained as local review artifacts; neither contains Task7a fixture rows. The source-derived clone still contains the unrelated synthetic rows inherited from its template. No shared template or existing REST role was modified.

Release manifest changes are limited to A6a plannedMigration/localEvidence references and counts. Existing live capability observations, group ready=false, preparation FAIL_CLOSED and candidate ready=false remain unchanged. Deploy reviewed additive SQL before selecting the matching frontend consumers; confirm hosted named-argument contracts and tenant/staging acceptance first. Retain the legacy reader and new interfaces for mixed callers and rollback. No Edge deployment is needed for this group.

Self-review checked: no promotion/billing/archive code copied; exact source reader bodies/ACLs; old view and RPC unchanged; admin personal/organization distinction; no silent index reuse; actual role actions; explicit fixture exclusions; no production frontend edit; no blanket privilege repair; source clone not mislabeled captured/live/fresh replay. Coverage floors, D0 historical defaults, full acceptance, hosted PG17/PostgREST gateway and protected browser gates remain separate. Independent review is next. The controller-authorized per-command core.hooksPath=NUL bypass was used after focused checks, avoiding the known unrelated broad pre-commit artifact lint failure.

Commit: this report and the five scoped deliverables are included in the Task7a implementation commit; its immutable SHA is returned to the controller after commit (a report cannot include its own content-addressed commit ID).
