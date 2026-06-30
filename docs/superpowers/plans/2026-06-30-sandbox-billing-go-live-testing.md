# Sandbox Billing Go-Live Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the sandbox Stripe, Supabase, Edge Function, and frontend billing implementation is safe enough to promote to live, with go-live blocked by any failed payment, entitlement, tax, invoice, webhook, role-switch, or add-on consumption check.

**Architecture:** Treat Stripe sandbox as payment source of truth and Supabase billing tables as the app entitlement/cache source of truth. Every paid flow must be verified from frontend action to Stripe object to webhook event to durable Supabase row to UI entitlement or consumable credit. Use disposable users for mutating tests and never mutate canonical demo accounts except read-only login/navigation checks.

**Tech Stack:** Stripe Checkout, Stripe Billing, Stripe Customer Portal, Stripe Tax, Supabase Auth/REST/RPC/Edge Functions, Vite/React, Playwright, Vitest, Deno tests, Supabase Management API.

---

## Go/No-Go Rule

Go live only if every task below is checked with fresh evidence from the sandbox account `acct_1TnuLbGfkWWBWEyh` (`mAI prop sandbox`) and Supabase project `qvvicunqcrwpioqnvzxf`.

No-go if any of these occur:

- Any Checkout completion does not create the expected Stripe subscription, invoice, receipt, webhook event, and Supabase billing row.
- Any successful add-on payment does not deliver and consume the correct credits.
- Any declined/failed card delivers credits or entitlements.
- Any invoice lacks Greek VAT evidence or expected tax amount.
- Any role switch leaves stale entitlement access for the old audience.
- Any webhook replay creates duplicate ledger rows.
- Any browser role can write billing ledger tables directly.
- Any migration, typecheck, unit, Edge, or E2E test fails.

## Evidence File

Create or update one evidence file during execution:

- `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

For each task, record:

- command run
- timestamp
- account/project checked
- pass/fail
- object IDs for Stripe Checkout Session, Subscription, Invoice, Customer, and Supabase rows where applicable
- cleanup performed

---

## Task 1: Environment And Account Guard

**Files:**
- Read: `.env`
- Read: `.stripe.test.env`
- Read: `scripts/check-stripe-account.mjs`
- Read: `scripts/check-stripe-business-logic.mjs`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Load only sandbox/test credentials**

Run in PowerShell:

```powershell
$env:STRIPE_SECRET_KEY = $env:MAIPROP_STRIPE_SANDBOX_SECRET_KEY
$env:STRIPE_EXPECTED_ACCOUNT_ID = "acct_1TnuLbGfkWWBWEyh"
$env:STRIPE_API_VERSION = "2026-06-24.dahlia"
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $parts = $_ -split '=', 2
  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")
  if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}
