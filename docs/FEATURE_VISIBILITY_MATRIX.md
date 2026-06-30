# Feature visibility matrix (Participant ID × Free/Pro)

This document answers: **which modules/features are visible** for each **participant id** under **Free** vs **Pro**.

**Sources (repo “ground truth”):**
- Routes: `src/App.tsx`
- Dashboard nav logic: `src/pages/Dashboard.tsx` (`NAV_BY_TYPE` + `NAV_BY_TYPE_FREE`)
- Role & participant rules: `docs/PARTICIPANT_RIGHTS.md`, `docs/ONBOARDING_AND_USER_TYPES.md`
- Pro gates: `src/pages/ProfessionalProfile.tsx`, `src/pages/PropertyDetail.tsx`, `src/pages/Pricing.tsx`, `src/pages/Auctions.tsx`
- Investor deal flow gate: `src/components/InvestorRoute.tsx` (eligibility-based, not “just Pro”)

## Legend
- **Yes**: module is visible and usable
- **Locked**: module is visible but shows upgrade / eligibility gate (CTA)
- **No**: module not visible / not reachable for this participant/plan
- **Eligible-only**: access depends on separate eligibility rules (e.g. invitation/subscription), not just Pro
- **Pro-only**: no Free tier for that participant in pricing UX

## Big visibility table

Columns: `buyer(F)` means **buyer Free**, `buyer(P)` means **buyer Pro**, etc.

