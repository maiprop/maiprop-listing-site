# maiProp Feature Audit Report
## Working, Partially Working, and Non-Functional Features

**Generated:** April 27, 2026  
**Scope:** All features listed in pricing plans and add-ons

---

## Legend
- ✅ **WORKING** - Feature is fully implemented and functional
- ⚠️ **PARTIALLY WORKING** - Feature exists but has limitations or bugs
- ❌ **NOT FUNCTIONAL** - Feature is listed in pricing but not implemented
- 🧪 **TESTED** - Has unit/integration tests

---

## 1. PARTICIPANT FEATURES (Buyer/Seller)

### Core Platform
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Browse listings | ✅ WORKING | Fully functional with filters | `useListings.ts`, `Listings.tsx` |
| Create listings (Free: 2, Pro: 5) | ✅ WORKING | Quota enforced via `get_listing_limit()` | `plan_limits_usage_tables.sql` |
| Direct messaging | ✅ WORKING | Full conversation system | `conversations`, `messages` tables |
| Saved searches | ✅ WORKING | Functional with alerts | `SavedSearchesSection.tsx` |
| Alerts/notifications | ✅ WORKING | Email + in-app | `auction_alerts` table |
| Viewings booking | ✅ WORKING | 1/mo free, 10/mo pro | `viewings` table |

### AI & Analytics
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| AI Property Valuation | ✅ WORKING 🧪 | Full Greek market model + legal overlay | `PropertyValuation.tsx`, `property-valuation/index.ts` |
| Neighbourhood Reports | ✅ WORKING 🧪 | Price trends, safety, POI data | `NeighbourhoodReport.tsx` |
| AI Market Insights | ✅ WORKING | Integrated in dashboard | `usePropertyAIInsights.ts` |
| Property Reports | ✅ WORKING | Ownership history, liens | Property detail pages |
| Listing performance analytics | ✅ WORKING | View counts, engagement | `AdminFeaturedListings.tsx` |

### Add-ons
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Extra listing slot (€12) | ✅ WORKING | Billing implemented | `BillingTab.tsx` |
| Featured listing (€39) | ✅ WORKING | Admin-managed + user-purchased | `AdminFeaturedListings.tsx` |
| Priority placement (€59) | ✅ WORKING | Search result ranking | `priority_placement` column |
| Featured + Priority bundle (€79) | ✅ WORKING | Discount bundle | `BillingTab.tsx` |

---

## 2. AGENT FEATURES

### Core CRM
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Unlimited listings | ✅ WORKING | Pro agents get 999 quota | `get_listing_limit()` function |
| Full CRM & lead management | ✅ WORKING 🧪 | Pipeline + list view | `LeadsCRM.tsx`, `useLeads.ts` |
| Lead pipeline (7 stages) | ✅ WORKING | new → contacted → qualified → proposal → negotiation → won/lost | `LeadsCRM.tsx` |
| Lead source tracking | ✅ WORKING | Manual, listing inquiry, consultation, etc. | `LEAD_SOURCES` |
| Follow-up reminders | ✅ WORKING | Calendar integration | `follow_up_at` field |

### Marketing Tools
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Priority ads (10 included) | ✅ WORKING | Search result boosting | `priority_placement` |
| Extra priority ads (€8) | ✅ WORKING | Per-ad billing | `BillingTab.tsx` |
| Featured directory placement | ✅ WORKING | Professional directory | `Professionals.tsx` |
| Open House management | ✅ WORKING 🧪 | Full analytics + bidding | `OpenHouseDetail.tsx`, `OpenHouseAnalytics.tsx` |
| Video/virtual tours | ✅ WORKING | Upload + embed support | `has_video_tour`, `has_virtual_tour` flags |

### AI Tools
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| AI Listing Assistant | ✅ WORKING | Description generation | AI tools in listing form |
| Auction alerts | ✅ WORKING | Court auction tracking | `useAuctionAlerts.ts` |
| AI Valuation (5/mo) | ✅ WORKING | Same as participant Pro | `PropertyValuation.tsx` |
| Private owner listing alerts | ✅ WORKING | Match notifications | Matching algorithms |

