-- Keep investor deal flow on the sanitized feed table, but make the SELECT
-- policy match the app's profile model. Some approved investor accounts carry
-- the investor marker in participant_type while role activation is catching up.

GRANT SELECT ON TABLE public.firesale_requests_investor_feed TO authenticated;

DROP POLICY IF EXISTS "firesale_feed_select" ON public.firesale_requests_investor_feed;
DROP POLICY IF EXISTS "Eligible investors view firesale feed" ON public.firesale_requests_investor_feed;
DROP POLICY IF EXISTS "Platform admin read firesale feed" ON public.firesale_requests_investor_feed;

CREATE POLICY "firesale_feed_select"
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = (SELECT auth.uid())
          AND (
            p.role::text IN ('investor', 'institutional')
            OR p.participant_type::text IN ('investor', 'institutional')
          )
      )
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );
