-- Consolidate Quick Sale / firesale advisor policy duplicates without
-- changing access:
--   - interest rows: investor owns the row, INSERT still requires active/trial
--     investor subscription, platform admins retain full access;
--   - request feed: owners/admins retain access, and published deals remain
--     visible to users with active/trial investor subscriptions regardless of
--     profile role, matching the custom-payment-link access model.

BEGIN;

DROP POLICY IF EXISTS "firesale_interest_admin" ON public.firesale_interest;
DROP POLICY IF EXISTS "Investors read own firesale interest" ON public.firesale_interest;
DROP POLICY IF EXISTS "Investors update own firesale interest" ON public.firesale_interest;
DROP POLICY IF EXISTS "Investors delete own firesale interest" ON public.firesale_interest;
DROP POLICY IF EXISTS "Investors with active subscription insert firesale interest" ON public.firesale_interest;
DROP POLICY IF EXISTS "firesale_interest_select" ON public.firesale_interest;
DROP POLICY IF EXISTS "firesale_interest_insert" ON public.firesale_interest;
DROP POLICY IF EXISTS "firesale_interest_update" ON public.firesale_interest;
DROP POLICY IF EXISTS "firesale_interest_delete" ON public.firesale_interest;

CREATE POLICY "firesale_interest_select"
  ON public.firesale_interest
  FOR SELECT
  TO authenticated
  USING (
    investor_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "firesale_interest_insert"
  ON public.firesale_interest
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR (
      investor_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.investor_subscriptions s
        WHERE s.user_id = (SELECT auth.uid())
          AND s.status IN ('active', 'trial')
      )
    )
  );

CREATE POLICY "firesale_interest_update"
  ON public.firesale_interest
  FOR UPDATE
  TO authenticated
  USING (
    investor_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    investor_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "firesale_interest_delete"
  ON public.firesale_interest
  FOR DELETE
  TO authenticated
  USING (
    investor_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals" ON public.firesale_requests;
DROP POLICY IF EXISTS "firesale_requests_select" ON public.firesale_requests;

CREATE POLICY "firesale_requests_select"
  ON public.firesale_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
    OR (
      published_to_investors = true
      AND EXISTS (
        SELECT 1
        FROM public.investor_subscriptions s
        WHERE s.user_id = (SELECT auth.uid())
          AND s.status IN ('active', 'trial')
      )
    )
  );

COMMIT;
