# Undeveloped Features — Plan Limits & Pricing

This document lists features and limits from the Pricing specs that are **not yet implemented** in code or Dashboard.

---

## 1. BUYER

### Implemented ✅
- Browse all listings
- Auction listing cap: Free 60, Pro 600 (Auctions.tsx `MAX_PAGES_FREE`/`MAX_PAGES_PRO`)
- Auction filters: Pro filters gated by `isPro` (ownership, yield, round) — partial
- Professional directory access (no per-category limit yet)

### Not implemented ❌

| Feature | Spec | Status |
|---------|------|--------|
| Save up to 1 search (free) | Limit on `saved_searches` count | No enforcement in `useSavedSearches` or `SaveSearchModal` |
| Set 1 search alert (free) | Limit on alerts per search | No limit check |
| Book 1 viewing per month (free) | Monthly cap on viewings | No enforcement in viewing creation |
| 1 Auction alert (free) | Max 1 `auction_alerts` for free | No limit in `useCreateAuctionAlert` |
| Professional directory: 5 per category (free) | Cap professionals viewed per category | No tracking or gate |
| Full AI Property Valuation | 5/month, €3 extra | No usage tracking; no pay-per-extra flow |
| Property Reports | 3/month, €9 extra | No Property Reports feature; no usage limits |
| Similar sales on listing | Access on Pro | No "similar sales" UI on PropertyDetail |
| Save 5 searches, 5 alerts (Pro) | Pro limits | No enforcement |
| Book 10 viewings (Pro) | Pro monthly cap | No enforcement |
| 5 Auction alerts (Pro) | Pro limit | No enforcement |
| Unlimited professionals (Pro) | No cap | N/A — limit only for free |

**Dashboard**: ✅ Plan & Usage card added (`DashboardPlanCard`) — shows Free/Pro badge, usage vs limits, upgrade CTA when at limit.

---

## 2. SELLER

### Implemented ✅
- List up to 2 properties — **not enforced**; no insert guard

### Not implemented ❌

| Feature | Spec | Status |
|---------|------|--------|
| List limit: 2 (free), 5 (Pro) | Enforce on listing insert | No RLS or app check for seller/individual plan |
| No AI assistance (free) | Hide AI assist for free | AI assist likely available; no plan gate |
| Basic dashboard, no analytics (free) | Hide analytics for free | Analytics shown to all |
| AI listing description assist (Pro) | Pro only | No plan gate |
| Featured badge (Pro) | Pro only | `is_featured` exists; no plan gate on set |
| Listing performance analytics (Pro) | Pro only | No plan gate |
| Priority placement (Pro) | Pro only | No plan gate |

**Dashboard**: ✅ Plan & Usage card shows listings used vs limit; upgrade CTA when at 2 listings.

---

## 3. AGENT

### Implemented ✅
- CRM & contacts (LeadsCRM, ContactsCRM)
- Basic dashboard
- Auction alerts (no limit check)

### Not implemented ❌

| Feature | Spec | Status |
|---------|------|--------|
| List limit: 5 (free) | Enforce on insert | No plan-based limit |
| maiProp branded video room | Free feature | Exists; no plan gate |
| View 60 auctions (free) | Same as buyer | Uses buyer limits if `isPro` from subscription |
| Pro auction filters (Pro) | Pro only | Gated by `isPro` |
| Book 3 viewings/month (free) | Monthly cap | No enforcement |
| Basic profile on Professionals page | Agent profile in directory | Unclear if agents have directory entry |
| Unlimited listings (Pro) | Pro only | No limit |
| Unlimited auction alerts & searches (Pro) | Pro only | No limit |
| Alert for Private Owner's Ad | New feature | Does not exist |
| Up to 10 Priority Ads, €5 each extra | Priority Ads + usage billing | No Priority Ads product; no usage tracking |
| Priority in Professionals Directory | Pro only | No implementation |
| Book 10 viewings (Pro) | Pro cap | No enforcement |

**Dashboard**: ✅ Plan & Usage card shows listings and viewings used vs limit; upgrade CTA when at limits.

---

## 4. DEVELOPER

### Implemented ✅
- Project showcase pages (Projects)
- Pre-sale listing management
- Priority placement (field exists)

### Not implemented ❌

| Feature | Spec | Status |
|---------|------|--------|
| Pro-only access | Developers have no free tier | Pricing page shows Pro only; no enforcement before signup |
| Featured on New Building section | Placement in UI | Logic for "featured" in New Building section unclear |
| Plan enforcement | Must be on Pro to use | No subscription/plan check for developer role |

**Dashboard**: No plan status; developers can use full features without subscription.

---

## 5. PROFESSIONAL

(Spec mentions two plans but details not provided — keeping existing structure.)

- Free: directory, basic leads, booking
- Pro: priority leads, advanced tools  
- No specific limit enforcement found.
- **Dashboard**: ✅ Plan & Usage card shows Free/Pro status; upgrade CTA when on Free.

---

## 6. Cross-cutting

### Subscription / plan detection
- `useSubscription` checks `PRO_PRODUCT_ID` (€29 Pro) — **buyer-focused**
- No per-audience plan keys (buyer_pro, seller_pro, agent_pro, developer_pro)
- `create-checkout` uses `plan` key; mapping to Stripe products may be incomplete

### Dashboard
- ✅ Plan & Usage card (`DashboardPlanCard`) in Overview for buyer, seller, agent, developer, professional
- ✅ Upgrade prompts when at limit (saved searches, viewings, listings, auction alerts)
- ✅ Display of current plan (Free vs Pro) in Overview

### Backend
- No usage tables (e.g. `valuation_usage`, `report_usage`, `viewing_usage_per_month`)
- No RLS or triggers enforcing listing count by plan
- No webhook or cron for monthly reset of viewing counts

---

## 7. Suggested implementation order

1. **Plan context**  
   - Add `usePlanLimits(audience)` returning limits from profile + subscription.
   - Extend subscription check for seller_pro, agent_pro, developer_pro.

2. **Enforce caps**  
   - Saved searches: check count before insert.
   - Auction alerts: check count before insert.
   - Listings: check count before insert (seller 2/5, agent 5/unlimited).
   - Viewings: monthly count + cap (requires usage table or derived count).

3. **Usage-based (add-on)**  
   - AI Valuation: usage table + 5 included, €3/extra.
   - Property Reports: new feature + 3 included, €9/extra.
   - Priority Ads: new product + 10 included, €5/extra.

4. **Dashboard**  
   - Add Plan card to Overview (or Settings).
   - Add upgrade CTAs when at limit.
   - Add usage display for valuations/reports (when implemented).
