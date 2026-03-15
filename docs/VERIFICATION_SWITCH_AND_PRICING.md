# Verification: User Switching & Pricing Enforcement

## 1. Switching participant type

### Flow
1. **Settings → Switch Participant Type** (Dashboard)
2. `handleSwitchRole` clears `bio` only: `onUpdate({ bio: null })`
3. User is redirected to `/onboarding`
4. Onboarding: user picks a type → `updateProfile({ role: p.role })` + `supabase.from("profiles").update({ bio: __type:${p.id} })`

### Enforcement layers

| Layer | What it does |
|-------|--------------|
| **RLS** (20260311232309) | `WITH CHECK (role = (SELECT role FROM profiles WHERE user_id = auth.uid()))` — any `role` change is rejected |
| **Trigger** (20260326120000) | `profiles_guard_admin_and_role` — reverts `role` to `agent`/`professional` unless `has_platform_admin(auth.uid())` |
| **Trigger** (20260326120000) | Blocks `is_platform_admin` changes unless caller is platform admin |

### Result
- **Role cannot change** via normal profile updates (RLS).
- **`bio` can change** (participant-type label) as long as `role` stays the same.
- **Valid switches** (same DB role): `agent ↔ developer ↔ institutional`, `buyer ↔ investor`, `seller` only.
- **Escalation blocked**: `individual` → `agent`/`professional`/`seller_landlord` is blocked. Only platform admin can set these roles.

### Edge case: first-time onboarding
- New users get `role = 'individual'` from `handle_new_user`.
- Selecting "seller" or "agent" in onboarding tries `updateProfile({ role: 'seller_landlord' })` or `role: 'agent'`.
- RLS blocks this (role must stay `individual`).
- Agent/professional/seller_landlord can only be set by: (a) `auto_grant_owner_privileges` trigger (owner emails), or (b) platform admin.

---

## 2. Pricing updates

### Flow
1. **Admin pricing page**: `/admin/pricing`
2. Actions: Save (upsert), Delete, Seed default

### Enforcement layers

| Layer | What it does |
|-------|--------------|
| **AdminRoute** | Redirects to `/dashboard` if `!profile?.is_platform_admin` |
| **AdminPricing** | Renders "Access restricted" if `!isAdmin` (backup) |
| **RLS** (20260326120000) | `pricing_configs` INSERT/UPDATE/DELETE require `has_platform_admin(auth.uid())` |
| **RLS** (20260316100000) | `pricing_configs` SELECT: `USING (true)` — anyone can read |

### Result
- **UI**: Only platform admin can reach the page (AdminRoute).
- **DB**: Only platform admin can upsert/delete `pricing_configs`. Direct API calls with a non-admin JWT fail RLS.
- **Read**: Public; used by FiresalePricing, Pricing, etc.

### Bypass attempts
- Non-admin opening `/admin/pricing` → AdminRoute redirects.
- Non-admin calling `supabase.from("pricing_configs").upsert(...)` from console → RLS rejects (not `has_platform_admin`).

---

## 3. Summary

| Check | Status |
|-------|--------|
| Participant switch cannot escalate role | ✅ RLS + trigger |
| Only platform admin can change `agent`/`professional` | ✅ Trigger |
| Admin nav only for `is_platform_admin` | ✅ Frontend |
| Pricing updates only by platform admin | ✅ AdminRoute + RLS |
| Pricing reads remain public | ✅ SELECT `USING (true)` |