| Module / Feature | buyer(F) | buyer(P) | seller(F) | seller(P) | agent(F) | agent(P) | developer(F) | developer(P) | professional(F) | professional(P) | investor(F) | investor(P) | institutional(F) | institutional(P) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Public: Home (`/`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Public: Browse listings (`/listings`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Public: Auctions list (`/auctions`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Public: Professionals directory (`/professionals`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Public: Pricing (`/pricing`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Auth: Login/Signup (`/login`, `/signup`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Protected: Dashboard (`/dashboard`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Protected: Messages (`/messages`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Protected: Create listing (`/listings/new`)** | No | No | Yes | Yes | Yes | Yes | Yes | Yes | No | No | No | No | Yes | Yes |
| **Protected: New building listing (`/listings/new-building`)** | No | No | Yes | Yes | Yes | Yes | Yes | Yes | No | No | No | No | Yes | Yes |
| **Protected: Projects (`/projects`)** | No | No | No | No | Yes | Yes | No | Yes | No | No | No | No | Yes | Yes |
| **Protected: Portfolios (`/portfolios`)** | No | No | No | No | Yes | Yes | No | Yes | No | No | No | No | Yes | Yes |
| **Protected: Investor Dashboard (`/investor-dashboard`)** | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only | Eligible-only |
| **Admin Dashboard (`/admin`)** | No | No | No | No | No | No | No | No | No | No | No | No | No | No |
| **Property detail view (`/property/:id`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Auction detail view (`/auction/:id`)** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Property Valuation (card on property page)** | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes |
| **Property Report (card on property page)** | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes |
| **Auctions: advanced filters (ownership/round/yield)** | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes |
| **Professionals: full profile view (`/professionals/:id`)** | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes |
| **Professionals: “Send message / Book” actions** | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes | Locked | Yes |
| **Professional provider: “My profile” (`/professionals/me`)** | No | No | No | No | No | No | No | No | Yes | Yes | No | No | No | No |
| **Professional provider: Services / Booking / Leads modules (Dashboard nav)** | No | No | No | No | No | No | No | No | Partial (reduced nav) | Yes | No | No | No | No |
| **Seller-only: Firesale submit flow (`/firesale` submit)** | Locked (must onboard as seller) | Locked (must onboard as seller) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Locked (must onboard as seller) | Locked (must onboard as seller) | Yes | Yes |
| **Buyer: Saved Searches (Dashboard nav)** | Yes | Yes | No | Yes | No | Yes | No | Yes | No | No | Yes | Yes | Yes | Yes |
| **Buyer: Open Houses (Dashboard nav)** | No | Yes | No | Yes | Yes | Yes | No | Yes | No | No | No | Yes | No | Yes |
| **Agent: Analytics (Dashboard nav)** | No | No | No | No | No | Yes | No | Yes | No | Yes | No | No | Yes | Yes |
| **Agent: Contacts/CRM (Dashboard nav)** | No | No | No | No | No | Yes | No | Yes | No | Yes | No | No | Yes | Yes |
| **Global AI widget (`AIAssistantWidget`)** | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* | Yes* |

Notes:
- **Investor Dashboard is eligibility-gated** via `InvestorRoute` and `useEligibleForQuickSale()`; this is **separate from Pro**.
- **Professional profile page** is explicitly **simplified** when `viewerIsPro` is false (`ProfessionalProfile.tsx`).
- **Developer Free** is treated as **Pro-only in pricing UX**; the app still has a Free nav mapping, but product intent is “Pro-only”.
- `Yes*` for the global AI widget: it is hidden on specific routes (`/login`, `/signup`, `/onboarding`, `/dashboard`, `/messages`, `/ai-assistant`, and property pages) per `src/App.tsx`.

## Pricing vs UI parity (possible “loopholes”)

The pricing page is a *promise/marketing list*, while dashboard visibility is implemented by nav routing rules (`Dashboard.tsx`) and separate feature gates (AI usage, Pro subscription, eligibility). This section flags places where the **UI reveals a module when Pro is enabled**, even if that module is not explicitly called out by name in the pricing bullets.

### Quick Sale / deal-flow (buyer)
- `deal-flow` (Investor Dashboard module) can appear for the **buyer dashboard key** when `useEligibleForQuickSale().eligible === true`.
- `useEligibleForQuickSale()` is based on **active/trial `investor_subscriptions` (or admin)**, not on Pro (`isPro`) directly.
- So a **buyer Free** user who is eligible can see `deal-flow` even if the Pricing page “buyer Free” list doesn’t mention Investor Dashboard.

### buyer pro
- Dashboard shows **Open Houses** (`open-houses`) in the nav when Pro is enabled (`NAV_BY_TYPE.buyer` includes `open-houses`; `NAV_BY_TYPE_FREE.buyer` does not).
- The buyer Pro feature bullets list viewings/saved searches/alerts/AI tools, but don’t explicitly name **Open Houses** as a separate promise (UI-wise it becomes visible).

### seller pro
- Dashboard shows **Open Houses** (`open-houses`) with Pro for the seller nav key.
- Seller Pro bullets focus on AI listing assist/featured/analytics, but don’t explicitly call out Open Houses as a separate module (UI reveals it via nav).

### agent pro
- Dashboard shows **Analytics**, **Saved Searches**, **Open Houses**, **Leads**, and **Contacts** in the nav when Pro is enabled.
- Pricing includes CRM & contacts management and performance analytics, but does not explicitly list Open Houses / Leads / Saved Searches as named bullet items (the modules become visible via nav).

### developer pro
- Dashboard shows **Analytics**, **Leads**, **Contacts**, **Projects**, and **Portfolios** in the nav when Pro is enabled.
- Pricing lists project showcase pages / project ad management / Spotlight / Priority Rank, but does not explicitly enumerate Leads/Contacts/Portfolios/Analytics as standalone bullets (UI becomes visible via nav).

### professional pro
- Dashboard shows **Booking**, **Contacts**, **Analytics**, and **Viewings** in the nav when Pro is enabled.
- Pricing lists booking/calendar + advanced lead analytics + messaging, but does not explicitly mention Contacts/Viewings by module name (UI exposes them through nav).

### institutional / investor ids
- In this codebase, `getParticipantTypeFromProfile()` maps to only `buyer/seller/agent/developer/professional` dashboard keys.
- That means **institutional/investor participant ids effectively use the buyer dashboard keys**, plus `deal-flow` when eligible.

## Dashboard visibility: Basic (Free) vs Pro nav modules

“Basic dashboard” = `NAV_BY_TYPE_FREE` (when `isPro === false`).
“Pro dashboard” = `NAV_BY_TYPE` (when `isPro === true`), except for **admin** which uses the admin nav definition.

Note: **Deal Flow (`deal-flow`)** may be added on top for buyer when `useEligibleForQuickSale()` returns eligible (independent of Pro).

| Participant id (dashboard key) | Basic dashboard modules (`isPro=false`) | Pro dashboard modules (`isPro=true`) |
|---|---|---|
| buyer | Overview, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Profile, Settings | Overview, Saved, Saved Searches, Open Houses, Messages, Viewings, Auction Alerts, Profile, Settings (+ `deal-flow` if eligible) |
| seller | Overview, My Listings, Messages, Viewings, Profile, Settings | Overview, My Listings, Saved, Saved Searches, Messages, Viewings, Open Houses, Profile, Settings |
| agent | Overview, My Listings, Saved, Messages, Viewings, Auction Alerts, Profile, Settings | Overview, My Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auction Alerts, Open Houses, Leads, Contacts, Profile, Settings |
| developer | Overview, My Listings, Messages, Profile, Settings | Overview, My Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Leads, Contacts, Projects, Portfolios, Profile, Settings |
| professional | Overview, My Services, Leads, Messages, Profile, Settings | Overview, My Services, Booking, Leads, Contacts, Analytics, Messages, Viewings, Profile, Settings |

## Big “everything” flow diagram (single page)

```mermaid
flowchart LR
  %% Entry
  V[Visitor] --> H[/Public modules:\n/, /listings, /auctions, /professionals, /pricing/]
  V --> L[/Login/Signup/]
  L --> AU[Authenticated user]
  AU --> OB{Onboarded?}
  OB -->|No| ONB[/Onboarding/]
  OB -->|Yes| DASH[/Dashboard/]

  %% Participant id selection (bio type)
  ONB --> PT{Participant id\n__type:*}
  PT --> B[buyer]
  PT --> S[seller]
  PT --> I[investor]
  PT --> A[agent]
  PT --> D[developer]
  PT --> INST[institutional]
  PT --> PRO[professional]

  %% Plan state
  AU --> PLAN{Global plan}
  PLAN --> F[Free]
  PLAN --> P[Pro]

  %% Core protected routes
  DASH --> MSG[/Messages/]
  DASH --> SAVED[/Saved/]
  DASH --> VIEW[/Viewings/]
  DASH --> AUCTAL[/Auction alerts/]
  DASH --> OH[/Open houses/]
  DASH --> SET[/Settings/]

  %% Sell-side modules
  DASH --> LISTNEW[/Create listing\n/listings/new/]
  DASH --> PRJ[/Projects/]
  DASH --> PORT[/Portfolios/]
  DASH --> CRM[/Contacts & Leads/]

  %% Pro-provider modules
  DASH --> PROME[/Professional profile\n/professionals/me/]
  DASH --> PROSERV[/Services/Booking/Leads/]

  %% Special dashboards
  DASH --> INV[/Investor Dashboard\n/investor-dashboard/]

  %% Gates (role-based)
  LISTNEW --> GateListing{Role allows listings?}
  GateListing -->|Yes: seller/agent/developer/institutional/admin| OKL[Create/manage listings]
  GateListing -->|No: buyer/investor/professional| NO1[Blocked/No nav]

  INV --> Elig{Eligible for Quick Sale?}
  Elig -->|No| BackDash[Redirect to /dashboard]
  Elig -->|Yes| DealFlow[Deal flow visible]

  %% Pro gates (global)
  H --> PD[/Property detail\n/property/:id/]
  PD --> Val[Property Valuation]
  PD --> Rep[Property Report]
  Val -->|Free| ValLock[Locked + upgrade CTA]
  Val -->|Pro| ValOK[Unlocked + usage tracking]
  Rep -->|Free| RepLock[Locked + upgrade CTA]
  Rep -->|Pro| RepOK[Unlocked + usage tracking]

  H --> PROLIST[/Professionals directory/]
  PROLIST --> PROPAGE[/Professional profile\n/professionals/:id/]
  PROPAGE -->|Free| ProLite[Simplified profile + upgrade CTA]
  PROPAGE -->|Pro| ProFull[Full profile: tabs/services/etc.]

  H --> AUCT[/Auctions list/]
  AUCT --> AFilt[Advanced auction filters]
  AFilt -->|Free| AFLock[Locked (Pro CTA)]
  AFilt -->|Pro| AFOK[Unlocked]

  %% Firesale submit gate
  H --> FS[/Firesale page\n/firesale/]
  FS --> FSSub[Submit request]
  FSSub --> SellerRole{Is seller role?}
  SellerRole -->|No| SellerCTA[CTA: onboard as Seller]
  SellerRole -->|Yes| FSOK[Submit allowed + validation]

  %% Admin-only
  AU --> AdminRole{role='admin'?}
  AdminRole -->|Yes| ADM[/Admin dashboard\n/admin/]
  AdminRole -->|No| NOADM[No admin routes]
```

