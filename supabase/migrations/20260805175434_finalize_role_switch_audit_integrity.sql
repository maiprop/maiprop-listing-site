-- Finalize the role-switch audit rollout after the preceding transactional
-- schema migration has committed. New writes are already protected by the
-- NOT VALID foreign key; this phase adds supporting indexes before validating
-- legacy rows.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a Supabase migration transaction.
-- For modest tables we use a fail-fast maintenance-window build with strict
-- lock and execution ceilings. Large tables must be prebuilt online after the
-- preceding migration commits; the exception hints contain the exact commands.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_profiles_index_ready boolean;
  v_reconciliation_index_ready boolean;
  v_profiles_heap_bytes bigint;
  v_history_heap_bytes bigint;
BEGIN
  SELECT COALESCE(bool_and(index_state.indisvalid AND index_state.indisready), false)
  INTO v_profiles_index_ready
  FROM pg_index index_state
  WHERE index_state.indexrelid = to_regclass('public.idx_profiles_role_switch_audit_id');

  SELECT COALESCE(bool_and(index_state.indisvalid AND index_state.indisready), false)
  INTO v_reconciliation_index_ready
  FROM pg_index index_state
  WHERE index_state.indexrelid = to_regclass('public.idx_role_switch_history_reconciliation_due');

  IF to_regclass('public.idx_profiles_role_switch_audit_id') IS NOT NULL
     AND NOT v_profiles_index_ready THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'role_switch_audit_invalid_index_requires_cleanup',
      DETAIL = 'idx_profiles_role_switch_audit_id exists but is not ready and valid.',
      HINT = 'Outside a transaction, drop the invalid index concurrently, then rerun the online prebuild command.';
  END IF;

  IF to_regclass('public.idx_role_switch_history_reconciliation_due') IS NOT NULL
     AND NOT v_reconciliation_index_ready THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'role_switch_audit_invalid_index_requires_cleanup',
      DETAIL = 'idx_role_switch_history_reconciliation_due exists but is not ready and valid.',
      HINT = 'Outside a transaction, drop the invalid index concurrently, then rerun the online prebuild command.';
  END IF;

  IF NOT v_profiles_index_ready THEN
    v_profiles_heap_bytes := pg_relation_size('public.profiles'::regclass);
    IF v_profiles_heap_bytes > 134217728 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'role_switch_audit_index_prebuild_required',
        DETAIL = format(
          'profiles is %s bytes; refusing a blocking index build in a transactional migration.',
          v_profiles_heap_bytes
        ),
        HINT = 'After phase one commits, run outside a transaction: SET lock_timeout = ''5s''; SET statement_timeout = ''30min''; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role_switch_audit_id ON public.profiles(role_switch_audit_id) WHERE role_switch_audit_id IS NOT NULL;';
    END IF;
  END IF;

  IF NOT v_reconciliation_index_ready THEN
    v_history_heap_bytes := pg_relation_size('public.role_switch_history'::regclass);
    IF v_history_heap_bytes > 134217728 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'role_switch_audit_index_prebuild_required',
        DETAIL = format(
          'role_switch_history is %s bytes; refusing a blocking index build in a transactional migration.',
          v_history_heap_bytes
        ),
        HINT = 'After phase one commits, run outside a transaction: SET lock_timeout = ''5s''; SET statement_timeout = ''30min''; CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_switch_history_reconciliation_due ON public.role_switch_history(billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE billing_reconciliation_required = true;';
    END IF;
  END IF;

  IF NOT v_profiles_index_ready THEN
    LOCK TABLE public.profiles IN SHARE MODE NOWAIT;
    EXECUTE 'CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles(role_switch_audit_id) WHERE role_switch_audit_id IS NOT NULL';
  END IF;

  IF NOT v_reconciliation_index_ready THEN
    LOCK TABLE public.role_switch_history IN SHARE MODE NOWAIT;
    EXECUTE 'CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history(billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE billing_reconciliation_required = true';
  END IF;
END
$migration$;

-- FK validation scans existing rows under a lock compatible with normal writes.
-- Give the scan more time than the bounded blocking index phase while retaining
-- the short lock-acquisition ceiling.
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey;
