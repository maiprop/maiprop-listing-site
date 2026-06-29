# Production Deployment Checklist

Go through every box **before** promoting a release to production. This is a safety net, not a substitute for judgement — if something looks off, stop.

## 1. Code & CI

- [ ] All PRs merged to `main` are green on the `quality`, `e2e`, `migrations-validate`, and `lighthouse` CI jobs.
- [ ] No `// @ts-ignore`, `TODO: remove before prod`, `console.log(secret)`, or similar debug leftovers introduced this release.
- [ ] `npm audit --omit=dev --audit-level=high` passes locally.
- [ ] Dependabot has no **high** or **critical** open PRs against `main`.
- [ ] Branch protection on `main` is enabled (required reviews + required status checks + no force-push).

## 2. Secrets & environment

- [ ] All variables in [`ENV_SETUP.md`](./ENV_SETUP.md) "Production" table are set in Cloudflare Pages.
- [ ] All edge-function secrets are set in Supabase → Edge Functions → Secrets.
- [ ] No `VITE_` key contains a value that should be server-side only (publishable_key ≠ service_role).
- [ ] `VITE_SENTRY_DSN` set → verify by triggering a test error in Sentry staging project.
- [ ] Any secret rotated in the last 7 days has a row in [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).
- [ ] `gh secret-scanning alerts list` (or TruffleHog) shows zero open findings.

## 3. Database & migrations

- [ ] Every new file in `supabase/migrations/` has been applied to **staging** and the smoke checklist in [`STAGING_SETUP.md`](./STAGING_SETUP.md) passes there.
- [ ] `supabase db push` against production has no warnings about destructive changes.
- [ ] RLS policies on new tables reviewed — no `USING (true)` or `WITH CHECK (true)` without justification.
- [ ] Enterprise tenant migrations reviewed: `organizations`, `organization_memberships`, `organization_domains`, `organization_sso_providers`, and `procurement_evidence` all have RLS enabled.
- [ ] `e2e/rls-security.spec.ts` passes against staging credentials.
- [ ] Supabase PITR / daily backups enabled and retention >= 7 days. If the project is on Supabase Free, the free-tier logical backup fallback is active instead.
- [ ] Supabase Free fallback, when applicable: latest logical backup exists as an encrypted off-site backup.
- [ ] Last successful restore drill <= 90 days ago for paid PITR/daily backups, or <= 30 days ago for the Supabase Free logical-backup fallback (record date below).

## 4. Stripe & billing

- [ ] Production webhook endpoint exists in Stripe dashboard and points at `https://<prod-ref>.supabase.co/functions/v1/stripe-webhook`.
- [ ] `STRIPE_WEBHOOK_SECRET` in Supabase matches the one shown in Stripe dashboard (they rotate on endpoint recreate).
- [ ] `BILLING_MODE`/`STRIPE_MOCK_MODE` are unset before paid production launch; mock mode is only for pre-Stripe smoke checks and never proves real payment activation.
- [ ] Test-mode deployment uses `STRIPE_RUNTIME_MODE=test` or leaves it unset, an `sk_test_...` `STRIPE_SECRET_KEY`, and Stripe test webhook/price IDs.
- [ ] Live launch explicitly sets `STRIPE_RUNTIME_MODE=live` and `STRIPE_LIVE_MODE=true` before replacing `STRIPE_SECRET_KEY` with an `sk_live_...` key.
- [ ] Stripe Tax is enabled and verified in Checkout: sessions have `automatic_tax.enabled=true`, billing address collection, tax ID collection, Customer name/address updates, Product `tax_code`, Price `tax_behavior`, and payment-mode `invoice_creation.enabled=true`.
- [ ] `STRIPE_SECRET_KEY=sk_live_... npm run check:stripe-tax-readiness -- --strict` passes and confirms an active Greek/EU Stripe Tax registration plus tax-ready product/price metadata.
- [ ] `npm run test:deno` passes — signature tests are green.
- [ ] Admin Pricing sync has created/stored separate **live-mode** monthly and annual price IDs, or `STRIPE_PRICE_*` Edge secrets point to live-mode prices. Browser `VITE_STRIPE_PRICE_*` display fallbacks also match live mode. No `_test_` substring.
- [ ] Manual test: complete a checkout with a real card in an off-hours window; verify subscription appears in profile, webhook delivered 200, the Stripe invoice/PDF/receipt exist, and the Billing tab displays Greek VAT at 24% plus VAT ID when provided. For VAT launch gating, run the paid E2E with `E2E_REQUIRE_STRIPE_TAX_AMOUNT=true E2E_EXPECT_STRIPE_TAX_RATE=0.24`.
- [ ] Stripe customer emails are enabled in Stripe Billing email settings; after the live card smoke test, confirm the customer inbox received the Stripe invoice/receipt email.
- [ ] Manual test: approved investor request can create a bespoke Stripe Checkout URL via `create-investor-payment`, and completing it activates the pending investor subscription.

