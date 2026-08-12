BEGIN;

-- Public directory readers must use a fixed projection. Raw professional rows
-- include moderation reasons, calendar notes, and internal notes that are not
-- part of the marketplace directory contract.
DROP POLICY IF EXISTS "Professionals are publicly viewable"
  ON public.professionals;
DROP POLICY IF EXISTS "Professionals are viewable by owner or admin"
  ON public.professionals;
DROP POLICY IF EXISTS "professionals_select"
  ON public.professionals;

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

-- This security-definer view is intentional. The owner bypasses the raw-table
-- owner-only RLS policy, while the fixed projection and predicate define the
-- complete anonymous directory contract.
CREATE OR REPLACE VIEW public.public_professionals
WITH (security_barrier = true)
AS
SELECT
  professional.id,
  professional.user_id,
  professional.title,
  professional.display_name,
  professional.category,
  professional.city,
  professional.bio,
  professional.avatar_url,
  professional.rating,
  professional.reviews_count,
  professional.verified,
  professional.verified_at,
  professional.hourly_rate,
  professional.experience_years,
  professional.specialties,
  professional.languages,
  professional.license_number,
  professional.website_url,
  professional.video_link,
  professional.projects_count,
  professional.average_deal_size,
  professional.average_portfolio_asset_size,
  professional.subscription_tier,
  professional.created_at,
  professional.updated_at
FROM public.professionals AS professional
WHERE professional.archived_at IS NULL;

REVOKE ALL ON TABLE public.public_professionals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_professionals
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_professionals IS
  'Fixed public professional-directory projection. Internal moderation and calendar fields are intentionally excluded.';

COMMIT;
