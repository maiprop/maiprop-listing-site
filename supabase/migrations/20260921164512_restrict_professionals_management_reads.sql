BEGIN;

-- Recovery phase 2: apply only AFTER the public interface and the compatible
-- BrandedVideoRoom consumer have shipped, and legacy open tabs are refreshed.
-- Do not batch phases 1 and 2 ahead of the consumer rollout: the old video
-- caller reads raw rows for guests and would lose access to the room itself.
-- Rollback frontends must retain the public-projection consumer patch.
-- End the pre-existing broad raw SELECT; anonymous callers use only the fixed
-- public projection, and authenticated management reads are owner/admin only.
DROP POLICY IF EXISTS "Professionals are publicly viewable" ON public.professionals;
DROP POLICY IF EXISTS "Professionals are viewable by owner or admin" ON public.professionals;
DROP POLICY IF EXISTS "professionals_select" ON public.professionals;

CREATE POLICY "professionals_select"
  ON public.professionals
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

REVOKE SELECT ON TABLE public.professionals FROM anon;
GRANT SELECT ON TABLE public.professionals TO authenticated, service_role;

COMMIT;
