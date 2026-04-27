# maiProp Pricing Matrix
## Database-Configured Pricing & User Role Combinations

**Generated:** April 27, 2026  
**Source:** Database migrations + AdminPricing.tsx DEFAULT_SEED

---

## Executive Summary

| User Role | Base Plan | Monthly | Annual | Free Tier |
|-----------|-----------|---------|--------|-----------|
| **Buyer / Seller** (Participant) | Pro | €29 | €290 | ✅ Yes |
| **Agent** | Agent Pro | €149 | €1,490 | ✅ Yes (5 listings) |
| **Developer** | Developer Pro | €129 | €1,290 | ❌ No |
| **Professional** | Professional Pro | €69 | €690 | ✅ Yes |
| **Investor** (Private) | Investor Plan | €49 | €490 | ❌ No |
| **Institutional** | Institutional Plan | €199 | €1,990 | ❌ Invite-only |

---

## 1. PARTICIPANTS (Buyer / Seller)

### Subscription Plans
| Plan Key | Label | Module | Price | Unit | Features |
|----------|-------|--------|-------|------|----------|
| `participant_free` | Free | user_subscription | €0 | monthly | Basic search, 1 alert, 1 viewing/mo, 2 listings |
| `pro` | Participant Pro | user_subscription | €29 | monthly | AI insights, 5 listings, 10 viewings/mo, unlimited alerts |

### Add-ons (Ad-hoc Charges)
| Key | Label | Price | Unit | Description |
|-----|-------|-------|------|-------------|
| `extra_listing` | Extra Listing Slot | €12 | per_listing | Additional listing beyond quota |
| `featured_listing` | Featured Listing | €39 | per_listing | Homepage carousel + spotlight (30 days) |
| `priority_placement` | Priority Placement | €59 | per_listing | Pinned above non-priority results (30 days) |
| `featured_priority_bundle` | Featured + Priority Bundle | €79 | per_listing | Both boosts combined |

### AI Reports (Valuation Reports)
| Key | Label | Price | Unit | Savings |
|-----|-------|-------|------|---------|
| `valuation_single` | AI Valuation (single) | €39 | per_report | - |
| `valuation_bundle` | AI Valuation (×5) | €149 | bundle | Save 24% |
| `property_report_single` | Property Report | €49 | per_report | - |
| `neighbourhood_report_single` | Neighbourhood Report | €19 | per_report | - |
| `neighbourhood_report_bundle` | Neighbourhood Bundle (×3) | €39 | bundle | Save 31% |

---

## 2. AGENTS

### Subscription Plans
| Plan Key | Label | Module | Price | Seats | Features |
|----------|-------|--------|-------|-------|----------|
| `agent_free` | Agent Free | agent_subscription | €0 | 1 | 5 listings, 3 viewings/mo, basic profile |
| `agent_basic` | Agent Pro | agent_subscription | €149 | 1 | Unlimited listings, CRM, 10 priority ads |
| `agency_starter` | Agency Starter | agent_subscription | €249 | 3 | Shared listing pool, branded profile |
| `agency_growth` | Agency Growth | agent_subscription | €449 | 10 | Priority placement, dedicated manager |
| `agency_enterprise` | Agency Enterprise | agent_subscription | €749 | Unlimited | White-label, SLA, support |

### Agent Add-ons
| Key | Label | Price | Unit |
|-----|-------|-------|------|
| `extra_priority_ad` | Extra Priority Ad | €8 | per_ad |
| `featured_professional` | Featured Professional | €59 | monthly |

---

## 3. DEVELOPERS

### Subscription Plans
| Plan Key | Label | Module | Price | Listing Limit |
|----------|-------|--------|-------|---------------|
| `developer_pro` | Developer Pro | developer_subscription | €129 | Unlimited |

**Features:**
- Unlimited project listings
- New Build showcase pages
- Pre-sale & off-plan management
- Construction timeline & floor plans
- Priority in New Builds section
- AI listing & description tools
- Project analytics dashboard
- AI Neighbourhood Reports (3/mo included)
- Lead capture & CRM

**Note:** No free tier (Pro-only)

---

## 4. PROFESSIONALS (Architects, Lawyers, Valuers)

### Subscription Plans
| Plan Key | Label | Module | Price | Features |
|----------|-------|--------|-------|----------|
| Free (implied) | Directory Only | - | €0 | Basic listing, enquiries |
| `professional_basic` | Professional Pro | professional_subscription | €69 | Priority leads, calendar, verified badge, 3 AI tools/mo |
| `professional_premium` | Professional Premium | professional_subscription | €129 | API access, referral network, full tools |

