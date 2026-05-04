# Rate Limiting

## Architecture

Edge functions use an **in-memory sliding-window** rate limiter (`_shared/rateLimit.ts`).
Each Deno Deploy isolate maintains its own counter map keyed by IP address.

## Accepted Risk: Per-Isolate Counters

Under high concurrency Supabase may spin up **N isolates** for the same function.
Each isolate has its own counter, so the effective limit can be exceeded up to N×.

### Why this is acceptable at current scale

| Factor | Detail |
|--------|--------|
| **Traffic volume** | Single-digit RPS on AI endpoints; isolate fan-out unlikely |
| **DB-backed hard cap** | `usage_ai_calls` table + `check_ai_quota()` SECURITY DEFINER RPC enforce a per-user monthly ceiling regardless of isolate count |
| **Cost ceiling** | OpenAI / OS API calls are gated by the DB quota, not the in-memory limiter |
| **Blast radius** | Worst case: a burst of duplicate AI calls that still count against the DB quota |

### When to upgrade

Move to a Postgres-backed atomic rate limiter if:

- Sustained traffic exceeds ~50 RPS on any AI endpoint
- Multiple concurrent isolates are observed (check Supabase Edge Function metrics)
- Cost overruns from burst AI calls become material

### Implementation notes

- `makeRateLimiter({ bucket, maxRequests, windowMs })` creates an isolate-local limiter
- `tooManyRequestsResponse(corsHeaders)` returns a standard 429 with Retry-After
- The DB-level quota (`check_ai_quota` RPC + `enforce_ai_quota` trigger) is the authoritative cap
