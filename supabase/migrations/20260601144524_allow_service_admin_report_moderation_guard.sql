-- Allow the service-role AdminReports moderation RPC to update profile
-- moderation fields without weakening direct profile writes.

CREATE OR REPLACE FUNCTION public.profiles_guard_account_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service_actor_text TEXT := current_setting('maiprop.admin_report_moderation_actor', TRUE);
  v_service_actor UUID;
  v_service_actor_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_service_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_service_actor := v_service_actor_text::UUID;
    v_service_actor_is_admin := public.has_platform_admin(v_service_actor);
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.account_moderation_reason IS DISTINCT FROM OLD.account_moderation_reason
     OR NEW.account_moderated_at IS DISTINCT FROM OLD.account_moderated_at
     OR NEW.account_moderated_by IS DISTINCT FROM OLD.account_moderated_by THEN
    IF NOT (
      v_service_actor_is_admin
      OR public.has_platform_admin((SELECT auth.uid()))
    ) THEN
      NEW.account_status := OLD.account_status;
      NEW.account_moderation_reason := OLD.account_moderation_reason;
      NEW.account_moderated_at := OLD.account_moderated_at;
      NEW.account_moderated_by := OLD.account_moderated_by;
    END IF;
  END IF;

  RETURN NEW;
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

  PERFORM set_config(
    'maiprop.admin_report_moderation_actor',
    _admin_user_id::TEXT,
    TRUE
  );

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

REVOKE ALL ON FUNCTION public.profiles_guard_account_moderation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_guard_account_moderation()
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_ban_reported_content_owner_for_user(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_reported_content_owner_for_user(UUID, UUID, TEXT)
  TO service_role;

DO $$
DECLARE
  fn REGPROCEDURE := 'public.admin_ban_reported_content_owner_for_user(uuid,uuid,text)'::REGPROCEDURE;
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_ban_reported_content_owner_for_user must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute admin_ban_reported_content_owner_for_user';
  END IF;
END $$;
