# One-by-one: what to copy and where

**If you don’t have Supabase access and everything runs through Lovable,** use **[LOVABLE_ONLY_INSTRUCTIONS.md](./LOVABLE_ONLY_INSTRUCTIONS.md)** instead of this file.

---

Do these in order. Use **Supabase Dashboard** in your browser.

---

## Step 1 — Critical security migration (required)

1. **Open:** Your project at [supabase.com/dashboard](https://supabase.com/dashboard) → select your project.
2. **Go to:** Left sidebar → **SQL Editor**.
3. **Click:** **New query** (or the + button).
4. **Copy from:** In this repo, open the file  
   `supabase/migrations/20260320120000_fix_critical_security_issues.sql`  
   Select **all** (Ctrl+A / Cmd+A) and copy (Ctrl+C / Cmd+C).
5. **Paste into:** The big SQL Editor text area in the Supabase SQL Editor.
6. **Click:** **Run** (or Ctrl+Enter).
7. **Check:** At the bottom it should say “Success” (and show how many statements ran). If you see an error, read the message; it may mean a policy name is different—you can note it and continue or fix.

---

## Step 2 — Security fixes migration (required if not already applied)

1. **Stay in:** Supabase Dashboard → **SQL Editor**.
2. **Click:** **New query** again (start a fresh query).
3. **Copy from:** In this repo, open the file  
   `supabase/migrations/20260319120000_security_fixes.sql`  
   Select **all** and copy.
4. **Paste into:** The new SQL Editor text area.
5. **Click:** **Run**.
6. **Check:** “Success” at the bottom. If you see “policy does not exist” or “already exists”, that’s often fine (idempotent); the rest should still apply.

---

## Step 3 — Optional: move pg_net out of public schema

1. **Stay in:** SQL Editor.
2. **Click:** **New query**.
3. **Copy from:** In this repo, open the file  
   `supabase/migrations/20260320130000_extensions_schema_optional.sql`  
   Select **all** and copy.
4. **Paste into:** The SQL Editor.
5. **Click:** **Run**.
6. **Check:** “Success” or a notice about pg_net is OK. If it errors (e.g. permissions), you can skip this step; the app will still work.

---

## Step 4 — Enable breach detection (Dashboard only)

1. **In Supabase Dashboard:** Left sidebar → **Authentication**.
2. **Click:** **Providers** (or **Auth** → **Providers**).
3. **Click:** **Email** (the email provider row).
4. **Find:** The option like **“Breach detection”** or **“Check passwords against breach databases”**.
5. **Turn it:** **On** / **Enable**.
6. **Save** if there’s a Save button.

---

## Step 5 — Set webhook secret (only if you use OS webhooks)

1. **In Supabase Dashboard:** Left sidebar → **Edge Functions** (or **Project Settings** → **Edge Functions**).
2. **Open:** **Secrets** (or the place where you manage function secrets).
3. **Add or edit:** Name = `MAIPROP_OS_WEBHOOK_SECRET`, Value = the secret string your maiProp OS uses to sign webhooks (you must get this from the OS side or generate one and set the same value there).
4. **Save.**

---

## Step 6 — Confirm other secrets (no copy/paste, just check)

1. **In Supabase Dashboard:** **Edge Functions** → **Secrets** (or **Project Settings** → **API** / **Secrets**).
2. **Check** that these exist if your app uses them:  
   `MAIPROP_OS_URL`, `MAIPROP_OS_EMAIL`, `MAIPROP_OS_PASSWORD`, `LOVABLE_API_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`.  
3. **Add** any that are missing (name + value); get values from your env or team.

---

## Quick reference

| Step | Where to copy from (file in repo)              | Where to paste / do                    |
|------|------------------------------------------------|----------------------------------------|
| 1    | `supabase/migrations/20260320120000_fix_critical_security_issues.sql` | SQL Editor → New query → Run           |
| 2    | `supabase/migrations/20260319120000_security_fixes.sql`               | SQL Editor → New query → Run           |
| 3    | `supabase/migrations/20260320130000_extensions_schema_optional.sql`   | SQL Editor → New query → Run (optional)|
| 4    | —                                             | Authentication → Providers → Email → Breach detection On |
| 5    | —                                             | Edge Functions → Secrets → Add `MAIPROP_OS_WEBHOOK_SECRET` (if needed) |
| 6    | —                                             | Edge Functions → Secrets → Confirm/add other secrets |

After Step 1 and 2 (and 4), your critical security fixes are applied. Steps 3, 5, and 6 are optional or as-needed.
