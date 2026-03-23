# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run preview      # Preview production build (port 4173)
npm run db:push      # Push local Supabase migrations
npm run seed:users   # Seed mock users (requires tsx)
```

To run a single test file:
```bash
npx vitest run src/test/SomeFile.test.ts
```

## Architecture

**Stack:** Vite + React 18 + TypeScript (strict) + Supabase + Radix UI/shadcn-ui + Tailwind CSS + React Query

### Auth & Routing (`src/App.tsx`, `src/contexts/AuthContext.tsx`)

All auth state lives in `AuthContext`. Route guards are implemented as wrapper components:
- `ProtectedRoute` — requires login
- `AdminRoute` — requires admin role
- `InvestorRoute` — requires investor role
- `SellerRoute` — requires seller role

Pages are lazy-loaded via `React.lazy`. The app uses React Router v6 with nested routes under a single `Layout`.

### Data Layer

- **React Query** for all server state (caching, refetching, mutations)
- **Supabase client** at `src/integrations/supabase/client.ts` — reads env vars; validates them on init
- **Generated types** at `src/integrations/supabase/types.ts` — auto-generated from DB schema, do not edit manually
- Custom hooks in `src/hooks/` encapsulate all Supabase queries (e.g., `useListings`, `useViewings`, `useAuctionAlerts`)

### Supabase Edge Functions (`supabase/functions/`)

Functions with `verify_jwt = true` (protected): `property-chat`, `pro-ai-tools`, `ai-service-match`, `listing-ai-assist`, `create-checkout`, `check-subscription`, `customer-portal`, `create-stripe-price`, `process-email-queue`

Functions with `verify_jwt = false` (public): AI search, property valuation, neighbourhood reports, POIs, auction syncing, saved search alerts

### UI Components

- `src/components/ui/` — shadcn-ui primitives (Radix UI based), do not modify these directly
- Feature components live in `src/components/` and are named by feature (e.g., `AuctionAlertModal`, `MapView`, `LeadsCRM`)
- Toast notifications use Sonner (`sonner` package) — import `toast` from `sonner`

### Key Patterns

- **Unused variables:** Prefix with `_` to suppress the `no-unused-vars` ESLint error
- **`any` types:** Avoid — they trigger an ESLint warning; use proper types or generics
- **Explicit return types:** Required on exported async functions (ESLint warns otherwise)
- **Path alias:** `@/` maps to `src/` — use for all internal imports

### Environment Variables

Required vars (see `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY` (optional — has fallback)

`src/lib/validateEnv.ts` validates these at startup.
