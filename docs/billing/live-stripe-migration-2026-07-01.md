# Live Stripe Migration Plan And Evidence

## Summary
- Target live Stripe account: `acct_1TnuLTGfOEgBOxtl` (`mAI prop`).
- Production Supabase project: `qvvicunqcrwpioqnvzxf`.
- Sandbox/test account remains `acct_1TnuLbGfkWWBWEyh` (`mAI prop sandbox`).
- Live migration is blocked unless Stripe objects are `livemode=true`. Catalogue bootstrap uses a dedicated, temporary, least-privilege `rk_live_...` key; standard `sk_live_...` keys are refused.

## Implementation Plan
1. Create the live Stripe catalogue with the existing catalogue script:
   `STRIPE_CATALOG_BOOTSTRAP_KEY=rk_live_... npm run stripe:setup-catalog -- --live --confirm-live-account acct_1TnuLTGfOEgBOxtl --write-env .stripe.live.env --write-sql .tmp/stripe-live-pricing-metadata.sql`
   Revoke that restricted bootstrap key immediately after the catalogue and generated metadata have been verified.
2. Configure live Stripe account-level items:
   - Greek account tax/VAT ID `EL802708301`.
   - Active Stripe Tax registration for Greece/EU.
   - Billing Customer Portal in live mode.
   - Exactly one live direct Payment Method Configuration marked as default, with card enabled. Checkout intentionally omits `payment_method_types` and `payment_method_configuration`, so Stripe applies this verified default configuration.
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
   - `STRIPE_EXPECTED_ACCOUNT_ID=acct_1TnuLTGfOEgBOxtl` as a runtime defense; the release verifier and live bootstrap also pin this ID in source.
   - `STRIPE_RUNTIME_MODE=live`
   - `STRIPE_LIVE_MODE=true`
   - `STRIPE_COMPANY_VAT_ID=EL802708301`
6. Apply only the reviewed backward-compatible database migrations and pricing
   metadata. Do not deploy new Edge Functions or Pages code yet.
7. Dispatch the main-only exact-SHA verifier from `main`; do not export live
   Stripe or evidence-signing keys into a developer shell:
   `gh workflow run verify-stripe-live-readiness.yml --ref main -f release_sha=<full-main-sha> -f confirm=VERIFY_STRIPE_LIVE_READINESS`
8. The original dispatcher must be listed in the repository variable
   `PRODUCTION_RELEASE_APPROVERS`. The workflow checks out the supplied SHA,
   proves it is the current clean `origin/main`, records the repository,
   workflow definition SHA/ref, event SHA/name, and dispatcher identities,
   generates schema-qualified evidence signed with a domain-separated HMAC and
   single-use run nonce, verifies it immediately, and uploads it under an
   immutable attempt-qualified name. The signing key and minimally scoped
   `rk_live_...` Stripe key are repository secrets; GitHub private Free does not
   provide protected-environment controls for this repository. The production
   deployment workflow
   must query GitHub's artifact and workflow-run APIs, bind the artifact ID,
   digest, repository, workflow path, event, run ID, attempt, actor, and exact
   SHA, then verify the HMAC and freshness before mutation. Reruns,
   substituted actors, and non-allowlisted dispatchers fail closed.
9. Only after the exact-SHA evidence succeeds, deploy the matching Supabase
   Edge Functions and Cloudflare Pages artifact. Run the controlled live
   checkout/webhook/refund proof and rollback immediately on any failed gate.

## Exhaustive Test Gates
- `npm run check:stripe-account -- --expected-account acct_1TnuLTGfOEgBOxtl`
- `npm run check:stripe-business-logic -- --allow-live`
- `npm run check:stripe-tax-readiness -- --strict`
- main-only `Verify Stripe Live Readiness` workflow succeeds on attempt 1 for the exact current `main` SHA and the allowlisted dispatcher
- downloaded `stripe-live-readiness-<sha>-<run-id>-1` artifact matches GitHub's API-reported ID/digest/run metadata and contains fresh valid HMAC-signed evidence
- `npm run typecheck`
- `npm run test`
- `npm run test:deno`
- targeted Playwright billing tests after live cutover, using only controlled low-value/refunded live transactions.

## Current Evidence
- Historical connector observations are not current release evidence. The Stripe connector presently requires reauthentication, so no connector result may be used to authorize this release.
- GitHub run `31572311971` failed closed before provider access because `PRODUCTION_RELEASE_APPROVERS` is unset; it produced no readiness artifact.
- Repository and organization scopes currently lack the restricted readiness key and release-evidence signing key required by the verifier.
- Production Supabase currently has Stripe-related Edge secrets set by name, including `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RUNTIME_MODE`, `STRIPE_LIVE_MODE`, public price fallback secrets, and company VAT secrets.
- Production Supabase pricing metadata still points at the existing sandbox/test Stripe IDs until the live catalogue SQL is applied.

## Go/No-Go Rule
Go live only when the exact release workflow produces signed `stripe-live-migration-evidence.json` with `ok=true` using a minimally scoped `rk_live_...` key. Full `sk_live_...` and test keys fail closed. The production app must also pass one controlled live Checkout, webhook fulfillment, invoice/VAT, portal, cancellation, add-on delivery, and refund/cancel cleanup test.
