# Auction-only release execution

The auction recovery implementation was reviewed and merged in PR #672 as
`c32dafe99980c0cc959f98627c6dbed5be9f49a2`. PR CI `35579735862` and original main CI
`35583043089` passed, including browser tests, unchanged performance budgets,
coverage, migration validation and release-safety checks. Local validation passed
4,675 tests, 12 browser performance checks, 132 browser smoke checks and 44
disposable PostgreSQL checks. Another 140 configuration-dependent browser checks
were skipped locally.

## Environment rejection

Release run `35586555501` was rejected before any job step ran. The production
environment used custom branch restrictions whose only entry was policy
`52560309`, branch `__production_disabled__`. GitHub therefore rejected `main`.
No staging or production mutation occurred. The temporary release grant was
expired at `2026-09-21T10:04:08Z`; the branch lock was preserved.

The rejected run remains in the audit trail. It is not rerun or deleted, and the
single-dispatch-per-commit guard remains unchanged. This documentation-only
release commit provides a new control identity for the next original main CI run.
It does not alter application code, migrations, workflow behavior or the reviewed
auction artifact scope.

## Approved execution

The user approved temporarily permitting only `main` through production branch
policy `52560309` for one auction-only release, then restoring
`__production_disabled__` afterward. Obtain successful original CI for this fresh
main commit before dispatch. Keep production locked until the run is ready, then
change only the named branch-policy entry and issue a short-lived grant for the
exact release commit and approved operator.

The release still contains one fixed migration and the reviewed 14-file overlay
on live baseline `5cf9ba49eafdc19d2e8746bc877f33b08bad0dae`. The migration SHA-256 is
`358340988a8acc7042f283a07a5c267a43171d93e5acc5b42171eb1534225a3c`; the prepared
source SHA-256 is `aaf5c6f5ecc1515bd63dd14ecf1fc5bd2506ace035f86ce699a6f236be9e15b5`.
The workflow independently recomputes and verifies its artifact evidence.

Staging must demonstrate browsing, access limits, filtering, pagination, UUID and
provider details, and authenticated save/remove/report actions. Its temporary
fixtures must be removed before production. Production receives the auction
database capability and matching website only after the signed staging proof
passes. Other migrations and Edge Functions remain outside this release.

After the run, restore the original branch policy and expire the grant whether
the release succeeds or fails. Report the actual deployed result and independently
verify the live catalogue before claiming the outage is resolved. This record is
not a claim of successful deployment.
