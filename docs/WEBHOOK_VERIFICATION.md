# Webhook Verification — Implementation Guide

The platform receives webhooks from two external systems. Both **must** be verified before any work is done, and both are already implemented — this document exists so the contract is explicit.

| Webhook | Edge function | Secret env var | Verification helper |
|---|---|---|---|
| Stripe | `supabase/functions/stripe-webhook/index.ts` | `STRIPE_WEBHOOK_SECRET` | `Stripe.webhooks.constructEventAsync()` (from `stripe` SDK) |
| MaiProp-OS | `supabase/functions/receive-from-os/index.ts` | `OS_WEBHOOK_SECRET` | `verifyHmacSignature()` in `_shared/webhookHmac.ts` |

---

## 1. Stripe

### Event flow

```
Stripe ──(POST https://<ref>.supabase.co/functions/v1/stripe-webhook)──▶ Edge function
                          │                                                    │
                          │ Header: stripe-signature: t=<ts>,v1=<hmac>,v0=...  │
                          │ Body:   raw JSON (DO NOT mutate before verifying)  │
                          ▼                                                    ▼
                    constructEventAsync(rawBody, signature, secret)
                          │
                          ├── signature valid + fresh  →  handle event, return 200
                          ├── signature invalid         →  return 400 (Stripe will retry)
                          └── handler throws            →  return 500 (Stripe will retry)
```

### Rules (also enforced by `stripe-webhook/webhook.test.ts`)

1. **Always read the body as raw text** (`await req.text()`). Never `req.json()` before signature verification — a re-serialised body will fail HMAC.
2. **Only trust `STRIPE_WEBHOOK_SECRET`** for the endpoint currently being hit. Do not reuse a test-mode secret against a live endpoint.
3. **Idempotency**: handlers must tolerate the same `event.id` twice. Stripe retries up to 3 days on 5xx. The `syncSubscription` helper is naturally idempotent (it overwrites the profile row); the `checkout.session.completed` handler re-fetches the subscription and overwrites the same state.
4. **Return 2xx promptly**. Long-running work must be queued, not performed inline. Stripe treats response > 30s as failure.
5. **Never log the raw body or signature**. Log `event.id` + `event.type` only.

### Local testing

```powershell
# Terminal 1
supabase start
supabase functions serve stripe-webhook --env-file supabase/.env.local --no-verify-jwt

# Terminal 2
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
# The Stripe CLI prints the webhook secret — set STRIPE_WEBHOOK_SECRET to that value.

# Trigger a test event
stripe trigger checkout.session.completed
```

### CI

Signature verification invariants are tested in
`@/supabase/functions/stripe-webhook/webhook.test.ts` (run via `npm run test:deno`).

---

## 2. MaiProp-OS (custom HMAC)

MaiProp-OS is the internal back-office system that pushes listing / valuation updates into the public site. It uses a custom HMAC-SHA256 scheme modelled on Stripe's.

### Signature format

```
Header:  x-os-signature: t=<unix_seconds>,v1=<hex_hmac>
Signed string: "<timestamp>.<rawBody>"
HMAC key:  OS_WEBHOOK_SECRET (shared with MaiProp-OS)
```

### Replay protection

Requests older than **5 minutes** (default tolerance) are rejected with 401. The timestamp is part of the signed string, so an attacker cannot replay old payloads even if they captured them.

### Implementation

Helper: `@/supabase/functions/_shared/webhookHmac.ts`

```ts
import { verifyHmacSignature, HmacVerifyError } from "../_shared/webhookHmac.ts";

const rawBody = await req.text();
try {
  await verifyHmacSignature(rawBody, req.headers.get("x-os-signature"), secret);
} catch (err) {
  if (err instanceof HmacVerifyError) return errorResponse(err.message, 401);
  throw err;
}
const body = JSON.parse(rawBody);
```

Tests: `@/supabase/functions/_shared/webhookHmac.test.ts` covers valid, missing, malformed, tampered, stale-timestamp, and wrong-secret cases.

### Adding a new MaiProp-OS webhook endpoint

1. Create `supabase/functions/<name>/index.ts`.
2. Call `verifyHmacSignature(rawBody, header, secret)` **before** parsing JSON.
3. Return 401 on `HmacVerifyError`, 400 on bad JSON, 200 on success, 500 on internal error.
4. On the MaiProp-OS side, sign as:

   ```
   ts       = Date.now() / 1000 | 0
   v1       = hex(hmac_sha256(OS_WEBHOOK_SECRET, `${ts}.${rawBody}`))
   header   = `t=${ts},v1=${v1}`
   ```

5. Add integration tests under `supabase/functions/_shared/`.

### Secret rotation

- Rotate `OS_WEBHOOK_SECRET` and the corresponding secret on the MaiProp-OS side in the **same deploy window**. The helper allows only one secret at a time; there is no rolling-secret support yet.
- If rolling-secret support becomes necessary, extend `verifyHmacSignature` to accept `string | string[]` and try each.
- Cadence lives in [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).

---

## Common mistakes

- **Parsing JSON before verifying** — mutates whitespace, breaks signature. Always read `text()` first.
- **Trusting `content-type`** — do not branch on content-type to decide whether to verify. Verify unconditionally.
- **Returning 200 on signature failure** — Stripe / OS will stop retrying, and you have lost observability. Return 400 / 401.
- **Logging the secret** in a stack trace. Wrap verification calls; never include `Error.stack` in responses.
- **Mixing test-mode and live-mode Stripe secrets** across environments.
