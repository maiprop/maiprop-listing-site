# mAIprop Listing Site — Platform Reference

Deep dive of **maiprop/maiprop-listing-site** (full platform, cloned as `maiprop-properties`). Covers workflows, user types, participant IDs, pricing IDs, routes, and modules.

---

## 1. User Types & Roles

### Database `user_role` enum

| Role | Description | Access |
|------|-------------|--------|
| `buyer` | Buyer / consumer | Default; browse, limited features |
| `agent` | Real estate agent | Create listings, CRM, analytics |
| `professional` | Architect, lawyer, valuer, etc. | Service catalog, booking, Pro tools |
| `seller` | Private seller/landlord | Create listings, Seller Pro |
| `investor` | Investor | InvestorDashboard, Quick Sale (invitation-only) |
| `institutional` | Fund / institutional | Same as investor; can also create listings |
| `developer` | Developer | Projects, listings, Agent-like |
| `admin` | Platform admin | Full access, pricing, pipeline, invitations |

### Auth helpers (`src/lib/authUtils.ts`)

- **`isPlatformAdmin(profile)`** — `role === 'admin'`
- **`isSellSideRole(profile)`** — `agent`, `seller`, `developer`, `institutional` (create listings)
- **`isBuySideRole(profile)`** — `investor`, `institutional` (investor dashboard)

---

## 2. Participant IDs

Defined in `src/lib/participantConfig.ts`. Used for Pricing, Onboarding, Dashboard, and Signup.

| ParticipantId | Label | DB Role(s) |
|---------------|-------|------------|
| `buyer` | Buyer / Renter | `buyer`, default |
| `seller` | Seller / Landlord | `seller` |
| `investor` | Investor | `investor` |
| `agent` | Agent | `admin`, `agent` |
| `institutional` | Institutional / Fund | `institutional` |
| `developer` | Developer | `developer` |
| `professional` | Professional | `professional` |

### Derivation

- **`getParticipantTypeFromProfile(profile)`** — Uses `bio` prefix `__type:investor`, `__type:seller`, etc. if present; otherwise uses `role`
- **`getOwnerParticipantType(profile)`** — Returns `"agent"` or `"seller"` for listing display

---

## 3. Pricing Keys & IDs

> **Pricing has two layers, kept intentionally separate.** The displayed
> price numbers below are *display fallbacks*; the actual amount charged
> is whatever Stripe says for the resolved Price ID (see resolution order
> below). If the layers drift, fix `rolePlanMap.ts` first, then mirror to
> the doc, then run `npm test src/test/rolePlanMap.test.ts` to confirm
> the snapshot test passes.

### Layer A — Role-level fallback plans (`src/lib/rolePlanMap.ts`)

Used by `RoleSwitchModal`, `Pricing.tsx`, `Onboarding.tsx`,
`DashboardPlanCard`, and `BillingTab`. One plan per pricing audience.
These are display values only; checkout uses the Stripe Price ID.

| Audience | Plan key | Plan name | Monthly | Annual | Pro-only? |
|----------|----------|-----------|--------:|-------:|:---------:|
| `participant` (buyer/seller) | `pro` | Pro Plan | €29 | €290 | no |
| `agent` | `agent_basic` | Agent Pro | €149 | €1490 | no |
| `developer` | `developer_pro` | Developer Pro | €129 | €1290 | **yes** |
| `professional` | `professional_basic` | Professional Pro | €69 | €690 | no |
| `investor` | `investor_private` | Investor Plan | €490 | €4900 | **yes** |
| `institutional` | `investor_institutional` | Institutional Plan | €1490 | €14900 | **yes** |

### Layer B — Fine-grained DB-driven keys (`src/hooks/usePricingConfigs.ts`)

Used by the Pricing page tabs and AdminPricing editor. Reads from the
`pricing_configs` table at runtime, so admins can adjust prices without a
deploy. Some keys (e.g. `agent_plus`, `professional_premium`,
`valuation_*`) are sub-plans / add-ons that don't appear in Layer A.

| Key | Audience | Notes |
|-----|----------|-------|
| `pro` | user | Layer-A `participant` plan |
| `seller_pro` | user | Seller-specific tier (planned; falls back to `pro` if absent) |
| `agent_basic` | agent | Layer-A `agent` plan |
| `agent_plus` | agent | Add-on tier (Pricing page only) |
| `developer_pro` | developer | Layer-A `developer` plan |
| `professional_basic` | professional | Layer-A `professional` plan |
| `professional_premium` | professional | Add-on tier (Pricing page only) |
| `valuation_single` | user | One-off purchase (`unit: per_use`) |
| `valuation_bundle` | user | 5-pack purchase (`unit: per_use`) |
| `investor_private` | investor | Layer-A `investor` plan |
| `investor_institutional` | investor | Layer-A `institutional` plan |

### Stripe price resolution (`create-checkout`)

1. **Env override**: `STRIPE_PRICE_<UPPERCASE_KEY>` (e.g. `STRIPE_PRICE_PRO`)
2. **DB lookup**: `pricing_configs.metadata.stripe_price_id` for the plan key
3. **Fallback**: `STRIPE_PRICE_DEFAULT`

### `pricing_configs` table

- Columns: `key`, `label`, `description`, `audience`, `module`, `unit`,
  `currency`, `amount`, `is_active`, `sort_order`, `metadata` (JSONB)
