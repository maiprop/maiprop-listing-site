---
name: testing-qa
description: Local dev setup, demo accounts, and key UI flows for end-to-end testing the maiprop-listing-site app.
---

# Testing QA — maiprop-listing-site

## Local Dev Setup

```bash
cd /home/ubuntu/repos/maiprop-listing-site
npm install
npm run dev   # Starts Vite on port 8080
```

The dev server connects to **production Supabase** — all data changes are real. Be careful with destructive operations.

If port 8080 is already in use:
```bash
lsof -ti:8080 | xargs kill -9
npm run dev
```

## Devin Secrets Needed

- `SUPABASE_SERVICE_ROLE_KEY` — Required for admin-level DB operations (user creation, profile updates). This is the `service_role` JWT from Supabase dashboard (Settings → API).
- `SITE_LOCK_PASSWORD` — Required to access portal.maiprop.co (private preview gate). Not needed for localhost testing.

## Production Portal Access (portal.maiprop.co)

The production frontend is at `portal.maiprop.co` and is behind a **passcode gate**. To access:

1. Navigate to `https://portal.maiprop.co`
2. Enter the passcode (stored as `SITE_LOCK_PASSWORD` secret) and click Unlock
3. The portal is now accessible for the browser session

**When to use portal vs localhost:**
- Use `portal.maiprop.co` when testing CORS fixes, edge function deployments, or anything that depends on the production origin
- Use `localhost:8080` for general UI testing — it connects to the same Supabase backend
- Cloudflare Pages preview URLs (`*.maiprop-listing-site.pages.dev`) may be behind Cloudflare Access — use portal or localhost instead

## Test Accounts

All demo accounts use:
- **Password**: `Demo2025!`
- **Email domain**: `@maiprop.demo`

| Account | Canonical Email | Legacy Alias | Role | Pro? |
|---------|------------------|--------------|------|------|
| Seller Pro | seller.pro@maiprop.demo | - | seller | Yes |
| Seller Free | seller.free@maiprop.demo | - | seller | No |
| Buyer Pro | buyer.pro@maiprop.demo | - | buyer | Yes |
| Buyer Free | buyer.free@maiprop.demo | - | buyer | No |
| Investor Private | investor.private@maiprop.demo | - | investor (private) | Yes |
| Investor Institutional | investor.institutional@maiprop.demo | - | investor (institutional) | Yes |
| Agent Pro | agent.pro@maiprop.demo | - | agent | Yes |
| Developer Pro | developer.pro@maiprop.demo | - | developer | Yes |
| Professional (Architect) | architect.pro@maiprop.demo | professional1@maiprop.demo | professional | Yes |
| Professional (Lawyer) | lawyer.pro@maiprop.demo | professional2@maiprop.demo | professional | Yes |
| Professional (Valuer) | valuer.pro@maiprop.demo | professional3@maiprop.demo | professional | Yes |
| Admin | admin@maiprop.demo | - | admin | Yes |

Canonical browser-test accounts come from `scripts/seed-demo-accounts.ts`. The `professional1/2/3` identities are legacy aliases from `scripts/seed-mock-users.ts` and `scripts/seed-mock-professionals.ts`; keep them only for backward compatibility with older data snapshots.

Preferred Playwright env overrides:
- `E2E_BUYER_FREE_EMAIL` / `E2E_BUYER_FREE_PASSWORD`
- `E2E_BUYER_PRO_EMAIL` / `E2E_BUYER_PRO_PASSWORD`
- `E2E_SELLER_PRO_EMAIL` / `E2E_SELLER_PRO_PASSWORD`
- `E2E_AGENT_PRO_EMAIL` / `E2E_AGENT_PRO_PASSWORD`
- `E2E_DEVELOPER_PRO_EMAIL` / `E2E_DEVELOPER_PRO_PASSWORD`
- `E2E_INVESTOR_PRIVATE_EMAIL`
- `E2E_INVESTOR_INSTITUTIONAL_EMAIL`
- `E2E_ADMIN_EMAIL`
- `E2E_PROFESSIONAL_ARCHITECT_EMAIL`
- `E2E_PROFESSIONAL_LAWYER_EMAIL`
- `E2E_PROFESSIONAL_VALUER_EMAIL`
- `E2E_DEMO_PASSWORD`

For general authenticated smoke coverage, prefer `buyer.free@maiprop.demo`. Some deployed environments have stale `buyer.pro` credentials until the demo seed script is rerun.

## Pro Access Override

Pro features are gated by Stripe subscription. For testing without Stripe, the `force_pro_access` boolean column in `profiles` table bypasses the subscription check. Set it via:

```sql
UPDATE profiles SET force_pro_access = true WHERE display_name LIKE '%Pro%';
```

The `useSubscription` hook checks: `isPro = isAdmin || hasStripePro || hasInvestorPro || forceProAccess`

## Cross-User Testing via Playwright CDP

To switch between users programmatically without manually logging in/out:

```python
import asyncio
from playwright.async_api import async_playwright

async def login_as(email, password="Demo2025!"):
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp("http://localhost:29229")
        context = browser.contexts[0]
        page = context.pages[-1]
        
        # Clear auth state
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto("http://localhost:8080/login", wait_until="networkidle")
        await asyncio.sleep(2)
        
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)
        await page.click('button[type="submit"]')
        await asyncio.sleep(3)
```

This is much faster than GUI login for multi-user test flows.

## Key Testing Flows