```

Expected: no output and no live Stripe secret loaded.

- [ ] **Step 2: Verify Stripe account identity**

Run:

```powershell
npm run check:stripe-account
```

Expected:

```text
Stripe account check (test)
- actual:   acct_1TnuLbGfkWWBWEyh (mAI prop sandbox)
- expected: acct_1TnuLbGfkWWBWEyh
- country:  GR
- currency: eur
```

- [ ] **Step 3: Verify Supabase target**

Run:

```powershell
(Get-Content .env | Where-Object { $_ -match '^VITE_SUPABASE_PROJECT_ID=' }) -replace '^VITE_SUPABASE_PROJECT_ID=',''
```

Expected:

```text
"qvvicunqcrwpioqnvzxf"
```

- [ ] **Step 4: Record connector caveat**

Run:

```powershell
# Use Stripe connector account info if available, otherwise record "not available".
```

Expected: if the connector reports `acct_1TnuLTGfOEgBOxtl`, record that the connector is live-only and must not be used as sandbox proof.

---

## Task 2: Pricing And Business Logic Contract Audit

**Files:**
- Read: `scripts/check-stripe-business-logic.mjs`
- Read: `scripts/setup-stripe-catalog.mjs`
- Read: `src/hooks/usePricingConfigs.ts`
- Read: `src/lib/rolePlanMap.ts`
- Read: `src/pages/AdminPricing.tsx`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Run Stripe/Supabase catalog audit**

Run:

```powershell
npm run check:stripe-business-logic
```

Expected:

```text
Stripe business-logic audit (test, API 2026-06-24.dahlia)
Stripe account: acct_1TnuLbGfkWWBWEyh (mAI prop sandbox)
Supabase rows checked: 28/28
Stripe prices checked: 30/30
Public subscriptions: pro, agent_basic, developer_pro, professional_basic
Self-serve add-ons: valuation_single, valuation_bundle, property_report_single, neighbourhood_report_single, neighbourhood_report_bundle
```

- [ ] **Step 2: Confirm public subscription matrix**

Verify all rows are active and mapped:

| Plan | Audience | Monthly | Annual | Checkout Mode |
|---|---:|---:|---:|---|
| `pro` | participant | EUR 29 | EUR 290 | subscription |
| `agent_basic` | agent | EUR 149 | EUR 1490 | subscription |
| `developer_pro` | developer | EUR 129 | EUR 1290 | subscription |
| `professional_basic` | professional | EUR 69 | EUR 690 | subscription |

Expected: each monthly and annual Stripe Price has `tax_behavior=exclusive`, active product, active price, correct lookup key, and Supabase metadata points to the same product/price IDs.

- [ ] **Step 3: Confirm invite-only matrix**

Verify:

| Plan | Audience | Public Checkout |
|---|---|---|
| `investor_private` | investor | blocked |
| `investor_institutional` | institutional | blocked |

Expected: no public price is exposed for investor/institutional plans; only admin-created custom annual Checkout URLs are allowed.

- [ ] **Step 4: Confirm self-serve add-on matrix**

Verify:

| Add-on | Runtime Bucket | Credits | Price |
|---|---|---:|---:|
| `valuation_single` | `property-valuation` | 1 | EUR 39 |
| `valuation_bundle` | `property-valuation` | 5 | EUR 149 |
| `property_report_single` | `property-report` | 1 | EUR 49 |
| `neighbourhood_report_single` | `neighbourhood-report` | 1 | EUR 19 |
| `neighbourhood_report_bundle` | `neighbourhood-report` | 3 | EUR 49 |

Expected: only these five add-ons can self-serve through `create-checkout`; manual/internal catalog rows cannot create fulfilled credits.

---

## Task 3: Static Build, Migration, And Unit Test Gate

**Files:**
- Read: `package.json`
- Read: `supabase/migrations/*`
- Read: `src/test/*`
- Read: `supabase/functions/**/*.test.ts`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Typecheck**

Run:

```powershell
npm run typecheck
```

Expected: exit code `0`.

- [ ] **Step 2: Migration chronology**

Run:

```powershell
npm run lint:migrations:chronology
```

Expected:

```text
[migration-idempotency] OK
```

- [ ] **Step 3: Whitespace/conflict check**

Run:

```powershell
git diff --check
```

Expected: exit code `0`; line-ending warnings are acceptable, whitespace errors are not.

- [ ] **Step 4: Focused billing/role frontend tests**

Run:

```powershell
npx vitest run src/test/roleTierInteractionMatrix.test.ts src/test/rolePlanMap.test.ts src/test/DashboardUtilityTabs.behavior.test.tsx src/test/BillingTab.checkoutActions.test.ts src/test/BillingTab.addons.helpers.test.ts src/test/BillingTab.addons.test.tsx src/test/useUsageAddons.test.tsx src/test/stripeWebhookAddonInvestorFulfillment.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Edge billing tests**

Run:

```powershell
deno test --allow-env --allow-net --allow-read --allow-write supabase/functions/create-checkout/index.test.ts supabase/functions/create-checkout/pricing.test.ts supabase/functions/create-checkout/trials.test.ts supabase/functions/customer-portal/index.test.ts supabase/functions/check-subscription/index.test.ts supabase/functions/get-invoices/index.test.ts supabase/functions/stripe-webhook/index.test.ts supabase/functions/begin-role-switch/index.test.ts
```

Expected: all tests pass. DNS errors against `https://test.supabase.co` are acceptable only inside tests that assert auth failure.

---

## Task 4: Fresh Subscription Checkout Matrix

**Files:**
- Read: `e2e/stripe-payment-complete.spec.ts`
- Read: `supabase/functions/create-checkout/index.ts`
- Read: `supabase/functions/stripe-webhook/index.ts`
- Read: `supabase/functions/check-subscription/index.ts`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Run existing strict paid E2E**

Run:

```powershell
$env:E2E_COMPLETE_STRIPE_PAYMENT = "true"
$env:E2E_STRIPE_API_SUBSCRIPTION_CYCLES = "monthly,annual"
$env:E2E_STRIPE_ADDON_KEYS = "valuation_single,valuation_bundle,property_report_single,neighbourhood_report_single,neighbourhood_report_bundle"
$env:E2E_REQUIRE_STRIPE_TAX_AMOUNT = "true"
$env:E2E_EXPECT_STRIPE_TAX_RATE = "0.24"
$env:E2E_STRIPE_CHECK_DECLINED_CARD = "true"
npx playwright test e2e/stripe-payment-complete.spec.ts --project=chromium --workers=1
```

Expected: all tests pass.

- [ ] **Step 2: Expand subscription matrix if the current E2E still covers only `pro`**

Add or run Playwright/API coverage for:

| Plan | Monthly | Annual |
|---|---|---|
| `pro` | required | required |
| `agent_basic` | required | required |
| `developer_pro` | required | required |
| `professional_basic` | required | required |

Expected per checkout:

- Checkout Session `mode=subscription`.
- Stripe Subscription created automatically.
- `billing_subscriptions` row has correct `plan_key`, `billing_cycle`, `status=active`, and Stripe price ID.
- `profiles.subscription_product_id` matches the current-audience product only.
- `check-subscription` returns the expected entitlement payload.
- invoice exists with Stripe Tax and receipt/payment evidence.

- [ ] **Step 3: Verify duplicate active subscription prevention**

For each public audience, try to create the same-audience active subscription twice for the same disposable user.

Expected: second attempt is rejected before Stripe Checkout Session creation.

---

## Task 5: Trial And Post-Trial Matrix

**Files:**
- Read: `supabase/functions/create-checkout/trials.test.ts`
- Read: `supabase/functions/create-checkout/index.ts`
- Read: `supabase/functions/check-subscription/index.ts`
- Read: `supabase/functions/stripe-webhook/index.ts`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Confirm trial card collection**

Create trial Checkout for each public subscription plan with `start_trial=true`.

Expected:

- Checkout requires card collection.
- Subscription has `trial_end` approximately 7 days after creation.
- `subscription_trial_claims` prevents duplicate trial claims.
- `billing_subscriptions.status` maps to trialing/active entitlement during the trial window.

- [ ] **Step 2: Simulate successful post-trial renewal**

Use Stripe test clocks or a mocked webhook sequence for each plan:

1. `checkout.session.completed`
2. trialing subscription state
3. `invoice.payment_succeeded` after trial
4. active subscription state

Expected: entitlement remains active, invoice appears, `check-subscription` returns active paid access.

- [ ] **Step 3: Simulate failed post-trial payment**

Use Stripe test clocks or webhook fixtures:

1. trial ends
2. `invoice.payment_failed`
3. subscription becomes `past_due` or equivalent recovery status

Expected: UI shows recovery/payment issue state, no false paid renewal receipt, and entitlement behavior matches the configured grace policy.

- [ ] **Step 4: Simulate terminal trial lapse**

Send or replay terminal events such as canceled/unpaid/incomplete-expired.

Expected: `billing_subscriptions` status becomes terminal, profile product entitlement is cleared or ignored, and protected Pro UI is no longer accessible for that user.