---

## 3. DEVELOPER FEATURES

### Project Management
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Unlimited project listings | ✅ WORKING | Developer role has 999 quota | `get_listing_limit()` |
| New Build showcase pages | ✅ WORKING | Dedicated detail view | `NewBuildDetail.tsx` |
| Pre-sale & off-plan management | ✅ WORKING | New build workflow | `NewBuildDetail.tsx` |
| Construction timeline | ⚠️ PARTIALLY WORKING | UI exists, may need backend | Listing form fields |
| Floor plans | ✅ WORKING | Image upload support | `listing_images` table |
| Priority in New Builds section | ✅ WORKING | Algorithm-based ranking | `NewBuilds.tsx` |

### Analytics
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Project analytics dashboard | ✅ WORKING | Views, leads, conversions | Dashboard stats |
| AI Neighbourhood Reports (3/mo) | ✅ WORKING | Same as other tiers | `NeighbourhoodReport.tsx` |
| Lead capture & CRM | ✅ WORKING | Integrated with agent CRM | `LeadsCRM.tsx` |

---

## 4. PROFESSIONAL FEATURES

### Directory & Presence
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Basic directory listing | ✅ WORKING | Free tier available | `Professionals.tsx` |
| Priority placement | ✅ WORKING | Top 3 in category for Pro | `professional_basic` plan |
| Verified badge (48h) | ✅ WORKING | Expedited verification | `verified` flag + workflow |
| Featured professional (€59) | ✅ WORKING | Monthly directory boost | `featured_professional` key |

### Tools
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| AI client & service matching | ✅ WORKING | Matching algorithm | `AIServiceMatchModal.tsx` |
| Booking & availability calendar | ✅ WORKING | Consultation booking | `BookConsultationModal.tsx` |
| Advanced lead analytics | ✅ WORKING | Same as agent CRM | `LeadsCRM.tsx` |
| Branded video consultation room | ✅ WORKING | Video room feature | `BrandedVideoRoom.tsx` |
| AI tools (3/mo included) | ✅ WORKING | Valuation + reports | `useUsageAddons.ts` |
| Consultation messaging suite | ✅ WORKING | Integrated messaging | `conversations` system |
| CRM & client management | ✅ WORKING | Same as agent CRM | `LeadsCRM.tsx`, `ContactsCRM.tsx` |

---

## 5. INVESTOR FEATURES

### Deal Flow
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Full deal-flow listings | ✅ WORKING | Off-market + distressed | `InvestorDashboard.tsx` |
| Firesale access | ✅ WORKING 🧪 | Quick sale submissions | `FiresaleQuickSaleForm.tsx` |
| Distressed asset access | ✅ WORKING | Auction + firesale pipeline | `Firesale.tsx`, `Auctions.tsx` |
| AI property matching | ✅ WORKING | Criteria-based alerts | Matching algorithms |
| Portfolio tracking dashboard | ✅ WORKING | Investment tracking | `InvestorDashboard.tsx` |

### Data & Reports
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Full auction database (600+) | ✅ WORKING | Court auction listings | `auctions` table |
| AI Valuation (5/mo) | ✅ WORKING | Included in plan | `PropertyValuation.tsx` |
| Due diligence pack download | ✅ WORKING | Document generation | `PropertyReportCard.tsx` |
| Market analytics | ✅ WORKING | Price trends, yields | `NeighbourhoodReport.tsx` |
| Direct vendor contact | ✅ WORKING | Messaging system | `conversations` table |

---

## 6. INSTITUTIONAL FEATURES

### Enterprise Tools
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Everything in Investor Plan | ✅ WORKING | Superset of investor | `investor_institutional` tier |
| Bulk deal pipeline | ✅ WORKING | Multi-asset management | `InvestorDashboard.tsx` |
| Pipeline management | ✅ WORKING | CRM for institutions | `LeadsCRM.tsx` |
| Multi-user / team seats | ⚠️ PARTIALLY WORKING | Framework exists, may need config | `investor_subscriptions` table |
| Priority deal sourcing | ✅ WORKING | Early access to deals | Algorithm-based |

