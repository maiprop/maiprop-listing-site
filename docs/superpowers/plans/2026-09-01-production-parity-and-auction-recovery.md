# Production Parity and Auction Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the live auctions, seller-management, professionals, and homepage read contracts without placing a Supabase service-role credential in Cloudflare Pages, then deploy the exact tested SHA and collect repeatable live latency evidence.

**Architecture:** Add one forward-only, idempotent database repair migration. It recreates the already-designed management and professional projections, asserts their dependencies, and adds a narrow `SECURITY DEFINER` auction wrapper that derives its cap from `auth.uid()`. Cloudflare calls that wrapper with the existing public runtime and, for authenticated requests, the caller's bearer token. The release retains the repository's exact-SHA manifest, staging gate, production approval, and production ban on the service-role binding.

**Tech Stack:** React 18, TypeScript, Cloudflare Pages Functions, Supabase/PostgreSQL/PostgREST, Vitest, GitHub Actions, Node.js 20/22.

**Spec:** `docs/superpowers/specs/2026-09-01-subsecond-live-application-design.md`

## Global Constraints

- Do not add, read, print, rotate, or provision `SUPABASE_SERVICE_ROLE_KEY` in the production Pages runtime.
- Keep `scripts/build-cloudflare-pages-runtime-patch.mjs` and `scripts/validate-cloudflare-pages-staging-posture.mjs` enforcing that production constraint.
- Never rewrite an applied migration. Use one additive repair migration and fail closed when a required foundational relation or function is absent.
- Preserve the backend-only grant on `public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)`.
- Do not publish the synthetic browser listing in this wave. Publishing is a separate public mutation and requires action-time confirmation.
- Do not claim sub-second performance from local tests. Report live cold and warm measurements only after the exact SHA is deployed.
- Stop the release on any failed focused test, full test, build, staging check, capability assertion, or production preflight.
- This plan is Wave 0 only. Dashboard aggregation, listing read models, homepage consolidation, and media optimization remain later performance waves after the repaired baseline is measured.

---

### Task 1: Add a forward repair migration for the missing live capabilities

**Files:**
- Create: `src/test/subsecondReleaseCapabilitiesMigration.test.ts`
- Create: `supabase/migrations/20260901120000_repair_subsecond_release_capabilities.sql`
- Reference unchanged: `supabase/migrations/20260726201049_public_auction_candidate_boundary.sql`
- Reference unchanged: `supabase/migrations/20260726204345_harden_public_auction_boundary_and_index.sql`
- Reference unchanged: `supabase/migrations/20260728093154_align_managed_catalogue_and_promotion_principal.sql`
- Reference unchanged: `supabase/migrations/20260729145205_replace_public_professional_definer_view.sql`
- Reference unchanged: `supabase/migrations/20260812102342_reconcile_legacy_migration_effects.sql`

**Interfaces:**
- Adds `public.get_visible_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)` with the exact card-only return columns of `public.get_public_auction_candidates`.
- Restores `public.get_manageable_listing_catalogue_page`, `public.get_manageable_listing_summary`, `public.get_public_professionals`, and `public.public_professionals` from their committed definitions and grants.
- Emits `NOTIFY pgrst, 'reload schema'` only after all capability assertions pass.

- [ ] **Step 1: Write the failing migration contract test**

Read the new migration as text and require all of the following:

- the wrapper is `STABLE`, `SECURITY DEFINER`, and uses a fixed empty `search_path`;
- anonymous callers are capped at 60;
- authenticated callers derive their cap from `public.get_auction_listing_visible_limit(auth.uid())` and are clamped to 600;
- the wrapper calls `public.get_public_auction_candidates` rather than querying `public.listings` itself;
- the wrapper is granted only to `anon, authenticated` after revoking `PUBLIC`;
- the underlying candidate RPC is explicitly left service-role-only;
- the two management functions and the professional function/view are recreated with their original grants;
- the migration asserts every required function/view with `to_regprocedure`/`to_regclass` before requesting a PostgREST schema reload;
- the source does not mention a service-role secret binding.

- [ ] **Step 2: Prove the focused test fails because the migration is absent**

Run:

```powershell
npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts
```

Expected: failure reading the missing migration.

- [ ] **Step 3: Implement the bounded auction wrapper**

Use this authorization structure while copying the return-table definition exactly from `get_public_auction_candidates`:

