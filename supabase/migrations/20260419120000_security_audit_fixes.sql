-- =============================================================================
-- Security audit fixes: sync_log, profiles, open-house-docs, pricing_configs,
-- cron_config, is_platform_admin guard
-- =============================================================================

-- 1. sync_log: ensure no permissive INSERT (service role bypasses RLS)
DROP POLICY IF EXISTS "Allow sync log inserts" ON public.sync_log;
DROP POLICY IF EXISTS "Allow any sync log inserts" ON public.sync_log;

-- 2. profiles: guard is_platform_admin - users must NOT be able to set it
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block any change to is_platform_admin by non-admin
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;
  -- Only admin can escalate anyone to role='admin'
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin'::public.user_role THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Only admin can escalate to agent or professional
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('agent'::public.user_role, 'professional'::public.user_role) THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Self-updates: allow downgrade or same-role; never self-escalate to admin
  IF auth.uid() = NEW.user_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role NOT IN ('individual'::public.user_role, 'seller_landlord'::public.user_role) THEN
      IF NEW.role = 'admin'::public.user_role OR NOT public.has_platform_admin(auth.uid()) THEN
        NEW.role := OLD.role;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. open-house-docs: restrict SELECT to owner and listing owner only
DROP POLICY IF EXISTS "Open house docs read authenticated" ON storage.objects;
CREATE POLICY "Open house docs read owner or listing owner"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'open-house-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.open_house_registrations r
        JOIN public.listings l ON l.id = r.listing_id AND l.owner_id = auth.uid()
        WHERE (storage.foldername(name))[1] = r.requester_id::text
      )
    )
  );

-- 4. pricing_configs: ensure only platform admin can write (belt-and-suspenders)
DROP POLICY IF EXISTS "Authenticated can modify pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Authenticated can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Authenticated can delete pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can insert pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can delete pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can insert pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can delete pricing_configs" ON public.pricing_configs;

CREATE POLICY "Platform admin can insert pricing_configs"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (public.has_platform_admin(auth.uid()));
CREATE POLICY "Platform admin can update pricing_configs"
  ON public.pricing_configs FOR UPDATE
  USING (public.has_platform_admin(auth.uid()))
  WITH CHECK (public.has_platform_admin(auth.uid()));
CREATE POLICY "Platform admin can delete pricing_configs"
  ON public.pricing_configs FOR DELETE
  USING (public.has_platform_admin(auth.uid()));

-- 5. cron_config: if table exists, enable RLS and restrict to service_role/admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cron_config') THEN
    ALTER TABLE public.cron_config ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cron_config_select" ON public.cron_config;
    DROP POLICY IF EXISTS "cron_config_all" ON public.cron_config;
    CREATE POLICY "cron_config_admin_or_service"
      ON public.cron_config FOR ALL
      USING (public.has_platform_admin(auth.uid()));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'cron_config RLS setup skipped: %', SQLERRM;
END $$;
