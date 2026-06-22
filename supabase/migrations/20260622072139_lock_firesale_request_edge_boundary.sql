-- Quick Sale request creation and rollback now go through the authenticated
-- submit-firesale-request Edge Function. Keep owner reads in place, but remove
-- direct browser table writes so entitlement and ownership checks are enforced
-- server-side before `firesale_requests` is mutated.

DO $$
BEGIN
  IF to_regclass('public.firesale_requests') IS NULL THEN
    RETURN;
  END IF;

  REVOKE INSERT, DELETE ON TABLE public.firesale_requests FROM anon, authenticated;
  GRANT INSERT, DELETE ON TABLE public.firesale_requests TO service_role;

  IF has_table_privilege('authenticated', 'public.firesale_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.firesale_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.firesale_requests', 'DELETE')
     OR has_table_privilege('anon', 'public.firesale_requests', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must submit Quick Sale requests through submit-firesale-request';
  END IF;
END
$$;
