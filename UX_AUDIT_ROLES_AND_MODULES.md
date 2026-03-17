# UX Audit: User Types, Modules & Permissions

**Purpose:** Align displayed permissions, pricing promises, onboarding claims, and navigation with actual backend enforcement. Prevent user confusion and trust erosion.

---

## 1. ROLE & ACCESS MATRIX (Ground Truth)

| Feature / Module | Admin | Agent | Institutional | Developer | Investor | Professional | Seller | Buyer |
|------------------|-------|-------|---------------|-----------|----------|--------------|--------|-------|
| OS Sync | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Firesale Admin Pipeline | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Investor Dashboard (deal flow) | ✅* | ❌ | subscription | subscription | subscription | ❌ | ❌ | ❌ |
| Create Listings | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Admin Dashboard /admin | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Projects & Portfolios | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Professional Leads | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Quick Sale™ submit (seller) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auction filters (Pro) | ✅ | subscription | subscription | subscription | subscription | ❌ | subscription | subscription |

*Admin can access everything but Investor Dashboard is investor-targeted; admin uses Admin Dashboard instead.

---

## 2. CORRECTIONS REQUIRED

### 2.1 Settings Page — ROLE_PERMISSIONS (Dashboard.tsx)
**Status:** Partially fixed (OS sync removed from agent)

| Role | Current | Required |
|------|---------|----------|
| Admin | ✅ Correct | Platform admin, Subscribers, Pricing, OS sync, All dashboards |
| Agent | ✅ Fixed | Unlimited listings, Lead management, Analytics (no OS sync) |
| Institutional | Deals, Listings, Portfolios, CRM, Analytics | Add note: Deal flow requires investor subscription |
| Developer | Listings, Projects, Portfolios, Analytics | Remove any implied OS sync |
| Investor | Deal flow, Saved deals, Auction alerts, ROI calculator | Clarify: Deal flow = Investor Dashboard (subscription-gated) |

### 2.2 Pricing Page — Feature Promises (Pricing.tsx)

**CRITICAL — Remove admin-only features from non-admin audiences:**

| Audience | Feature to REMOVE | Reason |
|----------|-------------------|--------|
| Agent (AGENT_PRO) | "OS Sync integration" | Admin-only; backend checks role=admin |
| Agent (AGENT_PRO) | "Firesale admin pipeline" | Admin-only; AdminRoute protects /admin |
| Institutional (INSTITUTIONAL_PRO) | "Admin pipeline (Firesale & OS sync)" | Admin-only; institutional ≠ admin |
| Developer (DEVELOPER_PRO) | "OS Sync integration" | Admin-only |

**Agent paidDesc (line 285):** Change "Unlimited listings, CRM, **OS sync** & analytics" → "Unlimited listings, CRM & analytics" (remove OS sync)

### 2.3 Onboarding — Role Selection (Onboarding.tsx)

**Agent role features (lines 109–116):** Remove:
- "OS sync integration"
- "Firesale admin pipeline"

**Developer role features (lines 154–156):** Remove:
- "OS sync integration"

**Institutional features:** Ensure "Firesale admin pipeline" is NOT listed (it's admin-only). "Firesale off-market deals" = viewing deal feed (investor subscription), which is correct.

### 2.4 participantConfig — Admin vs Agent
**Current:** `getParticipantTypeFromProfile` returns `"agent"` when `profile.role === "admin"`.
**Impact:** Admin user gets agent nav in some code paths. Verify NAV_BY_TYPE uses role === "admin" ? "admin" : … so admin gets admin nav. **Status: Correct** (getNavItemsForBioType uses role for admin).

### 2.5 Investor Dashboard — Agent Redirect
**Current:** Agents see "This dashboard is for investors. As an agent, use the main Dashboard."
**Status:** ✅ Correct. Consider adding Admin Dashboard link for admins who land here (they have access to admin pipeline at /admin).

### 2.6 MODULES Table (Pricing.tsx) — Missing Admin
**Gap:** `MODULES` has no `admin` key. If Pricing shows modules by audience, admin audience is not in AUDIENCE_TABS. Admins don't go through Pricing flow. **Low priority** — add admin to MODULES for completeness if ever displayed.

### 2.7 Navbar — Role Label
**Current:** `isPlatformAdmin(profile) ? "Admin"` correctly overrides. ✅ Correct.

### 2.8 Dashboard NAV_BY_TYPE — Admin
**Current:** admin gets overview, admin-dashboard, listings, analytics, saved, saved-searches, messages, viewings, open-houses, auctions, contacts, profile, settings.
**Status:** ✅ Correct. Admin Dashboard is the only entry point for OS sync and Firesale pipeline.

### 2.9 ROLE_PERMISSIONS — Missing institutional___fund?
**toRoleKey:** "Institutional / Fund" → "institutional___fund" (slash + space). But roleLabel for institutional is "Institutional" (no " / Fund"). So toRoleKey("Institutional") = "institutional". ✅ Match.

### 2.10 Buyer/Seller Free vs Pro — Auction Filters
**Pricing BUYER_PRO:** Lists "Ownership Status Filters", "Auction Round Filters", "Expected Yield Filters" as paid. Backend (Auctions.tsx) gates these for `isPro` or `isMaiPropOsUser`. **Status:** Aligns with user subscription, not role. ✅ Correct.

---

## 3. SUMMARY OF EDITS

| File | Change |
|------|--------|
| `src/pages/Pricing.tsx` | Remove "OS Sync integration" and "Firesale admin pipeline" from AGENT_PRO. Remove "Admin pipeline (Firesale & OS sync)" from INSTITUTIONAL_PRO. Remove "OS Sync integration" from DEVELOPER_PRO. Update agent paidDesc: remove "OS sync". |
| `src/pages/Onboarding.tsx` | Remove "OS sync integration" and "Firesale admin pipeline" from agent role features. Remove "OS sync integration" from developer role features. |

---

## 4. WIRING DIAGRAM (Reference)

```
ROLES (DB: profiles.role)
├── admin          → isPlatformAdmin(), AdminRoute, /admin
├── agent          → sell-side, listings, contacts, analytics
├── institutional  → sell-side + investor dashboard (subscription)
├── developer      → sell-side, projects, portfolios
├── investor       → investor dashboard (subscription)
├── professional   → services, leads, booking
├── seller_landlord→ listings, viewings
└── individual     → buyer/renter

ADMIN-ONLY (role='admin')
├── /admin (AdminDashboard)
├── OS Sync (edge functions check role=admin)
├── Firesale pipeline (AdminFiresalePipeline)
├── Subscribers, Pricing (AdminDashboard tabs)
└── grant_platform_admin
```

---

## 5. VERIFICATION CHECKLIST

- [ ] Settings "Your Permissions" shows no admin-only items for non-admin roles
- [ ] Pricing page does not promise OS sync or Firesale admin to agents, institutional, developers
- [ ] Onboarding does not list OS sync or Firesale admin for agent or developer
- [ ] Agent paidDesc in Pricing omits OS sync
- [ ] Navbar role label: Admin shows "Admin", Agent shows "Agent"
