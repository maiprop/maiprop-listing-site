-- The sanitized investor feed is a read model. Browser roles must never gain
-- mutation privileges even if default table grants drift in a future deploy.

ALTER TABLE public.firesale_requests_investor_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firesale_feed_select
  ON public.firesale_requests_investor_feed;
CREATE POLICY firesale_feed_select
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.user_id = (SELECT auth.uid())
          AND (
            profile.role::text IN ('investor', 'institutional')
            OR profile.participant_type IN ('investor', 'institutional')
          )
      )
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

REVOKE ALL ON TABLE public.firesale_requests_investor_feed
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.firesale_requests_investor_feed
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.firesale_requests_investor_feed
  TO service_role;

DO $$
BEGIN
  IF has_table_privilege(
    'authenticated',
    'public.firesale_requests_investor_feed',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.firesale_requests_investor_feed',
    'UPDATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.firesale_requests_investor_feed',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'authenticated role can mutate investor feed';
  END IF;
END;
$$;