---

## Task 6: Add-On Purchase And Consumption Matrix

**Files:**
- Read: `supabase/migrations/20260628193711_addon_purchase_credit_delivery.sql`
- Read: `supabase/migrations/20260630121222_fix_ai_bundle_credit_reservation_limit.sql`
- Read: `supabase/migrations/20260630121353_fix_ai_bundle_credit_trigger_limit.sql`
- Read: `src/hooks/useUsageAddons.ts`
- Read: `src/pages/dashboard/BillingTab.tsx`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Complete paid Checkout for every self-serve add-on**

Run the strict Playwright add-on matrix from Task 4.

Expected:

| Add-on | Supabase `credits_granted` |
|---|---:|
| `valuation_single` | 1 |
| `valuation_bundle` | 5 |
| `property_report_single` | 1 |
| `neighbourhood_report_single` | 1 |
| `neighbourhood_report_bundle` | 3 |

- [ ] **Step 2: Exhaust each add-on through runtime usage**

Use disposable users and service-role probes against the real sandbox RPCs:

- `reserve_ai_quota_for_user` for `property-valuation`
- `reserve_ai_quota_for_user` for `neighbourhood-report`
- `charge_property_report_fetch_for_user` for `property-report`

Expected:

| Add-on | Allowed paid overage | Next attempt |
|---|---:|---|
| `valuation_single` | 1 | `monthly_limit_reached` |
| `valuation_bundle` | 5 | `monthly_limit_reached` |
| `neighbourhood_report_single` | 1 | `monthly_limit_reached` |
| `neighbourhood_report_bundle` | 3 | `monthly_limit_reached` |
| `property_report_single` | 1 | `report_limit_reached` or `report_monthly_limit_reached` |

- [ ] **Step 3: Confirm declined card no-delivery**

Run declined-card Checkout for an add-on.

Expected:

- no paid `addon_purchases` row
- no credits granted
- no entitlement changes
- failed Stripe payment object visible in sandbox

---

## Task 7: User-Type Switching Upgrade/Downgrade Matrix

**Files:**
- Read: `supabase/functions/begin-role-switch/index.ts`
- Read: `supabase/functions/log-role-switch/index.ts`
- Read: `supabase/functions/complete-onboarding-role/index.ts`
- Read: `src/pages/dashboard/BillingTab.tsx`
- Read: `src/components/RoleSwitchModal.tsx`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Validate-only role-switch preflight**

For each disposable starting role, call `begin-role-switch` with `{ "validate_only": true }`.

Expected: returns `{ "success": true, "validate_only": true }` and does not mutate `profiles.role`, `profiles.participant_type`, or `role_switch_in_progress_at`.

- [ ] **Step 2: Upgrade switching matrix**

Test disposable users for:

| From | To | Expected billing behavior |
|---|---|---|
| buyer free | participant Pro | subscription checkout |
| buyer/seller | agent | role-switch modal then agent checkout |
| buyer/seller | developer | role-switch modal then developer checkout |
| buyer/seller | professional | role-switch modal then professional checkout |
| participant Pro | agent Pro | old participant entitlement ignored; agent checkout required |
| participant Pro | developer Pro | old participant entitlement ignored; developer checkout required |
| participant Pro | professional Pro | old participant entitlement ignored; professional checkout required |

Expected: `check-subscription` only grants entitlements for the current audience.

- [ ] **Step 3: Downgrade/switch-away matrix**

For disposable paid users, switch away from paid role.

Expected:

- old role access is blocked during `role_switch_in_progress_at`
- current-audience subscription is cancelled or ignored according to the implemented path
- add-on purchases remain ledgered but do not mint unrelated entitlements
- protected role routes block stale access

- [ ] **Step 4: Invite-only investor/institutional switching**

Attempt self-service switch into `investor` and `institutional`.

Expected: no public Checkout; access requires admin-approved invitation/payment flow only.

---

## Task 8: Billing Portal, Invoices, Receipts, And VAT

