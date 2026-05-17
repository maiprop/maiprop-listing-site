# Strict Release Actions

> Started: 2026-05-07
> Scope: the eight actions from the strict React + TypeScript + Supabase audit.

## Status

| # | Action | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Run live Supabase security/performance advisors. | Done | Advisors queried on active project `qvvicunqcrwpioqnvzxf` after live migrations through `20260507201245`. |
| 2 | Produce table-by-table RLS access matrix. | Done | See `docs/RLS_ACCESS_MATRIX.md`. |
| 3 | Document every public Edge Function auth model. | Done | See `docs/EDGE_FUNCTION_AUTH_RATIONALE.md`. |
| 4 | Add owner filters to child-table mutations where possible. | Done | `project_units`, `project_leads`, `project_media`, `professional_services`, and `professional_availability` hooks now add client-side ownership preflights/payload checks. |
| 5 | Fix or explain future-dated migrations. | Done | Added `npm run lint:migrations:chronology` plus `scripts/applied-future-migrations.json` because the future-dated migrations are already applied in the live project and cannot be safely renamed. |
| 6 | Split large page components. | Started | Extracted shared listing compare-button UI into `ListingCompareButton`; larger page-section splits remain. |
| 7 | Clean noisy test warnings. | Partially done | Added missing `DialogDescription`, test i18n mock, jsdom canvas/download stubs, and React Router future flags in direct wrappers. |
| 8 | Add CI checks for migration timestamp/order sanity. | Done | Added script entry `lint:migrations:chronology`, unit coverage, and CI enforcement. |

## Live Supabase Security Advisor Findings

- Fixed: mutable `search_path` findings for `agent_data_input_max_per_month`, `agent_data_input_discount_pct_per_input`, `guard_sensitive_profile_columns`, and `tg_agent_data_inputs_updated_at`.
- Fixed: always-true `contact_submissions` insert policy now has bounded validation checks.
- Fixed: public storage object listing policies for `email-assets`, `firesale-photos`, `project-media`, and `property-images` were removed.
- Fixed: direct browser execution was removed from role transfer, quota, AI usage, listing view tracking, owner Pro lookup, onboarding, and agent data-input SECURITY DEFINER RPCs that should run through authenticated hooks or Edge Functions.
- Fixed: `pg_net` was recreated with extension registration in `extensions` after confirming `net.http_request_queue` was empty.
- Fixed: authenticated users can no longer execute the public SECURITY DEFINER role/quota helper RPCs directly; RLS policies now call private-schema helper copies.
- Fixed: listing view tracking now uses one service-role-only atomic RPC with least-privilege invoker execution.
- Fixed: Edge-only onboarding and platform-admin transfer RPCs now receive the verified caller explicitly instead of relying on `auth.uid()` in service-role calls.
- **Accepted risk** (2026-05-10): Auth leaked password protection (HIBP) is disabled. The live project `qvvicunqcrwpioqnvzxf` is on the Supabase Free plan and HIBP is gated behind Pro+. Org-level decision is to **not upgrade for HIBP alone**. Mitigations in place: `password_min_length=8`, rate limiting on repeated failures via Supabase Auth defaults, all sensitive RPCs run via Edge Functions with rate limiting (see `docs/EDGE_FUNCTION_AUTH_RATIONALE.md`). Re-evaluate when an unrelated business need pushes the org onto Pro.

## Live Supabase Performance Advisor Findings

- Fixed: missing FK indexes surfaced by the advisor, including the remaining `usage_ai_valuations.listing_id`, `usage_priority_ads.listing_id`, and `usage_property_reports.listing_id`.
- Fixed: `auth_rls_initplan` warnings were cleared by wrapping request-level auth helpers and dropping clear duplicate legacy policies.
- Remaining: multiple permissive policies exist where business access genuinely overlaps, plus unused-index INFO warnings that should not be removed without production query telemetry.
- Fixed: duplicate `public.favorites` index `idx_favorites_user_listing` was dropped because `favorites_user_id_listing_id_key` covers it.

## Large Component Split Targets

| File | Lines | First extraction target |
| --- | ---: | --- |
| `src/pages/Listings.tsx` | 812 | Filter/query composition and listing result sections. |
| `src/pages/Auctions.tsx` | 715 | Auction filters, card list, and alert dialog. |
| `src/pages/CreateNewBuildingListing.tsx` | 699 | Form sections and validation schema. |
| `src/pages/Onboarding.tsx` | 680 | Role step components and completion actions. |
| `src/pages/Dashboard.tsx` | 679 | Dashboard panels and metrics hooks. |
| `src/pages/OpenHouseDetail.tsx` | 670 | Offer/registration panels. |
| `src/pages/NewBuildDetail.tsx` | 669 | Media/unit/lead sections. |
| `src/pages/AdminPricing.tsx` | 651 | Pricing table editor and Stripe actions. |

## Current Release Blockers

1. ~~Live security advisor warning remains for leaked password protection~~ — accepted risk; project on Free plan, HIBP requires Pro. See "Live Supabase Security Advisor Findings" above.
2. Large page component extraction is still not complete.
3. Performance advisor still reports multiple-permissive-policy warnings and unused-index INFO findings that need telemetry-backed consolidation/removal.
