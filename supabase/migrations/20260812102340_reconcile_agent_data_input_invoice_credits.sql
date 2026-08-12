-- Keep invoice-credit reservations stable across webhook retries. The same
-- invoice/user tuple must always reuse the same rows and Stripe idempotency key.
ALTER TABLE public.agent_data_inputs
  ADD COLUMN IF NOT EXISTS stripe_credit_expected_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_credit_operation_key TEXT;

COMMENT ON COLUMN public.agent_data_inputs.stripe_credit_expected_amount_cents IS
  'Expected invoice credit amount recorded before the Stripe mutation for reconciliation.';
COMMENT ON COLUMN public.agent_data_inputs.stripe_credit_operation_key IS
  'Deterministic provider operation key recorded before the Stripe mutation.';

-- CREATE INDEX CONCURRENTLY cannot run in a Supabase migration transaction.
-- Small installations can build this index with strict lock/time ceilings.
-- Larger installations are completed by the signed release-workflow SQL:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_data_inputs_user_discount_invoice
--   ON public.agent_data_inputs USING btree (user_id, discount_invoice_id)
--   WHERE (discount_invoice_id IS NOT NULL);
BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_invoice_index_ready BOOLEAN;
  v_agent_inputs_heap_bytes BIGINT;
  v_online_finalization_required BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(bool_and(
    index_state.indisvalid
    AND index_state.indisready
    AND index_state.indislive
    AND index_state.indisunique = FALSE
    AND index_state.indrelid = 'public.agent_data_inputs'::regclass
    AND access_method.amname = 'btree'
    AND index_state.indnatts = 2
    AND index_state.indnkeyatts = 2
    AND pg_get_indexdef(index_state.indexrelid, 1, TRUE) = 'user_id'
    AND pg_get_indexdef(index_state.indexrelid, 2, TRUE) = 'discount_invoice_id'
    AND pg_get_expr(index_state.indpred, index_state.indrelid, TRUE) =
      'discount_invoice_id IS NOT NULL'
    AND pg_get_indexdef(index_state.indexrelid) =
      'CREATE INDEX idx_agent_data_inputs_user_discount_invoice ON public.agent_data_inputs USING btree (user_id, discount_invoice_id) WHERE (discount_invoice_id IS NOT NULL)'
  ), FALSE)
  INTO v_invoice_index_ready
  FROM pg_index index_state
  JOIN pg_class index_relation
    ON index_relation.oid = index_state.indexrelid
  JOIN pg_am access_method
    ON access_method.oid = index_relation.relam
  WHERE index_state.indexrelid =
    to_regclass('public.idx_agent_data_inputs_user_discount_invoice');

  IF to_regclass('public.idx_agent_data_inputs_user_discount_invoice') IS NOT NULL
     AND NOT v_invoice_index_ready THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'agent_data_input_invalid_invoice_index_requires_cleanup',
      DETAIL = 'idx_agent_data_inputs_user_discount_invoice exists but is not ready, valid, or exact.',
      HINT = 'Outside a transaction, drop the invalid index concurrently, then rerun the signed online finalization.';
  END IF;

  IF NOT v_invoice_index_ready THEN
    v_agent_inputs_heap_bytes :=
      pg_relation_size('public.agent_data_inputs'::regclass);
    IF v_agent_inputs_heap_bytes > 134217728 THEN
      v_online_finalization_required := TRUE;
    ELSE
      LOCK TABLE public.agent_data_inputs IN SHARE MODE NOWAIT;
      EXECUTE 'CREATE INDEX idx_agent_data_inputs_user_discount_invoice ON public.agent_data_inputs USING btree (user_id, discount_invoice_id) WHERE discount_invoice_id IS NOT NULL';
    END IF;
  END IF;

  IF v_online_finalization_required THEN
    RAISE NOTICE 'idx_agent_data_inputs_user_discount_invoice deferred to signed online finalization';
  END IF;
END
$migration$;

REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.apply_verified_data_input_discount(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.apply_verified_data_input_discount(
  p_user_id UUID,
  p_invoice_id TEXT,
  p_subtotal_minor INTEGER,
  p_operation_key TEXT
)
RETURNS TABLE (
  applied_count INT,
  applied_pct NUMERIC,
  expected_amount_cents INT,
  operation_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_per_month INT := public.agent_data_input_max_per_month();
  v_applied INT;
  v_applied_pct NUMERIC;
  v_expected_amount_cents INT;
  v_expected_value_count INT;
  v_expected_distinct_count INT;
  v_operation_value_count INT;
  v_operation_distinct_count INT;
  v_stored_operation_key TEXT;
BEGIN
  IF p_user_id IS NULL
     OR p_invoice_id IS NULL
     OR pg_catalog.length(p_invoice_id) = 0
     OR p_subtotal_minor IS NULL
     OR p_subtotal_minor <= 0
     OR p_operation_key IS NULL
     OR pg_catalog.length(p_operation_key) = 0
  THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'agent_data_input_invoice_credit:' || p_user_id::TEXT || ':' || p_invoice_id,
      0
    )
  );

  SELECT pg_catalog.count(*)::INT,
         LEAST(
           COALESCE(pg_catalog.sum(discount_pct), 0),
           v_max_per_month * public.agent_data_input_discount_pct_per_input()
         )::NUMERIC,
         pg_catalog.count(stripe_credit_expected_amount_cents)::INT,
         pg_catalog.count(DISTINCT stripe_credit_expected_amount_cents)::INT,
         pg_catalog.min(stripe_credit_expected_amount_cents),
         pg_catalog.count(stripe_credit_operation_key)::INT,
         pg_catalog.count(DISTINCT stripe_credit_operation_key)::INT,
         pg_catalog.min(stripe_credit_operation_key)
    INTO v_applied,
         v_applied_pct,
         v_expected_value_count,
         v_expected_distinct_count,
         v_expected_amount_cents,
         v_operation_value_count,
         v_operation_distinct_count,
         v_stored_operation_key
    FROM public.agent_data_inputs
   WHERE user_id = p_user_id
     AND discount_invoice_id = p_invoice_id
     AND COALESCE(discount_applied, FALSE) = TRUE;

  IF v_applied > 0 THEN
    IF v_expected_value_count <> v_applied
       OR v_expected_distinct_count <> 1
       OR v_operation_value_count <> v_applied
       OR v_operation_distinct_count <> 1
       OR v_stored_operation_key <> p_operation_key
       OR v_expected_amount_cents < 1
       OR v_expected_amount_cents <>
          pg_catalog.round((p_subtotal_minor::NUMERIC * v_applied_pct) / 100)::INT
    THEN
      RAISE EXCEPTION 'credit_reservation_expectation_mismatch';
    END IF;

    RETURN QUERY
    SELECT v_applied,
           v_applied_pct,
           v_expected_amount_cents,
           v_stored_operation_key;
    RETURN;
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT id, discount_pct
      FROM public.agent_data_inputs
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND COALESCE(discount_applied, FALSE) = FALSE
       AND applied_to_invoice_at IS NULL
       AND stripe_credit_id IS NULL
     ORDER BY created_at ASC
     LIMIT v_max_per_month
     FOR UPDATE SKIP LOCKED
  ),
  stats AS MATERIALIZED (
    SELECT totals.applied_count,
           totals.applied_pct,
           pg_catalog.round(
             (p_subtotal_minor::NUMERIC * totals.applied_pct) / 100
           )::INT AS expected_amount_cents
      FROM (
        SELECT pg_catalog.count(*)::INT AS applied_count,
               LEAST(
                 COALESCE(pg_catalog.sum(discount_pct), 0),
                 v_max_per_month * public.agent_data_input_discount_pct_per_input()
               )::NUMERIC AS applied_pct
          FROM eligible
      ) totals
  ),
  reserved AS (
    UPDATE public.agent_data_inputs target
       SET discount_applied = TRUE,
           discount_applied_at = pg_catalog.now(),
           discount_invoice_id = p_invoice_id,
           applied_to_invoice_at = pg_catalog.now(),
           stripe_credit_expected_amount_cents = stats.expected_amount_cents,
           stripe_credit_operation_key = p_operation_key
      FROM eligible, stats
     WHERE target.id = eligible.id
       AND stats.expected_amount_cents > 0
     RETURNING eligible.discount_pct,
               target.stripe_credit_expected_amount_cents
  )
  SELECT pg_catalog.count(*)::INT,
         LEAST(
           COALESCE(pg_catalog.sum(discount_pct), 0),
           v_max_per_month * public.agent_data_input_discount_pct_per_input()
         )::NUMERIC,
         COALESCE(
           pg_catalog.max(stripe_credit_expected_amount_cents),
           0
         )::INT
    INTO v_applied, v_applied_pct, v_expected_amount_cents
    FROM reserved;

  RETURN QUERY
  SELECT v_applied,
         v_applied_pct,
         v_expected_amount_cents,
         CASE WHEN v_applied > 0 THEN p_operation_key ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT, INTEGER, TEXT)
  TO service_role;

COMMIT;
