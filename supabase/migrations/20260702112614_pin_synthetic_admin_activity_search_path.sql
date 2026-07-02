-- Follow-up for staging databases that already applied
-- 20260702040225_exclude_synthetic_admin_activity.sql before the helper
-- carried an explicit search_path. Fresh databases also apply this harmlessly.

ALTER FUNCTION private.is_synthetic_admin_activity_identity(text, text)
  SET search_path = pg_catalog;

DO $$
DECLARE
  v_config text[];
BEGIN
  SELECT p.proconfig
  INTO v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'is_synthetic_admin_activity_identity'
    AND pg_get_function_identity_arguments(p.oid) = 'p_email text, p_display_name text';

  IF v_config IS NULL OR NOT ('search_path=pg_catalog' = ANY(v_config)) THEN
    RAISE EXCEPTION 'private.is_synthetic_admin_activity_identity must pin search_path to pg_catalog';
  END IF;
END $$;
