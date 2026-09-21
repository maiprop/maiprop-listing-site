# Auction-only recovery implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session, followed by one fresh review.

**Goal:** Prepare a narrowly scoped recovery for the live auction catalogue, without replaying the unrelated migration backlog.

**Architecture:** Restore the three missing auction RPCs through one additive, repeatable forward migration. Preserve the existing account entitlement helper, tables, roles, lead schemas, billing functions and migration records. Validate the migration against a disposable local PostgreSQL database before preparing a coordinated, artifact-bound database and website release.

**Tech stack:** PostgreSQL, Supabase, Cloudflare Pages, TypeScript, Node 20, Vitest.

**Spec:** The user's auctions-only instruction, reaffirmed on 21 September after the full-release database preflight failed. Live diagnosis and existing frontend fixes are documented in `docs/performance/2026-09-21-auction-recovery.md`.

## Global constraints

- Preserve all production data and unrelated schema differences.
- Do not apply the 30-file backlog or change historical migration records.
- Do not deploy Edge Functions or billing changes in this recovery.
- Keep the underlying auction reader service-role-only; expose only the bounded caller-aware envelope.
- Keep existing Free 60 / maximum 600 visibility rules and authenticated caller identity.
- Do not add a service-role binding to Cloudflare Pages.
- Complete local checks before any further GitHub CI or deployment dispatch.
- The existing full-release and catalogue-hotfix workflows do not satisfy this scope. Do not dispatch either as an auction-only release.

## Review focus

- Anonymous requests must never receive more than 60 rows despite large or negative requested limits.
- Paid callers must use their own account entitlement, never a client-selected account ID.
- Inactive, off-market, expired and non-provider listings must remain excluded.
- Filters, empty daily pools, deterministic ordering and three-image card projections must retain their current behavior.
- A repeated application must preserve definitions, privileges, unrelated objects and data.

## Tasks

### 1. Isolate and prove the database repair

- [x] Preserve the rejected broad proposal in local Git stash `a76838f46c5065a794b1d73fa6761c133acceeeb` and leave the auction branch clean.
- [x] Confirm production's existing `get_auction_listing_visible_limit(uuid)` helper and its service-role-only privileges using read-only SQL.
- [x] Add forward migration `20260921055243_restore_auction_only_reader_capabilities.sql` using the Supabase CLI. Its only definitions are the three missing auction functions. Preserve the canonical candidate/entitlement implementations; harden the public envelope against direct-RPC premium-filter and clock bypasses identified by review. Apply the final restricted grants in the same transaction.
- [x] Add a short-timeout auction ordering index only if its exact definition is absent; reject a same-name incompatible index.
- [x] Add source-contract regression tests and a disposable PostgreSQL harness. First prove missing functions fail, then prove the real SQL passes with anonymous, free, paid, filtered, empty-pool and excluded-listing fixtures.
- [x] Apply twice locally and compare unrelated fixture data, history and entitlement definition/ACL. Check table access remains denied and the internal reader cannot be invoked by public roles. The harness does not claim a full production schema rehearsal.

### 2. Bound the website release

- [x] Inventory runtime changes between live SHA `5cf9ba49eafdc19d2e8746bc877f33b08bad0dae` and the candidate. The current full main artifact also contains a Pricing change; it cannot be called a strictly auction-only artifact.
- [x] Prepare the reviewed 13-file source overlay with exact committed bytes and a complete source manifest. Preserve live Pricing, checkout, account-role and unrelated module sources. Shared favorites/cache/detail components remain necessary auction dependencies; this is not a claim that every non-auction bundle hash stays identical.
- [x] Build the scoped frontend and Pages worker, type-check both, and pass 203 focused page/action/API contract tests against the prepared source. The SQL harness separately passes 35 real PostgreSQL checks. These do not substitute for a deployed frontend-to-database staging smoke test.
- [ ] Complete deployed staging verification of list, filters, pagination, UUID/OS details and authenticated actions with isolated fixtures.

### 3. Release readiness

- [x] Obtain a fresh independent review of the local SQL/source preparation and its boundaries. Two public-RPC authorization issues were reproduced RED, corrected and verified GREEN; final scoped preparation review passes.
- [x] Bind the scoped database migration and matching website artifact to the same reviewed source and immutable digests, using the existing release authorization, staging, evidence and rollback requirements. The manual auction workflow retains the production lock and takes the shared staging lock. It requires original successful main CI and one dispatch per reviewed control SHA. Deployment verification remains pending.
- [ ] Run one controlled release only after local and staging proof. Stop on a failed gate without repeated paid attempts.
- [ ] Verify a non-empty production auction response and the live page. Record actual timings. Do not describe local preparation as live restoration.

The user's latest approval chooses the constrained recovery. It does not authorize the broader database reconciliation. No second scope question is needed to proceed with this plan.

Local evidence and release limitations: `docs/performance/2026-09-21-auction-only-preparation.md`.
