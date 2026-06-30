-- Enforce investor subscription expiry for annual Stripe payment access.
-- Paid investor Checkout sessions now set expires_at to one year after
-- activation. Keep manually managed null-expiry grants valid, but make every
-- access predicate reject rows whose expires_at is in the past.

BEGIN;

ALTER TABLE public.investor_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(
  p_user_id uuid
)
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

COMMENT ON FUNCTION public.has_current_investor_subscription(uuid) IS
  'True for active/trial investor subscriptions that are unexpired; null expires_at is reserved for manually managed grants.';

REVOKE ALL ON FUNCTION public.has_current_investor_subscription(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription(uuid)
  TO authenticated, service_role;

UPDATE public.investor_subscriptions
SET
  expires_at = COALESCE(activated_at, started_at, updated_at, created_at, now()) + interval '365 days',
  updated_at = now()
WHERE status = 'active'
  AND expires_at IS NULL
  AND stripe_session_id IS NOT NULL;

UPDATE public.investor_subscriptions
SET
  status = 'expired',
  updated_at = now()
WHERE status IN ('active', 'trial')
  AND expires_at IS NOT NULL
  AND expires_at <= now();

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
      JOIN public.pro_product_ids pp
        ON pp.product_id = p.subscription_product_id
      WHERE p.user_id = p_user_id
        AND p.subscription_product_id IS NOT NULL
    )
    OR public.has_current_investor_subscription(p_user_id)
$$;

COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical Pro-status reader. Returns true for platform admins, overrides, existing Pro products, or current active/trial investor subscriptions.';

REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;

DROP POLICY IF EXISTS "firesale_interest_insert" ON public.firesale_interest;
CREATE POLICY "firesale_interest_insert"
  ON public.firesale_interest
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR (
      investor_id = (SELECT auth.uid())
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "firesale_requests_select" ON public.firesale_requests;
CREATE POLICY "firesale_requests_select"
  ON public.firesale_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
    OR (
      published_to_investors = true
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "firesale_feed_select" ON public.firesale_requests_investor_feed;
CREATE POLICY "firesale_feed_select"
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = (SELECT auth.uid())
          AND (
            p.role::text IN ('investor', 'institutional')
            OR p.participant_type::text IN ('investor', 'institutional')
          )
      )
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

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
SET search_path = public
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
       OR NOT public.has_current_investor_subscription(v_actor)
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

    RETURN v_result;
  END IF;

  IF v_existing.status IN ('reserved', 'engaged', 'won') THEN
    RAISE EXCEPTION 'active_interest_is_admin_managed';
  END IF;

  v_has_proof := COALESCE(p_proof_of_funds_url, v_existing.proof_of_funds_url) IS NOT NULL
    OR COALESCE(p_proof_amount, v_existing.proof_amount) IS NOT NULL
    OR v_existing.proof_of_funds_verified_at IS NOT NULL;

  UPDATE public.firesale_interest
  SET
    status = CASE WHEN v_has_proof THEN 'prioritized' ELSE 'interested' END,
    message = NULLIF(p_message, ''),
    proof_amount = CASE
      WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_amount
      ELSE COALESCE(p_proof_amount, v_existing.proof_amount)
    END,
    proof_of_funds_url = CASE
      WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_of_funds_url
      ELSE COALESCE(p_proof_of_funds_url, v_existing.proof_of_funds_url)
    END
  WHERE id = v_existing.id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.submit_firesale_interest_for_user(UUID, UUID, TEXT, NUMERIC, TEXT) IS
  'Service-role-only firesale interest submission RPC. Allows paid investor/institutional access through role or participant_type only while the investor subscription is current.';

COMMIT;
