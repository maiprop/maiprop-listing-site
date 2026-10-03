# Task 13 — private admin predicate NULL, local reproduction and repair

2026-10-03. Base `8017bc3f6bb792236f9d9551de2a46c4a34971f9`. Local PostgreSQL 16.15 over the Unix socket only; no hosted database, HTTP bearer token, or deployment was used. The browser-equivalent calls used `SET LOCAL ROLE authenticated` with a matching `request.jwt.claim.sub` on the same backend. The auth identities were created by normal `auth.users` INSERT triggers and all test changes were rolled back.

## Clone admission and installed boundary

Source `maiprop_t12q_20260930_source` was postgres-owned, allowed connections, had zero sessions and zero prepared transactions; target `maiprop_t13_private_20261003_a81f` was absent. Command:

```text
wsl -u postgres -- createdb --template=maiprop_t12q_20260930_source --owner=postgres maiprop_t13_private_20261003_a81f
```

Applied these accepted migrations to the clone only with `wsl -u postgres -- psql -X -v ON_ERROR_STOP=1 -d maiprop_t13_private_20261003_a81f -f <absolute WSL migration path>` in this order. Raw results were `BEGIN / ALTER FUNCTION / ALTER FUNCTION / COMMIT`, `BEGIN / CREATE FUNCTION / COMMIT`, and `BEGIN / CREATE FUNCTION / COMMIT`:

1. `20261003000740_restore_firesale_expiry_audit_context.sql`
2. `20261003003737_preserve_firesale_audit_cascade_on_delete.sql`
3. `20261003010405_make_platform_admin_check_total.sql`

Installed metadata was read before the candidate calls from `pg_proc`, using `pg_get_functiondef`, SHA256 `digest`, ACL, owner, volatility, definer flag, arguments, and search path. SHA256 of exact installed definitions:

| Function | Before and after repair SHA256, unless changed |
| --- | --- |
| `private.has_platform_admin(uuid)` | `0025fdd87abee94a334561e6100ab0e30ba3894be9e40a271f8f020dbb3ea2ae` → `ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce` |
| `private.authoritative_role(uuid)` | `3d9aa1bd94c46f94fedf8e876904c66e4d8ab4ecff13180421ad1d84d24b9a3d` |
| `public.authoritative_role(uuid)` | `82951cbee2725a57a3b76809ade3f1abe24687a7a2d871ce7a953fc8a047b0b9` |
| `private.admin_user_activity_snapshot(integer,integer)` | `6ecc21105a0173d2adcd51f6b039e7043e101c04e493a50aeaf7dc712a94716c` |
| `public.admin_user_activity_snapshot(integer,integer)` | `4ea3f4e35c2ce52e41bc87fb5f3f42e1db236f3b9c7f9e4deefd7a31e419f93c` |
| `private.get_admin_listing_promotion_campaigns_internal()` | `2f4dd529036f20bcbba5f948670c85986f481ad43b959389d1913d0d76e3159a` |
| `public.get_admin_listing_promotion_campaigns()` | `f2b2562d28f3aa79b8ab79a9943da4f5840e3c1b1e22967eb9acc49a1eb03b09` |

The private helper's exact installed pre-repair body was `select private.authoritative_role(_user_id) = 'admin'::public.user_role`, with `_user_id uuid DEFAULT auth.uid()`, SQL, STABLE, SECURITY DEFINER, `search_path=public`, postgres owner, and ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`. The reader returned profile role or NULL and was unchanged. Both public wrappers were SECURITY INVOKER; both private aggregations were SECURITY DEFINER. Installed public and private EXECUTE plus private schema USAGE admitted authenticated. Anon lacked both public RPC EXECUTE grants. All seven listed function bodies except the repaired private helper, and their owner/ACL/security/search path metadata, were unchanged after repair.

## RED: supported public RPC paths

The fixture made one normal-trigger owner admin, a natural pre-onboarding NULL-role actor, a distinct onboarded seller and active owned listing, and an onboarded buyer. No role was manually nulled, no trigger was disabled, and no allocation, session, or provider email was fabricated. The test invoked the two exact public RPCs as the NULL-role authenticated actor. The first complete formatted RED run had 20 planned and 20 executed TAP assertions, with only assertions 9 and 10 failing:

