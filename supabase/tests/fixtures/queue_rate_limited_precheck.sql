-- Run only on an owned clone after trace + selected-email SQL, before queue repair.
BEGIN;
DO $proof$
DECLARE v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_definition
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.email_send_log'::regclass
      AND conname = 'email_send_log_status_check' AND convalidated;
  IF v_definition IS DISTINCT FROM
    'CHECK ((status = ANY (ARRAY[''pending''::text, ''sent''::text, ''suppressed''::text, ''failed''::text, ''bounced''::text, ''complained''::text, ''dlq''::text])))' THEN
    RAISE EXCEPTION 'unexpected_pre_queue_check';
  END IF;
  BEGIN
    INSERT INTO public.email_send_log(template_name,recipient_email,status)
      VALUES ('queue_precheck','queue-probe@example.test','rate_limited');
    RAISE EXCEPTION 'old_check_admitted_rate_limited';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%email_send_log_status_check%' THEN
      RAISE;
    END IF;
  END;
END;
$proof$;
ROLLBACK;
