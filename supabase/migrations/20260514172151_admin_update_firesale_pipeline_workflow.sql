-- Move Quick Sale pipeline status updates and investor notifications into one
-- admin-checked database workflow. This replaces the browser-side sequence:
-- update firesale_requests -> read investor profiles -> insert notifications.

CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal(
  p_deal_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_offer_price NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  deal_id UUID,
  status TEXT,
  notified INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal public.firesale_requests%ROWTYPE;
  v_previous_status TEXT;
  v_status TEXT := lower(trim(coalesce(p_status, '')));
  v_notified INTEGER := 0;
  v_deal_address TEXT;
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status NOT IN ('pending', 'reviewed', 'offer_sent', 'closed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT *
  INTO v_deal
  FROM public.firesale_requests
  WHERE id = p_deal_id
  FOR UPDATE;

  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'firesale_request_not_found';
  END IF;
  v_previous_status := v_deal.status;

  UPDATE public.firesale_requests
  SET
    status = v_status,
    admin_notes = p_admin_notes,
    offer_price = CASE
      WHEN p_offer_price IS NOT NULL THEN p_offer_price
      ELSE offer_price
    END
  WHERE id = p_deal_id
  RETURNING * INTO v_deal;

  IF v_status = 'offer_sent' AND v_previous_status IS DISTINCT FROM 'offer_sent' THEN
    v_deal_address := concat_ws(', ', nullif(v_deal.address, ''), nullif(v_deal.city, ''));
    IF v_deal_address = '' THEN
      v_deal_address := 'a distressed property';
    END IF;

    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      type,
      read,
      link
    )
    SELECT
      p.user_id,
      'New Quick Sale Deal Available',
      'A new distressed property at ' || v_deal_address || ' is available. Offer sent.',
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM public.profiles p
    WHERE p.investor_mode = true;

    GET DIAGNOSTICS v_notified = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) IS
  'Admin-only Quick Sale pipeline workflow. Atomically updates firesale request status/notes/offer price and inserts investor notifications when an offer is sent.';

CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication(
  p_deal_id UUID,
  p_published BOOLEAN
)
RETURNS TABLE (
  deal_id UUID,
  status TEXT,
  published_to_investors BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal public.firesale_requests%ROWTYPE;
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_deal
  FROM public.firesale_requests
  WHERE id = p_deal_id
  FOR UPDATE;

  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'firesale_request_not_found';
  END IF;

  UPDATE public.firesale_requests
  SET
    published_to_investors = p_published,
    status = CASE
      WHEN p_published THEN 'reviewed'
      WHEN status = 'reviewed' THEN 'pending'
      ELSE status
    END
  WHERE id = p_deal_id
  RETURNING * INTO v_deal;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_deal.published_to_investors;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) IS
  'Admin-only Quick Sale publication workflow. Atomically changes the investor visibility flag and compatible screening status.';
