-- Create a service-role role-switch audit RPC with an explicit verified user id.
-- The log-role-switch Edge Function authenticates the caller first, then calls
-- this helper through a service-role client. The legacy caller-context helper is
-- no longer browser-executable because the advisor-hardening migration revokes
-- authenticated EXECUTE from sensitive SECURITY DEFINER helpers.

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
    user_id,
    from_type,
    to_type,
    switch_kind,
    had_active_sub,
    sub_cancelled
  )
  VALUES (
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
DECLARE
  legacy_fn regprocedure;
BEGIN
  legacy_fn := to_regprocedure('public.record_role_switch_audit(text,text,text,boolean,boolean)');
  IF legacy_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', legacy_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', legacy_fn);
  END IF;
END $$;

DO $$
DECLARE
  service_fn regprocedure;
  legacy_fn regprocedure;
BEGIN
  service_fn := to_regprocedure('public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean)');
  IF service_fn IS NULL THEN
    RAISE EXCEPTION 'service role-switch audit RPC is missing';
  END IF;

  IF has_function_privilege('anon', service_fn::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', service_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service role-switch audit RPC must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', service_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service role-switch audit RPC must remain service-callable';
  END IF;

  legacy_fn := to_regprocedure('public.record_role_switch_audit(text,text,text,boolean,boolean)');
  IF legacy_fn IS NOT NULL THEN
    IF has_function_privilege('anon', legacy_fn::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', legacy_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy role-switch audit RPC must not be browser-executable';
    END IF;
  END IF;
END $$;
