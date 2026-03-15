# Saved Search Alerts Setup

The `send-saved-search-alerts` edge function sends emails when new listings match a user's saved search.

## 1. Environment variables

Set in Supabase Dashboard → Edge Functions → Secrets (or project Settings):

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes (for email) | Resend API key from [resend.com](https://resend.com) |
| `RESEND_FROM_EMAIL` | No | Sender email (default: `alerts@maiprop.co`). Must be a verified domain in Resend. |
| `MAIPROP_APP_URL` | No | Base URL for listing links (default: `https://maiprop-listing-site.lovable.app`) |

Without `RESEND_API_KEY`, the function runs but only logs; no emails are sent.

## 2. Deploy the function

```bash
supabase functions deploy send-saved-search-alerts
```

## 3. Schedule with pg_cron

Run every 6 hours:

```sql
SELECT cron.schedule(
  'send-saved-search-alerts',
  '0 */6 * * *',  -- every 6 hours
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-saved-search-alerts',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY` with your Supabase project ref and anon key. For production, use a service role key in a secure secret; the anon key works if RLS allows the function to read `saved_searches` and `listings`.

## 4. Manual run

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-saved-search-alerts" \
  -H "Authorization: Bearer YOUR_ANON_OR_SERVICE_KEY"
```

## Behaviour

- Fetches all `saved_searches` where `email_alerts = true`
- For each, runs a listings query using the stored filters (city, listing_type, price, etc.)
- Compares current result IDs to `last_alert_listing_ids`
- If new matches: sends email via Resend, updates `last_alert_sent_at` and `last_alert_listing_ids`
- First run for a search: sends all current matches