**Files:**
- Read: `supabase/functions/customer-portal/index.ts`
- Read: `supabase/functions/get-invoices/index.ts`
- Read: `src/pages/dashboard/BillingTab.tsx`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Open Customer Portal for a paid subscription**

Expected:

- portal opens for the user’s Stripe Customer
- no browser receives Stripe secret data
- return URL is allowlisted

- [ ] **Step 2: Update card in portal**

Use a Stripe test card update.

Expected: payment method updates in Stripe and the app continues showing active subscription.

- [ ] **Step 3: Cancel at period end**

Cancel subscription in portal for disposable user.

Expected:

- Stripe subscription has `cancel_at_period_end=true`
- webhook updates durable state
- UI shows scheduled cancellation, not immediate false lapse

- [ ] **Step 4: Resume or replace subscription**

Resume before period end if portal allows it, or create a replacement Checkout after cancellation.

Expected: durable billing state reconciles to the active replacement.

- [ ] **Step 5: Verify invoice and receipt evidence**

For fresh monthly, annual, and one-time add-on payments, verify:

- invoice exists
- receipt/payment evidence exists
- invoice status is paid
- tax is present
- account VAT/company VAT information is present where Stripe supports it
- customer tax fields are not malformed

- [ ] **Step 6: Verify Greek VAT**

Expected:

- Stripe Tax applied at 24% for Greek taxable software products.
- invoice `tax_amount / pre_tax_amount = 0.24` for Greece test customer.
- company VAT `EL802708301` is visible in invoice/account tax evidence where configured.

---

## Task 9: Webhook Idempotency And Failure Recovery

**Files:**
- Read: `supabase/functions/stripe-webhook/index.ts`
- Read: `supabase/migrations/20260628120000_stripe_billing_state.sql`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Verify recent webhook health**

Query:

```sql
SELECT event_id, status, event_type, created_at
FROM public.stripe_webhook_events
WHERE created_at >= now() - interval '1 hour'
ORDER BY created_at DESC;
```

Expected: recent events are `processed`; failure count is `0`.

- [ ] **Step 2: Replay a checkout event**

Replay or resend one recent `checkout.session.completed` event from sandbox.

Expected:

- `stripe_webhook_events` records idempotent handling
- no duplicate `billing_subscriptions`
- no duplicate `addon_purchases`
- profile entitlement remains correct

- [ ] **Step 3: Replay invoice events**

Replay `invoice.created`, `invoice.payment_succeeded`, and a failed-payment fixture.

Expected: invoice state and subscription state reconcile without duplicate rows or stale entitlement.

- [ ] **Step 4: Signature failure test**

Send a webhook request with wrong signature.

Expected: HTTP `400`, no fulfillment, no ledger write.

---

## Task 10: RLS And Browser Security Gate

**Files:**
- Read: `supabase/migrations/20260630072117_restrict_addon_purchases_browser_privileges.sql`
- Read: `supabase/migrations/20260628120000_stripe_billing_state.sql`
- Read: `supabase/migrations/20260707157000_addon_purchase_and_investor_payment_ledger.sql`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Browser role cannot write billing ledgers**

Attempt `INSERT`, `UPDATE`, and `DELETE` as authenticated browser user against:

- `addon_purchases`
- `billing_subscriptions`
- `billing_customers`
- `stripe_webhook_events`

Expected: denied or no-op; no write occurs.

- [ ] **Step 2: Users can read only own billing rows**

Create two disposable users with paid rows.

Expected: user A cannot read user B billing rows through anon/authenticated client.

- [ ] **Step 3: Service role can fulfill**

Insert a synthetic paid add-on row with service role, then delete it.

Expected: service role succeeds; trigger grants expected credits; cleanup succeeds.

---

## Task 11: Admin Pricing And Catalog Sync

**Files:**
- Read: `src/pages/AdminPricing.tsx`
- Read: `scripts/setup-stripe-catalog.mjs`
- Read: `scripts/check-stripe-business-logic.mjs`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Admin Pricing page smoke**

