# Code Health Tracking

## Audit Follow-up (2026-05-24)

Completed cleanup from the dead-code/type-safety audit:

- Removed unused exports: `useTogglePriceAlert`, `useMyFiresaleInterest`, and `useBulkUpdateConsultationRequests`.
- Kept `sortFiresaleInterestQueue` as a private live helper inside `useFiresaleInterestQueue`.
- Added contact-task due reminders through `private.send_due_contact_task_notifications()` and hourly pg_cron wiring.
- Removed all production `as never` casts under `src/`; Supabase payloads now use generated table/RPC types.

## Fat Components (F1/F2)

Pages over 600 LOC have been reviewed. All use extracted sub-components already:

| File | LOC | Sub-components | Status |
|------|-----|---------------|--------|
| `Listings.tsx` | 731 | 6 extracted (FilterChip, MapGate, etc.) | Orchestration JSX — further split adds complexity |
| `Auctions.tsx` | 715 | AuctionCard, AlertModal | Similar to Listings |
| `Onboarding.tsx` | 680 | 6 step components | Wizard pattern, acceptable |
| `CreateNewBuildingListing.tsx` | 672 | Form wizard | Acceptable for multi-step form |
| `Dashboard.tsx` | 671 | 10 tab components in `dashboard/` | Hub — just tab routing |
| `OpenHouseDetail.tsx` | 670 | Multiple extracted sections | Acceptable |
| `NewBuildDetail.tsx` | 670 | ConstructionTimeline, etc. | Acceptable |
| `PropertyDetail.tsx` | 638 | 12 extracted sub-components | Well decomposed |
| `AdminPricing.tsx` | 628 | Pricing table + forms | Admin-only, acceptable |

**Recommendation:** No immediate decomposition needed. Monitor for growth beyond 800 LOC.

## Direct Supabase Calls (F9)

36 `supabase.from()` and 11 `supabase.auth` calls exist outside `hooks/`:

### Priority extractions (high-traffic paths):
- `PropertyCard.tsx` — `listing_reports` insert → extract to `useReportListing` hook
- `Navbar.tsx` — notification updates → extract to `useNotifications` hook
- `ViewingDialog.tsx` — viewings + leads insert → extract to `useCreateViewing` hook

### Lower priority (admin-only):
- `AdminReports.tsx` — 7 calls (dashboard stats) → `useAdminStats` hook
- `AdminPanel.tsx` — sync check + user fetch → existing hooks
- `AdminFiresalePipeline.tsx` — notification insert → batch with other admin hooks

### Acceptable as-is:
- `LegalDocumentModal.tsx` — single insert for contact submission
- `AIAssistantWidget.tsx` / `ProAIToolsWidget.tsx` — session auth check (pattern is common)

## Test Coverage (D1-D3)

| Metric | Current | Target |
|--------|---------|--------|
| Line coverage | 64.63% | 70% |
| Function coverage | 42.15% | 55% |
| Dashboard tab coverage | 5/10 tested | 10/10 |

### Untested areas (highest impact):
1. Dashboard tabs: AnalyticsTab, AuctionsTab, BillingTab, SavedSearchesTab, ViewingsTab — smoke tests added
2. Mutation hooks: `useCreateListing`, `useUpdateListing` — need integration tests
3. Edge functions: 29/37 have Deno tests — remaining 8 are simple CORS/proxy functions

## Circular Dependencies (F3)

Previously identified cycles have been resolved:
- `AuthContext` ↔ `useSubscription` — broken by extracting `isPlatformAdmin` to `authUtils.ts`
- No new cycles detected via `madge --circular src/`

## Storybook (F7) — Deferred

Storybook is not currently installed. Recommended setup when the team grows beyond 2 engineers:

```bash
npx storybook@latest init --type react_vite
```

Priority components for stories:
1. `PropertyCard` — most reused component, 5+ variants (auction, firesale, new build, etc.)
2. `AuctionCard` — bid status states
3. `ConfirmDialog` — the shared modal replacement for `window.confirm()`
4. `ProGate` — subscription gating states (free, pro, loading)
5. `EmptyState` — various illustration + CTA combinations

**Why deferred:** The team is currently 1 engineer. Storybook adds ~50MB to `node_modules` and requires ongoing story maintenance. The ROI is better after hiring.

## Accessibility (M1-M3)

| Check | Status |
|-------|--------|
| axe-core in E2E | ✅ 3 pages scanned (index, listings, login) |
| ARIA labels on icon-only buttons | ✅ All close buttons labeled |
| Alt text on images | ✅ All `<img>` tags have `alt` attributes |
| `window.confirm()` → `ConfirmDialog` | ✅ Zero `window.confirm()` in production code |
