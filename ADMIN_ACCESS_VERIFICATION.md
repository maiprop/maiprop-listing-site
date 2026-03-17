# ADMIN Access Verification Report

**Date:** 2025-03-12  
**Scope:** Verify that users with `role='admin'` have access to all admin-only modules and functions.

---

## 1. ADMIN Role Definition

- **Source of truth:** `profiles.role = 'admin'` (unified in migration 20260413120000)
- **Frontend check:** `isPlatformAdmin(profile)` in `src/lib/authUtils.ts` — returns true when `profile.role === "admin"` or `profile.is_platform_admin === true`
- **DB check:** `has_platform_admin(auth.uid())` — returns true when `role = 'admin'` in profiles

---

## 2. Frontend Routes & Access

| Route | Protection | Status |
|-------|------------|--------|
| `/admin` | `AdminRoute` → `isPlatformAdmin()` | OK |
| `/admin/pricing` | `AdminRoute` → redirects to `/admin?tab=pricing` | OK |
| `/investor-dashboard` | `InvestorRoute` → `isBuySideRole()` or `isPlatformAdmin()` | OK |

**AdminRoute** (`src/components/AdminRoute.tsx`): Uses `isPlatformAdmin(profile)`; redirects non-admins to `/dashboard`.

**InvestorRoute** (`src/components/InvestorRoute.tsx`): Buy-side roles (investor, institutional) or platform admin can access. Platform admin always has visibility.

---

## 3. Admin Dashboard Modules (at /admin)

| Tab | Component | Backend / Access |
|-----|-----------|------------------|
| Pipeline | `AdminFiresalePipeline` | `firesale_requests` RLS |
| Open Houses | `OpenHouseDashboardSection` | Uses `myListings` (owner-based) |
| Subscribers | `AdminSubscribers` | `investor_subscriptions` RLS |
| Pricing | `AdminPricingContent` | `pricing_configs` RLS |
| OS Sync | `AdminPanel` | `sync_log` RLS + edge functions |

---

## 4. Database RLS – ADMIN Access

| Table | Admin Policy | Operations |
|-------|--------------|------------|
| **profiles** | `Platform admin can view all profiles` | SELECT all |
| **investor_subscriptions** | Platform admin policies | SELECT, UPDATE, INSERT |
| **firesale_requests** | `Platform admin can view/update` | SELECT, UPDATE |
| **pricing_configs** | Platform admin only | INSERT, UPDATE, DELETE |
| **sync_log** | `Admins can view sync logs` | SELECT |

All policies use `has_platform_admin(auth.uid())`, which checks `role='admin'`.

---

## 5. Edge Functions – Admin-Only

| Function | Admin Check | Status |
|----------|-------------|--------|
| `full-sync-from-os` | `profile?.role !== "admin"` → 403 | OK |
| `poll-os-auctions` | `profile?.role !== "admin"` → 403 | OK |
| `sync-to-os` | `profile?.role !== "admin"` → 403 | OK |
| `sync-firesale-to-os` | `profile?.role !== "admin"` → 403 | OK |
| `os-diagnose` | `profile?.role !== "admin"` → 403 | OK |

All use `profiles.role === "admin"` for authorization.

---

## 6. RPC Functions – Admin-Only

| Function | Guard | Status |
|----------|-------|--------|
| `grant_platform_admin(uuid)` | `has_platform_admin(auth.uid())` inside | OK |
| `grant_platform_admin_by_email(text)` | `has_platform_admin(auth.uid())` inside | OK |

---

## 7. Triggers / Guards

| Trigger | Purpose | Status |
|---------|---------|--------|
| `profiles_guard_admin_and_role` | Only admin can set `role='admin'`, escalate to agent/professional | OK |
| `professionals_guard_subscription_tier` | Only admin can change `subscription_tier` | OK |
| `investor_subscriptions` INSERT | Only admin can insert | OK |

---

## 8. Dashboard Nav for Admin

Admin sidebar (`NAV_BY_TYPE.admin`): overview, listings, analytics, saved, saved-searches, messages, viewings, auctions, contacts, profile, settings.

Admin overview cards: Quick Sale Pipeline → `/admin?tab=pipeline`, Admin Dashboard → `/admin`.

---

## 9. Verification Summary

| Area | Status | Notes |
|------|--------|-------|
| Frontend routes | OK | AdminRoute protects /admin, /admin/pricing |
| Profiles (all users) | OK | Platform admin can SELECT all |
| Investor subscriptions | OK | Admin full CRUD |
| Firesale requests | OK | Admin SELECT, UPDATE |
| Pricing configs | OK | Admin INSERT, UPDATE, DELETE |
| Sync log | OK | Admin can SELECT |
| OS sync edge functions | OK | All 5 functions require role=admin |
| Grant admin RPCs | OK | Only admin can call |
| Role escalation | OK | Triggers block non-admin escalation |

---

## 10. Edge Functions Not Requiring Admin (By Design)

| Function | Purpose | Access |
|----------|---------|--------|
| `fetch-report-from-os` | Fetch valuation/neighbourhood report for a listing | Any authenticated user |
| `receive-from-os` | Webhook from maiProp OS | Service role (no user JWT) |
| `create-checkout`, `customer-portal` | Stripe | Authenticated users |
| `fetch-past-deals-from-os` | Past deals for premium users | Pro users with JWT |

---

## Conclusion

**ADMIN has correct access to all admin-only modules and functions.**

- Frontend: AdminRoute + isPlatformAdmin
- DB: RLS policies using has_platform_admin()
- Edge functions: role === "admin" checks
- RPCs: has_platform_admin() in function body

No gaps identified.
