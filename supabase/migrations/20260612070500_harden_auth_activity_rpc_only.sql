-- Production hotfix for already-created auth activity telemetry.
-- Fresh databases also get this hardening at the end of
-- 20260707164000_add_user_auth_activity_events.sql after the table exists.

DO $$
BEGIN
  IF to_regclass('public.user_auth_activity_events') IS NULL THEN
    RAISE NOTICE 'public.user_auth_activity_events does not exist yet; skipping direct-write hardening';
    RETURN;
  END IF;

  REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_auth_activity_events FROM authenticated;
  GRANT SELECT ON TABLE public.user_auth_activity_events TO authenticated;

  DROP POLICY IF EXISTS "user_auth_activity_events_insert_own"
    ON public.user_auth_activity_events;

  IF has_table_privilege('authenticated', 'public.user_auth_activity_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must record auth activity through public.record_user_auth_activity, not direct INSERT';
  END IF;
END $$;
