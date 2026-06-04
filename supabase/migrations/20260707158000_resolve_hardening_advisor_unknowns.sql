-- Resolve advisor drift introduced by the hardening migrations:
-- - trigger/internal SECURITY DEFINER helpers must not be browser-executable
-- - addon purchase ledger foreign keys need supporting indexes

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    to_regprocedure('public.guard_viewing_status_transitions()'),
    to_regprocedure('public.check_listing_quota()')
  ] LOOP
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- RLS policies use the private helper, not direct browser calls to the public
-- wrapper. Keep the private helper callable by authenticated users for policy
-- evaluation and by service-role Edge Functions.
DO $$
DECLARE
  fn regprocedure := to_regprocedure('private.check_listing_quota()');
BEGIN
  IF fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_addon_purchases_user_id
  ON public.addon_purchases (user_id);

DO $$
BEGIN
  IF to_regprocedure('public.guard_viewing_status_transitions()') IS NOT NULL
     AND (
       has_function_privilege('anon', 'public.guard_viewing_status_transitions()'::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.guard_viewing_status_transitions()'::regprocedure, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'guard_viewing_status_transitions must not be browser-executable';
  END IF;

  IF to_regprocedure('public.check_listing_quota()') IS NOT NULL
     AND (
       has_function_privilege('anon', 'public.check_listing_quota()'::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.check_listing_quota()'::regprocedure, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'public.check_listing_quota must not be browser-executable';
  END IF;

  IF to_regprocedure('private.check_listing_quota()') IS NOT NULL
     AND NOT has_function_privilege('authenticated', 'private.check_listing_quota()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'private.check_listing_quota must remain callable for RLS evaluation';
  END IF;

  IF to_regclass('public.idx_addon_purchases_user_id') IS NULL THEN
    RAISE EXCEPTION 'addon_purchases user_id index is required';
  END IF;
END $$;
