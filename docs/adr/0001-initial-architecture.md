# ADR-0001: Initial architecture

- **Status:** Accepted (retrospective record — codified 2026-04-27)
- **Deciders:** @krenios
- **Date:** 2026-04-27 (retroactive — original decisions made 2025-01)

## Context

`maiprop-listing-site` is a Greek real-estate listing, auction, and
investment platform. The product needs:

- Listing search and filtering for buyers / renters / investors
- Map-based discovery (Greek properties, Mapbox)
- Multi-role user system (buyer, seller, agent, professional, admin,
  investor, institutional)
- Stripe-based subscription paywall (4 tiers per role)
- AI assistance for listing creation, valuation, and chat
- Real-time auction bidding for foreclosure properties (with Greek
  Land Registry integration via the Open Spitia / OS sync APIs)
- GDPR-compliant data handling (EU-resident user base)
- Document templates for Greek real-estate transactions (purchase
  agreements, lease agreements, etc.)
- Multilingual UI (Greek + English)

The team is one human developer plus AI co-pilots. Infrastructure must be
operable by a single person.

## Decision

### Frontend: Vite + React 18 + TypeScript (strict)

- **Vite** over CRA: faster dev server, simpler config, first-class TS
  support, smaller bundles.
- **React 18** over Vue/Svelte: ecosystem maturity, hiring pool, library
  support (Radix, shadcn, react-map-gl).
- **TypeScript strict** over loose-mode JS: catches errors at compile
  time; enforced via `tsconfig.app.json` (`strict: true`,
  `noUncheckedIndexedAccess: true`).

### Backend: Supabase (Postgres + Auth + Edge Functions + Storage)

- **Supabase** over custom Node/Express + custom auth + custom file
  storage:
  - Auth, RLS, storage, realtime, edge functions all in one product.
  - Postgres-native — no NoSQL impedance mismatch.
  - Hostable on EU region (GDPR compliance baked in).
  - Single team can operate it.
- **Edge functions in Deno**, not Node Lambdas: native Web APIs,
  no `npm install` step in deploys, faster cold start.
- **Row Level Security (RLS)** enforced on every user-data table. RLS is
  the primary authorization mechanism — backend authorization is *not*
  duplicated in edge functions.

### State: React Query + Context

- **React Query** for all server state (caching, refetching,
  optimistic updates). Replaces Redux/MobX/Zustand for data fetching.
- **React Context** only for cross-cutting state that doesn't come from
  the server: auth user/profile, theme. Not used as a general state
  store.
- **No Redux.** Server state lives in React Query; transient UI state
  lives in `useState`/`useReducer`.

### UI: Radix + shadcn-ui + Tailwind

- **Radix Primitives** for accessibility-correct interactive components
  (dialogs, menus, popovers).
- **shadcn-ui** for pre-styled wrappers around Radix — these live in
  `src/components/ui/` and are *vendored* (not a dependency); we own
  them.
- **Tailwind CSS** for styling. Design tokens in `tailwind.config.ts`.
- No CSS-in-JS (no styled-components, no emotion). Tailwind covers the
  surface and avoids runtime style injection.

### Routing: React Router v6

- Lazy-loaded routes via `React.lazy` to keep initial bundle small.
- Route guards as wrapper components (`ProtectedRoute`, `AdminRoute`,
  `SellerRoute`, `InvestorRoute`).

### Hosting: Cloudflare Pages

- **Cloudflare Pages** over Vercel/Netlify/AWS Amplify:
  - Free tier covers our traffic.
  - Workers integration for edge middleware (auth header injection,
    bot blocking).
  - Built-in CDN with EU PoPs.
  - Native CSP via `_headers` file.
- Edge functions deployed separately to Supabase (not Cloudflare
  Workers) — reuses Supabase's auth/secrets/logging.

### Payments: Stripe

- **Stripe Subscriptions** for the 4-tier paywall. Standard for SaaS.
- **Webhook signature verification** in `supabase/functions/stripe-webhook/`
  is the source of truth for subscription state — never trust the
  frontend.

### AI: OpenAI / Lovable Cloud (server-side only)

- AI calls are *only* from edge functions. Never from the frontend
  (would expose API keys, bypass rate limiting, and leak PII to the
  model provider).
