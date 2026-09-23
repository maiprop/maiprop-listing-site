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

## Fix round 1 — entitlement handoff and checkout lifecycle identity

Date: 2026-09-23

Fix base: `d7ce4ddd697960d34e7fdaccaa84c4fb5d03366f`

Review authority: `task-17-review.md`, Important I1 and I2

### I1 — ordinary entitlement handoff after audience publication

Subscription work continues to reject a stale actor, generation, known auth session, or audience. The current check now distinguishes auth identity validity from audience equality. When the same current identity's profile establishes or changes its audience while any subscription request is in flight, the stale request still publishes a `stale` outcome and cannot emit a checkout receipt. After releasing only its own in-flight record, it starts one ordinary check for the current audience.

This handoff covers the intentional startup race where profile and subscription loading begin together. A stale successful response cannot apply its old audience state; a stale failure or deadline cannot suppress recovery. The current ordinary request either settles normally or enters the unchanged timeout/grace/retry path. If a current-audience exact request is already in flight, the ordinary handoff attaches to that current work and does not duplicate the exact request. Actor, generation, and known-session changes do not use this audience-only handoff.

### I2 — Pricing confirmation ownership and return context

Pricing confirmation state now carries a lifecycle key derived from the current actor, known auth session id, and current profile audience. The key deliberately ignores access-token bytes, so a token refresh in the same known session does not invalidate or restart a completed transaction. Sign-out, another actor, a proven new same-user session, and an audience change invalidate the old completed/pending state and notification marker immediately, including while auth/profile loading is in progress.

Pending and error state remains tied to the exact current return id. Manual retry validates the current lifecycle key and exact URL identity before entering `checking`, so a retained DOM callback cannot restart removed or replaced work. A no-return, cancel, mock, or different exact return clears old retry state and advances the local attempt sequence.

Successful confirmation records the exact cleaned query string immediately before its guarded URL replacement. The verified banner survives that one matching cleanup for the same lifecycle identity, including unrelated parameters retained by the cleanup. A later URL-context change no longer inherits the completed banner.

### RED evidence

I1 production code with the stabilized delayed profile fixtures:

```powershell
npm run runtime -- npm exec vitest -- run src/test/AuthContext.test.tsx -t "hands off an initial ordinary|makes an exact checkout outcome stale"
```

Result before the fix: `4` failed and `66` skipped. All three ordinary success/failure/timeout cases observed only the stale request instead of the required current-audience handoff. The strengthened exact audience-change case returned stale but observed no ordinary handoff, leaving subscription loading unresolved.

I2 production code:

```powershell
npm run runtime -- npm exec vitest -- run src/test/pricing-dashboard-auction-specific.test.tsx -t "clears a completed checkout|keeps completed checkout state|clears pending retry state|preserves its own successful cleanup"
```

Result before the fix: `8` failed, `1` passed, and `37` skipped. Completed state survived sign-out/loading, actor, audience, known-session, and later URL-context changes. Pending retry state survived no-return, cancel, and mock replacements. The same-known-session token-refresh control passed before the fix and remains required.

### GREEN verification

The identical I1 command passed: `4` passed and `66` skipped.

The identical I2 command passed: `9` passed and `37` skipped.

Complete amended test files:

```powershell
npm run runtime -- npm exec vitest -- run src/test/AuthContext.test.tsx src/test/pricing-dashboard-auction-specific.test.tsx
```

Result: `2` files passed, `116` tests passed, `0` failed. Existing exact receipt coalescing, old-service compatibility, account races, timeout/grace behavior, pricing return copy, manual retries, checkout actions, and catalog/page behavior remain active.

Type check:

