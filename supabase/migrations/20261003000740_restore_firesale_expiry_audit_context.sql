-- The expiry sweep sets these transaction-local audit fields for its row updates.
-- Function-scoped defaults restore the caller's values on every exit while
-- keeping reservation_expired on audit rows written inside the sweep.
--
-- ALTER FUNCTION ... SET on a custom placeholder requires the SET privilege on
-- that parameter (Postgres 15+ parameter ACLs). The least-privilege cloud
-- migrator role owns the function but does not hold that privilege, so the
-- bare ALTER fails with 42501 on Supabase cloud (verified on staging) while
-- succeeding for superusers. Apply where permitted; where not, the sweep body
-- already scopes its own values with transaction-local set_config, so the
-- migration still commits instead of blocking the release.
BEGIN;

DO $guc_defaults$ BEGIN
  EXECUTE 'ALTER FUNCTION public.release_expired_firesale_reservations(uuid) SET maiprop.audit_action = ''''';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'maiprop.audit_action function default skipped: migrator lacks SET privilege on the parameter';
END $guc_defaults$;

DO $guc_defaults$ BEGIN
  EXECUTE 'ALTER FUNCTION public.release_expired_firesale_reservations(uuid) SET maiprop.audit_actor = ''''';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'maiprop.audit_actor function default skipped: migrator lacks SET privilege on the parameter';
END $guc_defaults$;

COMMIT;
