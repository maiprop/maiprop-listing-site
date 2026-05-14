-- High-trust role activation hardening.
--
-- Self-service onboarding may only complete roles that do not imply paid or
-- approval-gated access. Agent, developer, investor, and institutional roles
-- must be granted by trusted review/payment flows.
--
-- Invitation approval records the approved tier as pending payment. It does
-- not create an active investor subscription or flip the profile role; Stripe
-- or another payment-confirmation path must perform activation.

ALTER TABLE public.investor_subscriptions
  DROP CONSTRAINT IF EXISTS investor_subscriptions_status_check;

ALTER TABLE public.investor_subscriptions
  ADD CONSTRAINT investor_subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'pending_payment'));

CREATE OR REPLACE FUNCTION public.complete_onboarding_role(
  p_role public.user_role,
  p_participant_type text,
  p_display_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_participant_type NOT IN ('buyer','seller','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;

  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;

  IF p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  PERFORM public.complete_onboarding_role_for_user(
    v_uid,
    p_role,
    p_participant_type,
    p_display_name,
    p_city,
    p_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_role(public.user_role, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_role(public.user_role, text, text, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user(
  p_user_id uuid,
  p_role public.user_role,
  p_participant_type text,
  p_display_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_role public.user_role;
  v_was_switching boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, role_switch_in_progress_at IS NOT NULL
    INTO v_old_role, v_was_switching
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF p_participant_type NOT IN ('buyer','seller','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;

  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;

  IF p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  IF p_role = 'professional'::public.user_role THEN
    IF nullif(trim(coalesce(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.user_id = p_user_id AND pr.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  TO service_role;

DROP FUNCTION IF EXISTS public.admin_review_invitation_request(UUID, UUID, TEXT, TEXT, TEXT);

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
    SET status = 'rejected'
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
  'Admin-only Quick Sale invitation review workflow. Approval records the tier as pending_payment and leaves paid access inactive until Stripe/payment confirmation activates it.';
