# Strict Release Actions

> Started: 2026-05-07
> Scope: the eight actions from the strict React + TypeScript + Supabase audit.

## Status

| # | Action | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Run live Supabase security/performance advisors. | Done | Advisors queried on active project `qvvicunqcrwpioqnvzxf` after live migrations including `20260601140611`, `20260601140627`, `20260601144500`, `20260601144512`, `20260601144524`, `20260601145500`, `20260601145512`, `20260601150500`, `20260601150512`, `20260601151500`, `20260601151512`, `20260601152500`, and through `20260602044000`. Latest result: 135 WARN/INFO, 0 failing lints. |
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
- Fixed: direct browser execution was removed from role transfer, quota, AI usage, listing view tracking, owner Pro lookup, onboarding, open-house capacity/registration, AdminReports moderation, admin broadcast, firesale admin workflows, firesale interest submission, and agent data-input SECURITY DEFINER RPCs that should run through authenticated hooks or Edge Functions.
- Fixed: `pg_net` was recreated with extension registration in `extensions` after confirming `net.http_request_queue` was empty.
- Fixed: authenticated users can no longer execute the public SECURITY DEFINER role/quota helper RPCs directly; RLS policies now call private-schema helper copies.
- Fixed: listing view tracking now uses one service-role-only atomic RPC with least-privilege invoker execution.
- Fixed: Edge-only onboarding and platform-admin transfer RPCs now receive the verified caller explicitly instead of relying on `auth.uid()` in service-role calls.
- Fixed: open-house capacity and registration now use protected Edge Functions with service-role-only explicit-user RPCs; legacy `get_open_house_capacity(uuid)` and `create_open_house_registration(...)` caller-context RPCs are no longer browser-executable.
- Fixed: AdminReports content moderation now uses the protected `admin-content-report-action` Edge Function with service-role-only explicit-admin RPCs; legacy report moderation RPCs are no longer browser-executable.
- Fixed: admin broadcast notifications now use the protected `admin-broadcast-notification` Edge Function with a service-role-only explicit-admin RPC; the legacy broadcast RPC is no longer browser-executable.
- Fixed: firesale admin pipeline, publication, and investor-interest workflow mutations now use the protected `admin-firesale-action` Edge Function with service-role-only explicit-admin RPCs; the legacy firesale admin RPCs are no longer browser-executable.
- Fixed: investor firesale interest submission now uses the protected `submit-firesale-interest` Edge Function with a service-role-only explicit-user RPC and proof-path ownership validation; the legacy submit RPC is no longer browser-executable.
- Fixed: legacy `complete_onboarding_role(...)` and `get_my_role()` RPCs are no longer executable by browser roles; current onboarding uses the protected `complete-onboarding-role` Edge Function.
- Fixed: role-switch audit logging now uses a service-role-only RPC that receives the verified user id from the deployed `log-role-switch` Edge Function; the legacy caller-context audit RPC is no longer browser-executable.
- Fixed: role-switch start now uses the protected `begin-role-switch` Edge Function and a service-role-only explicit-user RPC; the legacy `begin_role_switch()` caller-context RPC is no longer browser-executable.
- Fixed: AI quota reservation now uses a service-role-only RPC that receives the verified user id from deployed AI Edge Functions; the legacy caller-context reservation RPC is no longer browser-executable.
- Fixed: AI quota status now uses the protected `ai-quota-status` Edge Function and a service-role-only explicit-user RPC; the legacy `check_ai_quota(text)` caller-context RPC is no longer browser-executable.
- Remaining (verified 2026-06-01): 0 authenticated SECURITY DEFINER RPC warnings remain. The only remaining security Advisor warning is HIBP leaked-password protection, which is Supabase-plan blocked and accepted below.
- **Accepted risk / platform blocked** (verified 2026-06-01, app mitigation added 2026-06-03): Auth leaked password protection (HIBP) is disabled. The live project `qvvicunqcrwpioqnvzxf` rejects `password_hibp_enabled=true` with HTTP 402: "Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up." Org-level decision remains to **not upgrade for HIBP alone**. Mitigations in place: shared signup/reset validation in `src/lib/passwordPolicy.ts` rejects common compromised/demo passwords before calling Supabase, `password_min_length=8`, password-update reauthentication is enabled, rate limiting on repeated failures via Supabase Auth defaults, and sensitive RPCs run via Edge Functions with rate limiting (see `docs/EDGE_FUNCTION_AUTH_RATIONALE.md`). Re-evaluate when an unrelated business need pushes the org onto Pro.
- **Accepted risk / platform blocked** (verified 2026-06-01): Supabase Auth session inactivity/timebox controls are disabled (`sessions_inactivity_timeout=0`, `sessions_timebox=0`). The Management API rejects `sessions_inactivity_timeout=3600` and `sessions_timebox=604800` with HTTP 402: "User sessions can only be configured on Pro Plans and up." Enable these immediately after upgrading to Supabase Pro or higher.
- **Configuration pending** (verified 2026-06-01): Supabase Auth CAPTCHA remains disabled because `security_captcha_secret` is not configured. Enable CAPTCHA only after choosing the provider and setting the matching secret in Supabase Auth settings.

## Live Supabase Performance Advisor Findings

- Fixed: missing FK indexes surfaced by the advisor, including the remaining `usage_ai_valuations.listing_id`, `usage_priority_ads.listing_id`, and `usage_property_reports.listing_id`.
- Fixed: `auth_rls_initplan` warnings were cleared by wrapping request-level auth helpers and dropping clear duplicate legacy policies.
- Remaining (verified 2026-06-01, telemetry reporting improved 2026-06-03): 70 multiple-permissive-policy warnings and 64 unused-index INFO findings. The newly added FK support indexes are expected to appear as unused until production traffic or maintenance scans touch those paths. `npm run check:supabase-advisor` now includes `unused_index_review` counts so the weekly artifact separates mapped production `pg_stat_user_indexes` evidence from advisor-only warnings. Advisor gates now use `--fail-on-unknown`, so any new unclassified WARN/INFO lint is a CI failure until it is fixed or added to `scripts/supabase-advisor-debt-policy.json` with owner, reason, next action, and review cadence. Do not drop indexes or merge overlapping business policies without production query/RLS telemetry.
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

1. ~~Live security advisor warning remains for leaked password protection~~ - accepted risk with app-side password denylist mitigation; project on Free plan, HIBP requires Pro. See "Live Supabase Security Advisor Findings" above.
2. Large page component extraction is still not complete.
3. Performance advisor still reports multiple-permissive-policy warnings and unused-index INFO findings that need telemetry-backed consolidation/removal.
