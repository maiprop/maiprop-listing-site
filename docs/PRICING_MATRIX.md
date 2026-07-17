# maiProp Pricing Matrix
## Database-Configured Pricing & User Role Combinations

**Verified:** July 16, 2026
**Source of truth:** active `pricing_configs`, audience-scoped entitlement functions,
`ai_usage_limits`, `usePlanLimits.ts`, and the Billing/Pricing UI contracts

---

## Executive Summary

| User Role | Base Plan | Monthly | Annual | Free Tier |
|-----------|-----------|---------|--------|-----------|
| **Buyer / Seller** (Participant) | Pro | EUR 29 | EUR 290 | Yes |
| **Agent** | Agent Pro | EUR 149 | EUR 1,490 | Yes (5 listings) |
| **Developer** | Developer Pro | EUR 129 | EUR 1,290 | No |
| **Professional** | Professional Pro | EUR 69 | EUR 690 | Yes |
| **Investor** (Private) | Investor Plan | - | Custom annual link | Invitation-only |
| **Institutional** | Institutional Plan | - | Custom annual link | Invitation-only |

> **Investor & Institutional** tiers are invitation-only and are sold through
> admin-created Checkout links with a custom annual amount per approved request.
> After an approved applicant pays, the Stripe webhook activates access in
> Supabase for one year.
>
> **Agents & Professionals** have only **Free + Pro** plans. Anything beyond Pro
> (extra seats, branded profile, white-label, API access, referral network) is
> sold as an **add-on** from the dashboard's Billing tab - there is no Agency
> tier and no Professional Premium tier.

---

## 1. PARTICIPANTS (Buyer / Seller)

### Subscription Plans
| Plan Key | Label | Module | Price | Unit | Features |
|----------|-------|--------|-------|------|----------|
| `participant_free` | Free | user_subscription | EUR 0 | monthly | 5 calls/month per core AI feature; buyers and sellers: 1 requested viewing/month; sellers: 2 listings and unlimited hosted viewings |
| `pro` | Participant Pro | user_subscription | EUR 29 | monthly | 50 calls/month per core AI feature; buyers and sellers: 10 requested viewings/month; sellers: 5 listings, unlimited hosted viewings, and 1 Seller Spotlight/month; 3 property reports |

### Add-ons (Ad-hoc Charges)
| Key | Label | Price | Unit | Description |
|-----|-------|-------|------|-------------|
| `extra_listing` | Extra Listing Slot | EUR 12 | per_listing | Additional listing beyond quota |
| `featured_listing` | Spotlight Listing | EUR 39 | per_listing | Badge and featured-section exposure (30 days) |
| `priority_placement` | Priority Rank | EUR 59 | per_listing | Higher position above non-priority results (30 days) |
| `featured_priority_bundle` | Maximum Exposure | EUR 79 | per_listing | Spotlight Listing + Priority Rank |

### AI Reports (Valuation Reports)
| Key | Label | Price | Unit | Savings |
|-----|-------|-------|------|---------|
| `valuation_single` | AI Valuation (single) | EUR 39 | per_report | - |
| `valuation_bundle` | AI Valuation (x5) | EUR 149 | bundle | Save 24% |
| `property_report_single` | Property Report | EUR 49 | per_report | - |
| `neighbourhood_report_single` | Neighbourhood Report | EUR 19 | per_report | - |
| `neighbourhood_report_bundle` | Neighbourhood Bundle (x3) | EUR 39 | bundle | Save 31% |

---

## 2. AGENTS

### Subscription Plans
| Plan Key | Label | Module | Price | Seats | Features |
|----------|-------|--------|-------|-------|----------|
| `agent_free` | Agent Free | agent_subscription | EUR 0 | 1 | 5 listings, 3 hosted listing viewings/mo, basic profile |
| `agent_basic` | Agent Pro | agent_subscription | EUR 149 | 1 | Unlimited listings, CRM, 10 priority ads, 10 hosted listing viewings/month, 50 calls/month per core AI feature, unlimited property reports |

> Legacy `agency_starter` / `agency_growth` / `agency_enterprise` tiers are deprecated
> (`is_active: false` in `pricing_configs`). They are kept for historical reference
> only and are not displayed anywhere. Agency-style functionality is now sold as
> add-ons (see below).

