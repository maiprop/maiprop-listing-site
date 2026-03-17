# Security Audit Fixes (April 2024)

## Issues Addressed

### 1. sync_log — Fake audit entries
- **Issue:** Authenticated users could INSERT fabricated audit entries.
- **Fix:** Dropped permissive `Allow sync log inserts` policy. Only service role (bypasses RLS) can insert. Edge functions use service role.

### 2. profiles — Self-grant admin via is_platform_admin
- **Issue:** UPDATE policy did not guard `is_platform_admin`; users could set it to true.
- **Fix:** Restored `is_platform_admin` guard in `profiles_guard_admin_and_role()` trigger. Only platform admin can change it.

### 3. open-house-docs — Overly broad read access
- **Issue:** All authenticated users could read any file (ID cards, passports, waivers).
- **Fix:** Replaced `Open house docs read authenticated` with policy that allows:
  - File owner (path starts with their `user_id`)
  - Listing owner (for registrations on their listings)

### 4. pricing_configs — Unrestricted writes
- **Issue:** Any authenticated user could INSERT/UPDATE/DELETE pricing and Stripe IDs.
- **Fix:** Dropped any permissive policies. Only `has_platform_admin(auth.uid())` can write.

### 5. cron_config — No RLS
- **Issue:** Table exposed project URL and anon key to anonymous users.
- **Fix:** Enable RLS; policy restricts ALL to platform admin only. Service role bypasses RLS for cron jobs.

### 6. Google Maps API key in listings
- **Issue:** `poll-os-auctions` and `full-sync-from-os` embedded the key in `cover_image_url` stored in public listings.
- **Fix:** Both functions now store `streetview-proxy` URL instead (`?lat=&lng=`). MapView fallback uses `getStreetViewProxyUrl()`.

## Migration

Run: `supabase db push`

Migration file: `20260419120000_security_audit_fixes.sql`

## Code Changes

- `supabase/functions/poll-os-auctions/index.ts` — Use proxy URL
- `supabase/functions/full-sync-from-os/index.ts` — Use proxy URL  
- `src/components/MapView.tsx` — Use `getStreetViewProxyUrl()` for fallback
