-- Admit the retained queue worker's HTTP 429 audit status after selected email admission.
-- The canonical operation constraints and legacy sent-message index are unchanged.
BEGIN;

DO $guard$
DECLARE
  v_definition text;
  v_old constant text := 'CHECK ((status = ANY (ARRAY[''pending''::text, ''sent''::text, ''suppressed''::text, ''failed''::text, ''bounced''::text, ''complained''::text, ''dlq''::text])))';
  v_new constant text := 'CHECK ((status = ANY (ARRAY[''pending''::text, ''sent''::text, ''suppressed''::text, ''failed''::text, ''bounced''::text, ''complained''::text, ''dlq''::text, ''rate_limited''::text])))';
BEGIN
  IF pg_catalog.to_regclass('public.email_send_log') IS NULL
    OR pg_catalog.to_regclass('public.scheduled_http_dispatches') IS NULL THEN
    RAISE EXCEPTION 'queue_rate_limit_required_relation_missing';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.email_send_log'::regclass) <> 5
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.email_send_log'::regclass
        AND conname = 'email_send_log_recipient_compat_check' AND convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.email_send_log'::regclass
        AND conname = 'email_send_log_canonical_check' AND convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.email_send_log'::regclass
        AND conname = 'email_send_log_first_dispatch_fkey' AND convalidated)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
      WHERE i.indrelid = 'public.email_send_log'::regclass
        AND c.relname = 'idx_email_send_log_message_sent_unique' AND i.indisvalid)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_index
      WHERE indrelid = 'public.email_send_log'::regclass AND NOT indisvalid) THEN
    RAISE EXCEPTION 'queue_rate_limit_selected_email_shape_drift';
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_definition
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.email_send_log'::regclass
      AND conname = 'email_send_log_status_check' AND convalidated;
  IF v_definition = v_new THEN
    RETURN;
  END IF;
  IF v_definition IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'queue_rate_limit_status_check_drift';
  END IF;
  ALTER TABLE public.email_send_log DROP CONSTRAINT email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));
END;
$guard$;

COMMIT;
