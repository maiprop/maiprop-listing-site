# maiProp — Greek Real Estate Platform

A full-stack property listing and investment platform for the Greek market. Built with Vite + React 18 + TypeScript, Supabase (Postgres + Auth + Edge Functions), and Tailwind CSS.

## Quick Start

```bash
nvm use                         # Node 20.19.5 / npm 10.x
cp .env.example .env          # fill in required vars (see below)
npm ci
npm run dev                   # http://localhost:8080
```

This repo is pinned to Node `20.19.5` and npm `10.8.2`. `.nvmrc`,
`.node-version`, `.npmrc`, CI, and the development Dockerfile all enforce that
runtime contract.

## Required Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (optional — has fallback) |
| `VITE_STRIPE_PRO_PRODUCT_ID` | Stripe product ID for the Pro plan (optional) |

See `.env.example` for the full list.

### App not loading?

- **White screen or "Configuration Error"**: Copy `.env.example` → `.env` and fill in the Supabase vars from your [Supabase project dashboard](https://supabase.com/dashboard).
- **Stuck on "Loading..."**: Check your internet connection. The app must reach Supabase.

## Commands

```bash
npm run dev          # dev server on :8080
npm run check:runtime # verify Node/npm match package.json engines
npm run build        # production build (dist/)
npm run preview      # preview prod build on :4173
npm run lint         # ESLint
npm run test         # Vitest test suite (once)
npm run test:watch   # Vitest in watch mode
npm run db:push      # push Supabase migrations (requires supabase CLI)
npm run seed:users   # seed mock users (requires tsx)
```

## Architecture

```
src/
  App.tsx              — Router, lazy-loaded pages, per-route ErrorBoundary tree
  contexts/
    AuthContext.tsx     — Single auth + subscription state store
  pages/               — Route-level page components (lazy-loaded via React.lazy)
  components/          — Feature components (Navbar, PropertyCard, …)
    ui/                — shadcn-ui primitives (Radix UI — do not edit directly)
  hooks/               — All Supabase queries/mutations via React Query
  lib/
    format.ts          — Canonical formatPrice / formatDate / fmtDate / fmtTime
    authUtils.ts       — Role helpers (isPlatformAdmin, isSellSideRole)
    participantConfig.ts — Participant types, labels, pricing audience mapping
    listingUtils.ts    — Listing shape normalisation helpers
  integrations/
    supabase/
      client.ts        — Supabase client (validates env on init)
      types.ts         — Auto-generated DB types (do not edit manually)
  test/                — Vitest unit tests
supabase/
  functions/           — Deno edge functions
  migrations/          — SQL migrations (apply with npm run db:push)
```

### Auth & Role Model

Auth state lives exclusively in `AuthContext`. Route guards are wrapper components:

| Guard | Requirement |
|---|---|
| `ProtectedRoute` | Any authenticated user |
| `AdminRoute` | `profiles.role = 'admin'` |
| `InvestorRoute` | Active investor subscription |
| `SellerRoute` | Sell-side role (seller / agent / developer) |

Roles are stored in `profiles.role` and map to the `ParticipantId` type:
`buyer | seller | agent | developer | professional | investor | institutional`

Use `getParticipantTypeFromProfile()` from `src/lib/participantConfig.ts` to resolve a profile to its canonical participant type — it handles the legacy `bio __type:` prefix automatically.

**Never check roles by email** — `role = 'admin'` in the DB is the authoritative check.

### Data Layer

All server state goes through **React Query** hooks in `src/hooks/`:
- Use explicit `.select("col1, col2, …")` — never `select("*")`
- Apply `enabled: !!user` guards to skip unauthenticated fetches
- Invalidate related query keys on mutation success

Regenerate Supabase types after schema changes:
```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### Performance

- Listings grid uses `pageSize = 24` (infinite scroll via `useListingsPaginated`); map and split views fetch up to `MAP_FETCH_LIMIT = 200` rows in a single bounded request via `useListings` (see `src/hooks/useListings.ts`)
- `PropertyCard` images use `loading="lazy"` for native browser lazy-loading
- Dashboard analytics queries (`useListingViewTrends`, `useLeadFunnel`) are only fired inside the lazy-loaded `AnalyticsTab` — not on Dashboard mount
- Mapbox is dynamically imported inside `MapView` to keep it out of the initial JS bundle

## Backend Layers

The project has **two distinct backend function layers**. Use the table below to choose the correct one for any new endpoint:

| Layer | Directory | Runtime | Purpose | When to add here |
|---|---|---|---|---|
| **Cloudflare Pages Functions** | `functions/` | Node (edge) | Routing middleware, dynamic sitemap, static-route proxying | URL rewriting, response headers, sitemap generation — anything that must run at the CDN level before the SPA loads |
| **Supabase Edge Functions** | `supabase/functions/` | Deno | Business logic, AI calls, Stripe payments, emails, data sync | Any function that reads/writes the database, calls external APIs, or requires auth context |

**Rule of thumb:** If the function needs Supabase secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`) it belongs in `supabase/functions/`. If it only needs to intercept/rewrite an HTTP request at the edge, it belongs in `functions/`.