- Supported providers: OpenAI (chat, embeddings), Lovable Cloud
  (gateway), Mapbox (geocoding).

### Maps: Mapbox GL

- **Mapbox GL** over Leaflet/Google Maps:
  - Vector tiles for performance.
  - Custom styling matches our brand.
  - Sufficient EU coverage for Greek properties.

### Testing: Vitest + Playwright + Deno test

- **Vitest** for unit and component tests (fast, jest-compatible).
- **Playwright** for E2E (cross-browser, includes accessibility checks
  via `@axe-core/playwright`).
- **Deno's built-in test runner** for edge functions (no npm
  toolchain in those packages).

### CI/CD: GitHub Actions

- **GitHub Actions** for CI (already where the code lives).
- Multi-job pipeline: `quality` → `e2e` → `migrations-validate` →
  `lighthouse` → `deploy`.
- DORA metrics: targets are Elite tier (multiple deploys/day, <1h
  lead time). Currently meeting both.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Next.js (instead of Vite) | We don't need SSR; the buyer-facing pages benefit more from CDN + cached SPA shell than per-request server rendering. The Cloudflare Pages CDN is closer to users than any SSR origin would be. |
| Custom backend (Express/Fastify on AWS) | A solo team cannot reasonably operate Postgres + auth + storage + edge runtime + secrets management on its own. Supabase's bundled offering wins on operational cost. |
| Firebase | Vendor lock-in to NoSQL; weaker RLS story; no native Postgres for the relational data we need (listings × auctions × bids × users). |
| Vercel hosting | Cost ramp on bandwidth/edge function invocations; we don't need the framework-tight integration since we're on Vite. |
| Vue / Svelte | Smaller hiring pool; thinner ecosystem for the specific libraries we depend on (react-map-gl, Radix). |
| GraphQL | Over-engineering for our use case; Supabase's PostgREST + RLS gives us typed, secure CRUD with no schema-stitching complexity. |
| Monorepo (Nx/Turborepo) | We have a single deployable unit. The mental overhead and CI cost of monorepo tooling does not pay off until we have ≥3 deployable apps sharing significant code. |

## Consequences

### Positive

- Single CI pipeline, single deploy target, single auth source of truth.
- All security logic (RLS) lives next to the data, eliminating "forgot
  to add the auth check in the new endpoint" bugs.
- Lazy-loaded routes mean adding a new page does not bloat the initial
  bundle.
- Type-safety from DB schema → generated types → React Query hooks →
  components. End-to-end type inference is the project's main
  productivity multiplier.

### Negative

- **Vendor concentration on Supabase.** If Supabase has a global outage,
  the app is fully down (auth, DB, edge functions, storage). Mitigation:
  Supabase has a 99.9% SLA on Pro tier; we accept the residual risk in
  exchange for the operational simplicity.
- **No SSR means slower TTFB on cold cache.** Mitigation: aggressive
  CDN caching of the SPA shell; pages render meaningful content within
  ~200ms once JS is parsed.
- **Edge functions in Deno cannot share the npm `supabase-js` typings
  without rewriting.** Mitigation: edge functions have their own
  Deno-native type imports; some duplication is accepted.

### Risks accepted

- **Bus factor of 1 human** (see `docs/archive/audits/ENTERPRISE_ASSESSMENT_2026-04-27.md`).
  Mitigated by: (a) this ADR + `CLAUDE.md` + `CONTRIBUTING.md` make the
  architecture intelligible to a successor; (b) `CODEOWNERS` formalizes
  blast-radius modules; (c) Supabase's hosted nature means a successor
  can take over by getting access to one Supabase project + one Cloudflare
  account.

## Future ADRs

Decisions that will warrant their own ADR if/when revisited:

- **ADR-0002 (open):** Whether to add Sentry / OpenTelemetry for
  production observability.
- **ADR-0003 (open):** Whether to add a circuit-breaker layer for
  external AI provider calls.
- **ADR-0004 (open):** Whether to introduce a state-management library
  for transient cross-page UI state (currently we use URL params and
  React Context).

---

**ADR template:** when proposing future ADRs, copy this file and update
the metadata header. Number sequentially.
