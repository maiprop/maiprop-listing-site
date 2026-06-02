-- Supabase Advisor: reduce authenticated SECURITY DEFINER EXECUTE surface.
-- These plan/quota limit calculators are helper functions used by triggers,
-- RLS-facing wrapper functions, or Edge/service flows. The browser should call
-- product-specific wrappers such as check_ai_quota(), check_listing_quota(), or
-- Edge Functions instead of executing these cross-user lookup helpers directly.

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_auction_listing_visible_limit(uuid)',
    'public.get_contact_monthly_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_open_house_rsvp_monthly_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_professionals_per_category_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)'
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
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_auction_listing_visible_limit(uuid)',
    'public.get_contact_monthly_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_open_house_rsvp_monthly_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_professionals_per_category_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)'
  ]
  LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      IF has_function_privilege('anon', fn::oid, 'EXECUTE')
         OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'plan/quota helper RPC remains browser-executable: %', sig;
      END IF;

      IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'plan/quota helper RPC must remain service-callable: %', sig;
      END IF;
    END IF;
  END LOOP;

  -- Product wrappers still need authenticated execution for existing app flows.
  FOREACH sig IN ARRAY ARRAY[
    'public.check_ai_quota(text)',
    'public.check_listing_quota()'
  ]
  LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL
       AND NOT has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'app-facing quota wrapper must remain authenticated-callable: %', sig;
    END IF;
  END LOOP;
END $$;
