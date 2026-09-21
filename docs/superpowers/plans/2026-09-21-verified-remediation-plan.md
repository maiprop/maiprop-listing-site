# Verified remediation implementation plan

> **Execution authorized:** The user subsequently requested proceeding with an agentic approach. Use superpowers:subagent-driven-development for local implementation and review. Deployment remains a separate concrete release action. Steps use checkbox syntax.

**Goal:** Repair verified failures, reconcile the capabilities needed by each release, and improve measured performance while preserving every supported module.

**Architecture:** Keep React, Cloudflare and Supabase changes scoped to their actual dependencies. Use additive, compatible database changes and behavior tests at the affected boundary. Treat cleanup and unmeasured performance concerns as gated investigations, not automatic rewrites.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Cloudflare Pages/Workers, Supabase Auth/Postgres/Edge Functions, Deno, Vitest, PostgreSQL runtime tests.

**Spec:** [Verified 27-item review](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/superpowers/plans/2026-09-21-verified-issue-review.md>). That document contains current evidence, corrections and the user's constraints.

## Global constraints

- Preserve modules, routes, filters, permissions, entitlements and supported user actions.
- Use local checks before any release-triggering push. Do not dispatch builds to discover ordinary test failures.
- Reuse the exact approved artifact between staging and production; a changed payload needs new evidence.
- No full-main deployment or blind migration-backlog application for a scoped repair.
- No deletion of historical migrations because definitions repeat.
- Supabase function line coverage and database executable PL/pgSQL statement coverage must each reach **80% minimum**, with separate denominators.
- Retain frontend/Cloudflare coverage floors: lines **86%**, functions **81%**, branches **80%**, statements **81.9%**.
- No lowering coverage by excluding difficult runtime files or substituting source-string checks for behavior.
- This plan introduces no GitHub runs, deployment permission changes or production writes. Those are separate release actions after a concrete candidate is ready.

## Review focus

1. Concurrent cold public requests and abandoned producers must recover without cross-request stream errors — A2.
2. A database rejection after conversation creation must never show enquiry success; retry must retain the form — A3.
3. Missing external evidence must never turn into made-up local scores or history; older clients must handle the response — A4.
4. An authenticated user from a different organization must not gain management or storage access — A6.
5. Retried billing, cleanup, RSVP or notification work must not duplicate irreversible effects — A6 and A11/A12.

## Order and release boundaries

| Order | Action | Prior issues | Deliverable / gate |
|---|---|---|---|
| 0 | A0: record exact release dependencies | 5, 21 | Capability manifest before choosing a release batch |
| 1 | A1: restore Professionals read | 1 | Working anonymous directory/detail with private fields protected |
| 1 | A2: finish existing cache reliability repair | 2 | Existing patch proven against actual live composition |
| 2 | A3: honest new-build enquiry result | 3 | Persistence errors reach the form; retry remains usable |
| 2 | A4: remove unsupported neighbourhood facts | 4 | Missing facts display as unavailable, sourced facts survive |
| 3 | A5: repair query timing | 14 | A real slow query is measured accurately |
| 3 | A6a–c: reconcile selected release capabilities | 5–10 | Each coherent service/SQL/client group passes its contract |
| 4 | A7: measure performance and fix demonstrated bottlenecks | 11–13, 15 | Comparable before/after evidence, preserved results |
| 5 | A8: verified cleanup | 15–19, 21 | No runtime consumer lost; no speculative migration deletion |
| 3–5 | A9: correct documentation alongside relevant changes | 20, 24 | Current authority and deployment behavior described accurately |
| 4 | A10: measure and reduce avoidable CI work | 22 | Proven redundant jobs removed with equivalent gates |
| 3–5 | A11: integration completion proofs | 23–25 | Traceable jobs, email path and video connection outcomes |
| Before release | A12: acceptance and coverage | 26, 27 | Module/role checks and separate current coverage reports |

