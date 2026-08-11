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
3. Apply the generated `.tmp/stripe-live-pricing-metadata.sql` to production Supabase only after reviewing that every product/price ID is live-mode.
4. Set production Supabase Edge secrets from `.stripe.live.env` plus:
   - `STRIPE_SECRET_KEY=sk_live_...`
    - `STRIPE_WEBHOOK_SECRET=whsec_...` from the live webhook endpoint.
    - `STRIPE_EXPECTED_ACCOUNT_ID=acct_1TnuLTGfOEgBOxtl`.
   - `STRIPE_RUNTIME_MODE=live`
   - `STRIPE_LIVE_MODE=true`
   - `STRIPE_COMPANY_VAT_ID=EL802708301`
5. Deploy production Supabase Edge Functions and Cloudflare Pages from `main`.
6. From a clean checkout of the exact release commit, run the live migration
   gate with the protected evidence-signing key:
   `STRIPE_RESTRICTED_KEY=rk_live_... RELEASE_EVIDENCE_SIGNING_KEY=... RELEASE_EVIDENCE_SIGNING_KEY_ID=... npm run check:stripe-live-migration -- --release-sha <full-main-sha> --out stripe-live-migration-evidence.json`
7. Verify the signed artifact before promotion:
   `RELEASE_EVIDENCE_SIGNING_KEY=... RELEASE_EVIDENCE_SIGNING_KEY_ID=... npm run verify:stripe-live-migration-evidence -- --evidence stripe-live-migration-evidence.json --release-sha <full-main-sha>`

## Exhaustive Test Gates
- `npm run check:stripe-account -- --expected-account acct_1TnuLTGfOEgBOxtl`
- `npm run check:stripe-business-logic -- --allow-live`
- `npm run check:stripe-tax-readiness -- --strict`
- `npm run check:stripe-live-migration -- --release-sha <full-main-sha> --out stripe-live-migration-evidence.json`
- `npm run verify:stripe-live-migration-evidence -- --evidence stripe-live-migration-evidence.json --release-sha <full-main-sha>`
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
