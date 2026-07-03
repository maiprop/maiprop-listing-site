# ECAS Remediation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the strict ECAS gaps found on `main` without changing current user-facing behavior except for safer auth, stronger deployment governance, and clearer operational evidence.

**Architecture:** Treat the current production `main` SHA as the source of truth. Fix risk-first items in small, independently verifiable slices: migration chronology, Supabase advisors, provider evidence, public Edge Function hardening, Stripe readiness, live E2E proof, and service-boundary debt. Database work must go through Supabase CLI-generated migrations and advisor verification.

**Tech Stack:** React + TypeScript + Vite, Supabase Postgres/Auth/Edge Functions/RLS, Cloudflare Pages/Functions, GitHub Actions, Playwright, Vitest, Deno tests, Stripe.

---

## Baseline Context

Current audited SHA: `66326673d2eea057f16584795655572974f97f99`.

Verified passing:
- `npm run check:secrets`
- `npm run typecheck`
- `npm test -- --run`
- `npm run test:deno`
- `npm run test:e2e`
- `npm run test:perf`
- `npm run check:rls-crud-matrix`
- `npm run check:live-security-posture`
- `npm run check:github-governance`
- `npm run check:dora-readiness`
- `npm run check:slsa-readiness`
- `npm run check:wcag-coverage`
- `npm run check:perf-proof`
- `npm run check:bundle-size`

Verified failing or incomplete:
- `npm run check:ecas-live-evidence -- --strict` fails because Sentry, GitHub admin, and Cloudflare evidence are unconfigured.
- Production Supabase reports 45 future-dated migrations.
- `scripts/check-migration-idempotency.mjs` allows already-applied future migrations, so the current chronology gate misses legacy future-dated files.
- Supabase security advisors report:
  - `public.has_current_investor_subscription(p_user_id uuid)` callable by `authenticated` as `SECURITY DEFINER`.
  - leaked password protection disabled.
- Supabase performance advisors report duplicate permissive anon SELECT policies on `public.projects`.
- `STRIPE_SECRET_KEY` is not exported in this shell, so live Stripe account/tax/catalog checks are not verified.
- 25 Edge Functions have `verify_jwt = false`; intended public/webhook/cron functions need explicit evidence.

---

## File Map

Migration governance:
- Modify: `scripts/check-migration-idempotency.mjs`
- Modify: `scripts/check-migration-idempotency.test.mjs`
- Modify or remove: `scripts/applied-future-migrations.json`
- Create: one Supabase CLI-generated migration for advisor fixes
- Review: `supabase/migrations/*.sql`

Supabase advisor fixes:
- Create: Supabase CLI-generated migration for `has_current_investor_subscription`, `projects` policy consolidation, and stale grant cleanup
- Modify tests referencing advisor migrations:
  - `src/test/investorSubscriptionExpiryMigration.test.ts`
  - `src/test/investorFeedPolicyMigration.test.ts`
  - `src/test/firesaleAdvisorPolicyConsolidationMigration.test.ts`
  - `src/test/projectSelectPolicyAdvisorMigration.test.ts`
  - `src/test/projectSelectPolicySplitMigration.test.ts`

Live evidence:
- Modify: `scripts/capture-github-admin-posture.mjs`
- Modify: `scripts/capture-github-admin-posture.test.mjs`
- Modify: `scripts/capture-cloudflare-admin-posture.mjs`
- Modify: `scripts/capture-cloudflare-admin-posture.test.mjs`
- Modify: `scripts/capture-sentry-live-evidence.mjs`
- Modify: `scripts/capture-sentry-live-evidence.test.mjs`
- Modify: `scripts/check-ecas-live-evidence.mjs`
- Modify: `scripts/check-ecas-live-evidence.test.mjs`

Edge function public surface:
- Modify: `scripts/check-edge-functions.mjs`
- Add/update tests near: `scripts/check-edge-functions.mjs` consumers and `src/test/criticalBusinessInvariants.test.ts`
- Review: `supabase/config.toml`
- Review public functions in: `supabase/functions/*/index.ts`

