# Contributing to maiprop-listing-site

Thanks for considering a contribution. This guide is targeted at **human
developers** picking up the codebase. For AI-assistant guidance, see
`CLAUDE.md` at the repo root.

## TL;DR

```bash
git clone https://github.com/maiprop/maiprop-listing-site.git
cd maiprop-listing-site
cp .env.example .env.local            # fill in Supabase keys
npm ci
npm run dev                           # http://localhost:8080
```

Before opening a PR:

```bash
npm run lint                          # eslint .
npm run typecheck                     # tsc --noEmit
npm run test                          # vitest run
npm run lint:migrations               # only if you touched supabase/migrations/
npm run build                         # vite build (catches prod-only errors)
```

All five must pass. CI will reject the PR otherwise.

---

## Repository layout

```
src/                  React 18 + TS + Vite frontend
  components/         Feature components
  components/ui/      shadcn-ui primitives — DO NOT modify directly
  contexts/           React Context providers (auth, theme)
  hooks/              React Query hooks (one per Supabase resource)
  integrations/       External SDKs (Supabase client + generated types)
  lib/                Pure utilities, validators, formatters
  pages/              Route-level page components (lazy-loaded)
  test/               Vitest unit + component tests
supabase/
  functions/          Deno-based edge functions (one folder per fn)
    _shared/          Shared utilities imported by edge functions
  migrations/         Forward-only SQL migrations (ordered by timestamp)
docs/                 Architecture, audits, ADRs, OpenAPI specs
.github/workflows/    CI (quality, e2e, migrations-validate, lighthouse, deploy)
scripts/              Build / lint / seed / load-test scripts
```

## Development workflow

### 1. Branch naming

- `feat/<short-desc>` — new functionality
- `fix/<short-desc>` — bug fixes
- `chore/<short-desc>` — tooling, deps, docs
- `refactor/<short-desc>` — code cleanup, no behavior change

Direct pushes to `main` are allowed for the lead developer (DORA Elite-tier
solo workflow). Other contributors must open a PR.

### 2. Commit messages — Conventional Commits

```
<type>(<scope>): <short imperative summary>

[optional body explaining *why*]
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`.

Examples:

```
feat(listings): add saved-search alert email queue
fix(auth): clear stale token on 401 from Supabase
refactor(types): replace `any` with typed payloads in hooks
docs(adr): record decision to use Cloudflare Pages for hosting
```

### 3. CODEOWNERS gate

PRs that touch any of the high-blast-radius modules listed in
`.github/CODEOWNERS` (auth, DB client, schema, payments, CI) require
sign-off from the relevant code owner. The list is derived from the
afferent-coupling table in `docs/ENTERPRISE_ASSESSMENT_2026-04-27.md`.

### 4. Tests

- **Unit tests** (`src/test/*.test.ts`) — pure logic, hooks, utilities. Use
  `renderWithProviders` from `src/test/utils.tsx`.
- **Component tests** (`src/test/*.test.tsx`) — render with mock providers,
  assert on user-visible behavior.
- **Smoke tests** (`src/test/components.smoke.test.tsx`,
  `src/test/pages.smoke.test.tsx`) — intentionally minimal "renders without
  throwing" tripwires. Do NOT add detailed assertions here.
- **Edge-function tests** (`npm run test:deno`) — Deno-native tests for
  `supabase/functions/*`.
- **E2E tests** (`npm run test:e2e`) — Playwright; covers happy paths.

Coverage thresholds (enforced in CI): lines 60%, branches 55%,
functions 38%, statements 60%. Don't lower these without a documented
ADR.

### 5. Adding a new dependency

1. Run `npm install <pkg>` (uses `package-lock.json`).
2. Run `npm audit` and ensure no new vulnerabilities are introduced.
3. Run `npm sbom --sbom-format=cyclonedx --omit=dev > .sbom-prod.json` and
   verify the new dep's license is non-copyleft (MIT, ISC, BSD-*, Apache-2.0
   are all fine; reject anything GPL/AGPL/LGPL/MPL/EPL/CDDL).
4. If it's a frontend dep that increases the `dist/` bundle, run
   `npm run build && npm run check:bundle-size` and adjust budgets in
   `scripts/check-bundle-size.mjs` only with justification.

### 6. Adding a database migration

1. `supabase migration new <descriptive_name>` (creates timestamped SQL file).
2. Write idempotent SQL — see `supabase/migrations/README.md` for rules
   (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE
   POLICY`, etc.).
3. Run `npm run lint:migrations` locally — must pass.
4. CI's `migrations-validate` job runs all migrations against a fresh DB
   to confirm replay-safety.
5. Migrations are forward-only; do not edit a migration after it has been
   merged.

### 7. Adding an edge function

1. `supabase functions new <name>` creates `supabase/functions/<name>/index.ts`.
2. Add CORS headers via `corsHeaders` from `_shared/cors.ts`.
3. Add structured logging via `logger` from `_shared/logger.ts` (do NOT use
   `console.*`).
4. If it calls external services, wrap fetches in retry-with-backoff
   (`_shared/retry.ts`).
5. Add it to `docs/api/edge-functions.openapi.yaml` — every function must
   have an OpenAPI entry. CI does not yet enforce this but the
   100% coverage invariant is a project goal.
6. Configure JWT verification in `supabase/config.toml` (`verify_jwt = true`
   for protected functions, `false` for public ones).
7. Test with `deno test --allow-env --allow-net --allow-read
   supabase/functions/<name>`.

## Architecture

The foundational decisions are recorded as ADRs in `docs/adr/`:

- [ADR-0001: Initial architecture](docs/adr/0001-initial-architecture.md)

Read these before proposing structural changes.

## Security

- Never commit secrets. The pre-existing `.gitignore` covers `.env*`.
- IDOR defense: every `update`/`delete` mutation must filter by both
  record ID **and** the current user's ownership column. The
  `idor.mutations.test.ts` suite verifies this for the core hooks.
- Admin checks: use `isPlatformAdmin(profile)` from
  `src/lib/authUtils.ts`. Never check by email.
- Row Level Security (RLS): every table that holds user data must have RLS
  enabled. New tables fail CI's RLS-coverage check otherwise.

See `SECURITY_AUDIT.md` and `docs/GO_LIVE_SECURITY_AUDIT_2026-04-27.md` for
the full security posture.

## Code style

The full set of conventions is in `CLAUDE.md` ("Key Patterns" section).
The most important ones:

- `@/` path alias maps to `src/`.
- Catch parameters typed as `unknown`, not `any`.
- File upload paths use `crypto.randomUUID()`, not `Date.now()`.
- Toast notifications via `toast` from `sonner`.
- Confirm dialogs via `<ConfirmDialog>`, not `window.confirm()`.
- Listing type cast: `const db = dbListing as ListingWithJoins` (single
  top-level cast).

## Releasing

There is no manual release process. `main` is the production branch:
every push to `main` triggers the `deploy` job in `.github/workflows/ci.yml`
which builds the frontend and pushes to Cloudflare Pages, and runs
`supabase db push` for any new migrations.

Staging environment auto-deploys from `staging` branch via `deploy-staging`.

## Getting unstuck

1. Search `docs/` — it contains 29 markdown files including audit reports,
   security analyses, design system, pricing matrix, etc.
2. Search `CLAUDE.md` for the "Key Patterns" section.
3. Check `.windsurf/workflows/` for slash-command runbooks
   (e.g. `/regenerate-supabase-types`).
4. Open an issue with the `question` label.

## License

This project is **UNLICENSED** (proprietary). See `package.json`.
External contributions are not currently accepted; this guide exists for
internal team members and future maintainers.
