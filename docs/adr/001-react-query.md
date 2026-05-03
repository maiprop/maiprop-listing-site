# ADR-001: React Query for Server State

**Date:** 2024 (project inception)  
**Status:** Accepted  
**Context:** Need a data fetching + caching layer for Supabase data  

## Decision

Use **TanStack React Query** (`@tanstack/react-query`) for all server state management.

## Rationale

- Automatic caching, deduplication, and background refetching
- Built-in infinite scroll support (`useInfiniteQuery`)
- Optimistic updates for mutations
- Devtools for debugging cache state
- Eliminates manual loading/error state management

## Consequences

- All Supabase queries are wrapped in custom hooks (`src/hooks/`)
- Components should never call `supabase.from()` directly — use hooks
- Default `staleTime: 5 * 60 * 1000` (5 min) — override per-query when needed (e.g., auctions use 30s)
- `QueryClient` config in `src/App.tsx` — no retries in test environment
