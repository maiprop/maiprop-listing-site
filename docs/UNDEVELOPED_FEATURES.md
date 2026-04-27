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
| List limit: 2 (free), 5 (Pro) | Enforce on listing insert | No RLS or app check for seller/buyer plan |
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

---
## 8. Edge Functions / background jobs: wired vs not wired (and missing connections)

This section is about **connections** (frontend calls vs cron/DB triggers vs currently unused functions), not just ???caps/enforcement???.

### A) Edge Functions that the frontend does call (but may have wiring mismatches)
- `property-chat`
  - **Called by:** `src/components/AIAssistantWidget.tsx`
  - **Current issue (wiring):** it sends `Authorization: Bearer ${SUPABASE_ANON_KEY}` (anon key), but security hardening checks require a real **user JWT**.
  - **Who should benefit:** buyer/seller/agent/developer/professional/investor/institutional (any authenticated participant) for the AI assistant UI.
  - **Connection to make:** pass the authenticated user access token from `AuthContext` (or adjust function auth verification in a controlled, deliberate way).
- `ai-service-match`
  - **Called by:** `src/components/AIServiceMatchModal.tsx`
  - **Current issue (wiring):** also uses `Authorization: Bearer ${SUPABASE_ANON_KEY}` which won???t satisfy JWT verification.
  - **Who should benefit:** any authenticated participant using ???Find matching professional???.
  - **Connection to make:** use the user???s JWT for the `Authorization` header.
- `smart-filters`
  - **Called by:** `src/hooks/useSmartFilters.ts`
  - **Current behavior:** skips AI call when `!user` (logged-out users get default config).
  - **Suggested rule:** if pricing ever says ???smart filters are Pro???, gate on `isPro`; otherwise keep as ???authenticated user??? level access.

### B) Edge Functions that are NOT called by the frontend at all
- `pro-ai-tools`
  - **Current wiring:** no frontend references found (not invoked by any route/component).
  - **Who should benefit:** **Pro** users across participant ids (buyer/seller/agent/developer/professional/investor/institutional), specifically for the ???Pro AI tools??? experience promised on pricing.
  - **Connection to make:** integrate `pro-ai-tools` into the same UI surfaces currently using `property-chat` / property tool cards:
    - Property detail ???Property Valuation / Property Report???
    - AI assistant flows (if you want Pro-specific prompts/behavior)
- `receive-from-os`
  - **Current wiring:** no frontend calls found; expected to be OS -> Supabase webhook style ingestion.
  - **Who should benefit:** platform/admin integration only.
  - **Connection to make:** ensure the OS system is configured to POST to `/functions/v1/receive-from-os` (with correct auth/service role) and that the payload updates the intended tables.
- `auth-email-hook`, `process-email-queue`, `send-saved-search-alerts`
  - **Current wiring:** not called directly from the frontend; expected to run via `pg_cron` / auth/webhook flows.
  - **Who should benefit:** users who create saved searches/notifications, plus auth flows.
  - **Connection to make:** verify the end-to-end chain:
    - UI insert/update of saved searches -> DB queue/state -> cron triggers -> edge function -> email send -> user notification.

### C) Edge Functions wired via DB triggers / cron (exist, but not ???by participation id??? directly)
- `oh-registration-notify`
  - **Wired by:** DB trigger on `open_house_registrations.status`
  - **Who should benefit:** the user who registered for an open house (typically buyer/investor depending on your onboarding mapping).
- OS sync functions (`full-sync-from-os`, `sync-to-os`, `sync-firesale-to-os`, `poll-os-auctions`, `os-diagnose`)
  - **Wired by:** Admin UI + scheduled cron
  - **Who should benefit:** platform/admin only (never ???agent Free???).

---
## 9. Participant-id based wiring: should an agent get access to a module that???s not accessible?

Rule of thumb from `src/pages/Dashboard.tsx`:
- **Agent Free** hides modules like **Analytics / Contacts / Leads** from the dashboard nav; they only appear when `isPro=true`.
- Therefore, **an agent should not automatically gain** those modules on Free just because the functionality exists somewhere; the correct connection is:
  - Pro-only dashboard nav + Pro-only AI tool cards controlled by `isPro`.

Concrete examples:
- **Should an agent get `pro-ai-tools`?**
  - **Yes, but only when the agent is Pro.**
  - Reason: `pro-ai-tools` is currently not wired anywhere in the frontend; once wired, it should align with the existing ???Pro??? surfaces for property valuation/reporting.
- **Should an agent get `property-chat` / `ai-service-match`?**
  - **Yes for authenticated agents**, but only if the frontend passes a **user JWT** (current anon-key Authorization will fail JWT verification).
