-- TEST FIXTURE ONLY. Apply inside a rolled-back proof transaction, after setting
-- maiprop.test_disposable_database. Not a runtime migration or D0 repair.
-- Before (immutable source template): profiles service_role none; history none.
-- Captured: profiles/history service_role=arwdDxtm. Simulate only SELECT/UPDATE
-- required by invoker finalization, plus profiles INSERT for the real-role guard probe.
-- No anon/authenticated grant changes. PostgreSQL17 MAINTAIN is not simulated.
DO $$ BEGIN IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR inet_server_addr() IS NOT NULL OR current_database() !~ '^maiprop_t7c_source_'
 THEN RAISE EXCEPTION 'owned source test clone required'; END IF; END $$;
GRANT SELECT,UPDATE,INSERT ON public.profiles TO service_role;
GRANT SELECT,UPDATE ON public.role_switch_history TO service_role;
