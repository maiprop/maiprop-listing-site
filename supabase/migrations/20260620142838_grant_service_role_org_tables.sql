-- Keep server-side clients explicit after enterprise tenant tables revoke
-- browser-role access. Supabase service_role bypasses RLS, but PostgREST still
-- needs table privileges for admin fixtures, Edge Functions, and cleanup jobs.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_memberships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_domains TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_sso_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.procurement_evidence TO service_role;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'organizations',
    'organization_memberships',
    'organization_domains',
    'organization_sso_providers',
    'procurement_evidence'
  ]
  LOOP
    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'service_role missing tenant table privileges on public.%', v_table;
    END IF;

    IF has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'anon must not have tenant write privileges on public.%', v_table;
    END IF;
  END LOOP;
END $$;
