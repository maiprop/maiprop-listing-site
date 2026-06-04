-- Prevent self-service clients from marking an account as investor-mode.
--
-- Business invariant:
--   Quick Sale investor dashboard access is invitation-only. A user may submit
--   an application, but the investor marker/access path must be set by admin
--   review and/or payment fulfillment, not by a direct profile update.

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  avatar_url,
  bio,
  city,
  country,
  display_name,
  first_name,
  last_name,
  participant_type,
  phone,
  video_link,
  website_url
) ON TABLE public.profiles TO authenticated;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'investor_mode', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update public.profiles.investor_mode';
  END IF;

  IF has_column_privilege('authenticated', 'public.profiles', 'force_pro_access', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update public.profiles.force_pro_access';
  END IF;

  IF has_column_privilege('authenticated', 'public.profiles', 'is_platform_admin', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update public.profiles.is_platform_admin';
  END IF;
END $$;
