-- Explicit Data API grants for Supabase's stricter grant enforcement.
--
-- Supabase's legacy project defaults leave many public-schema tables reachable
-- through broad anon/authenticated grants. RLS still decides row visibility, but
-- future Data API grant enforcement can fail closed if intended table grants are
-- only implicit. This migration reasserts the grants expected by the current
-- RLS policies while keeping internal/service-only tables closed and preserving
-- the column-level update boundary on public.profiles.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  policy_record record;
  target_role text;
  target_privilege text;
  policy_roles text[];
  policy_expression text;
BEGIN
  FOR policy_record IN
    SELECT
      p.schemaname,
      p.tablename,
      p.cmd,
      p.roles,
      p.qual,
      p.with_check
    FROM pg_policies p
    JOIN pg_class c
      ON c.oid = format('%I.%I', p.schemaname, p.tablename)::regclass
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
     AND n.nspname = p.schemaname
    WHERE p.schemaname = 'public'
      AND c.relkind IN ('r', 'p', 'v')
      AND p.tablename NOT IN (
        'email_send_log',
        'email_send_state',
        'email_unsubscribe_tokens',
        'rate_limit_counters',
        'suppressed_emails',
        'profiles'
      )
  LOOP
    policy_roles := ARRAY[]::text[];

    IF 'public' = ANY(policy_record.roles) THEN
      policy_roles := ARRAY['anon', 'authenticated'];
    END IF;
    IF 'anon' = ANY(policy_record.roles) THEN
      policy_roles := array_append(policy_roles, 'anon');
    END IF;
    IF 'authenticated' = ANY(policy_record.roles) THEN
      policy_roles := array_append(policy_roles, 'authenticated');
    END IF;

    policy_roles := ARRAY(SELECT DISTINCT unnest(policy_roles));

    FOREACH target_privilege IN ARRAY CASE policy_record.cmd
      WHEN 'ALL' THEN ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      ELSE ARRAY[policy_record.cmd]
    END
    LOOP
      policy_expression := CASE target_privilege
        WHEN 'INSERT' THEN coalesce(policy_record.with_check, '')
        ELSE coalesce(policy_record.qual, '')
      END;

      -- These policies are intentionally unreachable to anon/authenticated.
      IF btrim(policy_expression) = 'false'
         OR policy_expression ~* 'auth\.role\(\).*service_role' THEN
        CONTINUE;
      END IF;

      FOREACH target_role IN ARRAY policy_roles
      LOOP
        EXECUTE format(
          'GRANT %s ON TABLE %I.%I TO %I',
          target_privilege,
          policy_record.schemaname,
          policy_record.tablename,
          target_role
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- public.profiles contains private/commercial flags. Keep table-level UPDATE
-- revoked and grant only the self-editable columns used by the app.
REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, INSERT ON TABLE public.profiles TO authenticated;
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (
  avatar_url,
  bio,
  city,
  country,
  display_name,
  first_name,
  investor_mode,
  last_name,
  participant_type,
  phone,
  video_link,
  website_url
) ON TABLE public.profiles TO authenticated;

-- Keep service-only/internal tables closed even if older default grants were
-- present. SECURITY DEFINER functions and service-role Edge Functions own these
-- workflows.
REVOKE ALL ON TABLE public.email_send_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_send_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_unsubscribe_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated;
REVOKE ALL ON TABLE public.suppressed_emails FROM anon, authenticated;

DO $$
BEGIN
  IF NOT has_schema_privilege('anon', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'expected anon to have USAGE on schema public';
  END IF;
  IF NOT has_schema_privilege('authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'expected authenticated to have USAGE on schema public';
  END IF;

  IF NOT has_table_privilege('anon', 'public.listings', 'SELECT') THEN
    RAISE EXCEPTION 'expected anon SELECT on public.listings';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.listings', 'SELECT') THEN
    RAISE EXCEPTION 'expected authenticated SELECT on public.listings';
  END IF;
  IF NOT has_table_privilege('anon', 'public.contact_submissions', 'INSERT') THEN
    RAISE EXCEPTION 'expected anon INSERT on public.contact_submissions';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.pricing_configs', 'SELECT') THEN
    RAISE EXCEPTION 'expected authenticated SELECT on public.pricing_configs';
  END IF;

  IF has_table_privilege('anon', 'public.rate_limit_counters', 'SELECT')
     OR has_table_privilege('authenticated', 'public.rate_limit_counters', 'SELECT') THEN
    RAISE EXCEPTION 'rate_limit_counters must remain closed to Data API client roles';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.profiles', 'participant_type', 'UPDATE') THEN
    RAISE EXCEPTION 'expected authenticated column UPDATE on public.profiles.participant_type';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'is_platform_admin', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update public.profiles.is_platform_admin';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'force_pro_access', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update public.profiles.force_pro_access';
  END IF;
END $$;
