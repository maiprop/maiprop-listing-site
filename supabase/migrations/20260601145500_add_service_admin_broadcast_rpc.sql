-- Add a service-role-only Admin Broadcast RPC that receives the verified
-- admin actor explicitly from the protected Edge Function.

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification_for_user(
  _admin_user_id UUID,
  p_segment TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'admin_broadcast',
  p_link TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := _admin_user_id;
  v_segment TEXT := lower(trim(coalesce(p_segment, '')));
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_segment NOT IN ('all', 'investors', 'sellers', 'agents', 'professionals', 'developers') THEN
    RAISE EXCEPTION 'invalid_segment';
  END IF;

  IF length(trim(coalesce(p_title, ''))) = 0 OR length(trim(coalesce(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'title_and_body_required';
  END IF;

  FOR v_rec IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    WHERE p.user_id IS NOT NULL
      AND p.user_id <> v_actor
      AND COALESCE(p.account_status, 'active') = 'active'
      AND (
        v_segment = 'all'
        OR (v_segment = 'investors' AND (
          p.investor_mode = true
          OR p.role::TEXT IN ('investor', 'institutional')
          OR p.participant_type IN ('investor', 'institutional')
          OR EXISTS (
            SELECT 1
            FROM public.investor_subscriptions s
            WHERE s.user_id = p.user_id
              AND s.status IN ('active', 'trial')
          )
        ))
        OR (v_segment = 'sellers' AND (p.role::TEXT = 'seller_landlord' OR p.participant_type = 'seller'))
        OR (v_segment = 'agents' AND (p.role::TEXT = 'agent' OR p.participant_type = 'agent'))
        OR (v_segment = 'professionals' AND (p.role::TEXT = 'professional' OR p.participant_type = 'professional'))
        OR (v_segment = 'developers' AND (p.role::TEXT = 'developer' OR p.participant_type = 'developer'))
      )
  LOOP
    PERFORM private.insert_interaction_notification(
      v_rec.user_id,
      v_actor,
      trim(p_title),
      trim(p_body),
      COALESCE(NULLIF(trim(p_type), ''), 'admin_broadcast'),
      NULLIF(trim(coalesce(p_link, '')), '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.admin_broadcast_notification_for_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Service-role-only Admin Broadcast RPC. The protected Edge Function passes the verified admin user id explicitly.';

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)');
BEGIN
  IF fn IS NULL THEN
    RAISE EXCEPTION 'admin_broadcast_notification_for_user RPC was not created';
  END IF;

  IF has_function_privilege('anon', fn::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_broadcast_notification_for_user must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute admin_broadcast_notification_for_user';
  END IF;
END $$;