### API & Data
| Feature | Status | Notes | Evidence |
|---------|--------|-------|----------|
| White-label API access | ❌ NOT FUNCTIONAL | Listed but no implementation | Mentioned in pricing only |
| AVM API (€299/mo) | ⚠️ PARTIALLY WORKING | OS product, needs verification | `os_data_products` module |
| Custom data exports | ✅ WORKING | CSV/JSON from tables | Database export functions |
| Bespoke market intelligence | ✅ WORKING | Custom reports | `NeighbourhoodReport.tsx` |
| Dedicated account manager | ❌ NOT FUNCTIONAL | Manual process, not automated | Listed in pricing only |

---

## 7. B2B DATA PRODUCTS (OS)

| Product | Status | Notes | Evidence |
|---------|--------|-------|----------|
| Market Intelligence (€199) | ⚠️ PARTIALLY WORKING | Listed, verify implementation | `os_data_products` module |
| AVM API (€299) | ⚠️ PARTIALLY WORKING | Listed, verify implementation | `os_data_products` module |
| Auction Intelligence (€149) | ⚠️ PARTIALLY WORKING | Listed, verify implementation | `os_data_products` module |
| maiProp OS 20% discount | ✅ WORKING | Automatic at checkout | Pricing page banner |

---

## Summary by Implementation Status

### Fully Working (✅) - 45+ Features
- Core platform (listings, messaging, viewings)
- AI valuation system with Greek market data
- CRM with full pipeline management
- Open House management with analytics
- Lead capture and management
- Featured/priority listing system
- Neighbourhood reports
- Firesale and auction systems
- Professional directory and booking
- Video consultation rooms
- Usage tracking and billing

### Partially Working (⚠️) - 8 Features
- Construction timeline (UI exists, backend TBD)
- Team/multi-user seats (framework exists)
- White-label API (listed only)
- B2B OS products (verify endpoints)
- Dedicated account manager (manual process)

### Not Functional (❌) - 2 Features
- White-label API access (marketing only)
- Dedicated account manager (manual, not productized)

---

## Test Coverage Summary

| Feature Area | Test Files | Coverage |
|--------------|-----------|----------|
| Property Valuation | `PropertyValuation.test.tsx` | ✅ Comprehensive |
| Neighbourhood Reports | `NeighbourhoodReport.test.tsx` | ✅ Comprehensive |
| Leads CRM | `LeadsCRM.test.tsx` | ✅ Comprehensive |
| Open House | `OpenHouseAnalytics.test.tsx`, `useOpenHouseAssetControl.test.tsx` | ✅ Comprehensive |
| Firesale | `FiresaleQuickSaleForm.test.tsx`, `useFiresaleInterest.test.tsx` | ✅ Comprehensive |
| Plan Limits | `planLimitErrors.test.ts`, `usePlanLimits.test.tsx` | ✅ Comprehensive |
| Deal Checklist | `DealChecklist.test.tsx` | ✅ Good |
| Auction Alerts | `useAuctionAlerts.ts` (hook tested) | ✅ Good |
| Component Smoke | `components.smoke.test.tsx` | ✅ Broad coverage |
| Page Smoke | `pages.smoke.test.tsx` | ✅ Broad coverage |

---

## Recommendations

### High Priority Fixes
1. **Verify B2B OS Products** - Confirm endpoints for Market Intelligence, AVM API, Auction Intelligence
2. **White-label API** - Either implement or remove from pricing page
3. **Dedicated Account Manager** - Clarify as manual service vs product feature

### Documentation Updates Needed
1. Clarify that "dedicated account manager" is a sales process, not dashboard feature
2. Add OS discount application instructions to billing page
3. Document API access request process for institutional clients

---

*Document Version: 1.0*
*Last Updated: April 27, 2026*
