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

- `SUPABASE_ACCESS_TOKEN` — Required for Supabase Management API queries (DB state verification, migration status checks). Get from Supabase dashboard → Account → Access Tokens.
- `SUPABASE_SERVICE_ROLE_KEY` — Required for admin-level DB operations (user creation, profile updates). This is the `service_role` JWT from Supabase dashboard (Settings → API).
- `SITE_LOCK_PASSWORD` — Required to access portal.maiprop.co (private preview gate). Not needed for localhost testing.

## Test Accounts

All demo accounts use:
- **Password**: `Demo2025!`
- **Email domain**: `@maiprop.demo`

| Account | Email | Role | Pro? |
|---------|-------|------|------|
| Seller Pro | seller.pro@maiprop.demo | seller | Yes (force_pro_access) |
| Seller Free | seller.free@maiprop.demo | seller | No |
| Buyer Pro | buyer.pro@maiprop.demo | buyer | Yes (force_pro_access) |
| Buyer Free | buyer.free@maiprop.demo | buyer | No |
| Investor Private | investor.private@maiprop.demo | investor (private) | Yes |
| Agent Pro | agent.pro@maiprop.demo | agent | Yes |
| Developer Pro | developer.pro@maiprop.demo | developer | Yes |
| Professional (Architect) | professional1@maiprop.demo | professional | Yes |
| Professional (Lawyer) | professional2@maiprop.demo | professional | Yes |
| Professional (Valuer) | professional3@maiprop.demo | professional | Yes |

The three professional accounts are seeded by `scripts/seed-mock-professionals.ts` and are needed for any flow gated by `participant_type === "professional"` (e.g., the "Premium Tools" section on the Billing tab).

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

### Listing Creation (Seller/Agent/Developer)
1. Navigate to `/listings/new`
2. Select listing type (Sale, Rent, Open House)
3. Fill wizard steps (title, beds, baths, size, location, price)
4. Submit → should see success toast
5. Verify listing appears on `/listings` page

### Data Input (Agent only)
1. Log in as `agent.pro@maiprop.demo`
2. Navigate to Dashboard → "Data Input" tab in sidebar
3. Form shows: Closing date, Closing price (€), Property address, City, Postal code, Property type (dropdown), Transaction type, KAEK, Buyer/Seller names, Notes
4. Quota display shows "X / 20" submissions this month, verified closings count, and earned credit percentage
5. Warning banner: "All submissions are continuously verified..."
6. **Limitation**: Submission calls the `agent-data-input` edge function via `supabase.functions.invoke()`. This works on production/Cloudflare preview but **fails on localhost** with "Failed to send a request to the Edge Function". The form UI and validation can still be tested locally.
7. The `agent_data_inputs` table has a `closing_date` constraint — after PR #117 merges, this becomes an INSERT-only trigger instead of a table-level CHECK (allows admin UPDATEs without date drift failures).

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

## Testing Backend-Only PRs (Migrations, Edge Functions, Env Vars)

For PRs that only change migrations, edge functions, or environment config (no UI components), use this approach:

### 1. Automated Test Suites
```bash
npm test                    # Vitest — 89 files, 1254+ tests
npm run lint                # ESLint
npm run typecheck           # TypeScript strict checks (if available)

# Deno edge function tests (from supabase/functions/)
export PATH="$HOME/.deno/bin:$PATH"
cd supabase/functions && deno test --allow-env --allow-net --allow-read .
```

### 2. DB State Verification via Supabase Management API
Query production DB without deploying migrations:
```bash
# Check RLS policies
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tablename, policyname FROM pg_policies WHERE schemaname = '\''public'\'' ORDER BY tablename;"}' | python3 -m json.tool

# Check constraints on a table
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT conname, contype FROM pg_constraint WHERE conrelid = '\''public.TABLE_NAME'\''::regclass;"}' | python3 -m json.tool

# Check if specific migrations have been applied
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;"}' | python3 -m json.tool
```

### 3. Migration Verification Checklist
- Verify migrations in `scripts/applied-future-migrations.json` match what's in `schema_migrations`
- Confirm reverted migrations have no unintended changes (check `git diff`)
- For conditional migrations (CI vs production), verify the `information_schema.tables` detection pattern works
- CI's "Validate Supabase Migrations" check confirms fresh-DB replay is correct

### 4. Edge Function Testing Limitations
- Edge functions with `verify_jwt = false` can be curled directly against production
- Edge functions invoked via `supabase.functions.invoke()` from the frontend **fail on localhost** — the function URL resolves to the project's edge function endpoint which may not have the PR's changes deployed
- Stripe webhook functions require valid HMAC signatures — can only be tested via Deno unit tests or Stripe CLI's test webhook feature
- The Deno test suite mocks Supabase and Stripe clients, so it covers logic without needing real API access

## Known Gotchas

- **Quick Sale form requires 5+ photos**: The "Get AI Estimate & Continue" button stays disabled until at least 5 photos are uploaded. There's no way to bypass this in the UI.
- **Open house registration**: The `open_house_registrations` table has a UNIQUE(listing_id, requester_id) constraint. The mutation handles duplicates gracefully (catches error code 23505). RLS policies are correct — the `oh_regs_requester` policy allows buyers to insert their own registrations.
- **Listing URL patterns**: User-created listings use `/property/{id}`, while seeded/new-build listings use `/new-build/{id}`. The listings grid links correctly based on type.
- **Investor dashboard empty state**: If there are 0 deals in the pipeline, the "Express Interest" flow cannot be tested. Deals appear only after Quick Sale requests are approved by admin.
- **Cloudflare Pages preview gate**: The branch preview deploys (`devin-XXX.maiprop-listing-site.pages.dev`) sit behind Cloudflare Access — `curl` returns a 302 to `cloudflareaccess.com`. For runtime testing, use local `npm run dev` at port 8080 (it talks to the same production Supabase the preview uses).
- **Error messages in mutations**: All `onError` handlers in `useOpenHouseAssetControl.ts` now surface actual error messages (not generic "Something went wrong"). This applies to: create registration, update registration, upsert settings, create offer, update offer, accept offer, reveal offers.
- **`lsof` not available**: The `lsof` command might not be installed on some Devin VMs. Use `fuser 8080/tcp` or `ss -tlnp | grep 8080` as alternatives to check port usage.
- **Cookie consent banner**: On first load, a cookie consent banner appears at the bottom of the page. Click "Accept all" to dismiss it before interacting with the login form or other UI elements.
- **SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY swap**: The org secrets might have these two values swapped. If admin queries fail with the service role key, try using the anon key value instead (and vice versa). Check by decoding the JWT — `service_role` JWTs have `"role": "service_role"` in the payload.
