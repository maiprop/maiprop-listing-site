# Platform Architecture: maiprop

## 1. Module Access Model (Free vs Pro)

### Philosophy
Every module is **fully browsable for free**. The paywall sits at the point of action — the moment a user wants to act on information rather than just consume it. This maximizes SEO (all content is crawlable) and minimizes friction to discovery.

---

### Module Breakdown

#### Buy / Rent
| Feature | Free | Pro |
|---|---|---|
| Browse & search listings | ✅ | ✅ |
| View listing detail | ✅ | ✅ |
| Basic filters (price, beds, type) | ✅ | ✅ |
| Contact agent (1/month) | ✅ | ✅ |
| Advanced filters (floor, energy class, building age) | ❌ | ✅ |
| Saved searches + email alerts | ❌ | ✅ |
| Price history & index chart | ❌ | ✅ |
| AI property valuation | ❌ | ✅ |
| Side-by-side compare tool | ❌ | ✅ |
| Unlimited agent contacts | ❌ | ✅ |

#### Auctions
| Feature | Free | Pro |
|---|---|---|
| Browse court auctions | ✅ | ✅ |
| View opening bid & property type | ✅ | ✅ |
| Court name & date | ✅ | ✅ |
| Full auction dossier (cadastre, encumbrances) | ❌ | ✅ |
| Auction alerts by city / property type / price | ❌ | ✅ |
| Historical bid data | ❌ | ✅ |
| AI discount estimator | ❌ | ✅ |

#### Quick Sale (Fire Sale)
| Feature | Free | Pro |
|---|---|---|
| Browse quick-sale listings | ✅ | ✅ |
| View price & location | ✅ | ✅ |
| Submit property for quick sale | ❌ | ✅ (Seller) |
| Instant AI valuation pre-submission | ❌ | ✅ |
| Priority placement in results | ❌ | ✅ |
| Investor pipeline (receive deal flow) | ❌ | ✅ (Investor) |

#### Open Houses
| Feature | Free | Pro |
|---|---|---|
| Browse upcoming open houses | ✅ | ✅ |
| RSVP attendance | ✅ | ✅ |
| View address & host | ✅ | ✅ |
| Private / video viewing request | ❌ | ✅ |
| Branded video room (seller/agent) | ❌ | ✅ |
| Attendance analytics (host) | ❌ | ✅ |
| Lead capture from open house (agent) | ❌ | ✅ |

#### Market Professionals
| Feature | Free | Pro |
|---|---|---|
| Browse professional directory | ✅ | ✅ |
| View public profile & specialties | ✅ | ✅ |
| Send 1 enquiry/month | ✅ | ✅ |
| Book consultation | ❌ | ✅ |
| AI service matching | ❌ | ✅ |
| Direct messaging (unlimited) | ❌ | ✅ |
| Professional creates own profile | ❌ | ✅ (Pro account) |
| CRM tools for professionals | ❌ | ✅ (Pro account) |

---

## 2. User Roles

```
participant         — default for all registered users
  ├── buyer         — browses, saves searches, contacts agents
  ├── seller        — lists property, quick sale, open house hosting
  └── investor      — quick sale pipeline, auction alerts, portfolio tracking

professional        — market professionals (agents, lawyers, notaries)
  └── sub-types: real_estate_agent | lawyer | architect | notary | contractor

admin               — platform management
```

**Onboarding** determines role. All roles can upgrade to Pro.

---

## 3. Gating Strategy (Development)

### Single source of truth: `usePlanLimits`

```ts
// src/hooks/usePlanLimits.ts
const LIMITS = {
  free:  { contacts: 1, savedSearches: 0, valuations: 0, alerts: 0 },
  pro:   { contacts: Infinity, savedSearches: 5, valuations: 10, alerts: 10 },
}
```

### Gate component pattern

```tsx
// src/components/ProGate.tsx
// Wraps any Pro-only feature. Shows upgrade prompt inline rather than redirecting.
<ProGate feature="auction-alerts">
  <AuctionAlertModal />
</ProGate>
```

**Rules:**
- Never hide Pro content from the DOM for SEO-critical text — blur/overlay instead
- For **actions** (buttons, forms): disable + show upgrade tooltip
- For **data** (charts, full dossiers): render skeleton + overlay
- Never redirect to a paywall page mid-flow — always upgrade inline

---

## 4. Performance Architecture

### Current biggest bottlenecks (by impact)

