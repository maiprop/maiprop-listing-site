DO $activation$
DECLARE
  v_job_id bigint;
  v_schedule text;
  v_command text;
BEGIN
  IF pg_catalog.to_regprocedure(
    'private.invoke_role_switch_billing_reconciliation()'
  ) IS NULL THEN
    RAISE EXCEPTION 'role_switch_reconciliation_invoker_missing';
  END IF;

  SELECT jobid, schedule, command
  INTO v_job_id, v_schedule, v_command
  FROM cron.job
  WHERE jobname = 'reconcile-role-switch-billing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_switch_reconciliation_cron_missing';
  END IF;
  IF v_schedule IS DISTINCT FROM '*/5 * * * *' OR
     v_command IS DISTINCT FROM
       'SELECT private.invoke_role_switch_billing_reconciliation();' THEN
    RAISE EXCEPTION 'role_switch_reconciliation_cron_definition_mismatch';
  END IF;

  PERFORM cron.alter_job(
    job_id := v_job_id,
    active := TRUE
  );
END
$activation$;

SELECT pg_catalog.jsonb_build_object(
  'schema_version', 1,
  'evidence_type', 'maiprop-role-switch-cron-activation',
  'job_id', jobid,
  'job_name', jobname,
  'schedule', schedule,
  'command', command,
  'active', active,
  'activated_at', pg_catalog.clock_timestamp()
)::text
FROM cron.job
WHERE jobname = 'reconcile-role-switch-billing'
  AND schedule = '*/5 * * * *'
  AND command = 'SELECT private.invoke_role_switch_billing_reconciliation();'
  AND active = TRUE;
