-- =============================================================================
-- Schema alignment migration
-- Restores / adds columns that the application code references but were
-- removed from the DB via manual edits. Also creates missing tables.
--
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- 1. conversations.listing_id (used by messaging UI to scope per-listing threads)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS listing_id UUID
    REFERENCES public.listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_listing_id_idx
  ON public.conversations(listing_id);

-- 2. messages.receiver_id — ensure column exists (was added via manual edits in prod
--    on some environments), then make nullable. The app sets it from the conversation
--    participants on read; storing NULL at insert time is acceptable because the
--    RLS policies authorise reads based on conversation participants, not
--    message.receiver_id.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.messages
  ALTER COLUMN receiver_id DROP NOT NULL;

-- 3. professionals.notes — admin-only field used by verification panel to record
--    feedback / info requests. Distinct from user-facing calendar_notes.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. listing_reports.status — moderation state used by AdminReports.tsx
--    Values: 'pending' | 'resolved' | 'dismissed'
DO $$ BEGIN
  CREATE TYPE public.listing_report_status AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.listing_reports
  ADD COLUMN IF NOT EXISTS status public.listing_report_status NOT NULL DEFAULT 'pending';

-- 5. new_building_leads — legacy lead capture for new-build project interest.
--    Previously only referenced in code without a backing table.
CREATE TABLE IF NOT EXISTS public.new_building_leads (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_building_id    UUID        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT        NOT NULL,
  full_name          TEXT        NOT NULL DEFAULT '',
  phone              TEXT,
  investment_budget  NUMERIC     NOT NULL DEFAULT 0,
  notes              TEXT        NOT NULL DEFAULT '',
  utm_source         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS new_building_leads_building_idx
  ON public.new_building_leads(new_building_id);
CREATE INDEX IF NOT EXISTS new_building_leads_user_idx
  ON public.new_building_leads(user_id);

ALTER TABLE public.new_building_leads ENABLE ROW LEVEL SECURITY;

-- User can insert their own leads
CREATE POLICY "user_insert_own_new_building_lead"
  ON public.new_building_leads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- User sees their own leads; listing owner sees leads for their listings;
-- service role sees all.
CREATE POLICY "user_or_owner_select_new_building_lead"
  ON public.new_building_leads FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = new_building_leads.new_building_id
        AND l.owner_id = auth.uid()
    )
  );