A1 and A2 are independently reviewable and must not wait for a whole-project refactor. “Order 1” does not mean two automatic deployments: group compatible, locally proven changes only after A0 maps their dependencies. An urgent cache-only candidate can remain a website-only release. All broader cleanup is excluded from that candidate.

### Task 1 — A0 — Freeze the release dependency set

**Files:** read [fresh live metadata](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.tmp/project-internals-20260921/verification/live-metadata.json>), [earlier capability comparison](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.tmp/project-internals-20260921/source-live-comparison.json>), [live composition and pending repair](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.tmp/open-house-recovery-notes.md>), and [artifact verifier](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/production-release-artifact.mjs>). Create `C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/release-capabilities/2026-09-21-remediation.json`.

**Interface:** one record per required relation/routine/worker, with `consumer`, `signature`, `requiredRoles`, `livePresent`, `sourceMigration`, `releaseGroup`, `validationEvidence`. Routine names alone are insufficient: inspect overloads, argument types, return shapes, grants and policy dependencies.

- [ ] Record source SHA, live website marker/payload, deployed service hashes and applied migration versions without modifying them.
- [ ] Trace the 13 known missing calls and dynamic/imported helper calls. Map each absent source migration version to actual live capabilities rather than assuming every absent version has no effect.
- [ ] Assign each changed consumer to A1, A2, A3, A4, A6a, A6b or A6c. A candidate with an unresolved dependency fails preparation.
- [ ] Verify the previous website/service remains compatible during an additive rollout. Record the rollback artifact and any data compatibility limits.
- [ ] Keep the resulting manifest with local test evidence. Do not unlock production or push a speculative release candidate.

**Done:** an engineer can state exactly which database/service changes the candidate needs and which it does not.

### Task 2 — A1 — Restore the public Professionals contract

**Files:** reference [fixed public projection definition](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/migrations/20260729145205_replace_public_professional_definer_view.sql>), [directory/detail readers](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useProfessionals.ts>), [existing static guard](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/test/publicProfessionalsProjectionMigration.test.ts>). Create a new uniquely timestamped forward migration after checking actual live columns and types; create `C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/public_professionals_runtime_test.sql`.

**Interface:** `public.public_professionals` must expose the explicit public projection consumed by both readers. Preserve archived filtering and the intended owner/admin raw-table boundary. The current anonymous raw-table 401 is not repaired by giving anonymous callers private-table access.

- [ ] Build local fixtures for a public professional, an archived professional, a profile owner and an unrelated user. Assert anonymous directory/detail output and forbidden columns.
- [ ] Run those database requests against the current production-compatible schema and record the missing-view failure.
- [ ] Use the final constrained projection definition linked above in an additive migration, including its empty search path, view options and explicit grants. Inspect the entire caller/grant chain before adding any grant.
- [ ] Verify anonymous reads; owner/admin management reads; archived exclusion; and denial of internal notes, calendar notes and moderation details. Static SQL-string tests alone do not close this action.
- [ ] Validate matching browser directory/category/detail behavior locally, then on the scoped staging candidate.

**Done:** no PGRST205 on the intended public interface, correct public records, and private fields remain inaccessible.

### Task 3 — A2 — Complete the existing Open Houses cache repair

**Files:** [pending cache patch](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/functions/api/public/_cache.ts>), [public API regressions](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/functions/api/public/public-api.test.ts>), [Workers isolation regression](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/public-api-worker-cache.test.mjs>), [Workers harness](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/test-support/public-api-worker-cache.mjs>).

**Interface:** keep the public catalogue JSON envelope and cache headers. Coalesced requests receive independent Response objects backed by shared serialized data, with bounded producer/waiter lifetimes.

- [ ] Reuse the existing patch in ef204657; do not implement a second cache layer.
- [ ] Preserve the fresh A/B reproduction: baseline returns 200/500; pending fix returns 200/200 with one upstream producer.
- [ ] Run the targeted local gate:

