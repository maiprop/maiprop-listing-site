-- Reassert internal security helper EXECUTE surface after historical staging
-- drift and earlier migration variants that granted browser roles direct RPC
-- access. These helpers are used by RLS, triggers, or service-role Edge
-- Functions; browser-callable flows must use app-facing Edge Functions/RPCs.

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.authoritative_role()',
    'public.authoritative_role(uuid)',
    'public.check_listing_quota()',
    'public.has_platform_admin(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.has_role(uuid,public.user_role)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.authoritative_role()',
    'public.authoritative_role(uuid)',
    'public.check_listing_quota()',
    'public.has_platform_admin(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.has_role(uuid,public.user_role)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      IF has_function_privilege('anon', fn::oid, 'EXECUTE')
         OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'internal security helper remains browser-executable: %', sig;
      END IF;

      IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'internal security helper must remain service-callable: %', sig;
      END IF;
    END IF;
  END LOOP;
END $$;
