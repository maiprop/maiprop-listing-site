-- Finalize the role-switch audit rollout after the preceding transactional
-- schema migration has committed. New writes are already protected by the
-- NOT VALID foreign key; this phase adds supporting indexes before validating
-- legacy rows.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a Supabase migration transaction.
-- For modest tables we use a fail-fast maintenance-window build with strict
-- lock and execution ceilings. Large tables are finalized by the release
-- workflow outside this transaction with these idempotent commands:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role_switch_audit_id
--   ON public.profiles(role_switch_audit_id)
--   WHERE role_switch_audit_id IS NOT NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_switch_history_reconciliation_due
--   ON public.role_switch_history(billing_reconciliation_next_attempt_at,
--     billing_reconciliation_attempt_count, switched_at)
--   WHERE billing_reconciliation_required = true;

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_profiles_index_ready boolean;
  v_reconciliation_index_ready boolean;
  v_profiles_heap_bytes bigint;
  v_history_heap_bytes bigint;
  v_online_finalization_required boolean := false;
BEGIN
  SELECT COALESCE(bool_and(
    index_state.indisvalid
    AND index_state.indisready
    AND index_state.indislive
    AND index_state.indisunique = false
    AND index_state.indrelid = 'public.profiles'::regclass
    AND access_method.amname = 'btree'
    AND index_state.indnatts = 1
    AND index_state.indnkeyatts = 1
    AND pg_get_indexdef(index_state.indexrelid, 1, true) =
      'role_switch_audit_id'
    AND pg_get_expr(index_state.indpred, index_state.indrelid, true) =
      'role_switch_audit_id IS NOT NULL'
    AND pg_get_indexdef(index_state.indexrelid) =
      'CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles USING btree (role_switch_audit_id) WHERE (role_switch_audit_id IS NOT NULL)'
  ), false)
  INTO v_profiles_index_ready
  FROM pg_index index_state
  JOIN pg_class index_relation
    ON index_relation.oid = index_state.indexrelid
  JOIN pg_am access_method
    ON access_method.oid = index_relation.relam
  WHERE index_state.indexrelid = to_regclass('public.idx_profiles_role_switch_audit_id');

  SELECT COALESCE(bool_and(
    index_state.indisvalid
    AND index_state.indisready
    AND index_state.indislive
    AND index_state.indisunique = false
    AND index_state.indrelid = 'public.role_switch_history'::regclass
    AND access_method.amname = 'btree'
    AND index_state.indnatts = 3
    AND index_state.indnkeyatts = 3
    AND pg_get_indexdef(index_state.indexrelid, 1, true) =
      'billing_reconciliation_next_attempt_at'
    AND pg_get_indexdef(index_state.indexrelid, 2, true) =
      'billing_reconciliation_attempt_count'
    AND pg_get_indexdef(index_state.indexrelid, 3, true) = 'switched_at'
    AND pg_get_expr(index_state.indpred, index_state.indrelid, true) =
      'billing_reconciliation_required = true'
    AND pg_get_indexdef(index_state.indexrelid) =
      'CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history USING btree (billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE (billing_reconciliation_required = true)'
  ), false)
  INTO v_reconciliation_index_ready
  FROM pg_index index_state
  JOIN pg_class index_relation
    ON index_relation.oid = index_state.indexrelid
  JOIN pg_am access_method
    ON access_method.oid = index_relation.relam
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
      v_online_finalization_required := true;
    ELSE
      LOCK TABLE public.profiles IN SHARE MODE NOWAIT;
      EXECUTE 'CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles(role_switch_audit_id) WHERE role_switch_audit_id IS NOT NULL';
    END IF;
  END IF;

  IF NOT v_reconciliation_index_ready THEN
    v_history_heap_bytes := pg_relation_size('public.role_switch_history'::regclass);
    IF v_history_heap_bytes > 134217728 THEN
      v_online_finalization_required := true;
    ELSE
      LOCK TABLE public.role_switch_history IN SHARE MODE NOWAIT;
      EXECUTE 'CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history(billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE billing_reconciliation_required = true';
    END IF;
  END IF;

  IF NOT v_online_finalization_required THEN
    SET LOCAL statement_timeout = '5min';
    EXECUTE 'ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey';
  END IF;
END
$migration$;

COMMIT;