```powershell
node scripts/project-runtime.mjs -- node node_modules/vitest/vitest.mjs run scripts/public-api-worker-cache.test.mjs functions/api/public/public-api.test.ts
```

- [ ] Check cold/warm, concurrent, aborted, expired-publication, stalled-producer and recovery cases, plus auctions/listing consumers of the shared cache.
- [ ] Verify the artifact against the live frontend composition. For a cache-only release, only the intended worker payload changes; generate an accurate new release manifest rather than reuse the old marker from the local proof.
- [ ] Prepare a protected website-only staging/release path. Existing auction recovery workflow and full-main workflow are not interchangeable with this scope.

**Done:** staging behavior passes and a concrete deployable artifact is ready. Production completion requires promotion and a fresh Upcoming/Past check; current 200 responses alone do not prove this undeployed fix is active.

### Task 4 — A3 — Prevent false enquiry confirmations

**Files:** [enquiry submission](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/pages/NewBuildDetail.tsx>), [form state and feedback](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/components/new-build/RegisterInterestCard.tsx>), [page tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/test/NewBuildDetail.test.tsx>). Add a focused real-card test at `C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/test/RegisterInterestCard.test.tsx`. Inspect [conversation creation](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useMessages.ts>) and existing new-build lead triggers before changing retry semantics.

**Interface:** `onContact(form): Promise<void>` resolves only after the intended enquiry insert succeeds. A rejection must preserve the entered values, clear loading, and display a useful error.

- [ ] Promote the isolated reproduction into a normal regression test. Capture the mocked card's `onContact` callback and assert a returned insert error rejects it and never calls the success toast. Do not retain the evidence probe's wait-for-success step in the fixed test.
- [ ] Check the Supabase error returned by the actual insert:

```ts
const { error } = await supabase.from("new_building_leads").insert(payload);
if (error) throw error;
```

- [ ] In the real card, add a submission-error state. Clear it at submission start; catch a rejected callback, set a translated error message, and keep the form values. Render the message with `role="alert"`. Set `submitted` and clear the form only after successful resolution.
- [ ] Test insert rejection, conversation rejection, pending double-click prevention, and one successful retry after a definite rejection. Verify the existing database triggers produce the expected CRM/project-lead and notification records in local fixtures.
- [ ] Test a lost response after a committed insert. If the current identity/constraint path does not deduplicate retries, define a stable submission key and database-backed replay behavior in a separate additive contract before promising exactly-once submission. Do not silently swallow duplicate or permission errors.
- [ ] Run the page and real-card tests plus local type checking. Assert success wording only claims effects the transaction has actually established.

**Done:** failed persistence cannot appear successful; the form remains usable; retry outcomes are explicitly proven.

### Task 5 — A4 — Make neighbourhood reports honest when evidence is missing

**Files:** [fallback and OS enrichment](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/neighbourhood-report/index.ts>), [service tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/neighbourhood-report/index.test.ts>), [report rendering](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/components/NeighbourhoodReport.tsx>), [report UI tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/test/NeighbourhoodReport.test.tsx>).

**Interface:** unavailable facts must be representable without invented numbers. Sourced current market observations and independently supported historical observations must remain distinguishable; a current price does not establish a five-year price series.

- [ ] Add provider-failure and malformed-JSON tests using a fictional city. Assert no fabricated project, demographic, score or historic price is returned.
- [ ] Add an OS-current-price-only case. Assert the current observation remains available while absent history/percentage change stays unavailable; remove the fixed-multiplier reconstruction in `applyOsMunicipalityContext`.
- [ ] Replace fixed fallback claims with explicit unavailable values and an empty development list. For nullable sections, align the response schema and UI guards together; render “Unavailable” rather than zero, a fake “Quiet/Good” label or a numeric chart.
- [ ] Test the deployed older response consumer against the new service response. If partial responses would break it, negotiate the new response shape with an optional request version, or return the existing handled error envelope to older clients on unavailable-data paths. Never deploy nulls into an old client's unconditional numeric formatting.
- [ ] Keep successful, adequately sourced reports working. Verify any persisted listing scores are not written from fallback defaults.
- [ ] Run the service and component tests locally:

