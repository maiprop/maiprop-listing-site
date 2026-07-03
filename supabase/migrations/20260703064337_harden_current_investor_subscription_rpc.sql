-- Harden current-investor subscription checks so browser-callable RPCs cannot
-- execute an arbitrary-user SECURITY DEFINER helper. Public wrappers remain
-- compatibility-safe and caller-scoped; privileged arbitrary-user checks move
-- to a private, service-role-only helper.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.investor_subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trial')
      AND (s.expires_at IS NULL OR s.expires_at > now())
  )
$$;

COMMENT ON FUNCTION private.has_investor_subscription_for_user(uuid) IS
  'Service-role-only helper for active/trial investor subscriptions. Browser callers must use public caller-scoped wrappers.';

REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND p_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trial')
        AND (s.expires_at IS NULL OR s.expires_at > now())
    ),
    FALSE
  )
$$;

COMMENT ON FUNCTION public.has_current_investor_subscription(uuid) IS
  'Caller-scoped compatibility wrapper. Returns true only for the authenticated caller, never for an arbitrary user id.';

REVOKE ALL ON FUNCTION public.has_current_investor_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT public.has_current_investor_subscription((SELECT auth.uid()))
$$;

COMMENT ON FUNCTION public.has_current_investor_subscription() IS
  'Caller-scoped current investor subscription check for browser/RLS callers.';

REVOKE ALL ON FUNCTION public.has_current_investor_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, private
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT p.force_pro_access
        FROM public.profiles p
        WHERE p.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = p_user_id
        AND p.subscription_product_id IS NOT NULL
    )
    OR private.has_investor_subscription_for_user(p_user_id)
$$;

COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical Pro-status reader. Returns true for platform admins, overrides, audience-scoped Pro products, or current active/trial investor subscriptions.';

REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_firesale_interest_for_user(
  _user_id UUID,
  p_deal_id UUID,
  p_message TEXT DEFAULT NULL,
  p_proof_amount NUMERIC DEFAULT NULL,
  p_proof_of_funds_url TEXT DEFAULT NULL
)
RETURNS public.firesale_interest
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor UUID := _user_id;
  v_existing public.firesale_interest%ROWTYPE;
  v_result public.firesale_interest%ROWTYPE;
  v_has_proof BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_deal_id IS NULL THEN
    RAISE EXCEPTION 'invalid_deal_id';
  END IF;

  IF p_proof_amount IS NOT NULL AND p_proof_amount < 0 THEN
    RAISE EXCEPTION 'invalid_proof_amount';
  END IF;

  IF p_proof_of_funds_url IS NOT NULL
     AND p_proof_of_funds_url NOT LIKE v_actor::text || '/firesale/' || p_deal_id::text || '/%' THEN
    RAISE EXCEPTION 'invalid_proof_path';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, TRUE);

  IF NOT public.has_platform_admin(v_actor)
     AND (
       NOT EXISTS (
         SELECT 1
         FROM public.profiles p
         WHERE p.user_id = v_actor
           AND (
             p.role::text IN ('investor', 'institutional')
             OR p.participant_type::text IN ('investor', 'institutional')
           )
       )
       OR NOT private.has_investor_subscription_for_user(v_actor)
     ) THEN
    RAISE EXCEPTION 'investor_access_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.firesale_requests fr
    WHERE fr.id = p_deal_id
      AND fr.published_to_investors IS TRUE
      AND fr.status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'firesale_deal_not_available';
  END IF;

  PERFORM public.release_expired_firesale_reservations(p_deal_id);

  SELECT *
  INTO v_existing
  FROM public.firesale_interest
  WHERE deal_id = p_deal_id
    AND investor_id = v_actor
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    v_has_proof := p_proof_of_funds_url IS NOT NULL OR p_proof_amount IS NOT NULL;

    INSERT INTO public.firesale_interest (
      deal_id,
      investor_id,
      status,
      message,
      proof_amount,
      proof_of_funds_url
    )
    VALUES (
      p_deal_id,
      v_actor,
      CASE WHEN v_has_proof THEN 'prioritized' ELSE 'interested' END,
      NULLIF(p_message, ''),
      p_proof_amount,
      p_proof_of_funds_url
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.firesale_interest
    SET
      message = COALESCE(NULLIF(p_message, ''), message),
      proof_amount = COALESCE(p_proof_amount, proof_amount),
      proof_of_funds_url = COALESCE(p_proof_of_funds_url, proof_of_funds_url),
      status = CASE
        WHEN p_proof_of_funds_url IS NOT NULL OR p_proof_amount IS NOT NULL THEN 'prioritized'
        ELSE status
      END,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT) IS
  'Service-role-only firesale interest submission RPC. Allows paid investor/institutional access through role or participant_type only while the investor subscription is current.';

DO $$
DECLARE
  private_helper regprocedure := 'private.has_investor_subscription_for_user(uuid)'::regprocedure;
  public_compat regprocedure := 'public.has_current_investor_subscription(uuid)'::regprocedure;
  public_self regprocedure := 'public.has_current_investor_subscription()'::regprocedure;
BEGIN
  IF has_function_privilege('authenticated', private_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute private investor subscription helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = public_compat
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'public investor subscription wrapper must not be security definer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    WHERE p.oid = public_self
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'public no-arg investor subscription wrapper must not be security definer';
  END IF;
END $$;

COMMIT;
