-- Move Quick Sale invitation approval/rejection invariants out of the browser.
-- The RPC is service-role only and explicitly checks the authenticated admin
-- user id passed by the Edge Function before mutating invitation, subscription,
-- or profile state.

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
  full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.invitation_requests%ROWTYPE;
  v_decision TEXT := lower(trim(coalesce(p_decision, '')));
  v_tier TEXT := lower(trim(coalesce(p_tier, 'private')));
  v_granted_role TEXT;
  v_expires_at TIMESTAMPTZ := now() + interval '1 year';
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
    SET status = 'rejected'
    WHERE id = v_request.id
    RETURNING * INTO v_request;

    RETURN QUERY SELECT
      v_request.id,
      v_request.status,
      NULL::TEXT,
      NULL::TEXT,
      v_request.email,
      v_request.full_name;
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

  UPDATE public.invitation_requests
  SET status = 'approved'
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
    'active',
    now(),
    v_expires_at,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    tier = EXCLUDED.tier,
    status = 'active',
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = now();

  UPDATE public.profiles
  SET
    role = v_granted_role::public.user_role,
    participant_type = v_granted_role,
    updated_at = now()
  WHERE user_id = v_request.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.status,
    v_tier,
    v_granted_role,
    v_request.email,
    v_request.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT) IS
  'Admin-only Quick Sale invitation review workflow. Atomically approves/rejects requests, creates investor subscription, and grants profile role. Callable only through service-role Edge Function.';