```powershell
node scripts/project-runtime.mjs -- npm run test:deno -- neighbourhood-report/index.test.ts
node scripts/project-runtime.mjs -- node node_modules/vitest/vitest.mjs run src/test/NeighbourhoodReport.test.tsx
```

**Done:** each displayed factual number/project has provenance; missing evidence produces honest, usable partial/error states without breaking older clients.

### Task 6 — A5 — Measure actual query duration

**Files:** [observer](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/lib/queryObserver.ts>), [query client wiring](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/lib/appQueryClient.ts>), [observer tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/test/queryObserver.test.ts>).

**Interface:** timing belongs to one Query fetch lifecycle. Use a monotonic clock; do not infer duration from `dataUpdatedAt` or an externally supplied performance entry.

- [ ] Add the real QueryClient slow-query regression from the isolated probe. Include a fast query, a retry, a refetch and final failure.
- [ ] Track fetch start per Query instance (for example a WeakMap keyed by Query); start on its fetch action, calculate elapsed time on completion and clear terminal timing state. Remove the unused started expression and dependence on nonexistent `rq:` producers.
- [ ] Emit one slow event for one completed slow fetch, with safe route context. Avoid query-string values or user-entered data in new telemetry fields.
- [ ] Verify a 1.5-second query reports the measured duration; cached reads and fast queries do not; repeated refetches use fresh start times.
- [ ] Run the existing and new observer tests together. Verify no unbounded performance-entry accumulation.

**Done:** performance investigations can use real query timing instead of synthetic test measures.

### Task 7 — A6 — Reconcile capabilities as three coherent groups

These are release-readiness actions, not six newly proven live outages. Apply only groups required by the chosen candidate. A0 supplies exact signatures and compatible source definitions.

**A6a — Managed listings.** Files: [readers](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useListings.ts>), [managed catalogue definition](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/migrations/20260728093154_align_managed_catalogue_and_promotion_principal.sql>), [tenant proof harness](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/staging-listing-tenant-matrix.mjs>).

- [ ] Prove owner, organization and admin list/summary results on a local schema with production-compatible grants.
- [ ] Add the required page/summary routines through reviewed forward SQL; verify cursor tie-breaking, totals, empty pages and invalid cursors.
- [ ] Run a cross-tenant case and session switch during an in-flight request. Roll out matching consumers only when these interfaces exist.

**A6b — Building creation, project management and storage recovery.** Files: [creation](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/create-new-building-listing/index.ts>), [project management](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/project-management/index.ts>), [upload registration](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/lib/buildingListingUploads.ts>), [cleanup worker](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/process-storage-cleanup/index.ts>), [cleanup proof](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/staging-storage-cleanup-proof.mjs>), [project tenant proof](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/staging-project-tenant-matrix.mjs>). Reference the existing lifecycle/transition migrations rather than duplicating their evolving definitions arbitrarily.

- [ ] Map transaction, upload-registration, media/cover, deletion and cleanup claim/prepare/settle interfaces into one dependency graph.
- [ ] Inject failures after upload, during graph creation, after commit and during cleanup. Verify no partial listing graph or wrongly deleted referenced media.
- [ ] Race two cleanup workers and retry deletion. Prove lease/reference checks and tenant ownership before enabling the scheduler.
- [ ] Prepare additive SQL, matching services and schedule as a compatible set; preserve rollback access for previously deployed clients.
- [ ] Use local fixtures first. Run the linked staging harnesses only against an explicitly selected staging project after reviewing their fixture mutations.

