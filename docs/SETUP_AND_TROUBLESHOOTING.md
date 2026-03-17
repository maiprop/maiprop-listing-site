# Setup & troubleshooting (Lovable + Supabase)

If you've set all secrets in Lovable but **auction poll / full sync still fail** ("Failed to send a request to the Edge Function"), work through this checklist.

---

## 1. One Supabase project

Your **frontend** and your **Edge Functions** must use the **same** Supabase project.

- The app connects using **SUPABASE_URL** and **SUPABASE_ANON_KEY** (or `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` if your host injects those).
- Edge Functions run **inside that project** and need to be **deployed** there.

So: one project in [app.supabase.com](https://app.supabase.com). All secrets and deployments refer to that project.

---

## 2. Frontend: correct URL and anon key

The app expects:

- **VITE_SUPABASE_URL** = Project URL (e.g. `https://xxxxx.supabase.co`)
- **VITE_SUPABASE_PUBLISHABLE_KEY** = anon (public) key

In **Lovable → Update Secrets** you may have:

- **SUPABASE_URL** and **SUPABASE_ANON_KEY**

Some setups map these into the build as `VITE_SUPABASE_*`. If your build does **not** expose them with the `VITE_` prefix, the app can load but all Supabase calls (and thus Edge Function invokes) will fail. If in doubt, add **VITE_SUPABASE_URL** and **VITE_SUPABASE_PUBLISHABLE_KEY** with the same values as Project URL and anon key from Supabase Dashboard → Settings → API.

---

## 3. Edge Functions must be deployed

The functions (`poll-os-auctions`, `full-sync-from-os`, etc.) are **code in the repo**. They only run after they are **deployed** to your Supabase project.

**Check:**

1. Go to [app.supabase.com](https://app.supabase.com) → your project.
2. Left sidebar → **Edge Functions**.
3. See if **poll-os-auctions** and **full-sync-from-os** appear in the list.

- **If they are not there** → they are not deployed. The browser will get "Failed to send a request to the Edge Function" when you run poll or full sync.

**Deploy (Supabase CLI):**

```bash
# Install Supabase CLI if needed: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy poll-os-auctions
supabase functions deploy full-sync-from-os
```

Replace `YOUR_PROJECT_REF` with the ref from your Project URL (e.g. from `https://abcdefgh.supabase.co` the ref is `abcdefgh`).

If you deploy via **Lovable** or another CI/CD, ensure that step actually runs `supabase functions deploy` for these functions.

---

## 4. Edge Function secrets (in Supabase)

Edge Functions run on **Supabase’s servers** and read **Supabase’s** secrets, not only Lovable’s.

**Set in Supabase:**

1. [app.supabase.com](https://app.supabase.com) → your project.
2. **Project Settings** (gear) → **Edge Functions** (or **Secrets**).
3. Add:

| Secret                      | Value |
|----------------------------|--------|
| **SUPABASE_URL**           | Same as Project URL (e.g. `https://xxxxx.supabase.co`) |
| **SUPABASE_SERVICE_ROLE_KEY** | service_role key from Settings → API |
| **MAIPROP_OS_URL**         | `https://app.os.maiprop.co:8080` |
| **MAIPROP_OS_EMAIL**       | Your maiProp OS login email |
| **MAIPROP_OS_PASSWORD**    | Your maiProp OS login password |

Lovable may sync some of these from "Update Secrets" into the linked Supabase project; if poll/full sync still fail, confirm these exist **in Supabase** and have the correct values.

---

## 5. Quick verification

1. **Supabase DB**  
   In the app, open the **Admin** panel. If "Supabase DB" check is **OK**, the frontend is using the right project and anon key.

2. **Edge Functions**  
   If "Supabase DB" is OK but **Poll** or **Full sync** still fail with "Failed to send a request to the Edge Function", the most likely cause is **functions not deployed** (step 3). Deploy `poll-os-auctions` and `full-sync-from-os` to the same project and try again.

3. **OS API**  
   After the functions are deployed and reachable, "maiProp OS API" and poll/full sync can still fail if **MAIPROP_OS_*** secrets are missing or wrong in Supabase (step 4).

---

## Summary

| Issue | What to do |
|-------|------------|
| "Failed to send a request to the Edge Function" | Deploy Edge Functions to your Supabase project (Dashboard → Edge Functions; or CLI `supabase functions deploy`). Ensure the app’s Supabase URL points to that project. |
| App never loads / "Missing Supabase configuration" | Set **VITE_SUPABASE_URL** and **VITE_SUPABASE_PUBLISHABLE_KEY** (or your host’s equivalent) to Project URL and anon key. |
| Poll/sync return "skipped" or OS errors | Set **MAIPROP_OS_URL**, **MAIPROP_OS_EMAIL**, **MAIPROP_OS_PASSWORD** in **Supabase** Edge Function secrets. |
