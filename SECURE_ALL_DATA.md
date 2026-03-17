# How to secure all data

**Done in the repo (code + migrations):** RLS policies, critical security migration, edge function auth (os-diagnose agent-only; fetch-report-from-os and listing-ai-assist require authenticated user).  
**You must do (your Supabase project only):** Run the SQL migrations once, enable breach detection, and set the webhook secret. Details below.

---

## 1. Apply security migrations (database)

Run these in **Supabase Dashboard → SQL Editor**, or run `npm run db:push` (or `supabase db push`) if the Supabase CLI is installed and linked.

| Order | File | Purpose |
|-------|------|--------|
| 1 | `supabase/migrations/20260320120000_fix_critical_security_issues.sql` | Profiles PII, investor self-upgrade, consultation impersonation |
| 2 | `supabase/migrations/20260319120000_security_fixes.sql` | If not already applied: profiles view, sync_log, firesale storage, professionals tier guard |
| 3 | (optional) `supabase/migrations/20260320130000_extensions_schema_optional.sql` | Move pg_net out of public schema |

After this:

- **Profiles:** Only own profile (and agents) can read full row; others use `profiles_public` (no phone).
- **Investor subscriptions:** Only admins/service_role can insert/update; users can only SELECT own row.
- **Consultation requests:** `requester_id` must be NULL or `auth.uid()`.
- **Sync log:** Only service role (edge functions) can insert.
- **Firesale photos:** Only authenticated users can upload.

---

## 2. Database: RLS on every table

Ensure **Row Level Security (RLS) is enabled** on all tables that hold user or sensitive data. This repo already enables RLS on:

- `profiles`, `listings`, `listing_images`, `favorites`, `conversations`, `messages`, `viewings`
- `professionals`, `professional_services`, `professional_availability`
- `firesale_requests`, `consultation_requests`, `auction_alerts`, `saved_searches`
- `investor_subscriptions`, `sync_log`, `pricing_configs`, `user_roles`

**What you should do:**

- In Dashboard → **Database → Tables**, open each table and confirm **RLS** is **Enabled**.
- If you add new tables later, add RLS and policies in a migration before going to production.

---

## 3. Sensitive data: where it lives and who can see it

| Data | Who can read | Who can write | How it’s enforced |
|------|----------------|----------------|-------------------|
| **Phone, full PII in profiles** | Only owner + agents | Only owner (own row) | RLS on `profiles`; app uses `profiles_public` for others |
| **Listings** | Public (active); owner (all) | Owner (own), agents | RLS policies |
| **Messages / conversations** | Participants only | Participants | RLS by `sender_id` / conversation membership |
| **Firesale requests** | Owner, pros (by professional_id) | Anyone (INSERT with `user_id` check) | RLS + INSERT policy |
| **Investor subscriptions** | Owner (own), agents (all) | Admins only; Stripe via service_role | RLS; no user UPDATE/INSERT |
| **Consultation requests** | Requester, professional | Anyone (INSERT with `requester_id` check) | RLS + INSERT policy |
| **Sync log** | Read by app/agents as needed | Service role only | No client INSERT policy |
| **Pricing configs** | Public read | Agents only | RLS (agent-only write) |

No sensitive data (passwords, tokens, full PII) should be in client-visible tables without RLS restricting it to the owning user or admin.

---

## 4. Auth: protect accounts and passwords

- **Breach detection:** Dashboard → **Authentication** → **Providers** → **Email** → enable **“Breach detection”** (or equivalent) so leaked passwords are rejected at sign-up and password reset.
- **JWT:** App uses Supabase Auth; edge functions that need the current user require the **Authorization: Bearer &lt;JWT&gt;** header and validate it (e.g. `getUser(token)`).
- **Roles:** Admin/agent actions (sync, pricing, subscriptions) are gated by `profiles.role` (e.g. `has_role(auth.uid(), 'agent')`) in RLS and in edge functions (`requireAgent`).