**A6c — Role switching and billing recovery.** Files: [finalization](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/log-role-switch/index.ts>), [billing boundary](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/log-role-switch/billing.ts>), [retry worker](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/reconcile-role-switch-billing/worker.ts>), [audit runtime tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/role_switch_audit_integrity_test.sql>), [entitlement tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/billing_entitlement_hardening_test.sql>).

- [ ] Verify source audit-finalization signature, leases and state transitions against live-compatible SQL; the older deployed service must continue operating during rollout.
- [ ] Test provider timeout before/after completion, repeated requests, changed sessions and a second worker claiming work. Use a payment-provider stub or test environment.
- [ ] Assert one auditable final outcome and correct role/billing entitlements; a retry must not create a second subscription/charge.
- [ ] Deploy this group only when selected for a release; a missing worker alone is not justification to alter current customer billing.

**Done:** each selected group has complete contract/permission/retry evidence and a rollout sequence. Unselected groups remain recorded deployment dependencies.

### Task 8 — A7 — Optimize measured bottlenecks

**Files:** [detail SEO path](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/functions/_seo.ts>), [directory collection](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useProfessionals.ts>), [contacts](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useContacts.ts>), [leads](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useLeads.ts>), [catalogue scale fixture](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/public_catalogue_20k_scale_test.sql>), [existing latency diagnostic](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/diagnose-public-listings-latency.mjs>).

- [ ] Establish local/staging route measurements: at least 20 comparable cold and 20 warm samples per selected page, with device/network/cache state, HTML time, data time, requests, bytes and render milestones recorded.
- [ ] Include auctions, Open Houses, Professionals and new-build detail; collect realistic large-account CRM data locally.
- [ ] Attribute the delay before choosing a change. SEO already caches reads; publisher runs are not proven slow; unused optimizeImage cannot affect active pages.
- [ ] For a measured collection limit, add server pagination and stable sorting with accurate totals; test more rows than one API response can return, including filter changes and final page.
- [ ] For a measured SEO delay, preserve server metadata while removing proven sequential waits or reusing safe public publication data. Never substitute private payloads into public HTML.
- [ ] For publisher cost, inspect representative query plans and changed-row volume locally/staging before changing indexes or publication design. Preserve atomic snapshots, expiry and cursor behavior.
- [ ] For images, measure URLs/bytes used by active image components and verify transform support before enabling smaller variants.
- [ ] Repeat the same measurement protocol only for changed paths. Accept changes with a reproducible improvement and unchanged correctness; report tradeoffs rather than claiming whole-app speed from one route.

**Done:** a before/after artifact identifies the actual bottleneck, improvement and regressions checked. Unproven candidates are closed without a code change when evidence does not support them.

### Task 9 — A8 — Remove only demonstrably unused code

**Files:** [unused image helper](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/lib/optimizeImage.ts>), [legacy usage writers](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useUsageAddons.ts>), [legacy component](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/components/AuctionBidHistory.tsx>), [legacy hook](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useAuctionBidHistory.ts>), [AI compatibility shim](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/_shared/aiUsage.ts>), [literal accounting guards](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/public-function-inventory.cjs>).

- [ ] Confirm static imports, dynamic imports, exports, packaging entrypoints and generated references for each proposed deletion; record the result.
- [ ] Remove optimizeImage and its dedicated tests only if that check confirms no supported consumer. Do not market its deletion as an image-speed improvement.
- [ ] Remove the three obsolete always-throwing mutation hooks and only their obsolete tests/imports; preserve usage readers and server quota accounting.
- [ ] Review AuctionBidHistory and its hook as an unused pair. Remove them only if comparable-sales functionality remains supplied by the active product flow; otherwise retain and describe their actual purpose. A rename alone is not a performance fix.
- [ ] Retire recordAiCall only with its callers and the five literal inventory guards. Replace those guards with evidence that the real quota reservation happens before paid provider work. Verify denied calls do not reach providers and allowed calls reserve once.
- [ ] Extract large-file logic only when a current repair benefits from an independently testable boundary. Do not refactor billing because of line count alone.
- [ ] Retain migration history. Produce an effective-schema map; any future baseline requires fresh-install and supported-upgrade equivalence as a separate project.