| Problem | Files | Fix |
|---|---|---|
| No memoization on AuthContext value | `AuthContext.tsx` | Wrap value in `useMemo`; wrap callbacks in `useCallback` |
| 2000+ line page files | `Index.tsx`, `Dashboard.tsx` | Extract inline components to separate files |
| Dashboard fetches all data at once | `Dashboard.tsx` | Lazy-load tab content; fetch on tab activation |
| PropertyCard not memoized | `PropertyCard.tsx` | `React.memo(PropertyCard)` |
| Filter arrays recreated every render | `Listings.tsx` | Move to module-level constants |
| No list virtualization | `Listings.tsx`, `Index.tsx` | Use `@tanstack/virtual` for property grids |
| All Dashboard tabs mounted on load | `Dashboard.tsx` | Render tab content only when tab is active |
| Heavy pages not code-split | `CreateListing`, `AdminDashboard` | Already lazy in App.tsx — verify chunk sizes |

### Code splitting rules

```
All routes are already lazy-loaded in App.tsx — keep it that way.
Heavy components inside pages should also be lazy:
  - MapView (Mapbox GL — large bundle)
  - AIAssistantWidget (only needed on non-dashboard pages)
  - CompareDrawer (only when user triggers compare)
  - NeighbourhoodReport (only when user scrolls to section)
```

### SEO requirements

- All listing data must be server-renderable or included in the initial HTML response
- Use `react-helmet-async` for per-page `<title>` and `<meta description>` — already in place
- `PropertyDetail` and `Listings` pages must render above-the-fold content without waiting for auth
- Pro-gated content must not be in the DOM at all for anonymous users (to avoid leaking paid data), but listing titles/prices/locations must always be present in HTML

### Rendering budget (target)

| Page | Max components rendered on first load | Notes |
|---|---|---|
| Index (homepage) | < 12 | Defer below-fold sections with IntersectionObserver |
| Listings | < 30 property cards | Paginate or virtualize; infinite scroll with threshold |
| PropertyDetail | ~8 sections | Defer Valuation, Neighbourhood, AI tabs until scroll |
| Dashboard | 1 tab panel | Mount other tabs only on activation |
| Open Houses | < 20 cards | Same as Listings |

---

## 5. File Structure Targets

### Current state → target

```
src/pages/Index.tsx        2,073 lines  →  ~600 lines  (extract Hero, SearchBar, FeaturedSection, etc.)
src/pages/Dashboard.tsx    2,143 lines  →  ~300 lines  (extract each tab to src/pages/dashboard/*)
src/pages/Listings.tsx     1,422 lines  →  ~500 lines  (extract FilterBar, ListingGrid, SortBar)
src/pages/PropertyDetail.tsx 1,436 lines → ~600 lines  (extract sections to src/components/property/*)
src/pages/CreateListing.tsx 1,549 lines → ~400 lines  (extract each form step to separate component)
```

### Recommended folder structure additions

```
src/
  pages/
    dashboard/
      DashboardShell.tsx       ← routing + tab state only
      tabs/
        ListingsTab.tsx
        ViewingsTab.tsx
        ContactsTab.tsx
        LeadsTab.tsx
    property/
      sections/
        ValuationSection.tsx
        NeighbourhoodSection.tsx
        SimilarListingsSection.tsx
  components/
    gates/
      ProGate.tsx              ← single gate component
      UpgradePrompt.tsx        ← inline upgrade CTA
    listings/
      PropertyCard.tsx         ← memoized
      ListingGrid.tsx          ← virtualized grid
      FilterBar.tsx
```

---

## 6. Business Model Clarity

### Why this structure works

- **Free tier drives SEO**: All listings, all modules are crawlable. Google indexes everything.
- **Free tier drives signups**: Users hit the action limit (1 contact, 0 saved searches) naturally, not through a hard block on page load.
- **Pro tier is sticky**: Saved searches, alerts, and CRM tools create daily return visits. These are the highest-retention features.
- **Professional accounts are a separate revenue line**: Agents pay for their profile + CRM. This is independent of buyer/seller subscriptions.

### Pricing tiers to consider

| Tier | Target | Key unlocks |
|---|---|---|
| Free | Casual browsers | Browse all modules, 1 contact/month |
| Pro Buyer | Active buyers/renters | Alerts, valuation, advanced filters, unlimited contacts |
| Pro Seller | Homeowners selling | List property, quick sale, open house tools |
| Pro Investor | Investors | Auction alerts, investor pipeline, portfolio |
| Pro Professional | Agents, lawyers | Directory profile, CRM, branded video room |

Keep tiers cleanly separated in `usePlanLimits` so switching or adding tiers requires changing one file.