```sql
CREATE OR REPLACE FUNCTION public.get_visible_auction_candidates(
  p_limit INTEGER DEFAULT 60,
  p_stream TEXT DEFAULT 'organic',
  p_today DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_pool_tag TEXT DEFAULT NULL
)
RETURNS TABLE (
  -- Copy the exact 32 card-only columns and types from
  -- public.get_public_auction_candidates.
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_visible_limit INTEGER := 60;
BEGIN
  IF v_user_id IS NOT NULL THEN
    v_visible_limit := LEAST(
      600,
      GREATEST(
        60,
        COALESCE(public.get_auction_listing_visible_limit(v_user_id), 60)
      )
    );
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_public_auction_candidates(
    LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600),
    p_stream,
    p_today,
    p_now,
    p_pool_tag
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_visible_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT
) TO anon, authenticated;
```

Do not grant the underlying RPC to `anon` or `authenticated`. Repeat its revoke/service-role grant in this repair migration so later drift cannot reopen it.

- [ ] **Step 4: Recreate the missing management and professional projections exactly**

Copy, without redesigning:

- `get_manageable_listing_catalogue_page` and `get_manageable_listing_summary` from `20260728093154_align_managed_catalogue_and_promotion_principal.sql`, including authenticated-only grants;
- `get_public_professionals` and `public_professionals` from `20260729145205_replace_public_professional_definer_view.sql`, including their existing public projection columns, security settings, owner behavior, and grants.

Before creating them, assert foundational dependencies such as `public.listing_management_catalogue` and the underlying auction RPC. After creation, assert these exact signatures/relations exist:

```text
public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)
public.get_visible_auction_candidates(integer,text,date,timestamp with time zone,text)
public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)
public.get_manageable_listing_summary()
public.get_public_professionals()
public.public_professionals
```

- [ ] **Step 5: Reload PostgREST and verify migration contracts**

End with:

```sql
NOTIFY pgrst, 'reload schema';
```

Run:

```powershell
npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts src/test/publicAuctionCandidateBoundaryMigration.test.ts src/test/publicProfessionalsProjectionMigration.test.ts src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts
npm run lint:migrations
```

Expected: all tests pass; the older test still proves the underlying auction RPC is service-role-only.

- [ ] **Step 6: Self-review and commit the database repair**

Compare copied definitions line-for-line with their authoritative migrations. Confirm `git diff --check` is clean, then commit only the migration and its contract test:

```powershell
git add src/test/subsecondReleaseCapabilitiesMigration.test.ts supabase/migrations/20260901120000_repair_subsecond_release_capabilities.sql
git commit -m "fix: repair production read capabilities"
```

---

### Task 2: Remove the production service-role dependency from public auctions

**Files:**
- Modify: `functions/_publicListingProjection.ts`
- Modify: `functions/api/public/auctions.ts`
- Modify: `functions/api/public/public-api.test.ts`
- Verify unchanged: `scripts/build-cloudflare-pages-runtime-patch.mjs`
- Verify unchanged: `scripts/validate-cloudflare-pages-staging-posture.mjs`

**Interfaces:**
- `PUBLIC_AUCTION_CANDIDATES_PATH` becomes `/rest/v1/rpc/get_visible_auction_candidates`.
- `AuctionEntitlement` carries `accessToken: string | null` in addition to `limit` and `authenticated`.
- Candidate-stream helpers accept an optional caller token. Anonymous requests use the publishable key as the bearer token; authenticated requests forward the validated user token.

- [ ] **Step 1: Update tests first for the public-runtime contract**

Replace candidate-path expectations with `/rest/v1/rpc/get_visible_auction_candidates` and add explicit tests that:

- an anonymous auction request succeeds with only `SUPABASE_URL` plus the publishable/anon key;
- its candidate requests send the public key as `apikey` and `Authorization: Bearer <public-key>`;
- no candidate request sends the service-role key;
- a valid paid request validates `/auth/v1/user`, calls `get_auction_listing_visible_limit` with the public key plus the user's bearer token, and forwards that same user token to the visible-candidate wrapper;
- an invalid/missing token stays at the anonymous limit of 60;
- an authenticated fallback remains `private, no-store`;
- a missing public runtime still returns the existing 503 error contract;
- homepage auction delegation also uses the visible wrapper.

Remove the obsolete test named `fails closed when the server-only auction credential is absent`; replace it with the successful public-runtime-only case rather than weakening the assertion.

- [ ] **Step 2: Prove the focused handler tests fail**

Run:

```powershell
npx vitest run functions/api/public/public-api.test.ts
```

Expected: failures on the old RPC path, service-role headers, and early runtime guard.

- [ ] **Step 3: Move entitlement resolution to the public runtime**

Change the type and return values:

```ts
type AuctionEntitlement = {
  limit: number;
  authenticated: boolean;
  accessToken: string | null;
};
```

For `requestedLimit <= 60`, return the anonymous cap with `accessToken: null`. For a larger request:

