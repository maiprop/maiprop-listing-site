# Live Stripe Migration Plan And Evidence

## Summary
- Target live Stripe account: `acct_1TnuLTGfOEgBOxtl` (`mAI prop`).
- Production Supabase project: `qvvicunqcrwpioqnvzxf`.
- Sandbox/test account remains `acct_1TnuLbGfkWWBWEyh` (`mAI prop sandbox`).
- Live migration is blocked unless Stripe objects are `livemode=true`; the installed connector currently writes `livemode=false`, so production live setup requires an `sk_live_...` key or equivalent live-mode Stripe API session.

## Implementation Plan
1. Create the live Stripe catalogue with the existing catalogue script:
   `STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup-catalog -- --live --write-env .stripe.live.env --write-sql .tmp/stripe-live-pricing-metadata.sql`
2. Configure live Stripe account-level items:
   - Greek account tax/VAT ID `EL802708301`.
   - Active Stripe Tax registration for Greece/EU.
   - Billing Customer Portal in live mode.
   - Live webhook endpoint: `https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/stripe-webhook`.
3. Apply every pending migration and the generated pricing metadata to the
   isolated staging Supabase project. Verify migration versions, grants,
   idempotency, catalogue reads, checkout, webhook fulfillment, invoice credit,
   portal, cancellation, and refund there before touching production.
4. Review the backward-compatible production migration plan and the generated
   `.tmp/stripe-live-pricing-metadata.sql`; every referenced Product and Price
   must be live-mode and tied to the expected account.
5. Set production Supabase Edge secrets from `.stripe.live.env` plus:
   - `STRIPE_SECRET_KEY=sk_live_...`
    - `STRIPE_WEBHOOK_SECRET=whsec_...` from the live webhook endpoint.
    - `STRIPE_EXPECTED_ACCOUNT_ID=acct_1TnuLTGfOEgBOxtl`.
   - `STRIPE_RUNTIME_MODE=live`
   - `STRIPE_LIVE_MODE=true`
   - `STRIPE_COMPANY_VAT_ID=EL802708301`
6. Apply only the reviewed backward-compatible database migrations and pricing
   metadata. Do not deploy new Edge Functions or Pages code yet.
7. Dispatch the protected exact-SHA verifier from `main`; do not export live
   Stripe or evidence-signing keys into a developer shell:
   `gh workflow run verify-stripe-live-readiness.yml --ref main -f release_sha=<full-main-sha> -f confirm=VERIFY_STRIPE_LIVE_READINESS`
8. Approve the `production` environment review for that fresh attempt-1 run.
   The workflow checks out the supplied SHA, proves it is the current clean
   `origin/main`, generates signed evidence with a single-use run nonce,
   verifies it immediately, uploads it, and creates a GitHub provenance
   attestation. The production deployment workflow must consume that exact
   run's evidence before its freshness window expires; reruns and substituted
   actors fail closed.
9. Only after the exact-SHA evidence succeeds, deploy the matching Supabase
   Edge Functions and Cloudflare Pages artifact. Run the controlled live
   checkout/webhook/refund proof and rollback immediately on any failed gate.

## Exhaustive Test Gates
- `npm run check:stripe-account -- --expected-account acct_1TnuLTGfOEgBOxtl`
- `npm run check:stripe-business-logic -- --allow-live`
- `npm run check:stripe-tax-readiness -- --strict`
- protected `Verify Stripe Live Readiness` workflow succeeds on attempt 1 for the exact current `main` SHA
- downloaded `stripe-live-readiness-<sha>-<run-id>-1` artifact has a valid GitHub provenance attestation and fresh signed evidence
- `npm run typecheck`
- `npm run test`
- `npm run test:deno`
- targeted Playwright billing tests after live cutover, using only controlled low-value/refunded live transactions.

## Current Evidence
- Stripe connector account info reports `acct_1TnuLTGfOEgBOxtl` / `mAI prop`.
- Connector write probe created `prod_Uno9cbuycL654d` with `livemode=false`; it was immediately archived. This proves the connector is not sufficient for live-mode object creation.
- Connector catalogue inspection showed no active Products or Prices in the connector session, and the write probe returned `livemode=false`; therefore this connector session must not be used as proof of live-mode catalogue readiness.
- Production Supabase currently has Stripe-related Edge secrets set by name, including `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RUNTIME_MODE`, `STRIPE_LIVE_MODE`, public price fallback secrets, and company VAT secrets.
- Production Supabase pricing metadata still points at the existing sandbox/test Stripe IDs until the live catalogue SQL is applied.

## Go/No-Go Rule
Go live only when the exact release workflow produces signed `stripe-live-migration-evidence.json` with `ok=true` using a minimally scoped `rk_live_...` key (or a live secret key only where restricted-key permissions are insufficient), and the production app has passed one controlled live Checkout, webhook fulfillment, invoice/VAT, portal, cancellation, add-on delivery, and refund/cancel cleanup test.
