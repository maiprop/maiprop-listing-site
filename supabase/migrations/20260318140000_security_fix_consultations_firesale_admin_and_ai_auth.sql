-- =============================================================================
-- Security fixes (scanner findings):
-- - consultation_requests: remove permissive INSERT, enforce requester identity
-- - firesale_requests: remove investor SELECT on base table; expose sanitized feed table
-- - has_platform_admin(): tolerate legacy is_platform_admin column
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1) consultation_requests: prevent requester_id spoofing
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.consultation_requests ENABLE ROW LEVEL SECURITY;

-- Remove any legacy permissive policy (may exist in older environments)
DROP POLICY IF EXISTS "Anyone can create consultation requests" ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests with identity check" ON public.consultation_requests;

-- Authenticated users may insert only with requester_id = auth.uid()
CREATE POLICY "Consultation requests insert (auth identity)"
  ON public.consultation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Anonymous may insert only when requester_id IS NULL (lead-gen without impersonation)
CREATE POLICY "Consultation requests insert (anon no-identity)"
  ON public.consultation_requests
  FOR INSERT
  TO anon
  WITH CHECK (requester_id IS NULL);

-- Keep requester visibility limited to their own authenticated requests
DROP POLICY IF EXISTS "Requesters can view own requests" ON public.consultation_requests;
CREATE POLICY "Requesters can view own requests"
  ON public.consultation_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2) firesale_requests: investors must not read internal/admin/contact fields
--    Create a dedicated sanitized feed table for eligible investors.
-- ──────────────────────────────────────────────────────────────────────────────

-- Drop legacy policy that allowed full-row SELECT to investors
DROP POLICY IF EXISTS "Subscribed investors view firesale deal feed" ON public.firesale_requests;

-- If a VIEW exists with this name, replace it with a TABLE (RLS can't be enabled on views).
DO $$
DECLARE
  k "char";
BEGIN
  SELECT c.relkind INTO k
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'firesale_requests_investor_feed'
  LIMIT 1;

  IF k = 'v' THEN
    EXECUTE 'DROP VIEW IF EXISTS public.firesale_requests_investor_feed CASCADE';
  END IF;
END $$;

-- Ensure firesale_requests has published_to_investors column (added in a later
-- migration in some environments; idempotent so prod installs are unaffected).
ALTER TABLE public.firesale_requests
  ADD COLUMN IF NOT EXISTS published_to_investors boolean NOT NULL DEFAULT false;

-- Create sanitized investor feed table (idempotent)
CREATE TABLE IF NOT EXISTS public.firesale_requests_investor_feed (
  id UUID PRIMARY KEY REFERENCES public.firesale_requests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  property_type public.property_type,
  sqm NUMERIC,
  asking_price NUMERIC,
  status TEXT
);

ALTER TABLE public.firesale_requests_investor_feed ENABLE ROW LEVEL SECURITY;

-- Only eligible investor/institutional users can read the feed
DROP POLICY IF EXISTS "Eligible investors view firesale feed" ON public.firesale_requests_investor_feed;
CREATE POLICY "Eligible investors view firesale feed"
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role::text IN ('investor', 'institutional')
    )
    AND EXISTS (
      SELECT 1 FROM public.investor_subscriptions
      WHERE user_id = auth.uid()
        AND status IN ('active', 'trial')
    )
  );

-- Platform admin can read the feed table too (for debugging)
-- has_platform_admin() is (re)defined later in this migration. Install a stub
-- first so CREATE POLICY can resolve the function reference in fresh databases.
CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

DROP POLICY IF EXISTS "Platform admin read firesale feed" ON public.firesale_requests_investor_feed;
CREATE POLICY "Platform admin read firesale feed"
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (public.has_platform_admin(auth.uid()));

-- Keep feed table in sync with firesale_requests
CREATE OR REPLACE FUNCTION public.sync_firesale_investor_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only publish rows intended for investors
  IF (NEW.published_to_investors IS TRUE) THEN
    INSERT INTO public.firesale_requests_investor_feed (
      id, created_at, address, city, property_type, sqm, asking_price, status
    )
    VALUES (
      NEW.id, NEW.created_at, NEW.address, NEW.city, NEW.property_type, NEW.sqm, NEW.asking_price, NEW.status
    )
    ON CONFLICT (id) DO UPDATE SET
      created_at = EXCLUDED.created_at,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      property_type = EXCLUDED.property_type,
      sqm = EXCLUDED.sqm,
      asking_price = EXCLUDED.asking_price,
      status = EXCLUDED.status;
  ELSE
    DELETE FROM public.firesale_requests_investor_feed WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_firesale_investor_feed ON public.firesale_requests;
CREATE TRIGGER trg_sync_firesale_investor_feed
AFTER INSERT OR UPDATE OF published_to_investors, address, city, property_type, sqm, asking_price, status
ON public.firesale_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_firesale_investor_feed();

-- Backfill any already-published deals (idempotent)
INSERT INTO public.firesale_requests_investor_feed (id, created_at, address, city, property_type, sqm, asking_price, status)
SELECT fr.id, fr.created_at, fr.address, fr.city, fr.property_type, fr.sqm, fr.asking_price, fr.status
FROM public.firesale_requests fr
WHERE fr.published_to_investors IS TRUE
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3) has_platform_admin(): support both role='admin' and legacy is_platform_admin
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (role::text = 'admin') OR COALESCE(is_platform_admin, false)
     FROM public.profiles
     WHERE user_id = _user_id
     LIMIT 1),
    false
  );
$$;