1. validate the bearer token through `/auth/v1/user` using the public runtime;
2. call `/rest/v1/rpc/get_auction_listing_visible_limit` on that same runtime;
3. send `apikey: publicRuntime.key` and `Authorization: Bearer ${token}`;
4. preserve the current 60/600 clamps and fail closed to 60;
5. return the validated token only when authentication succeeded.

Do not call `getSupabaseServiceRuntime` anywhere in this public auction path.

- [ ] **Step 4: Thread the caller token through candidate hydration**

Add `accessToken: string | null = null` to the candidate helper chain:

```text
fetchDbAuctionStream
fetchDbAuctionStreams
fetchCanonicalAuctionStreams
fetchCanonicalAuctionPage
fetchPublicAuctionRows
```

Within `fetchDbAuctionStream`, use `getSupabaseRuntime(env)` and these headers:

```ts
const authorizationToken = accessToken ?? runtime.key;
headers: {
  apikey: runtime.key,
  Authorization: `Bearer ${authorizationToken}`,
  Accept: "application/json",
}
```

Pass `entitlement.accessToken` from `publicAuctions` into canonical candidate hydration. Keep exact-auction lookup unchanged because it already uses the public catalogue RPC. Remove the `getSupabaseServiceRuntime` early guard from `publicAuctions`; fail on a missing public runtime through the existing missing-runtime response.

- [ ] **Step 5: Verify focused tests and the production secret prohibition**

Run:

```powershell
npx vitest run functions/api/public/public-api.test.ts src/test/publicListingProjectionConsumers.test.ts
npm run typecheck:functions
npm run runtime -- node --test scripts/validate-cloudflare-pages-staging-posture.test.mjs
```

Confirm the posture test still proves production rejects a service-role binding.

- [ ] **Step 6: Self-review and commit the runtime refactor**

Inspect every `getSupabaseServiceRuntime` occurrence remaining in `functions/api/public/auctions.ts`; the public auction request path must have none. Confirm `git diff --check` is clean, then commit:

```powershell
git add functions/_publicListingProjection.ts functions/api/public/auctions.ts functions/api/public/public-api.test.ts
git commit -m "fix: authorize auctions without production service role"
```

---

### Task 3: Make the live read-only smoke detect the observed failures

**Files:**
- Modify: `.github/workflows/live-operational-smoke.yml`
- Modify: `src/test/liveOperationalSmokeWorkflow.test.ts`

**Interfaces:**
- Corrects the homepage probe to `/api/public/homepage?section=type-counts`.
- Rejects successful HTTP responses that contain an application-level `error`.
- Checks route-specific response shapes and records elapsed milliseconds per attempt.
- Uses a temporary recovery ceiling of 3,500 ms for JSON API probes; this is a failure-detection ceiling, not the final sub-second target.

- [ ] **Step 1: Strengthen the workflow contract test first**

Require the workflow to contain:

- `section=type-counts` and no `section=listing_counts`;
- a `performance.now()` elapsed measurement and an API ceiling of 3,500 ms;
- explicit rejection of a payload with an own `error` property;
- route-specific checks: `data` arrays for listings and auctions, an array for the current open-house response, and a non-array object for type counts;
- elapsed milliseconds in the pass/fail output;
- the existing no-secrets, no-auth, no-mutation, no-checkout guarantees.

- [ ] **Step 2: Prove the workflow test fails on the current implementation**

Run:

```powershell
npx vitest run src/test/liveOperationalSmokeWorkflow.test.ts
```

Expected: failure because the workflow uses `listing_counts` and accepts error objects.

- [ ] **Step 3: Implement route-specific probes**

Give each JSON probe a shape identifier. After parsing:

1. reject null/non-object payloads;
2. reject `Object.prototype.hasOwnProperty.call(payload, "error")`;
3. validate the expected shape for that route;
4. reject elapsed time above 3,500 ms for API probes;
5. log method, path, attempt, and elapsed milliseconds.

Preserve three bounded attempts and the 15-second fetch timeout. Do not introduce authentication or any non-GET/HEAD request.

- [ ] **Step 4: Verify and commit the live guard**

Run:

```powershell
npx vitest run src/test/liveOperationalSmokeWorkflow.test.ts
git diff --check
```

Then commit:

```powershell
git add .github/workflows/live-operational-smoke.yml src/test/liveOperationalSmokeWorkflow.test.ts
git commit -m "ci: detect broken and slow public reads"
```

---

### Task 4: Verify the exact release candidate and review the implementation

**Files:**
- Modify only if a real failure requires it: files already listed in Tasks 1-3
- Do not add unrelated cleanup.

- [ ] **Step 1: Run the focused recovery suite**

