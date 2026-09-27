# Repository Architecture

MaiProp is currently a single npm package with multiple runtime surfaces. This document defines the present layout, target layout, and migration rules so the repo can grow toward an enterprise package architecture without breaking production workflows.

## Current layout

| Path | Runtime / ownership |
|---|---|
| `src/` | Vite React app, React Query hooks, domain helpers, UI components, and Supabase browser client. |
| `functions/` | Cloudflare Pages Functions and middleware. |
| `public/` | Static assets, Cloudflare Pages `_headers`, `_redirects`, docs copied into the build. |
| `supabase/` | Supabase migrations, config, Edge Functions, shared Deno helpers, and tests. |
| `e2e/` | Playwright flows, security tests, performance gates and separately targeted live integration checks. |
| `scripts/` | CI/runtime checks, operational scripts, inventories, and local tooling. |
| `remotion-video/` | Separate Remotion package with its own TypeScript config. |
| `docs/` | ADRs, governance, security, operations, procurement, and audit evidence. |

## Proposed future layout (not implemented)

```text
/apps
  /web                 Vite React app shell and route ownership
/packages
  /domain              Business rules, domain types, validation schemas
  /ui                  Design system and shared presentational components
  /data-access         Supabase query adapters, React Query hooks, API clients
  /config              Shared config parsing and environment validation
  /testing             Shared fixtures and test helpers
/infrastructure
  /cloudflare          Cloudflare Pages, headers, redirects, WAF evidence
  /capacitor           Native shell and mobile build packaging evidence
/supabase              Supabase migrations, Edge Functions, RLS, storage, auth
/docs                  Governance, ADRs, runbooks, procurement evidence
/scripts               Repo-level automation and CI checks
```

The target `/apps/web`, `/packages/domain`, `/packages/ui`, `/packages/data-access`, and `/infrastructure/cloudflare` boundaries are tracked in `docs/governance/repository-boundaries.json`.

## Boundary Rules

- no physical move without dedicated migration PR, import codemod, CI updates, deploy verification, and rollback notes.
- No npm workspaces until package extraction creates at least one real package with a public API, tests, and dependency contract.
- UI code may call hooks/services, but should not call Supabase directly from page or component event handlers.
- Domain code must not import React, Supabase clients, browser globals, Cloudflare bindings, or Sentry.
- Data-access code may import Supabase and React Query; it should expose typed hooks/adapters rather than leaking table queries into UI.
- Cloudflare Pages Functions must remain deployable from the active Pages config before any move into `/infrastructure/cloudflare`.
- Supabase stays at `/supabase` until the Supabase CLI and deployment workflows are explicitly changed and verified.

## Proposed migration sequence

1. Move pure validation/domain helpers first. This has the lowest runtime risk and improves TypeScript reuse.
2. Move design-system primitives next. Keep app-specific composite components in the app until their ownership is clear.
3. Move data-access hooks after domain types stabilize.
4. Move the Vite app shell to `/apps/web` only after package imports are stable.
5. Move Cloudflare and native packaging files after deploy tooling supports the new paths.

## Platform Constraints

Cloudflare Pages currently expects root build config and public assets. Supabase expects `/supabase` for migrations and Edge Function deployment. React Query and Supabase browser clients are currently app-level dependencies. These constraints are why the first restructuring step is an enforceable architecture contract instead of a mass path move.

Source layout is not proof of deployed parity. See [the remediation checkpoint](superpowers/plans/2026-09-27-remediation-checkpoint.md) and [controlled release path](PRODUCTION_RELEASE_RUNBOOK.md).
