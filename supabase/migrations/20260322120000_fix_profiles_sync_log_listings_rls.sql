-- =============================================================================
-- Security report fixes: profiles self-grant, sync_log anon writes, listings draft exposure
-- =============================================================================

-- ── 1. Profiles: prevent authenticated users from granting themselves agent role ──
-- INSERT may only set role to the default unprivileged role (individual).
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'individual'::public.user_role
  );


-- ── 2. Sync log: restrict inserts to authenticated (stop anonymous audit-log pollution) ──
DROP POLICY IF EXISTS "Allow sync log inserts" ON public.sync_log;
CREATE POLICY "Allow sync log inserts"
  ON public.sync_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');


-- ── 3. Listings: do not expose draft/inactive listings when owner_id IS NULL ──
-- Only active listings are public; owner_id IS NULL without status = active must not be readable by anon.
DROP POLICY IF EXISTS "Active listings are public" ON public.listings;
CREATE POLICY "Active listings are public"
  ON public.listings FOR SELECT
  USING (
    status = 'active'::public.listing_status
    OR auth.uid() = owner_id
  );
