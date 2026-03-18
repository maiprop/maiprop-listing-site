# QA Checklist (Release Smoke + Role/Plan Matrix)

Use this checklist before each release. It’s designed to be **repeatable** and **fast**: do the smoke pass first, then only run the full matrix when changing auth, onboarding, pricing, or role gates.

## Legend
- [ ] **TODO**: not yet verified this release
- ✅ **Pass**
- ❌ **Fail**
- **Gate**: should redirect or show upgrade CTA

## Target participant IDs
- buyer
- seller
- agent
- developer
- professional
- investor
- institutional

## Target plan states
- **Free**
- **Pro** (current app behavior largely uses a *global* `isPro` flag)

---

## A) Release smoke (10–15 minutes)

### A1. Auth + onboarding invariants
- [ ] **Logged out**: visiting a protected route (e.g. `/dashboard`) redirects to `/login` and preserves the original destination.
- [ ] **Logged in, not onboarded**: visiting any protected route redirects to `/onboarding` (no loops).
- [ ] **Logout** returns you to a sane public route (typically `/`) and clears protected UI.

### A2. Public navigation (logged out)
- [ ] `/` loads without console errors; primary CTAs (Sign in / Get started) are visible.
- [ ] `/listings` loads and cards are clickable.
- [ ] `/property/:id` renders (pick any listing).
- [ ] `/auctions` loads (and does not show removed auction extras).
- [ ] `/professionals` loads and category filters/search work.
- [ ] `/firesale` loads and shows the form (submission should be gated later).
- [ ] `/pricing` loads; tabs switch correctly.

### A3. Core logged-in navigation (any onboarded account)
- [ ] `/messages` loads; create/open a conversation works; mobile back behavior works.
- [ ] `/dashboard` loads and top-level navigation doesn’t dead-end.
- [ ] Bottom nav / fixed nav do not overlap content on mobile pages.

---

## B) Role/plan matrix (deep check)

Run this when you change: **pricing**, **role rules**, **RLS**, **gating UI**, **checkout**, or **onboarding**.

### B1. Buyer

#### Buyer — Free
- [ ] `/listings` browse works.
- [ ] `/property/:id` loads.
- [ ] **Property Valuation / Property Report** show **locked** UI with clear Upgrade CTA.
- [ ] `/professionals/:id` shows **simplified** profile + Upgrade CTA (no full profile details).

#### Buyer — Pro
- [ ] `/property/:id` valuation/report unlock and run successfully (usage tracking works).
- [ ] `/professionals/:id` shows **full profile** (tabs/services/reviews) without upgrade gating.

### B2. Seller

#### Seller — Free
- [ ] `/listings/new` allowed (cap enforcement handled server-side; verify you can create at least 1 listing).
- [ ] `/firesale` submission allowed (seller-only), and validation blocks bad inputs.

#### Seller — Pro
- [ ] Listing cap increases according to pricing (verify with 3rd–5th listing).
- [ ] Seller Pro-only features (AI listing assist / analytics / featured) are visible and consistent with pricing copy.

### B3. Agent

#### Agent — Free
- [ ] `/listings/new` allowed (verify at least 1 listing can be created).
- [ ] Auctions browse works; pro auction filters are gated (if present).
- [ ] `/professionals/:id` should be **gated** unless global Pro is enabled.

#### Agent — Pro
- [ ] **Full professional profiles are visible** (`/professionals/:id` full view; no upgrade CTA).
- [ ] CRM/contacts/analytics features claimed by pricing are discoverable (no dead CTAs).

### B4. Developer

#### Developer — Free (expected per Pricing: Pro-only)
- [ ] User is directed to `/pricing?audience=developer` and/or developer actions are gated with a clear upgrade path.

#### Developer — Pro
- [ ] Developer flows are reachable and work (projects, pre-sale management, etc.).

### B5. Professional (directory provider)

#### Professional — Free
- [ ] Appears in directory `/professionals` after onboarding.
- [ ] Basic actions work (profile renders, lead/contact actions behave as intended).

#### Professional — Pro
- [ ] Pro-specific capabilities work (priority leads, booking/calendar, “messaging suite”) and are consistent with pricing.

### B6. Investor / Institutional

> NOTE: If these are offered in Onboarding, they must be supported consistently across participant mapping + pricing + access.

#### Investor — Free / Pro
- [ ] `/investor-dashboard` access matches your intended rule (currently eligibility-based). If blocked, redirect to `/dashboard` with a clear explanation/CTA.
- [ ] Copy is consistent: invitation-only vs subscribe vs pricing destination.

#### Institutional — Free / Pro
- [ ] If institutions can create listings, `/listings/new` should be allowed and not mis-identified as buyer.

---

## C) Auction property page correctness (regressions)
- [ ] Auction property page does **not** show:
  - “Official Website”
  - “Set Auction Alert”
  - “View on eAuction.gr”
  - “Market value: …”
- [ ] Auction description does **not** include standalone scraped price lines (e.g. `– €1.300`).

---

## D) Payments + subscription UX (only if relevant this release)
- [ ] `/pricing` → “Get Pro Plan” starts checkout successfully.
- [ ] Returning from checkout updates the UI (Pro badges/features unlock without requiring a hard refresh).
- [ ] Customer portal opens successfully for subscribed users.

---

## Notes for testers
- Recommended viewports:
  - Mobile: ~390px width (iPhone baseline) and ~412px (Android baseline)
  - Desktop: 1024px and 1440px