## 5. Monitoring & observability

- [ ] Sentry production project exists and has release created (`SENTRY_RELEASE` set in build if using source maps).
- [ ] Source maps uploaded to Sentry (if enabled) and **not** served publicly (`/*.map` rule in `public/_headers`).
- [ ] Supabase logs retention is adequate (pro tier → 7 days minimum).
- [ ] On-call rota documented and current contact knows who escalates.
- [ ] At least one synthetic uptime check (e.g. UptimeRobot, Better Stack) points at `https://portal.maiprop.co/` and `/sitemap-dynamic.xml`.

## 6. Security headers & CSP

- [ ] `public/_headers` CSP reviewed for this release. New third-party scripts require explicit entries in `script-src`.
- [ ] HSTS is set with `preload` and the domain is submitted to <https://hstspreload.org/> (once — not every release).
- [ ] No `'unsafe-eval'` or `'unsafe-inline'` in `script-src`.
- [ ] Run <https://securityheaders.com> against the staging URL — at least grade A.
- [ ] Run <https://observatory.mozilla.org> — at least grade A.

## 7. DNS, CDN, TLS

- [ ] Active production domain `portal.maiprop.co` resolves to Cloudflare Pages and serves the current build.
- [ ] TLS certificate is valid and renewal is automatic (Cloudflare managed cert).
- [ ] Apex/alias DNS (`maiprop.co`, `www.maiprop.co`) is either intentionally parked or 301s consistently to the active production domain.
- [ ] robots.txt + sitemap.xml accessible and up to date.

## 8. Accessibility & performance

- [ ] Latest Lighthouse CI report on `main` shows no failed assertions (run locally: `npm run lighthouse`).
- [ ] `e2e/accessibility.spec.ts` passes (includes axe scans across public listing, auction, open-house, quick-sale, pricing, legal, API-doc, and property-detail routes).
- [ ] Hero video has a poster image and `preload="metadata"`; not blocking LCP.

## 9. GDPR & legal

- [ ] Privacy policy + Terms of Service pages reflect current data processors (Supabase, Stripe, Sentry, Plausible, Mapbox, Google Maps, OpenAI/Anthropic, Resend).
- [ ] Cookie banner is present on first load and only fires analytics after consent.
- [ ] `e2e/gdpr-delete-account.spec.ts` passes against staging.
- [ ] Data retention schedule documented.
- [ ] Enterprise procurement evidence matrix reviewed: [`docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md`](./governance/PROCUREMENT_EVIDENCE_MATRIX.md).
- [ ] SSO/SAML requirements reviewed against [`docs/governance/ENTERPRISE_TENANCY_AND_SSO.md`](./governance/ENTERPRISE_TENANCY_AND_SSO.md). If customer SSO is required, Supabase SSO provider configuration and IdP test sign-in are verified in staging before production.

## 10. Post-deploy verification (within 30 minutes of go-live)

- [ ] Home page loads < 3s on a cold device.
- [ ] Sign in / sign out works.
- [ ] At least one successful upgrade via Stripe in live mode.
- [ ] Sentry received at least one transaction and zero new `error`-level events from real users.
- [ ] Cloudflare analytics shows traffic for `portal.maiprop.co` (rules out DNS misrouting).
- [ ] Stripe dashboard shows webhook delivered 200 for the test checkout.

---

## Rollback

If any post-deploy check fails within the first 30 minutes:

1. **Cloudflare Pages**: Deployments → find the previous green deploy → **Rollback to this deploy**. This is near-instant.
2. **Supabase migrations** are not automatically rolled back. If the bad deploy applied a schema change, write a compensating migration — do **not** drop the new column blindly.
3. File an incident under `docs/incidents/YYYY-MM-DD-<slug>.md` with a blameless timeline.

---

## Last restore test

Record here:

| Date (UTC) | Performed by | Outcome |
|---|---|---|
| 2026-06-18 | Platform | Pending operator execution; no successful restore drill recorded yet. See `docs/compliance/dora/RESTORE_DRILL_LOG.md` and run `npm run check:dr-restore-proof` before procurement review or production promotion. |
| 2026-06-27 | Codex | Successful non-production app-schema logical restore drill. Source backup timestamp 2026-06-27T17:47:44.293Z; disposable local Postgres target; verified profiles=101, listings=15726, projects=8, subscriptions/investor_subscriptions=10, open_house_registrations=3; release SHA 58937eaf; plaintext restore artifacts removed after verification. |
