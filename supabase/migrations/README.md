# Migration conventions

Every migration in this directory has been **applied to production**. Treat
them as immutable: never edit a file once its timestamp has shipped — Supabase
tracks applied migrations by filename (and tooling may verify hashes), so
modifying applied files risks divergence between fresh-DB rebuilds and the
production schema.

## Idempotency rules (enforced by CI)

`scripts/check-migration-idempotency.mjs` runs in CI for any migration whose
14-digit timestamp is **at or after `BASELINE_TIMESTAMP`** in that script
(currently `20260628000000`). Older files are out of scope for the lint by
design.

New migrations **must** use idempotent patterns so re-applies, restores, and
local rebuilds are no-ops on objects that already exist:

| DDL                       | Required pattern                                                          |
| ------------------------- | ------------------------------------------------------------------------- |
| `CREATE TABLE`            | `CREATE TABLE IF NOT EXISTS <name>`                                       |
| `CREATE INDEX`            | `CREATE [UNIQUE] INDEX IF NOT EXISTS <name>`                              |
| `CREATE TRIGGER`          | `DROP TRIGGER IF EXISTS <name> ON <tbl>;` first, **or** `CREATE OR REPLACE TRIGGER` (PG14+) |
| `CREATE POLICY`           | `DROP POLICY IF EXISTS "<name>" ON <tbl>;` first                          |
| `CREATE TYPE` (enum/comp) | Wrap in `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='<name>') THEN CREATE TYPE ... END IF; END $$;` |
| `CREATE FUNCTION`         | `CREATE OR REPLACE FUNCTION ...`                                          |
| `CREATE VIEW`             | `CREATE OR REPLACE VIEW ...` (or `DROP VIEW IF EXISTS` for materialized)  |

For `ALTER TYPE ... ADD VALUE` (Postgres 12+), prefer the built-in
`ADD VALUE IF NOT EXISTS` form — no DO block needed.

## Bumping the baseline

After a clean run where every recent migration satisfies the rules, bump
`BASELINE_TIMESTAMP` in `scripts/check-migration-idempotency.mjs` to the next
unstamped timestamp. This locks in the new floor without touching historical
files.

## Future-dated migration allowlist

Some migration timestamps are later than the current calendar date because they
were already applied to the linked Supabase project before the chronology rule
was tightened. Those versions are recorded in
`scripts/applied-future-migrations.json`.

That file is not permission to add new future-dated migrations. It is a
traceability artifact for already-applied history:

1. Every allowlisted version must still have a source-controlled `.sql` file in
   this directory.
2. New migrations must use the real current UTC timestamp from the operator's
   machine.
3. If a future-dated migration appears locally but not remotely, do not add it
   to the allowlist. Rename it before applying.

## Why historical migrations are exempt

The `migrations-validate` CI job replays every migration file against a fresh
Postgres 15 instance on each push, so we have empirical proof that the
existing series produces a correct schema **on first apply**. Idempotency only
matters for the second apply (restore, branching, local resets), which is why
the lint focuses on the forward-looking baseline rather than rewriting
hundreds of immutable files.
