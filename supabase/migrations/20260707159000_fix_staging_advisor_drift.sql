-- Close staging-only advisor drift after the highest-risk hardening chain.
-- This keeps the new marketing_leads owner FK indexed, removes browser EXECUTE
-- from internal trigger helpers, and reasserts cached auth lookups on simple
-- owner-scoped policies.

DO $$
BEGIN
  IF to_regclass('public.marketing_leads') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketing_leads'
         AND column_name = 'owner_id'
     ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_marketing_leads_owner_id ON public.marketing_leads (owner_id)';
  END IF;
END $$;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    to_regprocedure('public.log_user_role_change()'),
    to_regprocedure('public.rls_auto_enable()')
  ] LOOP
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
    CREATE POLICY "Users can view their own roles"
      ON public.user_roles
      FOR SELECT
      TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.private_owner_ad_alerts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users manage own private owner alerts" ON public.private_owner_ad_alerts;
    CREATE POLICY "Users manage own private owner alerts"
      ON public.private_owner_ad_alerts
      FOR ALL
      TO authenticated
      USING (user_id = (SELECT auth.uid()))
      WITH CHECK (user_id = (SELECT auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.listings') IS NOT NULL
     AND to_regprocedure('private.check_listing_quota()') IS NOT NULL THEN
    DROP POLICY IF EXISTS listing_insert_quota ON public.listings;
    CREATE POLICY listing_insert_quota
      ON public.listings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        owner_id = (SELECT auth.uid())
        AND (SELECT private.check_listing_quota())
      );
  END IF;
END $$;

DO $$
DECLARE
  log_user_role_change_fn regprocedure := to_regprocedure('public.log_user_role_change()');
  rls_auto_enable_fn regprocedure := to_regprocedure('public.rls_auto_enable()');
BEGIN
  IF to_regclass('public.marketing_leads') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'marketing_leads'
         AND column_name = 'owner_id'
     )
     AND to_regclass('public.idx_marketing_leads_owner_id') IS NULL THEN
    RAISE EXCEPTION 'marketing_leads.owner_id foreign key must have a supporting index';
  END IF;

  IF log_user_role_change_fn IS NOT NULL
     AND (
       has_function_privilege('anon', log_user_role_change_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', log_user_role_change_fn, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'log_user_role_change must not be browser-executable';
  END IF;

  IF rls_auto_enable_fn IS NOT NULL
     AND (
       has_function_privilege('anon', rls_auto_enable_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', rls_auto_enable_fn, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'rls_auto_enable must not be browser-executable';
  END IF;
END $$;
