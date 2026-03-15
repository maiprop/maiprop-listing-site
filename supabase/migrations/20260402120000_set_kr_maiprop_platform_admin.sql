-- Set kr@maiprop.co as platform admin.
-- Looks up user by email; if found, revokes admin from others and grants to kr@maiprop.co.
DO $$
DECLARE
  admin_uid uuid;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE LOWER(email) = LOWER('kr@maiprop.co') LIMIT 1;
  IF admin_uid IS NOT NULL THEN
    UPDATE public.profiles SET is_platform_admin = false WHERE is_platform_admin = true;
    UPDATE public.profiles SET is_platform_admin = true WHERE user_id = admin_uid;
  END IF;
END $$;
