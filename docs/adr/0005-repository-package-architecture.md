# ADR-0005: Repository Package Architecture

- **Status:** Accepted
- **Deciders:** @krenios
- **Date:** 2026-06-14

## Context

ADR-0001 rejected monorepo tooling because the product had one deployable app and one operator. ECAS has since raised repository architecture as an enterprise-readiness gap: the repo now contains the web app, Cloudflare Pages Functions, Supabase migrations, Supabase Edge Functions, Capacitor packaging, Remotion video code, E2E tests, operational scripts, and governance docs.

The repository needs clearer ownership boundaries, but a physical move of `src/`, `functions/`, `public/`, and deployment config would touch nearly every app workflow. Doing that in one change would create avoidable risk across Vite, Cloudflare Pages, Supabase, Playwright, Lighthouse, Capacitor, and CI.

## Decision

Adopt a phased repository package architecture.

Phase 0, implemented now:

- Create target landing zones: `/apps`, `/packages`, and `/infrastructure`.
- Keep the production runtime in current paths until a dedicated migration PR moves each boundary.
- Add `docs/governance/repository-boundaries.json` as the machine-readable ownership map.
- Add `npm run check:repo-architecture` and include the contract in enterprise readiness checks.
- Extend CODEOWNERS for `/apps`, `/packages`, `/infrastructure`, and `/supabase`.

Target layout:

```text
/apps
  /web
/packages
  /domain
  /ui
  /data-access
  /config
  /testing
/infrastructure
  /cloudflare
  /capacitor
/supabase
/docs
/scripts
```

This remains no npm workspaces until package extraction. Workspace tooling will be introduced only when a real package has a public API, tests, dependency contract, and CI command. Empty workspaces add install and tooling complexity without reducing current risk.

Physical moves require a dedicated migration PR with a codemod/import migration, build-script updates, CI updates, Cloudflare preview verification, Supabase deploy verification, and rollback notes.

## Consequences

Positive:

- New contributors get a clear target model without breaking the app today.
- Future code movement has a documented runway and acceptance criteria.
- CI can prevent architecture docs and CODEOWNERS from drifting.
- The repo becomes closer to an enterprise monorepo shape while preserving deploy stability.

Negative:

- Current implementation code still lives mostly under `src/`, so this does not finish the physical package extraction.
- Some duplication in docs is intentional until packages are actually extracted.
- The repository remains a single npm package for now.

## Migration Order

1. Extract pure domain and validation code to `/packages/domain`.
2. Extract UI primitives/design system to `/packages/ui`.
3. Extract Supabase query adapters and React Query hooks to `/packages/data-access`.
4. Move the Vite app shell to `/apps/web`.
5. Move Cloudflare Pages platform files to `/infrastructure/cloudflare` only after Pages build/deploy config supports that location.
6. Introduce npm workspaces when the first package extraction is real and tested.
