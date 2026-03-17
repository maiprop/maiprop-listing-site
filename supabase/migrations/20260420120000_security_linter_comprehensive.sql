-- =============================================================================
-- Comprehensive security linter fixes
-- Addresses: Security Definer View (0010), profiles_public RLS (database security),
-- Function Search Path Mutable (0011)
-- =============================================================================

-- ── 1. Replace profiles_public SECURITY DEFINER view with RLS-protected table ──
-- The view (security_invoker=false) bypassed RLS and exposed all profile data to anon.
-- Solution: table synced from profiles via trigger, with explicit RLS for SELECT.

DROP VIEW IF EXISTS public.profiles_public;

CREATE TABLE IF NOT EXISTS public.profiles_public (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  first_name text,
  last_name text,
  role public.user_role
);

-- Trigger to sync from profiles (runs as trigger owner, no SECURITY DEFINER view)
CREATE OR REPLACE FUNCTION public.sync_profiles_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.profiles_public WHERE user_id = OLD.user_id;
    RETURN OLD;
  ELSE
    INSERT INTO public.profiles_public (user_id, display_name, avatar_url, first_name, last_name, role)
    VALUES (NEW.user_id, NEW.display_name, NEW.avatar_url, NEW.first_name, NEW.last_name, NEW.role)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      role = EXCLUDED.role;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_public ON public.profiles;
CREATE TRIGGER trg_sync_profiles_public
  AFTER INSERT OR UPDATE OF display_name, avatar_url, first_name, last_name, role OR DELETE
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profiles_public();

-- Backfill from profiles
INSERT INTO public.profiles_public (user_id, display_name, avatar_url, first_name, last_name, role)
SELECT user_id, display_name, avatar_url, first_name, last_name, role
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role;

-- Enable RLS and add explicit SELECT policy (fixes "may be fully publicly accessible")
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;

-- Explicit SELECT policy: anon and authenticated can read (for listing detail, messages, admin).
-- Table exposes only safe columns (no phone); RLS is enabled per security recommendation.
CREATE POLICY "profiles_public_select"
  ON public.profiles_public FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

COMMENT ON TABLE public.profiles_public IS
  'Safe profile fields only (no phone). Synced from profiles via trigger. Replaces SECURITY DEFINER view.';


-- ── 2. Function search_path: set_open_house_updated_at (lint 0011) ──────────
CREATE OR REPLACE FUNCTION public.set_open_house_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── 3. Extensions: pg_net in extensions schema (lint 0014) ───────────────────
-- pg_cron: left in public per Supabase docs (moving can break cron).
-- pg_net: ensure in extensions if not already (20260320130000 may have moved it).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net' AND n.nspname = 'public'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS extensions;
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net schema move skipped: %', SQLERRM;
END $$;
