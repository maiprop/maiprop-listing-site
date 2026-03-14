# maiProp — Senior UX Audit Report

**Audit Date:** March 12, 2025  
**Scope:** All user workflows, access control, and edge cases across the application.

---

## Executive Summary

This audit identifies **functional bugs**, **UX limits**, **loopholes**, and **edge cases** across auth, onboarding, listings, viewings, subscriptions, and admin flows. Several items are **critical** (runtime errors or data loss); others are **high** or **medium** priority.

---

## 1. Auth & Onboarding Workflows

### 1.1 Login Flow

| Issue | Severity | Description |
|-------|----------|-------------|
| **Redirect before onboarding check** | Medium | After sign-in, Login redirects to `from` or `/dashboard` immediately. If the user `needsOnboarding`, they briefly land on Dashboard before `ProtectedRoute` bounces them to `/onboarding`. Causes a quick flash of the wrong page. |
| **`needsOnboarding` unused** | Low | `Login.tsx` destructures `needsOnboarding` but never uses it. Could redirect directly to `/onboarding` when `needsOnboarding` is true. |
| **Google OAuth redirect** | Low | Google sign-in redirects to `window.location.origin`; user lands on home. `ProtectedRoute` on Dashboard will redirect to onboarding if needed, but the initial landing page may not match intent. |

### 1.2 Signup Flow

| Issue | Severity | Description |
|-------|----------|-------------|
| **Google signup type persistence** | High | Participant type is stored in `sessionStorage` before OAuth. If the user opens the reset link in another tab or clears storage, Onboarding may not receive the type. |
| **Email signup bio update fire-and-forget** | High | `updateProfile({ bio: __type:${selectedType} })` is called with `.catch(() => {})`. If it fails, the user reaches Onboarding without a persisted type; Onboarding may show `pick-type` again, causing confusion. |
| **Google redirect URI** | Medium | Google OAuth redirects to `/onboarding` directly. If `sessionStorage` is lost, Onboarding shows pick-type; user may re-pick, but the original choice is gone. |

### 1.3 Onboarding Flow

| Issue | Severity | Description |
|-------|----------|-------------|
| **No mid-flow persistence** | Medium | If the user navigates away or closes the tab during onboarding (especially professional setup), all entered data is lost. No draft or resume mechanism. |
| **Professional verify partial failure** | Medium | `handleProVerify` inserts into `professionals` and updates `profiles.bio`. If the first succeeds and the second fails, profile and professionals can be inconsistent. |
| **Non-pro path direct update** | Low | Non-pro selection updates `profiles` via `supabase.from("profiles").update(...)` directly, while `updateProfile` is also used. Mixed patterns may cause confusion during maintenance. |

### 1.4 Reset Password Flow

| Issue | Severity | Description |
|-------|----------|-------------|
| **Post-reset redirect** | Low | After successful reset, redirect goes to `/dashboard`. If the user needs onboarding, `ProtectedRoute` will then send them to `/onboarding`. Minor extra hop. |

---

## 2. Access Control & Loopholes

### 2.1 ProtectedRoute

| Issue | Severity | Description |
|-------|----------|-------------|
| **No subscription check** | High | `ProtectedRoute` only enforces: logged in + onboarding done. It does not check subscription for routes that require it (e.g. Investor Dashboard deal flow). Subscription gating is done in-page, not at route level. |
| **No role-based protection** | High | Any authenticated user can access `/listings/new`, `/messages`, `/projects`, `/portfolios`. No verification that the user is a seller/agent/professional for listing creation. |
| **Onboarding loop guard** | Good | Correctly avoids redirect loop when already on `/onboarding`. |

### 2.2 Create Listing

| Issue | Severity | Description |
|-------|----------|-------------|
| **No role gate** | High | `/listings/new` is wrapped in `ProtectedRoute` only. Any signed-in user (buyer, investor, etc.) can create listings. Business logic assumes sellers/agents; there is no explicit role check. |
| **RLS as sole safeguard** | Medium | If RLS allows inserts for all authenticated users, this is a data-integrity loophole. If RLS restricts to certain roles, the UI does not communicate that; users may hit silent failures. |

### 2.3 Admin Pricing

| Issue | Severity | Description |
|-------|----------|-------------|
| **Email whitelist only** | Medium | Access is controlled by `OWNER_EMAILS` whitelist, not RBAC. Anyone who can create a user with a whitelisted email could gain access. |
| **Route protection** | Good | Wrapped in `ProtectedRoute`; unauthenticated users cannot reach the page. |

### 2.4 Investor Dashboard Admin

| Issue | Severity | Description |
|-------|----------|-------------|
| **Admin role source** | Medium | Admin features use `profile?.role === "agent"`. No dedicated `is_admin` flag. Role semantics may be overloaded. |
| **Undefined `isRealEstateAgent`** | Critical | Variable is used at lines ~662 and ~1213 but never defined. Causes `ReferenceError` when an agent tries to subscribe to deal flow or when the gate UI renders. |

---

## 3. Viewing & Messaging Workflows

### 3.1 ViewingDialog — CRITICAL

| Issue | Severity | Description |
|-------|----------|-------------|
| **No persistence** | Critical | "Book a Viewing" only sets local state `confirmed = true`. No API call, no DB insert, no email. User is told "A confirmation has been sent to your email" — false. |
| **Hardcoded dates** | Medium | Days are static (e.g. Mar 10–15). No dynamic calendar; dates become stale. |
| **Optional note unused** | Low | Note textarea value is never read or sent anywhere. |

### 3.2 Messages

| Issue | Severity | Description |
|-------|----------|-------------|
| **Assumed integration** | Medium | Depends on Supabase/Messages setup. If not wired, the feature is non-functional. |