```powershell
npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts src/test/publicAuctionCandidateBoundaryMigration.test.ts src/test/publicProfessionalsProjectionMigration.test.ts src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts functions/api/public/public-api.test.ts src/test/publicListingProjectionConsumers.test.ts src/test/liveOperationalSmokeWorkflow.test.ts
```

- [ ] **Step 2: Run static, migration, release, and build checks**

```powershell
npm run typecheck
npm run typecheck:functions
npm run lint:migrations
npm run check:release-safety
npm run build
npm run check:bundle-size
git diff --check
```

Resolve command-name differences from `package.json`; do not report an unrun check as passing.

- [ ] **Step 3: Run the repository's complete automated test suite**

Use the exact full-suite command from `package.json` (normally `npm test`). Record failures verbatim. Fix only failures caused by this wave and rerun the failed command plus the full suite.

- [ ] **Step 4: Perform an independent code review**

Use `superpowers:requesting-code-review` against the Wave 0 diff. The review must explicitly inspect:

- privilege boundaries and `auth.uid()` use;
- anonymous and authenticated 60/600 enforcement;
- runtime headers and token forwarding;
- migration idempotence and dependency assertions;
- PostgREST reload ordering;
- smoke-test false positives/false negatives;
- accidental production service-role provisioning.

Address verified findings with focused regression tests and a separate fix commit. Do not implement speculative review suggestions without reproducing the issue.

---

### Task 5: Push, stage, deploy the exact SHA, and remeasure live behavior

**Files:**
- No source changes during deployment.
- Evidence comes from existing release artifacts, production public-API checks, the read-only smoke workflow, and timestamped measurement output.

- [ ] **Step 1: Record and push the immutable candidate**

Require a clean worktree, capture `git rev-parse HEAD`, and push that exact commit to `main`. Verify the remote `main` SHA matches before continuing.

- [ ] **Step 2: Wait for required CI and automatic staging**

Monitor the repository's required checks and `Stage Release Candidate` for the exact SHA. Do not dispatch production from a merely green branch name. Confirm the staged release artifact includes the new migration in its existing SHA-bound `release-manifest.json`.

- [ ] **Step 3: Verify staging contracts and timing**

Use the existing production-deploy public API checker against staging. Require successful contracts for:

```text
/api/public/listings?limit=1
/api/public/auctions?limit=1
/api/public/open-houses?limit=1
/api/public/homepage?section=type-counts
```

Also verify the management and professional RPCs exist in staging through the release's database capability checks. Stop if any route returns an error payload, any capability is absent, or auctions still request a service-role binding.

- [ ] **Step 4: Deploy production through the existing approval gate**

Dispatch `Deploy Production Release` for the exact SHA with `confirm=DEPLOY_PRODUCTION_RELEASE`. Use the standard approval path unless the repository's recorded release state requires the already-designed single-admin break-glass path. Do not bypass the workflow, weaken a gate, or manually apply a partial migration.

- [ ] **Step 5: Verify production identity and capabilities**

Require the workflow's exact-SHA deployment attestation and its existing `check-production-deploy --public-api` result. Then dispatch `Live Public Read-Only Smoke` and require all probes to pass without application-level errors.

- [ ] **Step 6: Remeasure cold and warm live timings**

Measure the production origin, not a preview URL. For each public route below, record at least 30 sequential warm requests and 5 cache-bypassed/cold observations where the route supports safe cache variation:

```text
/
/api/public/listings?limit=60
/api/public/auctions?limit=60
/api/public/open-houses?limit=1
/api/public/homepage?section=type-counts
/api/public/homepage?section=auctions
```

Record status, response shape, `Server-Timing`, cache headers/status when present, and p50/p95/max. Then use the live browser to time:

- cold homepage to meaningful property content;
- auctions navigation to usable results;
- sign-in page and one authenticated sign-in with a designated test account;
- seller dashboard to heading and stable controls;
- My Listings navigation;
- create-listing wizard open and step transitions;
- edit-listing open and save with a designated disposable listing;
- relist with a designated disposable listing.

Do not publish or mutate a listing until the user provides action-time confirmation for the named disposable target. Separate network wait, UI/render wait, and total elapsed time where browser instrumentation permits.

- [ ] **Step 7: Publish the evidence and choose Wave 1 from data**

Report before/after results without rounding away failures. Wave 0 succeeds only when the broken contracts are restored and stable; the final architecture target remains p95 under one second. Use the new live trace to choose the next bounded plan:

- dashboard/listing aggregation if authenticated management dominates;
- public read-model consolidation if homepage/listings/auctions dominate;
- media/render optimization if APIs are fast but meaningful UI remains slow.

Do not claim the full performance refactor is complete at the end of Wave 0.
