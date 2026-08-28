# Catalogue Performance Hotfix Design

**Date:** 2026-08-28

**Production origin:** `https://portal.maiprop.co`

## Objective

Reduce the live property-catalogue delay without using, changing, or validating
Stripe credentials and without deploying the unreleased billing, checkout,
webhook, subscription, Edge Function, or frontend changes currently present on
`main`.

The hotfix changes only the production database catalogue read path. The live
Pages deployment remains `db53d1b9adae41edae93fbeb3e612b42dd8fec0b` until a
separate frontend release is proven safe.

## Diagnosis

The live static shell is already fast. The public catalogue is slow because
the deployed worker calls `get_public_listing_catalogue`, whose current
view-backed implementation times out after several seconds. The repository's
two materialized-catalogue migrations retain a compatibility wrapper with the
same RPC result type while moving reads to indexed immutable catalogue
versions:

- `supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql`
- `supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql`

The complete repository SHA cannot be treated as payment-neutral relative to
the live Pages SHA. That range includes unreleased Stripe checkout,
subscription, billing UI, webhook, runtime-mode, and payment reconciliation
changes. The coordinated full-stack release therefore remains Stripe-gated.

## Release architecture

A dedicated manual workflow applies only the two reviewed migration files.
Its source must be the exact current `main` SHA and its operator must supply the
exact confirmation string. The workflow never receives a Stripe secret and
does not run any Stripe command.

The workflow performs three ordered phases:

1. Validate the exact migration paths and SHA-256 digests, the GitHub actor,
   the current `main` SHA, and the unchanged live Pages marker.
2. Apply or verify the exact migrations on isolated staging, then prove the
   catalogue publication, RPC contracts, anonymous access, and latency budget.
3. Apply the same exact migrations to production, verify migration history and
   database contracts, then collect structured live API samples.

No Cloudflare Pages deployment, Edge Function deployment, Stripe readiness
proof, payment test, or unrelated pending migration is part of this hotfix.

## Migration application

The workflow constructs a temporary Supabase project at runtime. It reads the
target database's existing migration versions, validates that every version is
numeric, creates empty local placeholders for versions already recorded
remotely, and copies only the two approved migration files as pending content.
`supabase db push --db-url` must report a pending set that is a subset of those
two paths. The workflow then applies that set through the Supabase CLI so the
normal `supabase_migrations.schema_migrations` ledger is updated.

The migrations are idempotent. A rerun may find either or both already applied,
but it must still verify the final database contract. Any other pending local
migration, unknown remote history format, hash mismatch, or target mismatch
fails closed before mutation.

## Scope contract

The contract is versioned and stored in a JSON manifest. It binds:

- the fixed live Pages SHA;
- the two exact migration paths;
- each migration's SHA-256 digest;
- the production and staging Supabase project references;
- the release ceiling for a 12-card public catalogue request.

The validator rejects duplicate paths, unknown fields, missing files, digest
mismatches, non-SQL files, and any SQL containing Stripe secret names or writes
to billing/subscription/payment tables. Exact hashes remain the authoritative
content boundary; token checks are defense in depth.

## Database and security invariants

- The snapshot tables remain in `private` with RLS enabled and no direct
  `anon` or `authenticated` table access.
- Public access remains through the reviewed RPC functions only.
- `get_public_listing_catalogue` keeps its public composite result contract so
  the old live worker and frontend remain compatible.
- The publisher and resolver privileges, search paths, grants, retention, and
  cron schedule must match the existing migration tests.
- No payment, billing, subscription, entitlement, profile, Auth, storage, or
  Edge Function object is changed.
- Applied migration files are never rewritten or deleted.

## Verification and budgets

Staging and production must prove:

- both migration versions are recorded;
- a current publication exists and has a positive publication ID;
- the legacy compatibility RPC and typed catalogue RPCs resolve;
- anonymous catalogue requests return HTTP 200 or 206, never 5xx;
- no response includes fixture data;
- 12-card public catalogue API p95 is at most 1.8 seconds cold and 1.0 second
  warm;
- the live Pages marker remains the fixed pre-hotfix SHA;
- the evidence identifies database hotfix SHA and frontend SHA separately.

After deployment, run the complete timing exercise for public navigation,
catalogue readiness, sign-in/sign-out, signup-page readiness, listing wizard
steps, and listing publication where cleanup can be independently proven. The
database hotfix is not described as a full-site performance fix unless every
applicable budget passes.

## Failure handling

- A staging failure stops production.
- A pre-production live-marker or target-identity mismatch stops production.
- The database apply is transactional for each Supabase migration and the
  migration files are idempotent.
- Database/Edge changes are not rolled back through Cloudflare. If a committed
  database change fails post-deploy verification, use an additive reviewed
  forward fix; never delete migration history or rewrite an applied migration.
- Do not dispatch the coordinated full-stack release until Stripe is rotated
  and its payment-sensitive candidate passes the normal live-readiness proof.

## Acceptance

This hotfix is complete only when the exact workflow is merged, its staging and
production phases pass, the two migrations are recorded in production, live
catalogue samples meet the release ceilings, and the before/after measurement
is recorded. Remaining frontend/Auth/listing latency becomes a separately
scoped release rather than justification for deploying payment changes without
Stripe verification.
