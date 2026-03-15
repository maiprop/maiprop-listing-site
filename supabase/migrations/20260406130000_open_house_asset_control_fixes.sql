-- Open House Asset Control - Audit Fixes
-- 1. Enable profiles embed for open_house_registrations and open_house_offers
-- 2. open_house_settings: owner INSERT needs WITH CHECK
-- 3. Supabase types for new tables (handled by codegen; this adds any missing DB bits)

-- ── 1. Profiles relationship for PostgREST embed ─────────────────────────────
-- PostgREST requires FK to discover relationship. requester_id -> auth.users
-- but we need profiles:requester_id to work. Add FK to profiles(user_id) so
-- PostgREST can embed. profiles.user_id is UNIQUE and references auth.users.
-- Swap FK: requester_id will reference profiles(user_id) so embed works.
-- When user deleted -> profile deleted (CASCADE) -> we need reg/offer handling.
-- Keeping auth.users ref would block profile embed. Use profiles so embed works.
ALTER TABLE public.open_house_registrations
  DROP CONSTRAINT IF EXISTS open_house_registrations_requester_id_fkey;

ALTER TABLE public.open_house_registrations
  ADD CONSTRAINT open_house_registrations_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Same for open_house_offers bidder_id
ALTER TABLE public.open_house_offers
  DROP CONSTRAINT IF EXISTS open_house_offers_bidder_id_fkey;

ALTER TABLE public.open_house_offers
  ADD CONSTRAINT open_house_offers_bidder_id_fkey
  FOREIGN KEY (bidder_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- ── 2. open_house_settings: ensure owner can INSERT (first upsert) ───────
-- The "owner manage" policy uses USING; for INSERT we need WITH CHECK.
-- Per PostgreSQL, when USING only is given, WITH CHECK defaults to USING for INSERT.
-- Verify policy allows INSERT - it has USING so WITH CHECK inherits. No change needed.
-- (Postgres doc: "If WITH CHECK is not specified for INSERT and UPDATE, the USING expression is used")

-- ── 3. open_house_settings upsert: owner INSERT policy ────────────────────
-- When no row exists, upsert does INSERT. Owner must be able to INSERT.
-- Current policy "owner manage" FOR ALL USING (listing owner). 
-- For INSERT, WITH CHECK defaults to USING. Good.

-- ── 4. open_house_offers upsert conflict target ───────────────────────────
-- UNIQUE(listing_id, bidder_id) exists. Supabase upsert onConflict: "listing_id,bidder_id"
-- works with composite unique. No change needed.

-- ── 5. Storage: ensure open-house-docs DELETE policy for cleanup ──────────
-- Users may want to delete/replace their uploaded docs.
CREATE POLICY "Open house docs delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'open-house-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