### Agent Add-ons
| Key | Label | Price | Unit |
|-----|-------|-------|------|
| `agent_extra_seat` | Extra agent seat | EUR 39 | monthly |
| `agency_branded_profile` | Agency-branded profile | EUR 49 | monthly |
| `agency_dedicated_manager` | Dedicated account manager | EUR 199 | monthly |
| `agency_white_label` | White-label domain | EUR 149 | monthly |
| `extra_listing` / `featured_listing` / `priority_placement` / `featured_priority_bundle` | Listing promotions | EUR 12-EUR 79 | varies |

---

## 3. DEVELOPERS

### Subscription Plans
| Plan Key | Label | Module | Price | Listing Limit |
|----------|-------|--------|-------|---------------|
| `developer_pro` | Developer Pro | developer_subscription | EUR 129 | Unlimited |

**Features:**
- Unlimited project listings
- New Build showcase pages
- Pre-sale & off-plan management
- Construction timeline & floor plans
- 1 Spotlight + 1 Priority Rank promotion per month
- AI listing & description tools
- Project analytics dashboard
- 50 calls/month per core AI feature
- Unlimited property reports
- Lead capture & CRM

**Note:** No free tier (Pro-only)

---

## 4. PROFESSIONALS (Architects, Lawyers, Valuers)

### Subscription Plans
| Plan Key | Label | Module | Price | Features |
|----------|-------|--------|-------|----------|
| Free (implied) | Directory Only | - | EUR 0 | Basic listing, enquiries |
| `professional_basic` | Professional Pro | professional_subscription | EUR 69 | Priority leads, calendar, verified badge, 50 calls/month per core AI feature, unlimited property reports |

> Legacy `professional_premium` tier is deprecated (`is_active: false`). API access,
> referral network and additional client seats are now sold as add-ons.

### Professional Add-ons
| Key | Label | Price | Unit |
|-----|-------|-------|------|
| `featured_professional` | Spotlight Professional | EUR 59 | monthly |
| `professional_api_access` | Professional API access | EUR 59 | monthly |
| `professional_referral_network` | Referral network slot | EUR 39 | monthly |
| `professional_extra_seat` | Extra client seat | EUR 19 | monthly |
| `professional_branded_email` | Branded email templates | EUR 15 | monthly |

---

## 5. INVESTORS & INSTITUTIONAL

### Subscription Plans (invitation-only)
| Plan Key | Label | Module | Price | Features |
|----------|-------|--------|-------|----------|
| `investor_private` | Private Investor | investor_subscription | Custom annual link | Deal-flow, AI matching, 50 calls/month per core AI feature, unlimited property reports |
| `investor_institutional` | Institutional Investor | investor_subscription | Custom annual link | Full pipeline, bulk view, dedicated manager |

Institutional access includes support for listings-data integration. The AVM
API remains a separately priced maiProp OS data product and is not bundled into
the Institutional platform plan.

**Flow:**
1. Applicant submits the **Investor / Institutional Application** form.
2. The maiProp team reviews KYC + portfolio fit.
3. On approval, an automated email is sent containing an admin-created Stripe
   Checkout URL for the approved custom annual investor access amount.
4. After the payment is captured, the Stripe webhook activates the
   `investor_subscriptions` row, grants access to the Investor / Firesale tabs,
   and sets expiry one year after activation.

`pricing_configs` rows for these tiers are informational; the
`create-investor-payment` Edge Function enforces the admin-provided custom
amount, EUR currency, annual billing cycle, and one-year access period
server-side.

---

## 6. B2B DATA PRODUCTS (maiProp OS)

Cross-cutting products available to all B2B users:

| Key | Label | Module | Price | Target |
|-----|-------|--------|-------|--------|
| `market_intelligence` | Market Intelligence | os_data_products | EUR 199/mo | All B2B |
| `avm_api` | AVM API | os_data_products | EUR 299/mo | Lenders, valuers |
| `auction_intelligence` | Auction Intelligence | os_data_products | EUR 149/mo | Legal pros, agents |

