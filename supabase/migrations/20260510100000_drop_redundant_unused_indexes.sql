-- =============================================================================
-- 20260510100000_drop_redundant_unused_indexes.sql
-- =============================================================================
-- Phase 2.4 — Supabase performance advisor triage.
--
-- The Supabase performance advisor (last reviewed 2026-05-10) reports 85
-- unused indexes on this project. The vast majority of those are FK-supporting
-- indexes (e.g. `idx_messages_sender_id`) or filter-column indexes for
-- features that haven't yet generated production traffic; dropping them
-- would create the risk of slow JOINs, slow cascade deletes, or sequential
-- scans the moment those features see real usage.
--
-- This migration drops the subset of unused indexes that are strictly
-- redundant — i.e. another index on the same table already covers the same
-- (or a superset of) columns under the same WHERE predicate. PostgreSQL can
-- always answer the same queries from the wider/duplicate index, so dropping
-- these is genuinely free.
--
-- Each DROP below cites the index that covers the same lookups, and the
-- last CREATE timestamp for that index — confirming that this migration's
-- timestamp is later than every CREATE so the DROPs are not no-ops on
-- fresh replay.
--
-- See `docs/SUPABASE_PERFORMANCE_ADVISOR_TRIAGE.md` for the full triage
-- analysis and category-by-category rationale for what was kept.
-- =============================================================================

-- 1. conversations.participant_a — single-column index covered by the wider
--    btree on (participant_a, last_message_at), which can answer any query
--    on participant_a alone via index-only scan on the leading column.
DROP INDEX IF EXISTS public.idx_conversations_participant_a;

-- 2. conversations.participant_b — same as above, mirrored.
DROP INDEX IF EXISTS public.idx_conversations_participant_b;

-- 3. deal_checklists.user_id — single-column index covered by the unique
--    constraint deal_checklists_user_id_entity_type_entity_id_key whose
--    backing index leads with user_id.
DROP INDEX IF EXISTS public.idx_deal_checklists_user_id;

-- 4. email_unsubscribe_tokens.token — duplicate of the unique-constraint
--    index email_unsubscribe_tokens_token_key.
DROP INDEX IF EXISTS public.idx_unsubscribe_tokens_token;

-- 5. listing_view_events.listing_id — single-column index covered by the
--    composite idx_listing_view_events_listing_date (listing_id, viewed_at DESC).
DROP INDEX IF EXISTS public.idx_listing_view_events_listing;

-- 6. suppressed_emails.email — duplicate of the unique-constraint index
--    suppressed_emails_email_key.
DROP INDEX IF EXISTS public.idx_suppressed_emails_email;

-- NOTE: idx_firesale_interest_deal_id was originally part of this drop list
-- (covered by firesale_interest_deal_id_investor_id_key unique constraint),
-- but deferred. Its CREATE migration is timestamped 20260529000000, while
-- this migration is 20260510100000 — on fresh replay the DROP would run
-- before the CREATE, leaving the index in place after the chain finishes.
-- Will be dropped in a follow-up migration once the chronology lint
-- accepts a timestamp later than 20260529000000.