**Done:** every deletion has a consumer proof, preserved functional tests, and a transparent coverage-denominator change.

### Task 10 — A9 — Correct the operational documentation

**Files:** [access model](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/PLATFORM_ARCHITECTURE.md>), [runtime/auth description](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/README.md>), [on-call instructions](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/ON_CALL.md>), [email ADR](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/adr/004-pgmq-email-queue.md>), [current vs target layout](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/REPOSITORY_ARCHITECTURE.md>).

- [ ] Replace obsolete free/Pro allowance examples with the current verified authority and limits.
- [ ] Separate authority role, participant type and billing entitlement; identify the database/service checks that enforce each.
- [ ] Describe actual current email delivery and mark the queue schedule as unverified/absent, rather than promising a five-second retry.
- [ ] State source/deployed distinctions and the controlled release path. Keep explicitly labeled future architecture as future architecture.
- [ ] Check all linked files and commands. Avoid adding tests that merely repeat prose.

**Done:** operators can follow the documentation without assuming nonexistent jobs or undeployed interfaces.

### Task 11 — A10 — Reduce proven GitHub waste

**Files:** [CI](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.github/workflows/ci.yml>), [staging](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.github/workflows/stage-release.yml>), [production](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/.github/workflows/deploy-production-release.yml>).

- [ ] Read job durations, attempts, triggers and available billing data from recent existing runs; do not launch benchmark builds.
- [ ] Identify duplicated work by identical input SHA/artifact and equivalent output, not by repeated YAML text.
- [ ] Retain provenance, permission, artifact-integrity and environment-specific behavior gates. Reuse immutable outputs where the same check is genuinely repeated.
- [ ] Test trigger/guard changes locally using existing workflow contract tests before a release-triggering push.
- [ ] Compare job counts and duration for equivalent later releases; do not claim monetary savings without cost evidence.

**Done:** a measured redundant job/check is removed with equivalent release confidence, or the candidate is dismissed.

### Task 12 — A11 — Verify background integrations, email and video

**Files:** [OS poller](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/poll-os-auctions/index.ts>), [follow-ups](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/scheduled-followups/index.ts>), [alerts](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/send-saved-search-alerts/index.ts>), [direct auth email](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/auth-email-hook/index.ts>), [queue worker](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/process-email-queue/index.ts>), [video hook](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/src/hooks/useMaiPropVideoRoom.ts>), [TURN access](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/functions/api/turn-credentials.ts>), [room authorization tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/video_room_turn_authorization_test.sql>).

- [ ] Follow one dispatch ID through service response and durable processing result for each scheduled HTTP integration. Record where completion/retry reporting already exists before adding another system.
- [ ] Trace every active email producer to direct send or queue. Use a local/sandbox email sink to test retry and duplicate handling. Do not add a frequent queue schedule when no active producer requires it.
- [ ] If the queue is unused, propose retirement of its deployed route separately after checking external callers and retained data; the source search alone does not authorize deletion.
- [ ] Test video signaling and room permissions with local fixtures; then a controlled staging pair on direct and restrictive/relay-required networks. Use synthetic media for automated checks.
- [ ] Distinguish unavailable credentials from connection failure in user feedback if the network tests demonstrate an actionable gap. Preserve graceful fallback where it works.

**Done:** successful dispatches are traceable to outcomes, active email paths are known, and video failures/connections have evidence. A failed proof becomes a specific issue with a reproduction, not a blanket “module broken” assertion.

### Task 13 — A12 — Complete acceptance and current coverage before the selected release