Log in as `admin@maiprop.demo`, navigate to `/admin?tab=pricing`.

Expected:

- public subscription rows show monthly and annual separately
- investor/institutional rows show custom annual invite-only behavior
- manual/internal catalog rows are not shown as self-serve fulfilled products

- [ ] **Step 2: Price immutability behavior**

Test a sandbox price change from Admin Pricing or catalog script.

Expected:

- old Stripe Price archived or left active according to the explicit replacement flow
- new Price created
- Supabase metadata points to the replacement price
- existing subscriptions are not silently mutated

- [ ] **Step 3: Re-run catalog audit**

Run:

```powershell
npm run check:stripe-business-logic
```

Expected: all rows still pass.

---

## Task 12: Full Browser Role Smoke

**Files:**
- Read: `.agents/skills/testing-qa/SKILL.md`
- Read: `e2e/*`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Start local app**

Run:

```powershell
npm run dev
```

Expected: local Vite URL opens and connects to Supabase project `qvvicunqcrwpioqnvzxf`.

- [ ] **Step 2: Billing tab role smoke**

Log in and inspect `/dashboard?tab=billing` for:

- buyer free
- buyer pro
- seller free
- seller pro
- agent pro
- developer pro
- professional pro
- investor private
- investor institutional
- admin

Expected: each role sees only its appropriate subscription, invoices, portal eligibility, add-ons, and invite-only messaging.

- [ ] **Step 3: Protected route smoke**

Verify stale paid access does not open protected role routes after role switch or lapse.

Expected: route guards block stale or wrong-audience access.

---

## Task 13: Sandbox-To-Live Promotion Dry Run

**Files:**
- Read: `.env.example`
- Read: `.env.staging.example`
- Read: `docs/ENV_SETUP.md`
- Read: `docs/PRODUCTION_CHECKLIST.md`
- Read: `scripts/setup-stripe-catalog.mjs`
- Update evidence: `docs/billing/sandbox-go-live-evidence-2026-06-30.md`

- [ ] **Step 1: Create live mapping table**

Record sandbox-to-live mappings for:

- product IDs
- monthly price IDs
- annual price IDs
- one-time add-on price IDs
- webhook endpoint ID
- webhook signing secret name
- Stripe Tax status
- account VAT/tax ID status

Expected: every sandbox product has an intended live equivalent.

- [ ] **Step 2: Live account preflight without payments**

Against live account `acct_1TnuLTGfOEgBOxtl`, verify account name, country, currency, and catalog shape without creating customer payments.

Expected: live account is `mAI prop`, country `GR`, currency `eur`, and no sandbox IDs are configured in live Supabase.

- [ ] **Step 3: Edge function deployment checklist**

Before live release, deploy or verify individually:

```powershell
npx supabase functions deploy create-checkout --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy stripe-webhook --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy check-subscription --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy customer-portal --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy get-invoices --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy create-investor-payment --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy begin-role-switch --project-ref qvvicunqcrwpioqnvzxf
npx supabase functions deploy log-role-switch --project-ref qvvicunqcrwpioqnvzxf
```

Expected: each function deploy exits `0`.

- [ ] **Step 4: Live secrets checklist**

Verify live Supabase secrets are set:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_API_VERSION`
- live price ID fallbacks, if still used
- site URLs for success/cancel/portal return

Expected: no sandbox `sk_test`, `price_`, `prod_`, or webhook secret values are present in live secrets.

---

## Final Go-Live Decision

- [ ] All tasks above pass.
- [ ] Evidence file is complete.
- [ ] No open critical/high billing bugs.
- [ ] Sandbox webhook failures in the last hour: `0`.
- [ ] Stripe connector/account confusion is documented.
- [ ] A rollback plan exists: restore prior Supabase secrets, disable live Checkout entry points, and pause paid CTAs from Pricing/Billing if live payments fail.

If every checkbox is complete, proceed to live setup in a controlled release window and run one low-value real live payment followed by refund/cancellation as the final production smoke.
