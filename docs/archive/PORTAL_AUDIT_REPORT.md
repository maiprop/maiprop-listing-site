# Portal Audit Report — portal.maiprop.co

**Date:** March 2026  
**Scope:** Speed, security, scraping, user data, payment info, and liabilities

---

## Executive Summary

The MaiProp portal has a **solid security foundation** with RLS, auth-gated edge functions, and documented safeguards. Several items require attention: hardcoded dev fallbacks in client config, rate limiting gaps, and bundle size optimization. User PII and payment flows are appropriately protected.

---

## 1. Speed & Performance

### Current State

| Area | Status | Notes |
|------|--------|-------|
| Route lazy-loading | ✅ | Heavy routes (Dashboard, Listings, PropertyDetail, etc.) use `React.lazy()` |
| Hero video preload | ✅ | `index.html` preloads `hero-bg.mp4` for faster first paint |
| Mapbox | ⚠️ | 987 KB chunk; loaded on map views only (lazy) but still large |
| Main bundle | ⚠️ | ~865 KB index.js (above 500 KB Rollup warning) |
| CSS | OK | 132 KB main CSS; Mapbox adds 36 KB |

### Recommendations

1. **Manual chunks:** Split vendors (react, react-dom, recharts, framer-motion) from app code via `rollupOptions.output.manualChunks`.
2. **Mapbox:** Already lazy; consider `mapbox-gl` dynamic import only when MapView mounts. Verify it’s not in the critical path.
3. **Images:** `thessaloniki-landmark-C4m4r3m4.jpg` is 2.3 MB — compress or use WebP.
4. **CDN/caching:** Ensure `Cache-Control` headers for static assets; Street View proxy uses `max-age=86400`.

---

## 2. Security

### Strengths

| Area | Status | Notes |
|------|--------|-------|
| Auth | ✅ | Supabase Auth, JWT, ProtectedRoute, AdminRoute |
| RLS | ✅ | Enabled on profiles, listings, contacts, firesale_requests, etc. |
| profiles_public | ✅ | No phone/website in public view; sync via trigger |
| Investor subscriptions | ✅ | No self-grant; admins only for INSERT/UPDATE |
| Edge functions | ✅ | create-checkout, check-subscription, customer-portal require JWT |
| receive-from-os | ✅ | Rejects 503 if `MAIPROP_OS_WEBHOOK_SECRET` unset; validates `x-os-signature` |
| AI functions | ✅ | property-valuation, ai-search, smart-filters, neighbourhood-report require JWT |
| streetview-proxy | ✅ | Rate limited 60 req/min per IP; API key server-side only |
| Payment | ✅ | Stripe Checkout; no card data in app; create-checkout returns 503 if service role missing |

### Items to Address

1. **Hardcoded dev fallbacks** (`src/lib/config.ts`):
   - Supabase URL, anon key, Mapbox token have fallbacks when `!isProd`.
   - **Risk:** Dev builds or accidental prod builds without env could leak keys. Anon key is designed for client use; Mapbox token can incur cost if abused.
   - **Recommendation:** Remove fallbacks; fail fast if `VITE_*` vars missing. Or use empty string for Mapbox in prod when unset.

2. **CORS:** Edge functions use `Access-Control-Allow-Origin: *`. Acceptable for a public API; consider restricting to `https://portal.maiprop.co` for stricter control.

---

## 3. Scraping & Public Data Exposure

### What’s Public (By Design)

| Data | Access | Notes |
|------|--------|-------|
| Listings (active) | Public | Required for portal; `listings` RLS allows public SELECT for `status='active'` |
| Professionals directory | Public | display_name, hourly_rate, city, website_url, avatar |
| Open houses | Public | Listing data + schedule |
| Auctions | Public | Listing data + auction metadata |
| robots.txt | Allow all | `/` allowed for SEO |

### What’s Protected

| Data | Who Can Access | How |
|------|----------------|-----|
| Full profiles (phone, etc.) | Owner + agents only | RLS on `profiles`; app uses `profiles_public` for others |
| Contacts (CRM) | Owner only | RLS `user_id = auth.uid()` |
| Firesale requests (contact_email, contact_phone) | Owner, platform admin, **subscribed eligible investors** | RLS; `published_to_investors` must be true for investors |
| Messages | Participants only | RLS by conversation membership |
| Project leads | Project owner only | RLS by `project_id` → `owner_id` |
| Investor subscriptions | Own row only; admins for all | RLS |
| Invitation requests | Own status only | RLS |

