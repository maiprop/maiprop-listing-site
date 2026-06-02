-- Public role-group helper RPCs are no longer referenced by live RLS policies or
-- browser code. Private-schema equivalents exist for policy use. Keep direct
-- execution out of the Data API to reduce SECURITY DEFINER blast radius.

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.has_buy_side_role(uuid)',
    'public.has_sell_side_role(uuid)'
  ]
  LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.has_buy_side_role(uuid)',
    'public.has_sell_side_role(uuid)'
  ]
  LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      IF has_function_privilege('anon', fn::oid, 'EXECUTE')
         OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'unused public role-group helper remains browser-executable: %', sig;
      END IF;

      IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'unused public role-group helper must remain service-callable: %', sig;
      END IF;
    END IF;
  END LOOP;
END $$;
