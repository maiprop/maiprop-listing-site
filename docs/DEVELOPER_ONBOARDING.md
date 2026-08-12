# Developer Onboarding Guide

## Prerequisites

- **Node.js 20.19.5** (use `.nvmrc` / `.node-version`)
- **npm 10.8.2** (`engine-strict=true` rejects npm 11+ installs)
- **Deno 2.7+** (for edge function development)
- Git

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/maiprop/maiprop-listing-site.git
cd maiprop-listing-site
nvm use

# 2. Copy environment template
cp .env.example .env
# Fill in required values (see Environment Variables below)

# 3. Install dependencies
npm ci

# 4. Start dev server (port 8080)
npm run dev
```

If your terminal still resolves a newer global Node/npm first, run:

```bash
npm run runtime:doctor
npm run check:runtime:local
npm run runtime -- npm run dev
```

## Environment Variables

### Required (app won't start without these)

| Variable | Source | Description |
|----------|--------|-------------|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Settings → API → anon/public key | Public API key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase Dashboard → Settings → General | Project reference ID |

### Optional (features degrade gracefully)

| Variable | Feature |
|----------|---------|
| `VITE_MAPBOX_TOKEN` | Map views |
| `VITE_SENTRY_DSN` | Error tracking |
| `VITE_STRIPE_PRO_PRODUCT_ID` | Subscription checkout |
| `VITE_TURNSTILE_SITE_KEY` | Bot protection (has fallback) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps / Street View |
| `VITE_PLAUSIBLE_DOMAIN` | Analytics |

## Development Commands

```bash
npm run dev          # Dev server with HMR (port 8080)
npm run check:runtime # Verify Node/npm match package.json engines
npm run check:runtime:local # Verify through the local Node 20 launcher
npm run build        # Production build
npm run lint         # ESLint check
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
npm run test:coverage # Coverage report
npx vitest run src/test/SomeFile.test.ts  # Single test file
```

## Edge Function Development

```bash
# Run Deno tests
cd supabase/functions
deno test --allow-env --allow-net --allow-read --allow-write .

# Run a single test file
deno test --allow-env --allow-net --allow-read --allow-write ./_shared/rateLimit.test.ts
```

Edge functions use Deno, not Node. Key differences:
- Import from URLs or import maps (`deno.json`)
- Use `Deno.serve()` not Express
- Shared utilities in `supabase/functions/_shared/`

## Project Structure

```
src/
├── components/          # React components (feature-grouped)
│   ├── ui/              # shadcn-ui primitives (don't edit directly)
│   └── ...              # Feature components
├── contexts/            # React contexts (AuthContext, etc.)
├── hooks/               # Custom hooks (data fetching, mutations)
├── integrations/        # Supabase client + generated types
├── lib/                 # Utilities (format.ts, config.ts, authUtils.ts)
├── pages/               # Route-level page components
└── test/                # Test utilities + smoke tests

supabase/
├── functions/           # Deno edge functions
│   ├── _shared/         # Shared utilities (cors, auth, logger, etc.)
│   └── <function-name>/ # Individual functions
├── migrations/          # SQL migration files (ordered by timestamp)
└── config.toml          # Function config (verify_jwt, etc.)

docs/                    # Project documentation
e2e/                     # Playwright E2E tests
public/                  # Static assets + _headers (CSP)
```

## Key Patterns

- **Path alias:** `@/` maps to `src/` — use for all imports
- **Data fetching:** Always use React Query hooks in `src/hooks/`, never call Supabase directly from components
- **Error handling:** Use `toast()` from `sonner` with specific messages (never "Something went wrong")
- **Admin check:** `isPlatformAdmin(profile)` from `src/lib/authUtils.ts`
- **Confirm dialogs:** `<ConfirmDialog>` component, not `window.confirm()`
- **Formatting:** Import from `src/lib/format.ts` (formatPrice, formatDate, formatTimeAgo, etc.)

## Commit Convention

This repo uses **Conventional Commits** enforced by commitlint + Husky:

```
feat: add new property filter
fix: resolve login redirect loop
docs: update onboarding guide
chore: bump dependencies
```

See `commitlint.config.js` for the full config.

## Deployment

- **Frontend:** Cloudflare Pages. Git automatic deployments are disabled;
  reviewed immutable candidates use the default-off staging release train.
  Production mutation remains hard-disabled.
- **Edge Functions:** Supabase Functions (deployed via CI or `supabase functions deploy`)
- **Database:** Supabase PostgreSQL (migrations via `supabase db push`)

## Need Help?

- `CLAUDE.md` — AI assistant guidelines and code conventions
- `docs/` — Architecture docs, runbooks, audit reports
- `.github/workflows/ci.yml` — CI pipeline details
