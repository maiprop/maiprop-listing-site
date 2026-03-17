# Saved Search Alerts Setup

The saved search alerts run via `pg_cron` every 6 hours to email users when new listings match their saved searches.

## Prerequisites

1. **Extensions** (enable in Supabase Dashboard > Database > Extensions):
   - `pg_cron`
   - `pg_net`
   - `vault` (usually enabled by default)

2. **Edge Function environment** (Dashboard > Project Settings > Edge Functions):
   - `RESEND_API_KEY` – for sending emails via Resend
   - `MAIPROP_APP_URL` – e.g. `https://maiprop-listing-site.lovable.app`
   - `RESEND_FROM_EMAIL` – optional, defaults to `alerts@maiprop.co`

## Configure Vault Secrets

Run this in the SQL Editor (replace with your **anon key** from Project Settings > API):

```sql
SELECT vault.create_secret(
  'https://jglqlaynezspefoovqyc.supabase.co',
  'saved_search_alerts_project_url'
);

SELECT vault.create_secret(
  'YOUR_SUPABASE_ANON_KEY_HERE',
  'saved_search_alerts_anon_key'
);
```

The cron job reads these secrets and invokes the `send-saved-search-alerts` Edge Function every 6 hours. If vault secrets are not set, the job runs but does nothing until they are configured.

## Alternative: External Cron

If you prefer not to use pg_cron, you can trigger the function from an external scheduler (e.g. cron-job.org, GitHub Actions):

```bash
curl -X POST "https://jglqlaynezspefoovqyc.supabase.co/functions/v1/send-saved-search-alerts" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

Schedule this to run every 6 hours (e.g. `0 */6 * * *`).
