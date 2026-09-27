# Task 13 — Quick Sale request service boundary

## Result and scope

The fresh D0 replay of 461 current migrations stopped at `post-replay-checks.sql:13` with `browser firesale write privilege remains`. The June 22 migration had revoked direct `INSERT, DELETE`, but `20260707060000_explicit_data_api_grants.sql` inferred an authenticated `INSERT` grant from the surviving RLS insert policy. The D0 evidence is `db/d0-2026-09-27T05-08-53-071Z-cd1dc607/{manifest.json,post-replay-checks.stderr}`. No D0 suites or accepted coverage percentage ran beyond that guard.

The new forward migration `20260927051704_restore_firesale_request_service_boundary.sql` removes `INSERT, DELETE` from `PUBLIC`, `anon`, and `authenticated`, and ensures service `INSERT, DELETE`. It first requires an ordinary RLS-enabled table and the existing service `SELECT` needed by the named `submit-firesale-request` `.insert(...).select("id").single()` path. It checks effective table and column privileges after the edits; the entire correction is one atomic `DO` statement. It does not create a substitute service read grant. The service rollback path uses `.delete().eq("id", ...).eq("user_id", ...)`. Historical migrations, policies, endpoint code, table rows and unrelated grants were untouched.

The durable `supabase/tests/firesale_request_service_boundary_test.sql` uses actual `service_role`, `authenticated`, and `anon` sessions with synthetic seller, other seller and platform-admin identities. Request `INSERT RETURNING`, `DELETE`, admin `UPDATE`, owner read and privacy execute under normal triggers. Only synthetic auth/profile setup uses replica trigger mode. The test has a matching disposable database/socket guard for its Task 13 clone and future D0 databases, explicitly excludes the D0-owned diagnostic `run01`, and rolls back.

## Local target and exact proof

Only PostgreSQL 16 over `/var/run/postgresql`, port 5432, user `postgres`, was used. Before clone creation, a read-only query on `postgres` returned `postgres|postgres|t|0|0|0|postgres` for current user/database, Unix socket, target existence, source sessions, prepared transactions, and source owner. Then:

```text
wsl.exe -d Ubuntu -u postgres -- createdb -h /var/run/postgresql -p 5432 -U postgres -T maiprop_d0_20260927_run01 maiprop_t13_firesale_acl_20260927
```

The D0-owned `maiprop_d0_20260927_run01` and older template were read only. The new clone is an explicitly owned disposable target. Before repair, its ordinary table was owned by `postgres`, RLS enabled, and its exact ACL was `{postgres=arwdDxt/postgres,authenticated=arwDxt/postgres,anon=rwDxt/postgres,service_role=arwdDxt/postgres}`. Effective `authenticated INSERT` was true; both browser roles had `DELETE=false`; service had `SELECT/INSERT/DELETE=true`. The table had zero rows. The current client/service path was checked in `supabase/functions/submit-firesale-request/index.ts:203-232`.

The test was written and run before the migration with:

```text
wsl.exe -d Ubuntu -u postgres -- psql -X -v ON_ERROR_STOP=1 -h /var/run/postgresql -p 5432 -U postgres -d maiprop_t13_firesale_acl_20260927 -c "SET maiprop.test_disposable_database='maiprop_t13_firesale_acl_20260927'" -f '/mnt/c/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/firesale_request_service_boundary_test.sql'
```

**RED:** SQL exit 0, 14 TAP cases, three TAP failures: seller direct insert unexpectedly succeeded (case 4); consequently the unchanged-row check found 2 instead of 1 (case 12) and service rollback left the extra direct row (case 14). All other cases, including service `INSERT RETURNING`, owner read, other-user privacy, admin update and other write denials, passed. These were TAP failures, not SQL errors. The transaction rolled back.

The migration file was created with installed `supabase migration new restore_firesale_request_service_boundary` after `supabase migration new --help`. Applying it to the owned clone with `psql -X -v ON_ERROR_STOP=1 ... -f '<migration>'` returned `DO`, exit 0. Re-running the same test returned **18/18 TAP passing**, SQL exit 0, `ROLLBACK`; zero synthetic users or requests remained. The four added assertions check effective browser table/column write denial, service read/create/delete, and existing authenticated read/update grants. A second migration apply returned `DO`, exit 0, with identical ACL, owner, RLS and object counts (`3` policies, `2` user triggers, `3` constraints, `4` indexes, `0` rows). Final effective matrix: anon/authenticated `INSERT=false`, `DELETE=false`, `SELECT=true`, `UPDATE=true`; service `SELECT/INSERT/DELETE/UPDATE=true`.

For a source-like first-apply proof, a guarded transaction regranted `authenticated INSERT`, captured JSON catalog metadata (owner, RLS flags, complete policy/trigger/constraint/index catalog rows and complete table rows), ran the migration, and compared metadata before rollback. `source_regression=t`, `metadata_preserved=t`, `browser_insert_removed=t`. Policy expression hash stayed `da71a293be0a01951fafcc2476b028d6`. For the captured ACL variant, the named `supabase/tests/fixtures/role_switch_captured_mutation_surface.sql` lines 1075–1078 record browser `SELECT/UPDATE` without `INSERT/DELETE` and service `SELECT/INSERT/DELETE`. On the clone in that state, a guarded transaction captured `relacl`, applied the migration, and returned `captured_acl_noop=t`; it rolled back.

Guard and drift rejection were tested only on the owned clone. Omitting `maiprop.test_disposable_database` from the ordinary SQL test produced SQL exit 1 at its guard before fixtures. In two separate rollback transactions, disabling RLS and removing service `SELECT` each made the migration raise its corresponding preflight exception. `ON_ERROR_ROLLBACK=on` allowed inspection after each SQL error: complete table metadata/ACL and rows were unchanged (`t`, `0`), and each transaction rolled back. These expected SQL errors are separate from the RED TAP failures.

## Exploratory failures and limits

An initial Windows-to-WSL `psql -F '|'` invocation was split at the pipe by shell quoting and ran no SQL; subsequent queries omitted `-F`. A temporary column-level `INSERT(address)` grant did not create a persistent postflight drift case because PostgreSQL table-level `REVOKE INSERT` also revokes corresponding column grants. A temporary `ALTER TABLE ... OWNER TO authenticated` likewise did not produce a remaining effective write privilege after `REVOKE`. Both probes were confined to rollback transactions on the owned clone; neither changed the final clone. PostgreSQL's [REVOKE documentation](https://www.postgresql.org/docs/16/sql-revoke.html) confirms both role privilege aggregation and table-to-column revocation. [Supabase's Data API guide](https://supabase.com/docs/guides/api/securing-your-api) distinguishes grants from RLS. No shared role or password was changed.

The final clone still exists as `maiprop_t13_firesale_acl_20260927` for independent review, owned by `postgres`, socket-only, with the corrected ACL and zero synthetic request/user rows. It is not a template and no connection is left open. No hosted/provider operation, deployment, broad SQL suite, frontend suite, or new D0 replay was run here. This task establishes only the bounded Quick Sale ACL correction; D0 must rerun fresh current source after independent acceptance before any coverage or all-complete claim.
