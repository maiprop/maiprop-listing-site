-- Reduce Supabase advisor warnings for SECURITY DEFINER functions that are
-- implementation details, not public RPC endpoints.

DO $$
DECLARE
  fn_signature TEXT;
  fn_oid REGPROCEDURE;
BEGIN
  FOREACH fn_signature IN ARRAY ARRAY[
    'public.agent_data_inputs_validate_closing_date()',
    'public.audit_firesale_interest_mutation()',
    'public.enforce_professional_pro_consultation_request()',
    'public.guard_open_house_registration_insert()',
    'public.guard_open_house_registration_update()',
    'public.handle_new_user()',
    'public.invoke_send_saved_search_alerts_cron()',
    'public.profiles_guard_account_moderation()',
    'public.sync_profile_role_from_investor_subscription()'
  ] LOOP
    fn_oid := to_regprocedure(fn_signature);

    IF fn_oid IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_oid);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_oid);
    END IF;
  END LOOP;

  fn_oid := to_regprocedure('public.agent_data_input_discount_pct_per_input()');
  IF fn_oid IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn_oid);
  END IF;
END $$;
