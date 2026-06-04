REVOKE ALL ON TABLE public.user_search_events FROM anon;
GRANT SELECT, INSERT ON TABLE public.user_search_events TO authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.user_search_events', 'SELECT')
     OR has_table_privilege('anon', 'public.user_search_events', 'INSERT')
     OR has_table_privilege('anon', 'public.user_search_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.user_search_events', 'DELETE') THEN
    RAISE EXCEPTION 'anon must not have direct privileges on public.user_search_events';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_search_events', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.user_search_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must keep insert/select access to public.user_search_events';
  END IF;
END;
$$;
