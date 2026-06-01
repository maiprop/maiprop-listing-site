-- Add service-role-only report moderation RPCs for the AdminReports Edge Function.
-- The legacy admin_* RPCs use auth.uid(), so service-role Edge calls need
-- explicit-admin variants after verifying the caller JWT.

CREATE OR REPLACE FUNCTION public.admin_resolve_listing_report_for_user(
  _admin_user_id UUID,
  p_report_id UUID
)
RETURNS public.listing_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.listing_reports%ROWTYPE;
  v_link TEXT;
BEGIN
  IF _admin_user_id IS NULL OR NOT public.has_platform_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = p_report_id
  RETURNING * INTO v_report;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_link := CASE
    WHEN v_report.entity_type = 'firesale_request' THEN '/firesale'
    ELSE '/property/' || v_report.entity_id::TEXT
  END;

  IF v_report.reporter_id IS NOT NULL THEN
    PERFORM private.insert_interaction_notification(
      v_report.reporter_id,
      _admin_user_id,
      'Report reviewed',
      'Your report has been reviewed by our moderation team.',
      'report',
      v_link
    );
  END IF;

  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suspend_reported_listing_for_user(
  _admin_user_id UUID,
  p_report_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.listing_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.listing_reports%ROWTYPE;
  v_listing RECORD;
BEGIN
  IF _admin_user_id IS NULL OR NOT public.has_platform_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report
  FROM public.listing_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_report.entity_type <> 'listing' THEN
    RAISE EXCEPTION 'report_entity_is_not_listing' USING ERRCODE = '23514';
  END IF;

  SELECT id, owner_id, title INTO v_listing
  FROM public.listings
  WHERE id = v_report.entity_id
  FOR UPDATE;

  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.listings
  SET status = 'paused'::public.listing_status,
      updated_at = now()
  WHERE id = v_listing.id;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = v_report.id
  RETURNING * INTO v_report;

  PERFORM private.insert_interaction_notification(
    v_listing.owner_id,
    _admin_user_id,
    'Listing suspended',
    concat_ws(
      ' ',
      'Your listing',
      COALESCE(NULLIF(v_listing.title, ''), v_listing.id::TEXT),
      'was paused after a moderation review.',
      NULLIF(p_reason, '')
    ),
    'moderation',
    '/dashboard/listings'
  );

  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ban_reported_content_owner_for_user(
  _admin_user_id UUID,
  p_report_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.listing_reports%ROWTYPE;
  v_owner_id UUID;
BEGIN
  IF _admin_user_id IS NULL OR NOT public.has_platform_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report
  FROM public.listing_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_report.entity_type = 'listing' THEN
    SELECT owner_id INTO v_owner_id
    FROM public.listings
    WHERE id = v_report.entity_id;
  ELSIF v_report.entity_type = 'firesale_request' THEN
    SELECT user_id INTO v_owner_id
    FROM public.firesale_requests
    WHERE id = v_report.entity_id;
  ELSE
    RAISE EXCEPTION 'unsupported_report_entity' USING ERRCODE = '23514';
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'reported_owner_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET account_status = 'banned',
      account_moderation_reason = COALESCE(NULLIF(p_reason, ''), 'Banned after moderation review.'),
      account_moderated_at = now(),
      account_moderated_by = _admin_user_id,
      investor_mode = false,
      updated_at = now()
  WHERE user_id = v_owner_id;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = v_report.id;

  PERFORM private.insert_interaction_notification(
    v_owner_id,
    _admin_user_id,
    'Account banned',
    COALESCE(NULLIF(p_reason, ''), 'Your account was banned after a moderation review.'),
    'moderation',
    '/dashboard/settings'
  );

  RETURN v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_listing_report_for_user(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_listing_report_for_user(UUID, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_suspend_reported_listing_for_user(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_reported_listing_for_user(UUID, UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_ban_reported_content_owner_for_user(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_reported_content_owner_for_user(UUID, UUID, TEXT)
  TO service_role;

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_resolve_listing_report_for_user(uuid,uuid)',
    'public.admin_suspend_reported_listing_for_user(uuid,uuid,text)',
    'public.admin_ban_reported_content_owner_for_user(uuid,uuid,text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'expected service admin report moderation RPC % to exist', sig;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% must not be browser-callable', sig;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute %', sig;
    END IF;
  END LOOP;
END $$;