### Professional Add-ons
| Key | Label | Price | Unit |
|-----|-------|-------|------|
| `featured_professional` | Featured Professional | €59 | monthly |
| `extra_priority_ad` | Extra Priority Ad | €8 | per_ad |

---

## 5. INVESTORS

### Subscription Plans
| Plan Key | Label | Module | Price | Features |
|----------|-------|--------|-------|----------|
| `investor_private` | Private Investor | investor_subscription | €49/mo | Deal-flow, AI matching, 5 reports/mo |
| `investor_institutional` | Institutional Investor | investor_subscription | €199/mo | Full pipeline, bulk view, dedicated manager |

**Note:** Invite-only access. KYC verification required. Annual billing offers 2 months free (€490/year for Investor, €1,990/year for Institutional).

---

## 6. B2B DATA PRODUCTS (maiProp OS)

Cross-cutting products available to all B2B users:

| Key | Label | Module | Price | Target |
|-----|-------|--------|-------|--------|
| `market_intelligence` | Market Intelligence | os_data_products | €199/mo | All B2B |
| `avm_api` | AVM API | os_data_products | €299/mo | Lenders, valuers |
| `auction_intelligence` | Auction Intelligence | os_data_products | €149/mo | Legal pros, agents |

**Discount:** 20% off any maiProp subscription for active OS subscribers.

---

## Feature Availability Matrix

### Core Platform Features
| Feature | Free | Pro | Agent | Developer | Professional | Investor |
|---------|------|-----|-------|-----------|--------------|----------|
| Browse listings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create listings | 2 | 5 | Unlimited | Unlimited | - | - |
| Direct messaging | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Saved searches | 1 | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |
| AI Valuation | - | 5/mo | 5/mo | 3/mo | 3/mo | 5/mo |
| Neighbourhood Reports | - | 3/mo | Included | 3/mo | 3/mo | Included |
| Priority matching | - | ✅ | ✅ | ✅ | ✅ | ✅ |
| CRM access | - | - | ✅ | ✅ | ✅ | ✅ |

### Addon Features
| Feature | Price | Status |
|---------|-------|--------|
| Extra listing slot | €12 | 🔧 Implemented |
| Featured listing | €39 | 🔧 Implemented |
| Priority placement | €59 | 🔧 Implemented |
| Featured + Priority bundle | €79 | 🔧 Implemented |
| Featured professional | €59 | 🔧 Implemented |
| Extra priority ad | €8 | 🔧 Implemented |

---

## User Scenarios & Monthly Costs

| Scenario | Base | Add-ons | Reports | OS | **Total** |
|----------|------|---------|---------|-----|-----------|
| Casual Buyer (Free) | €0 | - | 1× valuation (€39) | - | **€0-39** |
| Active Seller (Pro) | €29 | 2× extra (€24) | Bundle (€149) | - | **€53 + reports** |
| Solo Agent | €149 | 5× priority (€40) | - | - | **€189** |
| Small Agency (3 seats) | €249 | 10× priority (€80) | - | MI (€199) | **€528** |
| Developer | €129 | Featured (€39×N) | - | - | **€129+** |
| Professional | €69 | Featured (€59) | - | - | **€128** |
| Private Investor | €49 | - | Included | - | **€49** |
| Institutional | €199 | - | Included | AVM (€299) | **€498** |
| Full B2B Enterprise | €749 | Unlimited | Included | All (€647) | **€1,396** |

---

## Recent Fixes ✅

1. **Pricing Discrepancies Resolved:**
   - ✅ Investor Plan: Fixed €490 → €49/month (annual €490)
   - ✅ Institutional Plan: Fixed €1,490 → €199/month (annual €1,990)
   - ✅ Pricing page now uses database values dynamically
   - ✅ rolePlanMap.ts updated with correct fallback values

2. **Database Synchronization:**
   - ✅ Frontend now reads from `pricing_configs` table
   - ✅ Hardcoded values only used as fallback when DB unavailable
   - ✅ All tests passing (1,091 tests)

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
- Price IDs stored in environment variables: `STRIPE_PRICE_<KEY>`
- Fallback to DB: `pricing_configs.metadata.stripe_price_id`
- Checkout via `create-checkout` edge function

---

*Document Version: 1.1*
*Last Updated: April 27, 2026 (post-fix)*