### Data Input (Agent role)
1. Log in as `agent.pro@maiprop.demo`
2. Navigate to Dashboard → Data Input tab (sidebar)
3. Note the current quota (X/20) — this is the precondition
4. Fill form: Closing date, Closing price (€), Property address, City, Property type (dropdown), Transaction type
5. Click "+ Submit closing"
6. **Pass**: Form clears, quota increments by 1, new entry appears in Submission history with "Pending review" status
7. **Fail**: "Failed to send a request to the Edge Function" error = CORS issue (see CORS debugging below)

**What this tests:** The `agent-data-input` edge function RPC call via `supabase.functions.invoke()`. Both the status check (on page load) and form submission use this function.

### Listing Creation (Seller/Agent/Developer)
1. Navigate to `/listings/new`
2. Select listing type (Sale, Rent, Open House)
3. Fill wizard steps (title, beds, baths, size, location, price)
4. Submit → should see success toast
5. Verify listing appears on `/listings` page

### Messaging
1. As buyer, find a listing and click "Contact Agent"
2. Redirects to `/messages` with new conversation
3. Type and send a message
4. Switch to seller account to verify message received

### Video Viewing
1. As buyer, go to property detail page
2. Click "Video Viewing" button
3. Select date, time slot, and platform (Zoom/Google Meet/Teams/WhatsApp)
4. Submit → confirmation modal + toast: "A [platform] link will be sent 15 minutes before."
5. The video viewing flow is manual/peer-to-peer — owner must paste the meeting URL after confirming
6. Buyer sees "Join video call" link in Dashboard → Viewings tab once the owner sets the link

### Open House Registration
1. Navigate to `/open-houses` or directly to `/open-house/{listing-id}`
2. Click "Pre-register for Open House" in the right sidebar
3. Dialog opens at Step 1 with "Register" button → click it
4. Success toast: "Registration submitted. Complete ID verification and waiver to be considered."
5. Dialog advances to Step 2 (Pre-qualification) → fill mortgage/budget/agent questions
6. Click "Continue" → "Registration Submitted" confirmation with checkmark

**Duplicate registration handling (fixed in PR #52):**
- If the buyer already has a registration, clicking "Register" again catches the PostgreSQL UNIQUE constraint error (code 23505) and returns the existing registration gracefully
- The success toast still shows — no error is surfaced
- Previously this showed "Something went wrong" — now it's resilient to retries

**Known UX behavior:** The sidebar button still shows "Pre-register for Open House" even after a registration exists. It doesn't change to "Continue" or show a pending status. This means users can click it again, but the duplicate handling prevents errors.

**Cleanup for re-testing:** To reset a user's registration state for fresh testing:
```typescript
// scripts/cleanup-oh-reg.ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, anonKey);
await supabase.auth.signInWithPassword({ email: 'buyer.pro@maiprop.demo', password: 'Demo2025!' });
const { data: { user } } = await supabase.auth.getUser();
await supabase.from('open_house_registrations').delete().eq('requester_id', user.id).eq('listing_id', LISTING_ID);
```

### Quick Sale (Fire Sale)
1. Navigate to `/firesale` as a seller
2. Fill form: address, KAEK, property type, size, price, year, notes
3. **Requires min 5 photos** to enable submission — cannot skip this
4. Upload 5+ photos, then click "Get AI Estimate & Continue"

### Investor Dashboard
1. Navigate to `/investor-dashboard` as investor user
2. Should see deal pipeline, stats, filters
3. Non-investors should see "Investor Access Required" gate page (not blank)
4. The InvestorRoute has a 6-second timeout — if loading takes longer, shows retry UI

### Billing Tab Add-ons (role-gated)
1. Navigate to `/dashboard?tab=billing` after logging in
2. The visible add-on sections depend on `participant_type` in the profile:
   - `agent` → "Agency Add-ons" section (Extra Seat, Branded Profile, Dedicated Manager, White-label Domain)
   - `professional` → "Premium Tools" section (API Access, Referral Network, Extra Client Seat, Branded Email Templates)
   - `investor` / `institutional` → green "Invitation-only access" banner above the add-ons grid
3. Source: `src/pages/dashboard/BillingTab.tsx` — `ADDONS_BY_ROLE[participantType]` is keyed off `getParticipantTypeFromProfile(profile)`.

## Known Gotchas

- **Quick Sale form requires 5+ photos**: The "Get AI Estimate & Continue" button stays disabled until at least 5 photos are uploaded. There's no way to bypass this in the UI.
- **Open house registration**: The `open_house_registrations` table has a UNIQUE(listing_id, requester_id) constraint. The mutation handles duplicates gracefully (catches error code 23505). RLS policies are correct — the `oh_regs_requester` policy allows buyers to insert their own registrations.
- **Listing URL patterns**: User-created listings use `/property/{id}`, while seeded/new-build listings use `/new-build/{id}`. The listings grid links correctly based on type.
- **Investor dashboard empty state**: If there are 0 deals in the pipeline, the "Express Interest" flow cannot be tested. Deals appear only after Quick Sale requests are approved by admin.
- **Cloudflare Pages preview gate**: The branch preview deploys (`devin-XXX.maiprop-listing-site.pages.dev`) sit behind Cloudflare Access — `curl` returns a 302 to `cloudflareaccess.com`. For runtime testing, use local `npm run dev` at port 8080 or `portal.maiprop.co` with the passcode — both talk to the same production Supabase.
- **Error messages in mutations**: All `onError` handlers in `useOpenHouseAssetControl.ts` now surface actual error messages (not generic "Something went wrong"). This applies to: create registration, update registration, upsert settings, create offer, update offer, accept offer, reveal offers.
- **ONBOARDING_TEST_PASSWORD secret**: This secret may not match the demo account password (`Demo2025!`). If login fails with "Invalid email or password" when using the secret, try `Demo2025!` directly.
