# Security steps when everything runs through Lovable (no Supabase access)

You don’t have Supabase Dashboard access; Lovable manages the backend. Do the following **in Lovable** (chat + project settings).

---

## Step 1 — Apply the critical security migration (required)

The migration is already in your repo:  
`supabase/migrations/20260320120000_fix_critical_security_issues.sql`

**In Lovable chat**, run **one** of these (depending on what Lovable supports):

- **Option A:**  
  `Apply pending Supabase migrations`

- **Option B:**  
  `Run the security migration: apply the SQL in supabase/migrations/20260320120000_fix_critical_security_issues.sql to the database`

- **Option C:**  
  If Lovable has a “Run SQL” or “Database” action: open that, then paste the **entire contents** of `supabase/migrations/20260320120000_fix_critical_security_issues.sql` and run it.

Confirm in chat that the migration ran successfully (no errors).

---

## Step 2 — Apply the security fixes migration (required if not already applied)

Same idea as Step 1, for the second file:  
`supabase/migrations/20260319120000_security_fixes.sql`

**In Lovable chat:**

- **Option A:**  
  After Step 1, say:  
  `Apply the SQL in supabase/migrations/20260319120000_security_fixes.sql`

- **Option B:**  
  If there’s a “Run SQL” / database runner: paste the **entire contents** of `supabase/migrations/20260319120000_security_fixes.sql` and run it.

Again, confirm success. If Lovable says something like “policy already exists”, that’s usually fine.

---

## Step 3 — Optional: extensions migration

Only if you want to address the “extension in public” warning.

**In Lovable chat:**  
`Apply the SQL in supabase/migrations/20260320130000_extensions_schema_optional.sql`

Or paste that file’s full contents into Lovable’s SQL runner and run. If it errors, you can skip this step.

---

## Step 4 — Enable leaked password protection (breach detection)

You do this in **Lovable’s UI**, not in Supabase.

1. In your **Lovable project**, open **Cloud** (or **Backend** / **Settings**).
2. Go to **Users** → **Auth settings** (or **Authentication** / **Auth**).
3. Open **Email** (email provider).
4. Find **“Password HIBP Check”** or **“Leaked password protection”** / **“Breach detection”**.
5. Turn it **On** and save.

Reference: [Lovable Security docs](https://docs.lovable.dev/features/security) — “Using Lovable Cloud: Enable **Password HIBP Check** in **Cloud → Users → Auth settings → Email**”.

---

## Step 5 — Set secrets (webhook + others)

Lovable stores backend secrets in **project settings**, not in Supabase Dashboard.

1. In Lovable, open **Project settings** (gear icon or **Settings**).
2. Find **Secrets**, **Environment variables**, or **Edge Functions → Secrets** (wording may vary).
3. **If you use OS webhooks:** add:
   - Name: `MAIPROP_OS_WEBHOOK_SECRET`  
   - Value: the secret your maiProp OS uses to sign webhooks (same value as on the OS side).
4. **Confirm** these exist if your app uses them:  
   `MAIPROP_OS_URL`, `MAIPROP_OS_EMAIL`, `MAIPROP_OS_PASSWORD`, `LOVABLE_API_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`.  
   Add any that are missing (name + value).

---

## Step 6 — Deploy so migrations and code are live

1. **Push** your repo (with the migration files and any code changes) so Lovable has the latest.
2. In Lovable, **publish/deploy** the app (e.g. **Share → Publish** or **Deploy**) so the backend (and any applied migrations) is what you expect.

---

## Quick reference (Lovable only)

| Step | What to do | Where |
|------|------------|--------|
| 1 | Apply `20260320120000_fix_critical_security_issues.sql` | Lovable chat: “Apply pending Supabase migrations” or “Run SQL in … fix_critical_security_issues.sql” |
| 2 | Apply `20260319120000_security_fixes.sql` | Lovable chat: “Apply … security_fixes.sql” or paste SQL and run |
| 3 | (Optional) Apply `20260320130000_extensions_schema_optional.sql` | Lovable chat or SQL runner |
| 4 | Enable breach detection | **Cloud → Users → Auth settings → Email** → Password HIBP Check **On** |
| 5 | Set webhook + other secrets | **Project settings → Secrets** (or Environment / Edge Function secrets) |
| 6 | Deploy | Push repo + **Publish / Deploy** in Lovable |

---

## If Lovable doesn’t run your migration files

If there’s no way in Lovable to “apply migrations” or “run SQL” from the repo:

1. Ask in Lovable chat:  
   `How do I run SQL migrations or run custom SQL on the project’s database?`
2. If Lovable gives you a link or flow to run SQL, use that and paste the contents of the two migration files (Steps 1 and 2) one by one.
3. If Lovable says only they can run SQL, request that they apply the two security migrations from your repo (give the file paths above).

The migration files are already in your repo; the only thing that must happen is for that SQL to be executed once on the database Lovable uses for your project. Steps 4 and 5 are done entirely in Lovable’s Cloud and project settings.
