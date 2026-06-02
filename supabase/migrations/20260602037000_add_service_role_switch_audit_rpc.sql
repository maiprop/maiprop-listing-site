-- Phase 1: add a service-role role-switch audit RPC with an explicit verified
-- user id. The log-role-switch Edge Function authenticates the caller first,
-- then calls this RPC through a service-role client. The legacy caller-context
-- RPC remains callable until the Edge Function deployment is verified.

CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user(
  _user_id uuid,
  _from_type text,
  _to_type text,
  _switch_kind text,
  _had_active_sub boolean,
  _sub_cancelled boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.role_switch_history(
    user_id, from_type, to_type, switch_kind, had_active_sub, sub_cancelled
  ) VALUES (
    _user_id,
    _from_type,
    NULLIF(_to_type, ''),
    _switch_kind,
    _had_active_sub,
    _sub_cancelled
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

COMMENT ON FUNCTION public.record_role_switch_audit_for_user(uuid, text, text, text, boolean, boolean) IS
  'Service-role role-switch audit RPC. The Edge Function verifies the caller JWT and passes the verified user id explicitly.';

REVOKE ALL ON FUNCTION public.record_role_switch_audit_for_user(uuid, text, text, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_role_switch_audit_for_user(uuid, text, text, text, boolean, boolean)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role-switch audit RPC must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role-switch audit RPC must remain service-callable';
  END IF;
END $$;
