-- Supabase DB lint flags p_leaving_role as unused in the role-switch cleanup
-- helper. Keep the existing cleanup body intact and add explicit validation so
-- callers cannot invoke the cleanup without naming the role being left.

DO $$
DECLARE
  v_signature regprocedure := 'private.cleanup_role_switch_dependencies(uuid,text)'::regprocedure;
  v_def text;
  v_marker text := '  -- Let overdue Quick Sale reservations expire first.';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'cleanup_role_switch_dependencies(uuid,text) missing';
  END IF;

  IF position('role_switch_leaving_role_required' IN v_def) = 0 THEN
    IF position(v_marker IN v_def) = 0 THEN
      RAISE EXCEPTION 'cleanup_role_switch_dependencies marker not found';
    END IF;

    v_def := replace(
      v_def,
      v_marker,
      '  IF NULLIF(btrim(p_leaving_role), '''') IS NULL THEN
    RAISE EXCEPTION ''role_switch_leaving_role_required'';
  END IF;

' || v_marker
    );

    EXECUTE v_def;
  END IF;
END $$;