### Scraping Mitigation

- Listings are intended for public discovery; blocking scraping would harm SEO and UX.
- No raw PII (phone, email) in public listing responses.
- Supabase PostgREST enforces RLS; scrapers using anon key cannot bypass.
- **Recommendation:** Add optional rate limiting at Supabase/edge if abuse is detected. Consider `robots.txt` rules for heavy crawlers if needed (e.g. `Disallow: /property/` for aggressive bots — only if scraping becomes a problem).

---

## 4. User Data & Private Information

### PII Handling

| Data Type | Storage | Exposure | Status |
|-----------|---------|----------|--------|
| Phone | `profiles.phone` | Owner + agents only | ✅ RLS |
| Email | `auth.users` (Supabase) | Not in app responses | ✅ |
| Contact name/email/phone | `firesale_requests` | Owner, admin, subscribed investors | ✅ RLS |
| CRM contacts | `contacts` | Owner only | ✅ RLS |
| Project leads | `project_leads` | Project owner only | ✅ RLS |
| Consultation requests | `consultation_requests` | Requester + professional | ✅ RLS; requester_id check |

### Profile Usage

- **AuthContext:** Fetches own profile from `profiles` with `.eq("user_id", userId)` — correct.
- **Other users:** App uses `profiles_public` (display_name, avatar_url, first_name, last_name, role) — no phone.
- **Professional profiles:** `professionals` table has `website_url`; professionals opt-in to show it. Not PII.

### Form Prefill

- Firesale form prefills `contactName`, `contactEmail`, `contactPhone` from profile/user — only for the submitting user’s own data.

---

## 5. Payment Information

| Flow | Implementation | Status |
|------|----------------|--------|
| Checkout | Stripe Checkout Sessions; redirect to Stripe-hosted page | ✅ No card data in app |
| Customer portal | Stripe Customer Portal; redirect | ✅ |
| Subscription status | `check-subscription` edge function; reads from Stripe | ✅ JWT required |
| Storage | No card numbers stored; Stripe handles PCI | ✅ |

---

## 6. Other Liabilities

### Checklist

| Item | Status |
|------|--------|
| Breach detection (Supabase Auth) | ⬜ Enable in Dashboard → Authentication → Providers → Email |
| Migrations applied | ⬜ Confirm `20260320120000_fix_critical_security_issues.sql` and related migrations run |
| Edge Function secrets | ⬜ Confirm MAIPROP_OS_WEBHOOK_SECRET, STRIPE_SECRET_KEY, LOVABLE_API_KEY, GOOGLE_MAPS_API_KEY in Supabase secrets |
| HTTPS | ✅ Assumed for portal.maiprop.co |
| Privacy/Terms | ✅ PrivacyPolicy, TermsOfService, CookiePolicy pages |
| GDPR considerations | ✅ Data processing, retention, and contact info documented in Privacy Policy |

### Open House Asset Control

- `useOpenHouseAssetControl` fetches registration requests with `profiles:requester_id (display_name, first_name, last_name, avatar_url)` — from `profiles_public` or equivalent; no phone. ✅

### Admin Firesale Pipeline

- `AdminFiresalePipeline` shows `contact_email`, `contact_phone` for firesale deals — only for platform admins (RLS). ✅

---

## 7. Summary of Actions

### Must Do (Project-Level)

- [ ] Run security migrations if not already applied
- [ ] Enable breach detection in Supabase Auth
- [ ] Set `MAIPROP_OS_WEBHOOK_SECRET` and other edge function secrets

### Should Do

- [ ] Remove or restrict hardcoded dev fallbacks in `config.ts`
- [ ] Add manual chunks for vendor splitting (react, recharts, etc.) to reduce main bundle
- [ ] Compress large images (e.g. thessaloniki-landmark)

### Nice to Have

- [ ] Restrict CORS to `https://portal.maiprop.co` for edge functions
- [ ] Add `robots.txt` `Disallow` rules for sensitive paths if needed (e.g. `/dashboard`, `/messages` — though these require auth)

---

## References

- `SECURE_ALL_DATA.md` — Data access matrix
- `SECURITY_AUDIT.md` — Detailed audit history
- `supabase/migrations/20260320120000_fix_critical_security_issues.sql` — Critical security fixes
