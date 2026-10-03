-- An approved invitation may be retried from a stale admin screen. Preserve an
-- existing same-tier pending checkout or current paid subscription on replay.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_review_invitation_request(
  p_admin_user_id UUID,
  p_request_id UUID,
  p_decision TEXT,
  p_tier TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  request_id UUID,
  status TEXT,
  tier TEXT,
  granted_role TEXT,
  email TEXT,
  full_name TEXT,
  subscription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.invitation_requests%ROWTYPE;
  v_subscription public.investor_subscriptions%ROWTYPE;
  v_decision TEXT := lower(trim(coalesce(p_decision, '')));
  v_tier TEXT := lower(trim(coalesce(p_tier, 'private')));
  v_granted_role TEXT;
  v_subscription_status TEXT := 'pending_payment';
BEGIN
  IF NOT public.has_platform_admin(p_admin_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT *
  INTO v_request
  FROM public.invitation_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'invitation_request_not_found';
  END IF;

  IF v_decision = 'rejected' THEN
    UPDATE public.invitation_requests
    SET status = 'rejected',
        rejection_reason = nullif(trim(coalesce(p_rejection_reason, '')), '')
    WHERE id = v_request.id
    RETURNING * INTO v_request;

    RETURN QUERY SELECT
      v_request.id,
      v_request.status,
      NULL::TEXT,
      NULL::TEXT,
      v_request.email,
      v_request.full_name,
      NULL::TEXT;
    RETURN;
  END IF;

  IF v_request.user_id IS NULL THEN
    RAISE EXCEPTION 'linked_user_required';
  END IF;

  IF v_tier NOT IN ('private', 'institutional', 'developer') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  v_granted_role := CASE v_tier
    WHEN 'institutional' THEN 'institutional'
    WHEN 'developer' THEN 'developer'
    ELSE 'investor'
  END;

  -- Request locking serializes two reviews; subscription locking also orders
  -- this read against a concurrent payment activation. A completed same-tier
  -- approval must not reset paid access or rewrite an in-flight checkout.
  IF v_request.status = 'approved' THEN
    SELECT *
    INTO v_subscription
    FROM public.investor_subscriptions
    WHERE user_id = v_request.user_id
    FOR UPDATE;

    IF v_subscription.id IS NOT NULL
       AND v_subscription.tier = v_tier
       AND (
         v_subscription.status = 'pending_payment'
         OR (
           v_subscription.status IN ('active', 'trial')
           AND (v_subscription.expires_at IS NULL OR v_subscription.expires_at > now())
         )
       ) THEN
      RETURN QUERY SELECT
        v_request.id,
        v_request.status,
        v_tier,
        v_granted_role,
        v_request.email,
        v_request.full_name,
        v_subscription.status;
      RETURN;
    END IF;
  END IF;

  UPDATE public.invitation_requests
  SET status = 'approved',
      rejection_reason = NULL
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  INSERT INTO public.investor_subscriptions (
    user_id,
    tier,
    status,
    started_at,
    expires_at,
    updated_at
  )
  VALUES (
    v_request.user_id,
    v_tier,
    v_subscription_status,
    now(),
    NULL,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    tier = EXCLUDED.tier,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    expires_at = NULL,
    updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_request.user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.status,
    v_tier,
    v_granted_role,
    v_request.email,
    v_request.full_name,
    v_subscription_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT) IS
  'Atomically reviews investor/developer invitation requests; same-tier approved retries preserve current pending or paid subscription, new approval creates pending_payment access only, rejection persists the admin reason.';

COMMIT;
