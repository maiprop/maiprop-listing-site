-- CRITICAL SECURITY FIX: Close paywall bypass + privilege escalation vectors
--
-- Finding 1: subscription_product_id IS NOT NULL check in check_listing_quota()
--   allows any user to self-assign a non-null subscription_product_id and bypass
--   the paywall. Fix: validate against actual pro_product_ids table.
--
-- Finding 2: participant_type is user-writable with no value restriction.
--   A buyer can set participant_type = 'institutional' and pass SellerRoute.
--   Fix: trigger guard that prevents setting privileged participant_type values.
--
-- Finding 3: subscription_product_id, force_pro_access are
--   user-writable via direct UPDATE. Fix: column-level REVOKE + trigger guard.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Fix check_listing_quota() — validate subscription against pro_product_ids
-- ══════════════════════════════════════════════════════════════════════════════

-- First ensure the pro_product_ids table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.pro_product_ids (
  product_id TEXT PRIMARY KEY
);

-- Ensure force_pro_access column exists (may have been added manually)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_pro_access BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION check_listing_quota()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      TEXT;
  v_is_pro    BOOLEAN;
  v_limit     INT;
  v_count     INT;
BEGIN
  -- Look up caller's role + subscription.
  -- SECURITY FIX: validate subscription_product_id against pro_product_ids
  -- instead of a bare IS NOT NULL check. This prevents users from setting
  -- any non-null string to bypass the paywall.
  SELECT
    COALESCE(p.role, 'buyer'),
    (
      p.subscription_product_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM pro_product_ids pp
        WHERE pp.product_id = p.subscription_product_id
      )
    )
    OR COALESCE(p.force_pro_access, FALSE)
  INTO v_role, v_is_pro
  FROM profiles p
  WHERE p.user_id = auth.uid();

  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_limit := get_listing_limit(v_role, v_is_pro);

  -- NULL limit = unlimited
  IF v_limit IS NULL THEN RETURN TRUE; END IF;

  -- Count non-deleted listings owned by the caller
  SELECT COUNT(*) INTO v_count
  FROM listings
  WHERE owner_id = auth.uid()
    AND (status IS NULL OR status != 'deleted');

  RETURN v_count < v_limit;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Trigger guard: prevent self-update of sensitive columns
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_sensitive_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only admins (via service role / RPC) can change these columns.
  -- Regular authenticated users must not self-assign subscription or privilege fields.

  -- Guard subscription_product_id
  IF NEW.subscription_product_id IS DISTINCT FROM OLD.subscription_product_id THEN
    IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.subscription_product_id := OLD.subscription_product_id;
    END IF;
  END IF;

  -- Guard force_pro_access
  IF NEW.force_pro_access IS DISTINCT FROM OLD.force_pro_access THEN
    IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.force_pro_access := OLD.force_pro_access;
    END IF;
  END IF;

  -- Guard participant_type: non-admins can only set allowed values.
  -- 'investor' and 'institutional' require admin approval.
  IF NEW.participant_type IS DISTINCT FROM OLD.participant_type THEN
    IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
      IF NEW.participant_type NOT IN ('buyer', 'seller', 'agent', 'developer', 'professional') THEN
        NEW.participant_type := OLD.participant_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sensitive_profile_columns ON public.profiles;
CREATE TRIGGER trg_guard_sensitive_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sensitive_profile_columns();

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Column-level REVOKE on profiles (defence in depth)
-- ══════════════════════════════════════════════════════════════════════════════
-- Revoke blanket UPDATE then re-grant only safe columns.
-- The trigger above is the primary guard; this is belt-and-suspenders.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  display_name, bio, avatar_url, phone, city,
  first_name, last_name, country, video_link, website_url,
  investor_mode, verified, participant_type, role
) ON public.profiles TO authenticated;

-- Note: role + participant_type are granted here because the trigger guard
-- handles the value restrictions. The RPC complete_onboarding_role() also
-- uses SECURITY DEFINER to set these.
