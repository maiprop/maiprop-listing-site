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

### Messaging
1. As buyer, find a listing and click "Contact Agent"
2. Redirects to `/messages` with new conversation
3. Type and send a message
4. Switch to seller account to verify message received

### Video Viewing
1. As buyer, go to property detail page
2. Click "Video Viewing" button
3. Select date, time slot, and platform
4. Submit → confirmation modal + toast

### Open House Registration
1. Navigate to `/open-houses`
2. Find an open house listing
3. Click into detail, then "Register"
4. Fill pre-registration form
5. **Known issue**: Registration may fail with "Something went wrong" — likely RLS policy issue on `open_house_registrations` table. Check Supabase RLS policies if this persists.

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

## Known Gotchas

- **Quick Sale form requires 5+ photos**: The "Get AI Estimate & Continue" button stays disabled until at least 5 photos are uploaded. There's no way to bypass this in the UI.
- **Open house registration RLS**: The `open_house_registrations` table may have RLS policies that prevent inserts from certain roles. If registration fails, check Supabase dashboard → Authentication → Policies.
- **Listing URL patterns**: User-created listings use `/property/{id}`, while seeded/new-build listings use `/new-build/{id}`. The listings grid links correctly based on type.
- **Investor dashboard empty state**: If there are 0 deals in the pipeline, the "Express Interest" flow cannot be tested. Deals appear only after Quick Sale requests are approved by admin.
- **UTF-8 encoding**: Previously had mojibake issues (â„¢ instead of ™). Fixed in PR #38 across 2924 instances. If new mojibake appears, check if source files are saved as UTF-8.
- **Port conflicts**: If the dev server starts on a different port (e.g., 8081), kill existing processes on 8080 first.
- **portal.maiprop.co vs localhost**: The live site has a "Private preview" passcode gate. For testing, localhost is preferred as it doesn't require the gate password and connects to the same Supabase backend.