- `metadata` shape: `{ stripe_price_id: "price_xxx" }`
- RLS: Only platform admin can INSERT/UPDATE/DELETE; SELECT is public

---

## 4. Routes & Route Guards

### Public routes

| Path | Page |
|------|------|
| `/` | Index |
| `/listings` | Listings |
| `/property/:id` | PropertyDetail |
| `/auction/:id` | PropertyDetail |
| `/auctions` | Auctions |
| `/firesale` | Firesale (Quick Sale™) |
| `/professionals` | Professionals |
| `/professionals/:id` | ProfessionalProfile |
| `/open-houses` | OpenHouses |
| `/open-house/:id` | OpenHouseDetail |
| `/signup` | Signup |
| `/login` | Login |
| `/reset-password` | ResetPassword |
| `/privacy-policy` | PrivacyPolicy |
| `/terms-of-service` | TermsOfService |
| `/cookie-policy` | CookiePolicy |
| `/pricing` | Pricing |
| `/ai-assistant` | AIAssistantPage |
| `/video-room/:professionalId` | BrandedVideoRoom |

### Protected routes

| Path | Guard | Page |
|------|-------|------|
| `/listings/new` | ProtectedRoute + SellerRoute | CreateListing |
| `/listings/new-building` | ProtectedRoute + SellerRoute | CreateNewBuildingListing |
| `/professionals/me` | ProtectedRoute | ProfessionalProfileMe |
| `/onboarding` | ProtectedRoute | Onboarding |
| `/dashboard` | ProtectedRoute | Dashboard |
| `/dashboard/:section` | ProtectedRoute | Dashboard |
| `/messages` | ProtectedRoute | Messages |
| `/projects` | ProtectedRoute | Projects |
| `/projects/:id` | ProtectedRoute | ProjectDetail |
| `/portfolios` | ProtectedRoute | Portfolios |

### Role-specific routes

| Path | Guard | Page |
|------|-------|------|
| `/investor-dashboard` | ProtectedRoute + **InvestorRoute** | InvestorDashboard |
| `/admin` | ProtectedRoute + **AdminRoute** | AdminDashboard |
| `/admin/pricing` | AdminRoute | Redirect to `/admin?tab=pricing` |

---

## 5. Workflows

### Signup → Onboarding

- **Signup** — Email/password, `role` selection, business info
- **Onboarding** — Required if `profile.bio` does not start with `__type:`; sets services, pricing model, rates

### Investor / Quick Sale workflow

1. User requests access via **invitation_requests** (or direct apply)
2. Admin reviews in AdminDashboard → **invitations** tab
3. Admin approves by adding user to **investor_subscriptions** (tier: `private`, `institutional`, `developer`)
4. User gains access to **InvestorDashboard** and **firesale_requests** feed
5. RLS: Only investors/institutional with `investor_subscriptions.status IN ('active','trial')` can SELECT firesale_requests

### Subscription (check-subscription)

- Uses Stripe `customers.list` by email → `subscriptions.list` (status: active)
- Returns: `{ subscribed, product_id, subscription_end }`
- Used by AuthContext and feature gates (Pro, valuation unlock, etc.)

### Conversations / messages

- **conversations** table: `participant_a`, `participant_b` (user IDs)
- RLS: User can only see conversations where they are a participant

---

## 6. Modules (AdminPricing)

| Module | Audience | Examples |
|--------|----------|----------|
| `user_subscription` | user | free, pro, seller_pro |
| `professional_subscription` | professional | professional_basic, professional_premium |
| `agent_subscription` | agent | agent_basic, agent_plus |
| `investor_subscription` | investor | investor_private, investor_institutional |
| `valuation_reports` | user | valuation_single, valuation_bundle |
| `adhoc_charges` | user, professional | extra_listing, featured_listing, featured_professional |
| `firesale_dashboard` | investor | (invitation-only) |
| `pro_tools` | — | — |
| `listings` | — | — |

---

## 7. Env Vars

### Client (Vite)

| Var | Required | Use |
|-----|----------|-----|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon key |
| `VITE_MAPBOX_TOKEN` | ✅ (prod) | Map components |
| `VITE_GOOGLE_MAPS_API_KEY` | — | Places autocomplete |
| `VITE_GOOGLE_STREETVIEW_KEY` | — | Street View (optional) |

### Edge functions

| Var | Use |
|-----|-----|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for admin ops |
| `STRIPE_SECRET_KEY` | Checkout, portal, check-subscription |
| `STRIPE_PRICE_<KEY>` | Per-plan override |
| `STRIPE_PRICE_DEFAULT` | Fallback if no DB/plan override |
| `MAIPROP_OS_*` | OS integration (sync, webhook) |
| `LOVABLE_API_KEY` | Lovable integration |
| `GOOGLE_MAPS_API_KEY` | Street View proxy |

---

## 8. Navbar Modules

Main nav links:

- Buy → `/listings?listing_type=sale`
- Rent → `/listings?listing_type=rent`
- Auctions → `/auctions` (badge: Live)
- Quick Sale™ → `/firesale`
- Open Houses → `/open-houses`
- Professionals → `/professionals`

---

## 9. Investor subscription tiers

`investor_subscriptions.tier`:

- `private` — Individual investor
- `institutional` — Fund / institutional
- `developer` — Developer (custom; no fixed price)

---

*Generated from maiprop-properties codebase (clone of maiprop/maiprop-listing-site before force-push).*
