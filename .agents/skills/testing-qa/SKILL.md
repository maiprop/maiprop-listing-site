---
name: testing-qa
description: Isolated local QA and source-aware module checks for maiprop-listing-site.
---

# Testing and QA

Select an explicit local or isolated test target before starting. Localhost describes the frontend, not its backend: inspect VITE_SUPABASE_URL and the public key class without printing secrets. Never default QA to production, change customer entitlements, reset credentials or seed production for convenience. Existing user authorization and actual task scope govern actions.

## Local setup

Read package.json, .env.example and playwright.config.ts. Follow README.md Quick Start for a new checkout; in an existing prepared checkout, reuse frozen installed dependencies. Use the installed project runtime through node scripts/project-runtime.mjs -- npm and inspect runtime:doctor if needed. Configure a local/disposable backend or a fixture-only browser test; never expose service/secret keys in VITE variables.

The Playwright config can start Vite locally, or use PLAYWRIGHT_BASE_URL for an explicitly selected server. It inherits environment values and may reuse an existing server. Verify both before running. Placeholder defaults are not a network isolation guarantee. Inspect the chosen spec and fixture interceptors; reject unexpected external requests. Fixture rendering does not prove actual RLS, provider delivery, billing or hosted behavior.

Run a named relevant spec with the installed runner, for example node scripts/project-runtime.mjs -- npm run test:e2e -- e2e/pages-public.spec.ts --project=chromium, only after its target/fixture setup is verified. Live-named specs are separate integration work and can perform mutations; read them and confirm the authorized isolated target before use. Do not run all live tests as a login remedy.

For an ordinary selected local environment, start the app with `node scripts/project-runtime.mjs -- npm run dev`. For component/service-mock verification without a live backend, run a named `src/test` file with `node scripts/project-runtime.mjs -- npm run test -- <test-file>`. These commands do not substitute for reading whether the chosen test makes real requests.

## Accounts and access

Synthetic account creation is an explicit isolated fixture operation. Obtain fixture credentials through the approved secret channel; do not publish working passwords or reset a shared account on failed login. Do not set force_pro_access broadly. To test plans, create narrowly scoped fixture state and verify cleanup in the disposable environment.

Authority profiles.role, participant presentation, billing entitlement, ownership and organization permissions are independent. Consult src/lib/authUtils.ts, participantConfig.ts, useSubscription.ts and the server operation. UI visibility is not authorization proof.

The portal's public website routes do not imply anonymous access to private actions. Cloudflare Access is a separate environment boundary; inspect the response when it is encountered. Do not assume a site-lock passcode, bypass Access or switch to production simply to make a test work.

## Meaningful module checks

- Auctions: identity, list/detail, supported filters, loading/error/empty states and retained comparable-sales versus previous-round surfaces.
- Open Houses: Upcoming/Past, actor/host permissions, RSVP quota/capacity, replay and supported offer workflow.
- Professionals: public projection/category/detail, owner/admin management, unrelated denial and related-card navigation.
- Saved items: account switch, mutation rollback, late hydration and saved order.
- New builds: enquiry retry, ownership and factual partial outcomes.
- Billing/email/AI: fixture response presentation separately from real service/database/provider evidence.

Use synthetic data and verify returned results and persisted state for mutations. Keep browser fixture, actual-role database, local transport and hosted integration results separate. Preserve screenshots/traces only as useful and without sensitive data. Do not claim whole-module completion from test existence or aggregate overlapping runs.

Release and migrations follow docs/PRODUCTION_RELEASE_RUNBOOK.md. No deployment is required merely to verify a local change.