Stripe readiness:
- Modify: `scripts/check-stripe-business-logic.mjs`
- Modify: `scripts/check-stripe-tax-readiness.mjs`
- Modify: `scripts/check-stripe-account.mjs`
- Add/update tests if present near script names or add `scripts/check-stripe-readiness.test.mjs`

Service-boundary/type debt follow-up:
- Modify: `scripts/check-type-debt.mjs`
- Modify: `scripts/type-debt-baseline.json`
- Target later direct Supabase hotspots:
  - `src/hooks/useOpenHouseAssetControl.ts`
  - `src/hooks/useMessages.ts`
  - `src/hooks/useProfessionalServices.ts`
  - `src/hooks/useListingForm.ts`
  - `src/hooks/useListings.ts`

---

### Task 1: Create Clean Remediation Branch

**Files:**
- No code files modified.

- [ ] **Step 1: Sync `main`**

Run:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git status --short --branch
```

Expected:

```text
## main...origin/main
```

- [ ] **Step 2: Create branch**

Run:

```powershell
git switch -c codex/ecas-remediation-hardening-20260703
```

Expected:

```text
Switched to a new branch 'codex/ecas-remediation-hardening-20260703'
```

- [ ] **Step 3: Record baseline**

Run:

```powershell
npm run check:secrets
npm run typecheck
npm run check:ecas-hardening
npm run check:standards-readiness
```

Expected: all commands exit `0`.

---

### Task 2: Make Migration Chronology Strict For All Source-Controlled Migrations

**Files:**
- Modify: `scripts/check-migration-idempotency.mjs`
- Modify: `scripts/check-migration-idempotency.test.mjs`
- Modify: `scripts/applied-future-migrations.json`

- [ ] **Step 1: Write failing test**

Add a test to `scripts/check-migration-idempotency.test.mjs` that proves `--check-chronology` fails for source-controlled future migrations even when they are in the applied-future allowlist.

Use this test body:

```js
test("chronology mode rejects source-controlled future migrations even when applied remotely", () => {
  const out = checkMigrationFilenames(
    ["20260601000000_future.sql"],
    {
      now: new Date("2026-05-01T00:00:00.000Z"),
      appliedFutureMigrations: new Set(["20260601000000"]),
      strictSourceChronology: true,
    },
  );

  expect(out).toHaveLength(1);
  expect(out[0].rule).toMatch(/Future-dated migration timestamp/);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```powershell
npx vitest run scripts/check-migration-idempotency.test.mjs
```

Expected: the new test fails because `strictSourceChronology` is not implemented.

- [ ] **Step 3: Implement strict chronology option**

In `scripts/check-migration-idempotency.mjs`, update `checkMigrationFilenames` to accept `strictSourceChronology = false` and bypass the applied-future allowlist when strict mode is enabled.

Patch the options destructuring to include:

```js
strictSourceChronology = false,
```

Patch the future-date branch to use:

```js
const isAllowedAppliedFuture = appliedFutureMigrations.has(timestamp);
if (date > maxAllowed && (strictSourceChronology || !isAllowedAppliedFuture)) {
  violations.push({
    file,
    rule: `Future-dated migration timestamp ${timestamp}`,
    snippet: `${timestamp} is after ${formatTimestamp(maxAllowed)}. Create migrations with 'supabase migration new <name>' and never hand-date future files.`,
  });
}
```

- [ ] **Step 4: Wire CLI flag**

In `run()` inside `scripts/check-migration-idempotency.mjs`, pass strict mode when `--check-chronology` is used:

```js
strictSourceChronology: checkChronology,
```

- [ ] **Step 5: Prove current repo fails strict chronology**

Run:

```powershell
npm run lint:migrations:chronology
```

Expected: fail with the 45 future-dated files.

- [ ] **Step 6: Decide migration history strategy**

For already-applied production migrations, do not rename files blindly. Choose one of these two paths after verifying `supabase_migrations.schema_migrations`:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version > to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS')
ORDER BY version;
```

Use Path A if every future-dated file is already applied in production: keep source filenames but rename the gate from “chronology pass” to “applied-future exception exists with evidence”, and fail only when the allowlist lacks an evidence object.

Use Path B if any future-dated file is not applied: recreate unapplied files with `supabase migration new`, move SQL into the generated filenames, and delete only the unapplied future filenames.

- [ ] **Step 7: Replace bare allowlist with evidence objects**

Change `scripts/applied-future-migrations.json` from string array entries to objects:

```json
[
  {
    "version": "20260703120000",
    "name": "agent_data_inputs",
    "productionApplied": true,
    "verifiedAt": "2026-07-03",
    "reason": "Historical production-applied migration. Filename cannot be changed without corrupting migration history."
  }
]
```

Update loader tests so the script requires `version`, `productionApplied: true`, `verifiedAt`, and `reason`.

- [ ] **Step 8: Verify**

Run:

```powershell
npx vitest run scripts/check-migration-idempotency.test.mjs
npm run lint:migrations
npm run lint:migrations:chronology
```

Expected: pass only if each historical future migration has explicit production-applied evidence.

---

### Task 3: Fix Supabase Security Advisor For Investor Subscription Helper

**Files:**
- Create: Supabase CLI-generated migration
- Modify tests referencing `has_current_investor_subscription`

- [ ] **Step 1: Inspect live function body**

Run via Supabase SQL:

```sql
SELECT pg_get_functiondef('public.has_current_investor_subscription(uuid)'::regprocedure);
```

Expected: inspect whether the function uses `auth.uid()` and whether `p_user_id` can be used to check another user.

- [ ] **Step 2: Create migration through CLI**

Run:

```powershell
supabase migration new harden_investor_subscription_rpc
```

Expected: one new file under `supabase/migrations/<current_timestamp>_harden_investor_subscription_rpc.sql`.

- [ ] **Step 3: Restrict direct external execution**

If app code only calls this helper inside RLS policies/functions, use this SQL in the new migration:

```sql
REVOKE ALL ON FUNCTION public.has_current_investor_subscription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription(uuid) TO service_role;
```

If authenticated client RPC access is required, replace the existing helper with a no-argument wrapper and keep the privileged user-id helper private:

```sql
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.investor_subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, extensions
AS $$
  SELECT private.has_investor_subscription_for_user((SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.has_current_investor_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription() TO authenticated;
```

- [ ] **Step 4: Update policy references**

Replace policy references of:

```sql
public.has_current_investor_subscription((SELECT auth.uid()))
```

with either:

```sql
private.has_investor_subscription_for_user((SELECT auth.uid()))
```

inside trusted DB policies/functions, or:

```sql
public.has_current_investor_subscription()
```

where the public API wrapper is intentionally used.

- [ ] **Step 5: Verify advisor**

Run:

```powershell
npm run lint:migrations
npm run test:deno
npm run check:live-security-posture
```

Then run Supabase advisor for security. Expected: no `authenticated_security_definer_function_executable` finding for `has_current_investor_subscription`.

---

### Task 4: Consolidate Duplicate `projects` Anonymous SELECT Policies

**Files:**
- Create: Supabase CLI-generated migration, or append to the Task 3 migration if still uncommitted and logically grouped as advisor cleanup
- Modify:
  - `src/test/projectSelectPolicyAdvisorMigration.test.ts`
  - `src/test/projectSelectPolicySplitMigration.test.ts`

- [ ] **Step 1: Write migration SQL**

Use the policy condition confirmed by current business rules. The strict default should expose active, non-archived public projects only:

```sql
DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
DROP POLICY IF EXISTS "projects_public_select" ON public.projects;

CREATE POLICY "projects_public_select"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (
  status = 'active'
  AND archived_at IS NULL
);
```

- [ ] **Step 2: Write regression test**

Update the relevant migration test to assert:

```ts
expect(sql).toContain('DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects');
expect(sql).toContain('DROP POLICY IF EXISTS "projects_public_select" ON public.projects');
expect(sql).toContain('CREATE POLICY "projects_public_select"');
expect(sql).toContain("status = 'active'");
expect(sql).toContain("archived_at IS NULL");
```

- [ ] **Step 3: Verify**

Run:

```powershell
npx vitest run src/test/projectSelectPolicyAdvisorMigration.test.ts src/test/projectSelectPolicySplitMigration.test.ts
npm run check:rls-crud-matrix
```

Expected: tests pass and RLS matrix still passes for 78 public tables.

---

### Task 5: Enable Supabase Leaked Password Protection As Admin Setting

**Files:**
- Modify: `docs/SECURITY.md` or existing security operations doc if present
- Modify: `docs/ECAS_REMEDIATION.md` if present

- [ ] **Step 1: Enable setting in Supabase dashboard**

In production Supabase project `qvvicunqcrwpioqnvzxf`, enable leaked password protection in Auth password security settings.

- [ ] **Step 2: Capture evidence**

Run Supabase security advisors again.

Expected: no `auth_leaked_password_protection` warning.

- [ ] **Step 3: Document evidence**

Add one dated evidence line to the security operations doc:

```markdown
2026-07-03: Supabase Auth leaked password protection enabled for production project `qvvicunqcrwpioqnvzxf`; verified via Supabase security advisors.
```

---

### Task 6: Make Live Evidence Capture Strict And Useful

**Files:**
- Modify: `scripts/capture-github-admin-posture.mjs`
- Modify: `scripts/capture-cloudflare-admin-posture.mjs`
- Modify: `scripts/capture-sentry-live-evidence.mjs`
- Modify: `scripts/check-ecas-live-evidence.mjs`
- Modify corresponding tests.

- [ ] **Step 1: Write test for unconfigured evidence**

In `scripts/check-ecas-live-evidence.test.mjs`, assert that `status: "unconfigured"` fails strict mode with the provider name:

```js
expect(() => checkEvidence({ provider: "sentry", status: "unconfigured" }, { strict: true }))
  .toThrow(/sentry live evidence is unconfigured/i);
```

- [ ] **Step 2: Require minimum successful evidence fields**

For GitHub evidence, require:

```json
{
  "provider": "github",
  "status": "ok",
  "branch": "main",
  "branchProtection": {
    "requiredPullRequestReviews": true,
    "requiredStatusChecks": true,
    "allowsForcePushes": false,
    "allowsDeletions": false
  }
}
```

For Cloudflare evidence, require:

```json
{
  "provider": "cloudflare",
  "status": "ok",
  "project": "maiprop-listing-site",
  "latestProductionDeployment": {
    "status": "success",
    "commitHash": "66326673d2eea057f16584795655572974f97f99"
  }
}
```

For Sentry evidence, require:

```json
{
  "provider": "sentry",
  "status": "ok",
  "environment": "production",
  "timeRange": "24h",
  "querySucceeded": true
}
```

- [ ] **Step 3: Run capture scripts with secure env**

Run:

```powershell
npm run capture:github-admin-posture
npm run capture:cloudflare-admin-posture
npm run capture:sentry-live-evidence
npm run check:ecas-live-evidence -- --strict
```

Expected: strict gate passes only with real provider evidence.

---

### Task 7: Add Explicit Public Edge Function Risk Register

**Files:**
- Modify: `scripts/check-edge-functions.mjs`
- Create or modify: `docs/security/public-edge-functions.md`
- Review: `supabase/config.toml`

- [ ] **Step 1: Create public function register**

Create `docs/security/public-edge-functions.md` with one row per `verify_jwt = false` function:

```markdown
| Function | Public reason | Auth substitute | Rate limit | Abuse test |
|---|---|---|---|---|
| `stripe-webhook` | Stripe webhook cannot use Supabase JWT | Stripe signature verification | Stripe replay/idempotency | `supabase/functions/stripe-webhook/index.test.ts` |
| `record-listing-view` | Anonymous listing view event | UUID validation + sampling + visibility RPC | Sampling and DB guard | `supabase/functions/record-listing-view/index.test.ts` |
```

Complete all 25 current `verify_jwt = false` functions from `supabase/config.toml`.

- [ ] **Step 2: Make script enforce register coverage**

In `scripts/check-edge-functions.mjs`, parse `docs/security/public-edge-functions.md` and fail when a `verify_jwt = false` function is missing from the table.

- [ ] **Step 3: Verify**

Run:

```powershell
npm run check:edge-functions
npm run test:deno
```

Expected: pass and every public function has documented auth substitute and abuse test.

---

### Task 8: Verify Stripe Live Readiness Without Leaking Secrets

**Files:**
- Modify: `scripts/check-stripe-business-logic.mjs`
- Modify: `scripts/check-stripe-tax-readiness.mjs`
- Modify: `scripts/check-stripe-account.mjs`
- Add tests if missing: `scripts/check-stripe-readiness.test.mjs`

- [ ] **Step 1: Make missing secret output actionable**

When `STRIPE_SECRET_KEY` is missing, scripts must print:

```text
STRIPE_SECRET_KEY is required. Export it only in the secure CI/provider shell; never commit it to .env files.
```

- [ ] **Step 2: Add masked evidence output**

When configured, scripts may print only masked key metadata:

```text
Stripe mode: test
Stripe key prefix: sk_test_...
```

Never print the full secret key.

- [ ] **Step 3: Run checks in secure environment**

Run:

```powershell
npm run check:stripe-business-logic
npm run check:stripe-tax-readiness
npm run check:stripe-account
```

Expected: all pass with live/test Stripe credentials exported in the process, and no secret value appears in stdout.

---

### Task 9: Run Live Credentialed E2E Matrix

**Files:**
- No app code modification expected.
- Evidence artifact path should be under existing Playwright reports or `artifacts/compliance/live-evidence/`.

- [ ] **Step 1: Export live E2E credentials**

Use existing Playwright env names from `e2e/*.spec.ts`. Confirm by running:

```powershell
rg -n "process\\.env\\.(E2E|LIVE|SUPABASE|STRIPE|ADMIN|BUYER|SELLER|AGENT|DEVELOPER|INVESTOR)" e2e
```

- [ ] **Step 2: Run credentialed live tests**

Run:

```powershell
npm run test:e2e -- e2e/live-critical-smoke.spec.ts e2e/live-role-tier-matrix.spec.ts e2e/rls-security.spec.ts
```

Expected: no credential-gated skips for selected files, and all tests pass.

- [ ] **Step 3: Run Stripe payment-completion tests in test mode**

Run only after test-mode Stripe + webhook callback are configured:

```powershell
npm run test:e2e -- e2e/stripe-payment-complete.spec.ts
```

Expected: subscription checkout, add-on checkout, declined-card behavior, and entitlement sync pass.

---

### Task 10: Establish 10x / Soak And Restore Evidence

**Files:**
- Modify existing performance docs or create: `docs/operations/load-test-evidence.md`
- Modify existing DR docs or create: `docs/operations/restore-drill-evidence.md`

- [ ] **Step 1: Run non-invasive k6 smoke**

Run:

```powershell
npm run check:perf-proof
node scripts/perf-k6-run.mjs --smoke
```

Expected: pass with no production mutation.

- [ ] **Step 2: Schedule true soak window**

Record approved window in `docs/operations/load-test-evidence.md`:

```markdown
2026-07-03: True 10x/soak not run during audit. Requires approved production or staging load window, traffic profile, abort threshold, and owner on-call.
```

- [ ] **Step 3: Run restore drill against non-production target**

Use `scripts/supabase-logical-backup.mjs` and the existing staging Supabase project. Do not restore into production.

Expected evidence:

```markdown
Backup source: production logical schema/data subset
Restore target: staging/non-production Supabase project
Validation: migration replay + selected row counts + RLS smoke
Outcome: pass/fail with timestamp
```

---

### Task 11: Reduce Service-Boundary Debt Without Broad Refactor

**Files:**
- Modify one module at a time:
  - `src/hooks/useOpenHouseAssetControl.ts`
  - `src/hooks/useMessages.ts`
  - `src/hooks/useProfessionalServices.ts`
  - `src/hooks/useListingForm.ts`
  - `src/hooks/useListings.ts`
- Create shared service modules only when a hook mutation is sensitive:
  - `src/services/openHouseAssetService.ts`
  - `src/services/messageService.ts`

- [ ] **Step 1: Pick one highest-risk hook**

Start with `src/hooks/useOpenHouseAssetControl.ts` because it had the highest direct Supabase count.

- [ ] **Step 2: Move only sensitive mutation payload construction**

Create a service wrapper that exposes named functions:

```ts
export async function approveOpenHouseRegistration(input: {
  registrationId: string;
  decision: "approved" | "rejected";
  reason?: string;
}) {
  return invokeAuthenticatedFunction("open-house-registration", input);
}
```

- [ ] **Step 3: Keep reads stable**

Do not move read-only list queries in the same PR unless tests prove no UX or latency regression.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run typecheck
npx vitest run src/test/useOpenHouseAssetControl.test.tsx
npm run test:e2e -- e2e/interaction-open-house.spec.ts
```

Expected: pass with no public UI behavior changes.

---

### Task 12: Final Verification And PR

**Files:**
- All modified files from completed tasks.

- [ ] **Step 1: Run full gate sequence**

Run:

```powershell
npm run check:secrets
npm run typecheck
npm test -- --run
npm run test:deno
npm run test:e2e
npm run test:perf
npm run check:rls-crud-matrix
npm run check:live-security-posture
npm run check:ecas-hardening
npm run check:standards-readiness
npm run check:mutation-validation
npm run check:openapi-coverage
npm run check:github-governance
npm run check:dora-readiness
npm run check:slsa-readiness
npm run check:wcag-coverage
npm run check:perf-proof
npm run check:ecas-live-evidence -- --strict
```

Expected: all pass. If credentialed live tests are intentionally not run, record the exact skipped env names in the PR body.

- [ ] **Step 2: Commit**

Run:

```powershell
git status --short
git add scripts src supabase docs
git commit -m "fix: harden ecas readiness gaps"
```

- [ ] **Step 3: Push and open PR**

Run:

```powershell
git push -u origin codex/ecas-remediation-hardening-20260703
gh pr create --base main --head codex/ecas-remediation-hardening-20260703 --title "fix: harden ECAS readiness gaps" --body-file docs/superpowers/plans/2026-07-03-ecas-remediation-hardening.md
```

- [ ] **Step 4: Monitor**

Run:

```powershell
gh pr checks --watch
```

Expected: all required checks pass before squash merge.

---

## Self-Review

Spec coverage:
- Migration governance gap: Task 2.
- Supabase security advisors: Tasks 3 and 5.
- Supabase duplicate policy advisor: Task 4.
- Strict live evidence: Task 6.
- Public Edge Function surface: Task 7.
- Stripe live readiness: Task 8.
- Credentialed live E2E/RLS proof: Task 9.
- 10x/restore proof: Task 10.
- Direct Supabase/service-boundary debt: Task 11.
- Final push/PR monitoring: Task 12.

Risk controls:
- No production destructive test is planned.
- No production restore is planned.
- No Stripe secret is printed or committed.
- Supabase migrations must be CLI-generated.
- Sensitive DB changes require advisor rerun and RLS matrix verification.