---

## 4. Subscription & Billing Workflows

### 4.1 Pricing Page — Manage Subscription

| Issue | Severity | Description |
|-------|----------|-------------|
| **Missing imports** | Critical | `handleManageSubscription` uses `supabase` and `toast` but they are not imported. Causes `ReferenceError` when the user clicks "Manage Subscription". |
| **Customer portal** | Low | Relies on `customer-portal` Edge Function. If the function or Stripe config is wrong, users get a generic error. |

### 4.2 Investor Subscription (InvestorDashboard)

| Issue | Severity | Description |
|-------|----------|-------------|
| **`isRealEstateAgent` undefined** | Critical | See §2.4. |
| **Subscription gate in-page** | Medium | Deal flow is gated by `canAccessDealFlow` (subscribed + investor type). Users can still reach the page and see the gate; no route-level redirect to pricing. |
| **Tier selection upsert** | Low | Direct upsert to `investor_subscriptions`; no payment flow (Stripe, etc.) is visible. May be intentional for MVP. |

---

## 5. Switch Participant Type (Settings)

| Issue | Severity | Description |
|-------|----------|-------------|
| **Bio cleared, role untouched** | Good | Correctly clears only `bio`; does not change `role` (RLS prevents self-escalation). |
| **Billing implications** | Medium | Copy mentions "billing & access notes" but does not explain what happens to active subscriptions (e.g. Pro, firesale) when switching. |
| **Data preservation** | Good | Copy states listings, saved properties, messages are preserved. |

---

## 6. Data Integrity & Edge Cases

### 6.1 Profile Consistency

| Issue | Severity | Description |
|-------|----------|-------------|
| **Bio vs role** | Medium | `bio` holds `__type:…`; `role` is a separate column. Some logic uses `role`, some uses `bio`. Inconsistency can cause wrong UI (e.g. agent vs investor). |
| **Profile fetch timing** | Low | Profile is fetched asynchronously after auth. Brief period where `user` exists but `profile` is null; some components may show loading or fallback. |

### 6.2 Public vs Protected Routes

| Route | Protection | Notes |
|-------|------------|-------|
| `/`, `/listings`, `/property/:id`, `/professionals`, `/pricing`, `/auctions`, `/firesale` | Public | Correct. |
| `/login`, `/signup`, `/reset-password` | Public | Correct. |
| `/dashboard`, `/messages`, `/listings/new`, `/investor-dashboard`, `/onboarding`, `/projects`, `/portfolios`, `/admin/pricing` | ProtectedRoute | Correct. |
| `/ai-assistant` | Unprotected | AI page is public; no auth required. May be intentional. |
| `/market-intelligence` | Unprotected | Public. |

---

## 7. UX Gaps & Recommendations

### Critical (Fix First) — ✅ ALL FIXED

1. ~~**Define `isRealEstateAgent`**~~ ✅ Fixed in `InvestorDashboard`.
2. ~~**Add missing imports**~~ ✅ Fixed in `Pricing.tsx`.
3. ~~**Implement viewing persistence**~~ ✅ Fixed in `ViewingDialog`: wired to `viewings` table, dynamic calendar, note persisted.

### High Priority — ✅ ALL FIXED

4. ~~**Harden Signup**~~ ✅ Await `updateProfile`, handle errors; added `localStorage` fallback for Google signup.
5. ~~**Add role check for Create Listing**~~ ✅ Restricted to sellers/agents; redirect to Settings if not eligible.
6. ~~**Improve Login redirect**~~ ✅ When `needsOnboarding`, redirect directly to `/onboarding`.

### Medium Priority — ✅ PARTIALLY FIXED

7. ~~**Onboarding resume**~~ ✅ Persist step/selected/proCategory to `localStorage`; auto-restore on return.
8. **AdminPricing** — Consider RBAC or dedicated admin flag (email whitelist retained; design decision).
9. ~~**ViewingDialog calendar**~~ ✅ Dynamic dates (next 7 days); part of viewing persistence fix.

### Low Priority — ✅ ALL FIXED

10. ~~**Remove unused `needsOnboarding`**~~ ✅ Now used for Login redirect.
11. ~~**Document billing behavior**~~ ✅ Added "Active subscriptions remain" note in Switch Participant confirm.
12. ~~**Error handling**~~ ✅ Pricing `handleManageSubscription` uses `e: unknown` and safe message extraction.

---

## 8. Workflow Summary Matrix

| Workflow | Entry | Gate | Exit | Known Limits |
|----------|-------|------|------|--------------|
| Login | Email/Google | None | Redirect to `from` or `/dashboard` | Flash if needs onboarding |
| Signup (email) | Form | None | Navigate to onboarding | Bio update may fail silently |
| Signup (Google) | OAuth | Type in sessionStorage | Redirect to onboarding | sessionStorage can be lost |
| Onboarding | ProtectedRoute | needsOnboarding | Set bio/role, navigate to dashboard | No resume; mixed update patterns |
| Create Listing | ProtectedRoute | None | Submit to listings | No role check |
| Book Viewing | Property detail | canVideoView | Local confirm only | **No persistence** |
| Manage Subscription | Pricing | User logged in | customer-portal | **Missing imports** |
| Investor Deal Flow | ProtectedRoute | canAccessDealFlow | View deals | **isRealEstateAgent undefined** |
| Switch Participant | Settings | Confirm modal | Clear bio, go to onboarding | Billing impact unclear |
| Admin Pricing | ProtectedRoute | Email whitelist | Full access | Whitelist-only model |

---

*End of UX Audit Report*
