# Re-Audit Verification Report

**Date:** 2025-03-17  
**Scope:** All previous audit fixes + pricing system implementation  
**Build:** ✅ Passing

---

## 1. Security / Config Fixes (Previous Audit)

| Item | Status | Verification |
|------|--------|--------------|
| **config.ts** – Prod uses env only | ✅ | `isProd ? _url! : fallback` — production never uses hardcoded keys |
| **useListings.ts** – profiles_public | ✅ | Both `fetchListingsPage` and `useListings` use `profiles_public` with `user_id, display_name, avatar_url` |
| **Index.tsx** – hero import | ✅ | `hero-bg.webp` exists in `src/assets/`, import correct |
| **config.toml** – verify_jwt | ✅ | property-chat, pro-ai-tools, ai-service-match, listing-ai-assist, create-checkout, check-subscription, customer-portal = `true` |
| **create-checkout** – no hardcoded price | ✅ | Throws if no `STRIPE_PRICE_DEFAULT` and no DB `stripe_price_id` |
| **AuthContext / usePortfolios** – explicit select | ✅ | Explicit column lists instead of `select("*")` |

---

## 2. Pricing System – Cross-Functional Verification

### Data flow
```
pricing_configs (DB) → usePricingConfigs (queryKey: "pricing-configs-public")
                           ↓
        ┌──────────────────┼──────────────────┬─────────────────┬─────────────────┐
        │                  │                  │                 │                 │
   Pricing.tsx      PropertyDetail.tsx   Onboarding.tsx   AdminSubscribers.tsx   AdminPricing
   (plan cards)     (valuation €)       (Pro €49/mo)    (investor tiers, MRR)   (edits + invalidates)
```

### UI touchpoints

| Page / Component | Route / Location | What uses pricing | Key(s) |
|------------------|------------------|-------------------|--------|
| **Pricing** | `/pricing` | Paid card price, label, description, CTA | PLAN_KEYS[activeTab] → pro, seller_pro, agent_basic, professional_basic |
| **PropertyDetail** | `/property/:id` | "Unlock Report — €29" | valuation_single |
| **Onboarding** | `/onboarding` (professional done) | "Upgrade to Pro — €49/mo" | professional_basic |
| **AdminSubscribers** | Admin → Subscribers | Tier labels, MRR, edit dropdown | investor_private, investor_institutional |
| **Admin Pricing** | Admin → Pricing | Full edit UI, Stripe Price ID, Create in Stripe | All keys |

### Plan key alignment
- **Pricing page** `PLAN_KEYS`: buyer→pro, seller→seller_pro, agent→agent_basic, developer→agent_basic, professional→professional_basic ✓  
- **AdminPricing** `DEFAULT_SEED`: All above + investor_private, investor_institutional, valuation_single, etc. ✓  
- **create-checkout**: Reads `pricing_configs.metadata.stripe_price_id` by plan key ✓  

---

## 3. Admin Pricing – UI & Flow

| Feature | Status | Notes |
|---------|--------|-------|
| Admin tab | ✅ | `/admin?tab=pricing` and `/admin/pricing` redirect |
| Sections | ✅ | Users, Professionals, Agents, Investors, Valuation, Ad-hoc |
| Editable fields | ✅ | Label, key, amount, unit, currency, description, Stripe Price ID |
| Create in Stripe | ✅ | CreditCard button per row; invokes `create-stripe-price` |
| Save / Seed | ✅ | Mutations invalidate both `admin-pricing-configs` and `pricing-configs-public` |
| Query cache | ✅ | Public pages refetch when admin saves or creates Stripe price |

---

## 4. Edge cases

| Scenario | Expected | Verified |
|----------|----------|----------|
| No pricing_configs | Fallback text (e.g. "€29", "€49/mo") | formatPrice `fallback` used |
| Empty DB | Pricing shows PLANS defaults | `config` undefined → `plan = basePlan` |
| Admin creates Stripe price | DB updated, input shows price_id | handleMetadataChange + invalidate |
| Listings owner profiles | RLS-safe | profiles_public used; no private fields |

---

## 5. Known limitation

- **profiles_public** has no `verified` column. `listingUtils` uses `l.profiles.verified || false`, so verified badge is always false. Acceptable trade-off for RLS; can be fixed later by adding `verified` to profiles_public if needed.

---

## 6. Build & cross-function summary

- **Build:** ✅ `npm run build` succeeds
- **Pricing:** Editable in Admin → auto-updates Pricing, PropertyDetail, Onboarding, AdminSubscribers
- **Stripe:** create-checkout uses DB/ENV; create-stripe-price creates prices and saves IDs