---

## 5. Edge functions: who can call what

| Function | Auth | Notes |
|----------|------|--------|
| **sync-to-os**, **sync-firesale-to-os**, **poll-os-auctions**, **full-sync-from-os**, **os-diagnose** | **Agent only** (JWT + role check) | Require `requireAgent()`; no public access |
| **check-subscription**, **create-checkout**, **customer-portal** | **Authenticated user** (JWT) | Use `Authorization` Bearer; no anon access |
| **receive-from-os** | **Webhook secret** (`x-os-signature`) | Set `MAIPROP_OS_WEBHOOK_SECRET` in secrets |
| **streetview-proxy** | None (public) | Only proxies Street View; API key stays server-side |
| **AI / Lovable gateway** (e.g. listing-ai-assist, property-valuation, ai-search, etc.) | Typically **JWT** or **gateway key** | Keys in env; not exposed to client |

**What you should do:**

- Ensure any function that reads/writes user or admin data requires JWT (and agent role when appropriate).
- In **Supabase Dashboard → Edge Functions**, confirm **Secrets** are set (no keys in code): e.g. `MAIPROP_OS_URL`, `MAIPROP_OS_EMAIL`, `MAIPROP_OS_PASSWORD`, `MAIPROP_OS_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`, etc.

---

## 6. Storage

- **Listing images / avatars:** Policies in migrations allow appropriate SELECT/INSERT/UPDATE/DELETE (e.g. by owner or authenticated).
- **Firesale photos:** Only **authenticated** users can INSERT; no “anyone can upload” policy.

If you add new buckets, add RLS-compatible storage policies so only intended roles can read/write.

---

## 7. App code: keep PII and secrets out of the client

- **Other users’ data:** Use **`profiles_public`** (or equivalent views) for display name, avatar, etc. Do **not** select from `profiles` for other users (that would expose phone etc. if RLS were misconfigured).
- **Secrets:** No API keys, OS passwords, or Stripe secret keys in frontend code or in repo. Use Supabase secrets / env for edge functions and backend.
- **Supabase client:** Use the **anon key** in the browser; RLS and edge function auth enforce access. Never use the **service_role** key in the client.

---

## 8. Checklist summary

**Already done in this repo:**
- [x] Critical migration file: `20260320120000_fix_critical_security_issues.sql` (profiles PII, investor subscriptions, consultation).
- [x] Security fixes migration: `20260319120000_security_fixes.sql` (profiles view, sync_log, firesale storage, professionals tier guard).
- [x] RLS enabled and policies on all main tables (via migrations).
- [x] Edge functions: sync/sync-firesale/poll/full-sync/os-diagnose require **agent**; check-subscription, create-checkout, customer-portal require **user JWT**; fetch-report-from-os and listing-ai-assist (non-ping) require **authenticated user**; receive-from-os validates webhook signature when secret is set.
- [x] App uses `profiles_public` for other users; `profiles` only for current user (AuthContext, Onboarding).
- [x] Optional extension migration: `20260320130000_extensions_schema_optional.sql` (pg_net only).

**You must do (cannot be done from this repo):**
- [ ] **Run the migrations** in your Supabase project (SQL Editor: paste and run the two main migration files, or run `npm run db:push` if CLI is linked).
- [ ] **Enable Breach detection** in Dashboard → Authentication → Providers → Email.
- [ ] **Set MAIPROP_OS_WEBHOOK_SECRET** in Dashboard → Edge Functions → Secrets (if you use OS webhooks).
- [ ] Confirm all other secrets are set (MAIPROP_OS_*, LOVABLE_API_KEY, STRIPE_SECRET_KEY, GOOGLE_MAPS_API_KEY, etc.).

After you run the SQL and toggle the Dashboard options, data access is restricted by RLS, auth, and role checks; credentials and PII are not exposed to the client.