### Supabase Edge Functions

**Protected** (JWT required): `property-chat`, `pro-ai-tools`, `listing-ai-assist`, `create-checkout`, `check-subscription`, `customer-portal`, `create-stripe-price`, `process-email-queue`

**Public**: AI search, property valuation, neighbourhood reports, POIs, auction syncing, saved-search alerts

### Cloudflare Pages Functions (`functions/`)

| File | Purpose |
|---|---|
| `_middleware.ts` | Global request middleware (headers, redirects) |
| `sitemap-dynamic.xml.ts` | Server-rendered sitemap combining static + live listings |
| `property/[id].ts` | Property detail URL pass-through |
| `auction/[id].ts` | Auction detail URL pass-through |
| `new-build/[id].ts` | New-build detail URL pass-through |

## Further Reading

### Operations

- [`docs/ENV_SETUP.md`](./docs/ENV_SETUP.md) — environment variables for dev / staging / prod / CI
- [`docs/STAGING_SETUP.md`](./docs/STAGING_SETUP.md) — staging environment setup + smoke test checklist
- [`docs/PRODUCTION_CHECKLIST.md`](./docs/PRODUCTION_CHECKLIST.md) — pre-launch / pre-release gate
- [`docs/SECRETS_ROTATION.md`](./docs/SECRETS_ROTATION.md) — rotation cadence + incident procedure
- [`docs/LIGHTHOUSE_CI_SETUP.md`](./docs/LIGHTHOUSE_CI_SETUP.md) — GitHub App install + token
- [`docs/WEBHOOK_VERIFICATION.md`](./docs/WEBHOOK_VERIFICATION.md) — Stripe + MaiProp-OS HMAC contracts
- [`docs/AUDIT_RECONCILIATION.md`](./docs/AUDIT_RECONCILIATION.md) — external audit findings vs. reality

### API reference

- [`docs/api/README.md`](./docs/api/README.md) — edge-function API docs, with hosted Redoc at [`/api-docs.html`](./public/api-docs.html) after deploy
- [`docs/api/edge-functions.openapi.yaml`](./docs/api/edge-functions.openapi.yaml) — OpenAPI source of truth

### Platform reference

- [`docs/PLATFORM_REFERENCE.md`](./docs/PLATFORM_REFERENCE.md) — canonical roles, participant IDs, pricing keys, routes, modules
- [`docs/QA_CHECKLIST.md`](./docs/QA_CHECKLIST.md) — release smoke + role/plan matrix checklist
- [`docs/UNDEVELOPED_FEATURES.md`](./docs/UNDEVELOPED_FEATURES.md) — gap list: plan limits not yet enforced
- [`docs/archive/`](./docs/archive/) — historical audits and completed setup instructions (do not treat as current)

### Conventions

- [`CLAUDE.md`](./CLAUDE.md) — project conventions for AI-assisted development
- `src/lib/participantConfig.ts` — canonical role/participant type definitions
- `src/integrations/supabase/types.ts` — full DB schema types (auto-generated)
