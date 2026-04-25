-- =============================================================================
-- Fix critical security issues (scan: 4 errors, 8 warnings)
-- 1. Profiles: stop exposing phone/PII to all authenticated users
-- 2. Investor subscriptions: prevent users from self-upgrading tier/status
-- 3. Consultation requests: prevent impersonation (requester_id must be self or NULL)
-- =============================================================================

-- ── 1. Profiles: remove policy that lets every authenticated user read all rows (including phone) ──
-- App should use profiles_public (view) for other users' display_name, avatar_url, etc.
-- Own profile is still readable via "Users can read own profile" or "Users can view own profile".
DROP POLICY IF EXISTS "Authenticated users can read public profile fields" ON public.profiles;

-- Ensure public view exists and exposes only safe columns (no phone)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false)
AS
SELECT user_id, display_name, avatar_url, first_name, last_name, role
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;


-- ── 2. Investor subscriptions: remove user UPDATE so users cannot self-upgrade tier/status/expires_at ──
-- Only admins (agent role) or service_role (e.g. Stripe webhook) can insert/update.
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Users can create their own subscription" ON public.investor_subscriptions;

-- Ensure only admins can insert (idempotent: drop if present from older migration, then recreate)
DROP POLICY IF EXISTS "Admins can insert investor subscriptions" ON public.investor_subscriptions;
CREATE POLICY "Admins can insert investor subscriptions"
  ON public.investor_subscriptions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'agent'::public.user_role));

-- Users can still SELECT their own row; admins can SELECT/UPDATE all (existing policies remain).


-- ── 3. Consultation requests: prevent setting requester_id to another user's identity ──
DROP POLICY IF EXISTS "Anyone can create consultation requests" ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests with identity check" ON public.consultation_requests;

CREATE POLICY "Consultation requests with identity check"
  ON public.consultation_requests FOR INSERT
  WITH CHECK (
    (auth.role() = 'anon' AND requester_id IS NULL)
    OR (auth.role() = 'authenticated' AND (requester_id IS NULL OR requester_id = auth.uid()))
  );
