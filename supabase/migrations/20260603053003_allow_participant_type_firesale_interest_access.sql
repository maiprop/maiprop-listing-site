-- Align Quick Sale investor interest submission with the dashboard access
-- model. The dashboard can identify paid investor access via participant_type,
-- while the original service-role RPC required profiles.role to already be
-- investor/institutional. Keep the subscription requirement and service-role
-- execute boundary intact.

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.investor_subscriptions s ON s.user_id = p.user_id
    WHERE p.user_id = v_actor
      AND (
        p.role::text IN ('investor', 'institutional')
        OR p.participant_type::text IN ('investor', 'institutional')
      )
      AND s.status IN ('active', 'trial')
  ) AND NOT public.has_platform_admin(v_actor) THEN
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
  'Service-role-only firesale interest submission RPC. Allows paid investor/institutional access through role or participant_type.';