**Discount:** 20% off any maiProp subscription for active OS subscribers.

---

## Feature Availability Matrix

### Core Platform Features
| Feature | Free | Pro | Agent | Developer | Professional | Investor |
|---------|------|-----|-------|-----------|--------------|----------|
| Browse listings | Yes | Yes | Yes | Yes | Yes | Yes |
| Create listings | 2 | 5 | Unlimited | Unlimited | - | - |
| Direct messaging | Yes | Yes | Yes | Yes | Yes | Yes |
| Saved searches | 1 | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| AI Valuation | 5/mo | 50/mo | 50/mo | Pro required (50/mo) | 50/mo | Paid access required (50/mo) |
| Neighbourhood Reports | 5/mo | 50/mo | 50/mo | Pro required (50/mo) | 50/mo | Paid access required (50/mo) |
| Printable property reports | Add-on | 3/mo + add-ons | Unlimited | Unlimited | Unlimited | Unlimited |
| Priority matching | - | Yes | Yes | Yes | Yes | Yes |
| CRM access | - | - | Yes | Yes | Yes | Yes |

### Addon Features
| Feature | Price | Status |
|---------|-------|--------|
| Extra listing slot | EUR 12 | Implemented |
| Spotlight Listing | EUR 39 | Implemented |
| Priority Rank | EUR 59 | Implemented |
| Maximum Exposure bundle | EUR 79 | Implemented |
| Spotlight Professional | EUR 59 | Implemented |
| Extra Priority Rank Ad | EUR 8 | Implemented |

---

## User Scenarios & Monthly Costs

| Scenario | Base | Add-ons | Reports | OS | **Total** |
|----------|------|---------|---------|-----|-----------|
| Casual Buyer (Free) | EUR 0 | - | 1x valuation (EUR 39) | - | **EUR 0-39** |
| Active Seller (Pro) | EUR 29 | 1 Seller Spotlight included; 2x extra listings (EUR 24) | Bundle (EUR 149) | - | **EUR 53 + reports** |
| Solo Agent | EUR 149 | 10 Priority included | - | - | **EUR 149** |
| Small Agency (3 seats) | EUR 149 + 2 seats (EUR 78) | 10 Priority included | - | Optional MI (EUR 199) | **EUR 227** without MI / **EUR 426** with MI |
| Developer | EUR 129 | 1 Spotlight + 1 Priority included; extras from EUR 39 / EUR 59 | - | - | **EUR 129 before extras** |
| Professional | EUR 69 | Spotlight (EUR 59) | - | - | **EUR 128** |
| Private Investor | Custom annual link | - | Included | - | **Custom annual link** |
| Institutional | Custom annual link | - | Included | AVM (EUR 299) | **Custom annual link + OS** |
| Full B2B Enterprise | EUR 749 | Unlimited | Included | All (EUR 647) | **EUR 1,396** |

---

## Recent Fixes

1. **Pricing Discrepancies Resolved:**
   - Investor and Institutional pricing is invite-only with a custom annual amount via admin-created Checkout.
   - Public subscription rows align with Stripe monthly and annual Price IDs.
   - Pricing page now uses database values dynamically.
   - rolePlanMap.ts keeps display fallback values only.

2. **Database Synchronization:**
   - Frontend now reads from `pricing_configs` table
   - Hardcoded values only used as fallback when DB unavailable
   - All tests passing (1,091 tests)

---

## Technical Implementation Notes

### Database Schema
- **Table:** `pricing_configs`
- **Columns:** key, label, description, audience, module, unit, currency, amount, is_active, sort_order, metadata

### Frontend Hooks
- `usePricingConfigs()` - Fetches from `pricing_configs` table
- `useSubscription()` - Determines Pro status
- `ROLE_PLAN_MAP` - Hardcoded fallback (source of discrepancy)

### Stripe Integration
- Price IDs are resolved from DB metadata first: `pricing_configs.metadata`
- Environment variables such as `STRIPE_PRICE_<KEY>` are fallback-only
- Checkout via `create-checkout` edge function

---

*Document Version: 1.1*
*Last Updated: July 16, 2026 (entitlement contract verification)*
