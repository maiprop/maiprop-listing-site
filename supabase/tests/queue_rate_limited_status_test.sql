\set ON_ERROR_STOP on
BEGIN;
SELECT plan(4);

SELECT is(
  (SELECT pg_catalog.pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
    WHERE conrelid='public.email_send_log'::regclass
      AND conname='email_send_log_status_check' AND convalidated),
  'CHECK ((status = ANY (ARRAY[''pending''::text, ''sent''::text, ''suppressed''::text, ''failed''::text, ''bounced''::text, ''complained''::text, ''dlq''::text, ''rate_limited''::text])))',
  'status CHECK adds only rate_limited');

DO $proof$
DECLARE v_status text;
BEGIN
  FOREACH v_status IN ARRAY ARRAY['pending','sent','suppressed','failed','bounced','complained','dlq','rate_limited'] LOOP
    INSERT INTO public.email_send_log(template_name,recipient_email,status)
      VALUES ('queue_status_probe','queue-probe@example.test',v_status);
  END LOOP;
  BEGIN
    INSERT INTO public.email_send_log(template_name,recipient_email,status)
      VALUES ('queue_status_probe','queue-probe@example.test','invalid_status');
    RAISE EXCEPTION 'invalid_status_admitted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%email_send_log_status_check%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.email_send_log(template_name,recipient_email,status)
      VALUES ('queue_status_probe',NULL,'rate_limited');
    RAISE EXCEPTION 'legacy_null_recipient_admitted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%email_send_log_recipient_compat_check%' THEN RAISE; END IF;
  END;
END;
$proof$;

SELECT is((SELECT count(*)::integer FROM public.email_send_log
    WHERE template_name='queue_status_probe'),8,'all old statuses and rate_limited insert; invalid remains rejected');
SELECT ok((SELECT count(*)=5 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.email_send_log'::regclass), 'selected canonical and recipient guards remain');
SELECT ok((SELECT count(*)=11 FROM pg_catalog.pg_index
    WHERE indrelid='public.email_send_log'::regclass AND indisvalid), 'selected and legacy indexes remain valid');

SELECT * FROM finish();
ROLLBACK;
