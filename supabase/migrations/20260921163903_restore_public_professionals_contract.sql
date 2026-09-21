BEGIN;

-- Additive recovery for environments missing the July public-directory repairs.
-- Keep the established 25-column public interface, including user_id and
-- license_number. Never grant anon the private admin helper or raw-table access.
-- The definer function below is deliberately constrained to that projection;
-- its invoker view checks caller grants, while owner/admin RLS protects raw rows.
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

CREATE OR REPLACE FUNCTION public.get_public_professionals()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  display_name text,
  category public.professional_category,
  city text,
  bio text,
  avatar_url text,
  rating numeric(3, 2),
  reviews_count integer,
  verified boolean,
  verified_at timestamptz,
  hourly_rate numeric(10, 2),
  experience_years integer,
  specialties text[],
  languages text[],
  license_number text,
  website_url text,
  video_link text,
  projects_count integer,
  average_deal_size text,
  average_portfolio_asset_size text,
  subscription_tier text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.get_public_professionals()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_professionals()
  TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.public_professionals
WITH (security_barrier = true, security_invoker = true)
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
  professional.rating::numeric(3, 2) AS rating,
  professional.reviews_count,
  professional.verified,
  professional.verified_at,
  professional.hourly_rate::numeric(10, 2) AS hourly_rate,
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
FROM public.get_public_professionals() AS professional;

REVOKE ALL ON TABLE public.public_professionals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_professionals
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_professionals() IS
  'Fixed professional-directory projection. The function excludes internal moderation and calendar fields.';
COMMENT ON VIEW public.public_professionals IS
  'Security-invoker wrapper over the fixed public professional-directory projection.';

NOTIFY pgrst, 'reload schema';

COMMIT;
