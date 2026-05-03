# ADR-003: Supabase Edge Functions (Deno)

**Date:** 2024 (project inception)  
**Status:** Accepted  
**Context:** Need serverless backend for API endpoints, webhooks, and scheduled jobs  

## Decision

Use **Supabase Edge Functions** (Deno runtime) for all backend logic.

## Rationale

- Co-located with Supabase database — direct access to PostgREST + Auth
- Deno runtime: TypeScript-first, secure by default (explicit permissions)
- No cold-start penalty for frequently-used functions
- Built-in JWT verification (`verify_jwt` in `config.toml`)
- pgmq integration for email queue processing

## Consequences

- Functions in `supabase/functions/<name>/index.ts`
- Shared code in `supabase/functions/_shared/` (CORS, auth, logger, rate limiter, etc.)
- Configuration in `supabase/config.toml` (per-function `verify_jwt`, etc.)
- Deployed via `supabase functions deploy` (manual or CI)
- Testing uses Deno's built-in test runner (`deno test`)
- Import maps in `supabase/functions/deno.json`
- 37 functions total: 14 with `verify_jwt=true`, 23 with `verify_jwt=false` (each with alternative auth)
