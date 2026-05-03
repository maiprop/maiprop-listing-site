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
- **catch blocks:** Always type catch parameters as `unknown`, not `any`. Access `.message` with `err instanceof Error ? err.message : null`.
- **File upload paths:** Use `crypto.randomUUID()` — not `Date.now() + Math.random()`.
- **Feature column filters:** Only columns in `ALLOWED_FEATURE_COLUMNS` (defined in `useListings.ts`) are passed to Supabase as filter column names. Never add arbitrary strings from user input.
- **Ownership guards:** Mutation hooks for user-owned data must include `.eq("user_id", user.id)` or equivalent ownership column alongside `.eq("id", id)`.
- **Admin check:** Use `isPlatformAdmin(profile)` from `src/lib/authUtils.ts`. Never check admin status by email address.
- **Relative time formatting:** Use `formatTimeAgo(iso)` from `src/lib/format.ts`. Do not define local `timeAgo`/`formatTimeAgo` functions.
- **MIME type validation:** Use the explicit allowlist in `compressImage.ts` — not `.startsWith("image/")`.
- **Confirm dialogs:** Use `<ConfirmDialog>` from `@/components/ui/ConfirmDialog` instead of `window.confirm()`. Pattern: add `const [deleteTarget, setDeleteTarget] = useState<string | null>(null)`, call `setDeleteTarget(id)` on click, render `<ConfirmDialog open={!!deleteTarget} onConfirm={() => { mutate(deleteTarget!); setDeleteTarget(null); }} onCancel={() => setDeleteTarget(null)} />`.
- **Listing type cast:** Use `const db = dbListing as ListingWithJoins` (exported from `useListings.ts`) as a single top-level cast instead of scattering `(db as any).field` throughout a component.
- **Unregistered Supabase tables:** Use `(supabase.from as any)("table_name")` with an `// eslint-disable-next-line` comment rather than `supabase.from("table_name" as any)` — keeps the cast narrow and the lint suppression explicit.

### Security Rules

- **CSP headers** are set in `public/_headers` (Cloudflare Pages) — update that file if new external domains are added.
- **IDOR defense:** All `update`/`delete` mutations must filter by the current user's ownership column in addition to the record `id`.
- **No email-based auth:** Use `profile.role === "admin"` (via `isPlatformAdmin`) — never `user.email.endsWith(...)`.

### Formatting Utilities (`src/lib/format.ts`)

Canonical helpers — import from here, never define locally:
- `formatPrice(n)` — formats number as `€150,000`
- `formatDate(iso)` — short date, e.g. `12 Apr 2026`
- `formatDateTime(iso)` — date + time
- `fmtDate(iso)` — weekday + date for scheduling views
- `fmtTime(iso)` — `HH:MM`
- `formatTimeAgo(iso)` — relative time, e.g. `5m ago`, `3h ago`

### Test Utilities (`src/test/utils.tsx`)

- `renderWithProviders(ui, opts)` — wraps component with MemoryRouter + QueryClientProvider
- `createTestQueryClient()` — no-retry QueryClient for tests
- `makeMockSupabase()` — vi.fn()-based mock of the Supabase client

### Listings Architecture (`src/hooks/useListings.ts`)

- `buildListingsQuery(filters, from, pageSize)` — single query builder; all filtering + ORDER BY happens server-side
- `useListingsPaginated(filters)` — infinite scroll; uses `PAGE_SIZE = 24`
- `useListings(filters)` — full fetch for map view (up to 500); no client-side sort
- `ALLOWED_FEATURE_COLUMNS` — Set of valid listing boolean column names; guards against column injection

### Environment Variables

Required vars (see `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY` (optional — has fallback)
- `VITE_SENTRY_DSN` (optional — enables error tracking + performance tracing)

`src/lib/config.ts` validates these at startup.

### Supabase Secrets (Edge Functions)

Set via `supabase secrets set KEY=value`:
- `SENTRY_DSN` — enables error forwarding from edge functions to Sentry (fire-and-forget HTTP POST, no SDK)
- `ENVIRONMENT` — tags Sentry events (`production` / `staging`); defaults to `production`
