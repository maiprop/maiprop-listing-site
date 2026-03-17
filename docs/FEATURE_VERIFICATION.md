# Feature Verification — Backend & UX

Verification of Analytics, Contacts CRM, Saved Search Alerts, and Messages improvements.

---

## 1. Backend Connections

### Analytics

| Component | Backend | Table/API | Status |
|-----------|---------|-----------|--------|
| View trends | Supabase | `listing_view_events` | ✅ Hooks read; `useListing` inserts on property view |
| Lead funnel | Supabase | `consultation_requests` | ✅ `useLeadFunnel(professionalId)` aggregates by status |
| Conversion rate | Derived | `confirmed / total` | ✅ Computed in hook |

- **listing_view_events**: Inserted from `useListings.ts` when a user views a property.
- **useListingViewTrends**: Queries `listing_view_events` for given listing IDs, groups by date.

### Contacts CRM

| Component | Backend | Table | Status |
|-----------|---------|-------|--------|
| Contacts CRUD | Supabase | `contacts` | ✅ useContacts, useCreateContact, useUpdateContact, useDeleteContact |
| Deal stages | Supabase | `contacts.deal_stage` | ✅ Migration adds column; form + pipeline update |
| Follow-ups | Supabase | `contacts.follow_up_at` | ✅ Migration adds column; form persists |
| Tasks | Supabase | `contact_tasks` | ✅ useContactTasks, useCreateContactTask, useUpdateContactTask |
| Listing link | Supabase | `contacts.listings` join | ✅ Select includes `listings(id, title, city)` via `listing_id` FK |

- Migration `20260329000000` adds `deal_stage`, `follow_up_at`, `listing_id` to `contacts` and creates `contact_tasks`.

### Saved Search Alerts

| Component | Backend | Status |
|-----------|---------|--------|
| Edge function | `send-saved-search-alerts` | ✅ Queries `saved_searches` + `listings`, sends via Resend |
| Tracking | `saved_searches.last_alert_sent_at`, `last_alert_listing_ids` | ✅ Migration adds columns |

- Deploy: `supabase functions deploy send-saved-search-alerts`
- Env: `RESEND_API_KEY`, `MAIPROP_APP_URL`
- Schedule via pg_cron (see `SAVED_SEARCH_ALERTS_SETUP.md`)

### Messages

| Component | Backend | Table/Bucket | Status |
|-----------|---------|--------------|--------|
| Messages | Supabase | `messages` | ✅ useMessages, useSendMessage |
| Attachments | Supabase | `message_attachments` | ✅ Insert on send; select in useMessages |
| Storage | Supabase Storage | `message-attachments` bucket | ✅ Upload before send; display via getPublicUrl |
| Read receipts | Supabase | `messages.status` | ✅ useMarkMessagesRead updates `sent` → `read` |

- Migration adds `message_attachments` table and `message-attachments` bucket with policies.

---

## 2. UX Notes

### Analytics

- Lead funnel stages and conversion rate for professionals.
- View trends chart for non-professionals with listing view data.
- Stats cards for Active Listings, Total Views, Conversion Rate.
- Empty states when there is no data.

### Contacts CRM

- Pipeline/List view toggle.
- “Follow-ups today” banner.
- Pipeline columns grouped by deal stage.
- Stage dropdown in pipeline cards.
- Tasks per contact (inline in pipeline; panel in list view).
- Delete from both pipeline and list views.
- Property link when contact has `listing_id` + joined listing.

### Messages

- Property links in content (`/property/[id]`) rendered as links.
- Read receipts (✓ sent, ✓✓ read).
- Attachments (Paperclip) for images and documents.
- Pending files shown before send with remove option.
- Paperclip available on mobile and desktop.

### Saved Search Alerts

- Toggle in Save Search modal.
- Edge function runs on schedule; no UI beyond existing alerts toggle.

---

## 3. Migration Checklist

Before use, run:

```bash
# Apply migrations (creates tables, columns, bucket)
supabase db push

# Deploy saved-search alerts function (optional)
supabase functions deploy send-saved-search-alerts
```

Ensure `RESEND_API_KEY` is set for saved search emails.
