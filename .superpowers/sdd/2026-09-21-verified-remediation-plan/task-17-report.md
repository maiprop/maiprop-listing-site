# Task 17 — durable workflow outcomes

Date: 2026-09-23

Base: `f0a0763881d8c4337ea4746d801aa14101c23a74`

Branch: `codex/project-remediation-20260921`

Requirements: `task-17-brief.md` and `task-17-checkout-design.md`

## Outcome

H5 now describes and acknowledges the action the admin workflow actually performs. Saving the shared textarea is labelled as an internal note, while the same copy explains that rejection shares the text as the applicant's rejection reason. A note save succeeds only when Supabase returns the exact professional row id; a zero-row update rejects and leaves the modal text available. Approval still succeeds independently and retains its existing optional-note warning.

H6 removes the unsupported launch-notification promise and orphan `pro_launch_interest` localStorage flag. The onboarding step retains meeting link, calendar note, Finish Setup, and Skip actions, and links to the live professional pricing view in a new tab so unsaved onboarding fields remain on the original page. No replacement benefits or enrollment workflow was invented.

H7 adds an optional, exact-session `verified_checkout` receipt to the existing subscription-check response. A subscription receipt is emitted only after the existing billing writes and required-subscription-id durable reread agree with the resolved product, plan, audience, active/trial status, and future period. Payment-mode add-ons retain the existing fulfillment call and then require an exact durable row reread. Recurring add-ons are observed read-only after the existing webhook path has persisted a matching active row. Conflicting, missing, unsupported, wrong-actor, wrong-runtime, or incomplete state remains pending without a receipt.

`refreshSubscription` now returns a typed outcome separate from entitlement state. Exact calls are bound to the captured user, subscription generation, known auth session, and profile audience; same-exact callers receive the same in-flight outcome. Invalid explicit ids do not fall back to an ordinary refresh. Old service responses without a receipt remain usable for general entitlement state but are pending for checkout confirmation. Stale failures do not mutate grace state or schedule a retry for the old identity.

Pricing now waits for the typed outcome. It retains the exact return id through checking, pending, and error states and provides a manual `Check again` action. Only a matching durable receipt produces `Subscription confirmed`, `Trial confirmed`, or `Purchase confirmed`, after which the matching return keys are removed while unrelated query parameters remain. Mock returns remain explicit. Cancellation now says only `Checkout cancelled.` Missing, malformed, or conflicting aliases do not invoke subscription refresh. Delayed results from an old actor cannot publish a success toast or clean the current return.

The OpenAPI entry documents both the ordinary empty refresh and exact-session POST request, the current subscription fields, 202 pending behavior, and the additive optional receipt.

## Contract and compatibility

- The request schema remains additive: `{}` is an ordinary refresh and `{ checkout_session_id }` asks for exact reconciliation.
- Existing clients ignore `verified_checkout` and keep their current entitlement behavior. The service addition alone does not change their UI.
- The new website treats a response from an older service, including `subscribed: true` without `verified_checkout`, as pending for this checkout while still accepting the general entitlement update.
- `sync_status: synced`, `isPro`, admin/override/investor access, a URL marker, or a cached billing grant never creates a checkout receipt.
- Subscription receipts require current-audience equality. Add-on receipts retain the existing `isCheckoutAddonAudienceAllowed` cross-role rules and do not apply subscription-only audience equality.
- Payment add-ons use the existing grant path once. Recurring add-ons perform no grant in check-subscription and can confirm only an already durable webhook-shaped row.
- No schema, migration, queue, grant algorithm, checkout-creation rule, provider retry policy, or grace interval changed.

## RED evidence

### H5/H6 workflow boundaries

```powershell
npm run runtime -- npm exec vitest -- run src/test/useAdminProfessionals.test.tsx src/test/ProVerificationComponents.test.tsx src/test/ProVideoStep.test.tsx
```

Before implementation: `3` tests failed and `12` passed. The actual hook accepted a zero-row update, the modal still exposed `Request More Info`, and onboarding still offered the localStorage-backed launch notification instead of the current plans route.

### H7 service receipts

```powershell
npm run runtime -- node scripts/run-deno-tests.mjs check-subscription/index.test.ts
```

Before the service change: `5` tests failed and `44` passed. The failing new and adapted receipt assertions showed that the exact subscription and payment add-on paths returned no durable receipt, a conflicting accepted write still returned synced, and a fulfilled recurring add-on had no read-only observation path. The original-source runner was used from `supabase/functions`; no production import map or network access was introduced.

### H7 Pricing state machine

```powershell
npm run runtime -- npm exec vitest -- run src/test/pricing-dashboard-auction-specific.test.tsx -t "preserves Checkout reconciliation|handles the Stripe return|keeps an exact pending|uses truthful|does not reconcile a missing"
```

Before the Pricing change: `5` tests failed, `2` passed, and `28` were skipped. The page had no pending/error/retry/receipt UI and treated the query marker as immediate activation. The explicit mock and cancellation cases were the two passing controls.

The context tests also reproduced that the former `Promise<void>` contract could not return a verified/pending/error result, explicit malformed ids downgraded to ordinary refresh, and an audience change could not be represented as a stale exact outcome.

## GREEN verification

