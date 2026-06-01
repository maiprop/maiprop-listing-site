-- Remove direct browser execution from legacy AdminReports moderation RPCs.
-- Browsers now call admin-content-report-action, which verifies the caller JWT
-- and invokes service-role-only explicit-admin RPCs.

REVOKE ALL ON FUNCTION public.admin_resolve_listing_report(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_listing_report(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_suspend_reported_listing(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_reported_listing(UUID, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_ban_reported_content_owner(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_reported_content_owner(UUID, TEXT)
  TO service_role;

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_resolve_listing_report(uuid)',
    'public.admin_suspend_reported_listing(uuid,text)',
    'public.admin_ban_reported_content_owner(uuid,text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'expected legacy admin report moderation RPC % to exist', sig;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy admin report moderation RPC % must not remain browser-callable', sig;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must retain EXECUTE on legacy admin report moderation RPC %', sig;
    END IF;
  END LOOP;
END $$;