```text
sqlstate | message | target_email | cross_owner_listing
         |         | f            | t
         |         | t            | f
not ok 9 - NULL-role authenticated actor must be denied snapshot
# have: NULL; want: 42501:admin_user_activity_snapshot is restricted to platform admins
not ok 10 - NULL-role authenticated actor must be denied campaign
# have: NULL; want: 42501:platform_admin_required
# Looks like you failed 2 tests of 20
ROLLBACK
```

The snapshot JSON contained `d13-target-seller@example.test` from another `auth.users` identity. The campaign JSON contained listing `d3130002-0000-4000-8000-000000000001` owned by the other seller `d3130001-0000-4000-8000-000000000003`. The campaign row includes admin report fields; this test does not claim every listing field is independently private. The buyer received 42501, the legitimate admin received both exact target records, and anon received 42501 at EXECUTE ACL. The initial draft had a plan-count typo (18 versus 17 assertions); it was corrected before the complete RED run above.

## Repair and GREEN

Controller authorized only the forward private helper body repair after the RED. `20261003013305_make_private_platform_admin_check_total.sql` wraps the *existing private reader comparison* in `COALESCE(..., false)`. Signature/default, language, STABLE, SECURITY DEFINER, search path, owner, ACL, reader, public helper, both wrappers and queries, and all grants remain unchanged. Raw migration result on the clone: `BEGIN / CREATE FUNCTION / COMMIT`.

Replayed with:

```text
wsl -u postgres -- env PGOPTIONS=-cmaiprop.test_disposable_database=maiprop_t13_private_20261003_a81f psql -X -v ON_ERROR_STOP=1 -d maiprop_t13_private_20261003_a81f -f "/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/private_admin_null_report_test.sql"
```

Raw decisive results:

```text
plan: 1..29
ok 4 - private predicate maps natural NULL role to false
ok 9 - private default uses authenticated NULL-role subject
ok 10 - private predicate admits admin
ok 11 - private predicate denies buyer
ok 12 - private predicate denies missing identity
ok 13 - private predicate denies NULL identity
ok 14 - NULL-role actor retains legitimate owner profile read
ok 15 - NULL-role actor cannot read another profile through RLS
sqlstate | message                                                       | target_email | cross_owner_listing
42501    | platform_admin_required                                       | f            | f
42501    | admin_user_activity_snapshot is restricted to platform admins | f            | f
ok 16 - NULL-role authenticated actor must be denied snapshot
ok 17 - NULL-role authenticated actor must be denied campaign
ok 18 - buyer snapshot denied
ok 19 - buyer campaign denied
ok 20 - legitimate admin snapshot succeeds
ok 21 - legitimate admin campaign succeeds
ok 22 - legitimate admin snapshot returns exact other-user email
ok 23 - legitimate admin campaign returns exact other-owner listing
ok 24 - authenticated without subject denies snapshot
ok 25 - authenticated without subject denies campaign
ok 26 - anon snapshot denied by ACL
ok 27 - anon campaign denied by ACL
ok 28 - all report attempts preserve complete inspected user, profile, listing, event and campaign state
ok 29 - normal triggers remain active
finish: (0 rows)
ROLLBACK
```

The disposable guard requires matching database GUC, postgres ownership, local socket, origin replication role, and excludes protected source/system names. After rollback, fixture auth users/profiles/listings and prepared transactions counted `0|0|0|0`; `session_replication_role=origin`, socket check true, and the source remained idle with zero sessions. No test temp object persisted in the backend after disconnect. `npm run lint:migrations` returned `[migration-idempotency] OK — 191 new migration(s) inspected, no violations.`

## Bounds

The installed database had 12 public/private functions whose definition referenced the private helper. Two had direct `IF NOT private.has_platform_admin` guards; the snapshot's `IF v_actor IS NULL OR NOT ...` is a third selected guard within the two tested public paths. Installed `pg_policies` contained 76 `USING` and 39 `WITH CHECK` references to the private helper, with zero direct negative-policy matches. The positive RLS terms already treat NULL as non-admission; this migration changes those predicate results to false, but does not claim to repair unrelated RLS paths. Existing open-house negative guards use explicit `NOT COALESCE` and were outside this case. No global test suite, hosted environment, network provider, or deployed API was exercised.