All commands ran from the repository root with the frozen project runtime.

### Final focused frontend regression run

```powershell
npm run runtime -- npm exec vitest -- run src/test/useAdminProfessionals.test.tsx src/test/ProVerificationComponents.test.tsx src/test/ProVideoStep.test.tsx src/test/AuthContext.test.tsx src/test/pricing-dashboard-auction-specific.test.tsx
```

Result: `5` files passed, `119` tests passed, `0` failed. This includes existing auth race, subscription timeout/grace, queued exact request, identity reset, pricing/catalog, mock/cancel, admin approval, and onboarding controls as well as the new H5-H7 cases.

After adding the explicit rejected-return manual retry case, its narrow command passed: `1` passed and `36` skipped. The case observes error copy, retains the exact id, retries the same id, and confirms only the later add-on receipt.

### Original-source Deno handler

```powershell
npm run runtime -- node scripts/run-deno-tests.mjs check-subscription/index.test.ts
```

Result: `49` passed, `0` failed. The tests include auth, ownership, runtime, catalog/audience, provider/config, exact retrieval, hard deadlines, fallback state, write/read ordering, conflicting durable rereads, payment fulfillment, and recurring read-only observation. The successful subscription assertion records the final billing read after both writes; the conflicting reread and add-on mismatch produce no receipt.

### Type check

```powershell
npm run runtime -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

### Scoped lint

```powershell
npm run runtime -- npm exec eslint -- src/components/AdminProfessionalVerification.tsx src/components/admin/ProVerificationComponents.tsx src/components/onboarding/ProVideoStep.tsx src/contexts/AuthContext.tsx src/contexts/authContextSupport.ts src/hooks/useAdminProfessionals.ts src/pages/Pricing.tsx src/test/AuthContext.test.tsx src/test/ProVerificationComponents.test.tsx src/test/ProVideoStep.test.tsx src/test/pricing-dashboard-auction-specific.test.tsx src/test/useAdminProfessionals.test.tsx supabase/functions/check-subscription/index.ts supabase/functions/check-subscription/index.test.ts
```

Result: exit 0; no findings.

### OpenAPI syntax and diff hygiene

```powershell
npm run runtime -- node -e "const fs=require('fs'); const yaml=require('js-yaml'); yaml.load(fs.readFileSync('docs/api/edge-functions.openapi.yaml','utf8')); console.log('OpenAPI YAML parsed')"
```

Result: exit 0; `OpenAPI YAML parsed`.

`git diff --check` also exited 0.

## Test disposition

Preserved and adapted:

- All existing check-subscription auth, exact ownership, runtime, subscription validation, timeout, investor, and durable fallback cases remain in the 49-test file. Existing exact subscription and payment add-on successes now additionally require the narrow receipt.
- The complete AuthContext file remains green. New cases cover shared same-exact outcomes, old-service pending compatibility, explicit invalid input, and audience-stale completion; existing account-change, background/exact queue, duplicate exact call, timeout, grace, and restore races remain active.
- The complete focused Pricing/dashboard file remains green. Existing auth-wait, pricing catalog, checkout creation, portal, active-plan, mock, cancel, and page behavior cases remain active.
- Admin approval/rejection and optional-note warning behavior remain covered alongside exact-row note acknowledgement.

Intentionally retired or inverted:

- The assertion that a real `checkout=success` marker immediately displays `Payment successful` and removes the id was replaced by pending/error/manual-retry and exact receipt assertions.
- The fixed-delay “one void refresh” assertion was replaced by the stronger exact pending-to-verified transaction and context-level one-request coalescing assertion.
- The onboarding `Coming Soon`, `Notify me`, invented benefit list, toast promise, and localStorage flag were removed. The replacement test asserts the real pricing link and the absence of those unsupported controls.
- Cancellation no longer claims that no charge was made solely from a URL marker.

## Privacy, self-review, and limits

The receipt contains only identifiers and fields already required to validate the exact actor's durable checkout outcome. It does not expose provider payloads, payment amounts, card data, tokens, internal error objects, or other users' state. Logs were not expanded. Test ids, billing rows, actors, and provider objects are synthetic; no provider, database, customer, or production request ran.

Self-review checked that receipts are populated from the owned retrieved session plus the durable reread, that accepted-but-conflicting writes cannot confirm, that recurring observation performs zero fulfillment calls, and that the frontend never infers confirmation from entitlement access. URL cleanup revalidates the current exact id and removes only checkout-return keys. Actor/audience changes invalidate old outcomes; stale catch/finally paths neither update unavailable state nor schedule an old retry. The admin note path verifies the exact returned row and leaves modal state untouched on rejection.

The repository-wide `eslint .` commit hook was not rerun because its known residual benchmark-artifact traversal remains Task 9 scope. Scoped lint covers every changed TypeScript/TSX file. No install, build, full suite, coverage collection, deployment, GitHub action, provider call, or snapshot move/delete occurred.

This evidence is local and synthetic. It does not establish provider delivery, webhook operation in production, deployed service/site ordering, cross-tab request deduplication, payment settlement, future subscription continuity, or browser-after behavior. The receipt proves only that this request observed a matching durable active/trial subscription or fulfilled add-on row. Independent full-diff review and the prepared H7 browser gate remain required.