```powershell
npm run runtime -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

Scoped lint:

```powershell
npm run runtime -- npm exec eslint -- src/contexts/AuthContext.tsx src/pages/Pricing.tsx src/test/AuthContext.test.tsx src/test/pricing-dashboard-auction-specific.test.tsx
```

Result: exit 0; no warnings or errors. An intermediate run identified one exhaustive-deps warning after the lifecycle change; the effect now reads `user?.id`, matching its dependency, and the final command is clean.

`git diff --check` passed.

### Self-review and limits

The ordinary handoff happens only when the same actor/generation/known-session identity remains current and the audience changed. It clears only its own in-flight slot, never a newer request. Exact old-audience callers still receive `stale`; the handoff is ordinary and cannot manufacture or reuse a receipt. Failure and timeout behavior after handoff uses the existing retry delays and grace semantics without changing their budgets.

Pricing stores no token or receipt in browser persistence. The lifecycle key uses only the actor id, parsed known session id (or a bounded unknown/no-session marker), and normalized current audience. Successful cleanup is retained only for the exact resulting query string and same lifecycle key. Manual retry checks URL and lifecycle before changing visible state. Test actors, sessions, responses, and query changes are synthetic.

No handler, schema, OpenAPI, H5/H6, provider, database, dependency, build, full suite, deployment, GitHub, or production operation changed or ran in this round. The unchanged 49-test Deno and initial H5/H6 evidence was not repeated. The known repository-wide artifact lint limitation remains Task 9 scope; only all changed source/test files were linted.

These checks prove the bounded local lifecycle transitions. They do not establish deployed service/site ordering, real provider/webhook behavior, cross-tab deduplication, or the prepared browser-after gate. Independent scoped rereview remains required.

## Fix round 2 — checkout-owned Sonner toast lifecycle

Date: 2026-09-23

Fix base: `179ab644b3f7ccb834187b86ee9a7a0f41df1efd`

Authority: `task-17-browser-toast-adjudication.md`, residual Important I2, informed by `task-17-lifecycle-browser-after-report.md`

### Disposition

Pricing now keeps the identity returned by its verified-checkout `toast.success` call separately from its duplicate-notification key. Actor, known-session, audience, and return-context invalidation dismiss exactly that owned success toast before clearing the corresponding local confirmation. Pricing lifecycle disposal also dismisses its owned toast. Cancellation, mock-return, and unrelated notification identities are never adopted or dismissed by this path.

The existing successful URL cleanup remains a valid completed context and therefore does not dismiss or reissue its success toast. A token refresh within the same known auth session also preserves the confirmation and toast without another exact reconciliation. A later return-context replacement invalidates both the inline confirmation and the owned toast.

### RED evidence

With only the focused regression assertions added and production still at the fix base:

```powershell
npm run runtime -- npm exec vitest -- run src/test/pricing-dashboard-auction-specific.test.tsx -t "clears a completed checkout|keeps completed checkout state|clears pending retry state|preserves its own successful cleanup|dismisses only its owned checkout toast"
```

Result: `1` file failed; `6` tests failed, `4` passed, and `37` were skipped. All six failures observed zero calls to `toast.dismiss`: the four completed identity transitions, later return-context replacement, and Pricing unmount. The same-known-session, initial successful cleanup, and pending-without-owned-toast controls passed.

### GREEN verification

The identical focused command passed: `1` file passed; `10` tests passed and `37` were skipped. The assertions require the exact returned checkout toast id, reject dismissal of a synthetic unrelated toast id, and keep the no-owned-toast and same-known-session controls dismissal-free.

Complete amended Pricing regression file:

```powershell
npm run runtime -- npm exec vitest -- run src/test/pricing-dashboard-auction-specific.test.tsx
```

Result: `1` file passed; `47` tests passed and `0` failed.

Type check:

```powershell
npm run runtime -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

Scoped lint:

```powershell
npm run runtime -- npm exec eslint -- src/pages/Pricing.tsx src/test/pricing-dashboard-auction-specific.test.tsx
```

Result: exit 0; no warnings or errors.

`git diff --check` passed.

### Self-review and limits

The checkout success id is retained only in memory and contains no actor, billing, token, provider, or receipt data. The duplicate key still prevents repeated announcements, while dismissal addresses only the live Sonner instance owned by the verified checkout. Invalidation nulls the retained id after dismissal, so later cleanup cannot target the same toast again. No global dismissal or notification-framework change was introduced.

This round did not change or rerun AuthContext, the handler, Deno tests, H5/H6, schemas, OpenAPI, provider or database behavior. It made no install, build, full-suite, deployment, GitHub, production, customer, or snapshot operation. The prior combined AuthContext + Pricing `116`-test result and handler `49`-test result remain earlier evidence, not results from this round. The repository-wide `eslint .` hook remains excluded under the recorded Task 9 artifact ruling; every file changed in this round received scoped lint.

The local component proof does not establish actual browser rendering, Sonner timing in a deployed site, or production auth transitions. The prepared actor-only body-visible browser gate and independent scoped rereview remain required.