**Files:** create `C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/docs/acceptance/2026-09-21-module-role-matrix.md`; use [frontend/Cloudflare coverage](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/run-vitest-coverage.mjs>), [Deno test runner](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/scripts/run-deno-tests.mjs>), [Deno configuration](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/functions/deno.json>), existing [catalogue runtime tests](<C:/Users/K R/.codex/worktrees/auction-recovery/maiprop-listing-site/supabase/tests/public_catalogue_snapshot_test.sql>) and other database runtime suites.

- [ ] Build the acceptance matrix with anonymous, Free, Pro, owner, unrelated user, organization member and admin contexts where supported. Each row records route/action, expected success/denial, retry behavior, evidence and tested commit.
- [ ] Include auction identity and pagination; Open Houses Upcoming/Past and RSVP capacity; professional directory/contact; new-build enquiry-to-CRM; listings/projects/storage; billing/role switch; messaging; investor and privacy flows.
- [ ] Run frontend/Cloudflare coverage once on the final selected source with the project runtime. Keep the existing higher thresholds.
- [ ] Run all Supabase tests with Deno coverage in a fresh isolated output directory; generate LCOV/HTML using the official Deno workflow. Enumerate all runtime Edge files independently and account for unimported files so they cannot disappear from the denominator. [Deno coverage reference](https://docs.deno.com/runtime/test/coverage/).
- [ ] On an isolated local database, initialize plpgsql_check profiling before test execution and retain results across all test sessions. Enumerate all application PL/pgSQL routines and count executed/total statements, including unexecuted routines; compute the weighted global result rather than averaging routine percentages. Validate the pinned extension's output on a known fixture first. [Profiler and statement coverage reference](https://github.com/okbob/plpgsql_check#coverage-metrics).
- [ ] Run a fresh migration replay and the supported upgrade path. Compare effective schema, grants, triggers and behavior. DDL/migration replay success is reported separately from executable PL/pgSQL statement coverage.
- [ ] Add meaningful tests for uncovered error, permission, rollback and retry branches until Edge line coverage and DB statement coverage each meet 80%. Do not lower other floors.
- [ ] Save SHA, timestamp, runtime versions, included/excluded files/routines, raw totals and per-area reports. A percentage without those denominators does not close #27.
- [ ] Complete the selected module's controlled staging journeys and review the exact artifact diff. Only then is the candidate ready for its authorized release boundary.

**Done:** evidence establishes the selected release's functionality and the requested coverage measures. A whole-app claim additionally requires every supported matrix row; it cannot be inferred from one release smoke test.

## Completion and self-review

All 27 original IDs map to actions above. The six compatibility entries are grouped so they cannot be counted or released as six independent failures. Confirmed defects have reproduction and completion checks; speculative items start with evidence collection and permit a no-change outcome.

No blanket deployment, paid-provider experiment, historical migration deletion or unsupported performance promise is needed to execute the local preparation. Completion is measured by working behavior and preserved access, not files deleted, coverage-test count or workflow length.

## Expanded audit repairs

These tasks address newly verified active paths from the current agent audit. Reports in the local SDD workspace retain evidence and dismissed candidates; no orphan code or labeled mock is counted as a live defect.

### Task 14 — H1 — Render actual market observations

**Files:** src/components/MarketTicker.tsx, its focused tests, and only necessary locale entries.
- [ ] Remove random price mutations, static city trends, fabricated sparklines and the fallback auction count.
- [ ] Render the latest validated API observations directly; late query completion/refetch must update displayed values.
- [ ] Distinguish sourced price/trend observations, estimates and unavailable data; do not label fabricated changes LIVE.
- [ ] Preserve the market ticker module and responsive scrolling presentation; decorative animation may not alter numeric facts.
- [ ] Test delayed data, refetch, absent/invalid data, zero auction count and elapsed timers. No fake facts appear from timer advancement or missing responses.
- [ ] Run focused tests and type checking; document removed background timer work without inventing measured page-speed improvement.

### Task 15 — H2/H3 — Preserve POI and walk-score provenance

**Files:** supabase/functions/property-pois/index.ts and tests; src/components/PropertyMiniMap.tsx; src/pages/PropertyDetail.tsx; affected score components/tests.
- [ ] Replace generic named/distance fallback amenities with an honest unavailable response or empty evidence set.
- [ ] Draw geographic POI markers only when coordinates are verified and supplied by the source. Do not invent coordinates from category offsets or list order.
- [ ] Keep supported nearby-place text and property location functionality. Qualify uncertain provider-generated suggestions appropriately.
- [ ] Never derive/persist/display a walk score from fallback/example amenities; preserve a genuinely sourced stored score and represent unknown separately from zero.
- [ ] Test provider/configuration/malformed failure, provenance through the real UI, no fallback-score overwrite, and stable coordinates when filters change.
- [ ] Check the current older client before changing the service shape; use compatible handled errors or negotiated new semantics where needed.

### Task 16 — H4 — Remove unsupported valuation fallback claims

**Files:** supabase/functions/property-valuation/index.ts and tests; src/components/PropertyValuation.tsx and AI insight consumers as needed.
- [ ] Trace the valid OS and AI evidence path and retain supported valuations.
- [ ] Remove unsupported current-year benchmark claims and financial/legal/planning/liquidity/yield constants on no-evidence paths.
- [ ] No external evidence means explicit unavailable fields or the existing handled error, not a fabricated valuation with a low-confidence badge.
- [ ] Do not reconstruct history or legal certainty from a current market average.
- [ ] Preserve quota reservation before paid work; inspect attempt/success/refund policy before changing billing semantics, and test no duplicate reservation or paid call after denial.
- [ ] Test no OS/no AI, valid OS-only evidence, malformed/provider failure, partial evidence and older-client compatibility with focused behavior tests.

### Task 17 — H5/H6/H7 — Confirm only durable workflow outcomes

**Files:** admin professional verification and notes workflow, onboarding ProVideoStep, Pricing checkout confirmation; related hooks/locales/tests only where needed.
- [ ] Verify request-more-information's actual side effect. Persist a real applicant-facing request using existing notification infrastructure if this is the intended current action, or accurately label an internal note. Preserve useful admin workflow and permissions.
- [ ] Verify whether Pro launch interest remains a supported business requirement. A localStorage flag cannot confirm future notification enrollment. Reuse a current durable workflow or present the actual available action without an unsupported delivery promise.
- [ ] Wait for checkout/entitlement verification before announcing payment or plan activation. Keep pending/error/retry states and retain the checkout identity until verification is established.
- [ ] Test failures and retries through each real user action. A query parameter must not trigger an activation success by itself. Labeled mock billing remains clearly distinct.
- [ ] Preserve current modules and avoid inventing a marketing queue or duplicate billing system solely to repair wording.

### Task 18 — A3b — Make enquiry replay durable

**Files:** additive new-build enquiry submission migration/RPC, generated interface types if required, NewBuildDetail and RegisterInterestCard, behavior and SQL tests.
- [ ] Inspect current raw lead, CRM, project-lead and notification identity rules; record a lost-response retry reproduction.
- [ ] Introduce stable client submission identity with a constrained database replay path. The same user/listing/key must return the same stored submission and emit no second trigger effects.
- [ ] Preserve the key through ambiguous failures; rotate after confirmed completion/new submission. Verify same-key different-payload handling and caller authorization explicitly.
- [ ] Protect against cross-user replay and double-click races. Definite permission/validation failures still reject; no blanket conflict swallowing.
- [ ] Validate backward compatibility and rollout order; old clients must keep working through the additive rollout, without claiming their retries become exactly once.
- [ ] Run meaningful local SQL and form/page behavior tests before marking the full A3 retry requirement complete.

