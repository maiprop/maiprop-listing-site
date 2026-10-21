-- Correlate the three existing scheduled HTTP invocations with their Edge outcomes.
-- This migration deliberately does not alter cron jobs or email admission.
BEGIN;
DO $guard$
DECLARE
  r record;
  v_repeat boolean;
  v_expected text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'scheduled_dispatch_owner_mismatch' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (('private','invoke_poll_os_auctions_cron'),('private','invoke_scheduled_followups_cron'),('public','invoke_send_saved_search_alerts_cron'))) <> 3 THEN
    RAISE EXCEPTION 'scheduled_dispatch_invoker_overload_or_missing' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname IN ('start_scheduled_http_dispatch_for_service','finish_scheduled_http_dispatch_for_service',
        'reconcile_scheduled_http_dispatches_for_service','reconcile_scheduled_http_dispatches',
        'scheduled_dispatch_summary_valid','invoke_saved_search_alerts_traced')
        AND n.nspname IN ('public','private')) NOT IN (0,6) THEN
    RAISE EXCEPTION 'scheduled_dispatch_new_routine_drift' USING ERRCODE = '22023';
  END IF;
  v_repeat := pg_catalog.to_regclass('public.scheduled_http_dispatches') IS NOT NULL;
  IF v_repeat <> (pg_catalog.to_regprocedure('public.start_scheduled_http_dispatch_for_service(uuid,text)') IS NOT NULL)
     OR v_repeat <> (pg_catalog.to_regprocedure('public.finish_scheduled_http_dispatch_for_service(uuid,uuid,text,jsonb,text)') IS NOT NULL)
     OR v_repeat <> (pg_catalog.to_regprocedure('private.reconcile_scheduled_http_dispatches(integer)') IS NOT NULL)
     OR v_repeat <> (pg_catalog.to_regprocedure('public.reconcile_scheduled_http_dispatches_for_service(integer)') IS NOT NULL)
     OR v_repeat <> (pg_catalog.to_regprocedure('private.scheduled_dispatch_summary_valid(jsonb)') IS NOT NULL)
     OR v_repeat <> (pg_catalog.to_regprocedure('private.invoke_saved_search_alerts_traced(text)') IS NOT NULL) THEN
    RAISE EXCEPTION 'scheduled_dispatch_partial_install' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.to_regclass('public.sync_log') IS NULL
     OR (SELECT c.relkind <> 'r' OR c.relowner <> 'postgres'::regrole OR NOT c.relrowsecurity
         FROM pg_catalog.pg_class c WHERE c.oid='public.sync_log'::regclass) THEN
    RAISE EXCEPTION 'scheduled_dispatch_sync_log_shape' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.sync_log'::regclass
      AND a.attnum>0 AND NOT a.attisdropped) <> (CASE WHEN v_repeat THEN 10 ELSE 9 END)
     OR (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||a.atttypid::regtype::text||':'||a.attnotnull::text,'|' ORDER BY a.attnum))
         FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.sync_log'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'dispatch_id') IS DISTINCT FROM '1d7bddfe603e34ad4c4056c84b418141'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.sync_log'::regclass
       AND a.attnum>0 AND NOT a.attisdropped AND (a.attname,a.atttypid::regtype::text,a.attnotnull) NOT IN
       (('id','uuid',true),('direction','text',true),('entity_type','text',true),('entity_id','text',true),
        ('status','text',true),('error_message','text',false),('records_affected','integer',false),
        ('payload','jsonb',false),('created_at','timestamp with time zone',true),('dispatch_id','uuid',false)))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid='public.sync_log'::regclass AND NOT i.indisvalid)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.sync_log'::regclass AND NOT c.convalidated)
     OR (SELECT pg_catalog.md5(pg_catalog.string_agg(c.conname||':'||pg_catalog.pg_get_constraintdef(c.oid),'|' ORDER BY c.conname))
       FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.sync_log'::regclass AND c.conname<>'sync_log_dispatch_id_fkey') IS DISTINCT FROM '23a7708bbe410ec1dbaac1681c9418b1'
     OR (SELECT pg_catalog.md5(pg_catalog.string_agg(c.relname||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY c.relname))
       FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.sync_log'::regclass) IS DISTINCT FROM 'd8e3de08bd361dad888c778cc36832e2'
     OR (SELECT pg_catalog.md5(pg_catalog.string_agg(p.polname||':'||pg_catalog.pg_get_expr(p.polqual,p.polrelid)||':'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'|' ORDER BY p.polname))
       FROM pg_catalog.pg_policy p WHERE p.polrelid='public.sync_log'::regclass) IS DISTINCT FROM 'ff532fe5503dc209f7849939a59f20c2'
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgrelid='public.sync_log'::regclass AND NOT t.tgisinternal) <> 0
     OR (SELECT c.relacl::text FROM pg_catalog.pg_class c WHERE c.oid='public.sync_log'::regclass) IS NULL
     OR (SELECT c.relacl::text FROM pg_catalog.pg_class c WHERE c.oid='public.sync_log'::regclass) NOT IN
       ('{postgres=arwdDxt/postgres,authenticated=arwdDxt/postgres,anon=arwdDxt/postgres,service_role=arwdDxt/postgres}',
        '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}')
  THEN
    RAISE EXCEPTION 'scheduled_dispatch_sync_log_drift' USING ERRCODE = '22023';
  END IF;
  IF NOT v_repeat AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.sync_log'::regclass AND a.attname='dispatch_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'scheduled_dispatch_sync_log_conflict' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('scheduled_http_dispatches_dispatch_id_key','scheduled_http_dispatches_net_request_id_key','scheduled_http_dispatches_net_request_id_idx','scheduled_http_dispatches_reconcile_pending_idx')
      AND c.oid NOT IN (SELECT i.indexrelid FROM pg_catalog.pg_index i WHERE i.indrelid=pg_catalog.to_regclass('public.scheduled_http_dispatches')))
  THEN
    RAISE EXCEPTION 'scheduled_dispatch_index_name_conflict' USING ERRCODE = '22023';
  END IF;
  IF v_repeat THEN
    IF (SELECT c.relkind <> 'r' OR c.relowner <> 'postgres'::regrole OR NOT c.relrowsecurity
        FROM pg_catalog.pg_class c WHERE c.oid='public.scheduled_http_dispatches'::regclass)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid='public.scheduled_http_dispatches'::regclass AND NOT i.indisvalid)
       OR (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.scheduled_http_dispatches'::regclass AND a.attnum>0 AND NOT a.attisdropped) <> 16
       OR (SELECT count(*) FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.scheduled_http_dispatches'::regclass) <> 11
       OR (SELECT count(*) FROM pg_catalog.pg_index i WHERE i.indrelid='public.scheduled_http_dispatches'::regclass) <> 4
       OR (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||a.atttypid::regtype::text||':'||a.attnotnull::text,'|' ORDER BY a.attnum))
         FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.scheduled_http_dispatches'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '4edab01fee72b1c7409d22c8e37226ac'
       OR (SELECT pg_catalog.md5(pg_catalog.string_agg(c.conname||':'||pg_catalog.pg_get_constraintdef(c.oid),'|' ORDER BY c.conname))
         FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.scheduled_http_dispatches'::regclass) IS DISTINCT FROM 'bc2bcfc6faae6d764f97d32bafd5558d'
       OR (SELECT pg_catalog.md5(pg_catalog.string_agg(c.relname||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY c.relname))
         FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.scheduled_http_dispatches'::regclass) IS DISTINCT FROM '068cfb3d7bfed68df8e63c82e2a7caab'
       OR (SELECT c.relacl::text FROM pg_catalog.pg_class c WHERE c.oid='public.scheduled_http_dispatches'::regclass) IS NULL
       OR (SELECT c.relacl::text FROM pg_catalog.pg_class c WHERE c.oid='public.scheduled_http_dispatches'::regclass) NOT IN
         ('{postgres=arwdDxt/postgres,service_role=r/postgres}',
          '{postgres=arwdDxtm/postgres,service_role=r/postgres}')
       OR (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid='public.scheduled_http_dispatches'::regclass) <> 0
       OR (SELECT count(*) FROM pg_catalog.pg_trigger t WHERE t.tgrelid='public.scheduled_http_dispatches'::regclass AND NOT t.tgisinternal) <> 0
    THEN RAISE EXCEPTION 'scheduled_dispatch_existing_relation_drift' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid='public.sync_log'::regclass AND c.conname='sync_log_dispatch_id_fkey'
          AND c.contype='f' AND c.convalidated AND c.confrelid='public.scheduled_http_dispatches'::regclass)
       OR (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.sync_log'::regclass AND c.conname='sync_log_dispatch_id_fkey') IS DISTINCT FROM
      'FOREIGN KEY (dispatch_id) REFERENCES scheduled_http_dispatches(dispatch_id) ON DELETE SET NULL' THEN
      RAISE EXCEPTION 'scheduled_dispatch_link_drift' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname IN ('start_scheduled_http_dispatch_for_service','finish_scheduled_http_dispatch_for_service',
        'reconcile_scheduled_http_dispatches_for_service','reconcile_scheduled_http_dispatches',
        'scheduled_dispatch_summary_valid','invoke_saved_search_alerts_traced')
        AND n.nspname IN ('public','private')
        AND (p.proowner IS DISTINCT FROM 'postgres'::regrole OR
          p.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR
          p.prosecdef IS DISTINCT FROM (p.proname<>'scheduled_dispatch_summary_valid') OR
          p.proacl::text IS DISTINCT FROM CASE WHEN n.nspname='private' THEN '{postgres=X/postgres}'
            ELSE '{postgres=X/postgres,service_role=X/postgres}' END OR
          pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) IS DISTINCT FROM CASE (n.nspname||'.'||p.proname)
            WHEN 'public.start_scheduled_http_dispatch_for_service' THEN '688410f09695b81380c2418c6cb34bb0'
            WHEN 'public.finish_scheduled_http_dispatch_for_service' THEN '54d690c4bee147a0ee53d57e9034324f'
            WHEN 'public.reconcile_scheduled_http_dispatches_for_service' THEN '2a098e096ccff0b8f3c6f95d287750a9'
            WHEN 'private.reconcile_scheduled_http_dispatches' THEN '2ffe1986caaae02dc0fd8fa3b583064b'
            WHEN 'private.scheduled_dispatch_summary_valid' THEN '9f0742fbedebc1805131f89a59db4ca1'
            WHEN 'private.invoke_saved_search_alerts_traced' THEN '17bcf6ab3c6a9335e7b7dadff0ebad3b'
            ELSE '' END)
    ) THEN
      RAISE EXCEPTION 'scheduled_dispatch_installed_routine_drift' USING ERRCODE='22023';
    END IF;
  END IF;
  IF pg_catalog.to_regclass('cron.job') IS NULL OR
     (SELECT count(*) FROM cron.job WHERE (jobname,schedule,command) IN (
       ('daily-crm-followups','0 8 * * *','SELECT private.invoke_scheduled_followups_cron();'),
       ('poll-os-auctions-daily','15 4 * * *','SELECT private.invoke_poll_os_auctions_cron();'),
       ('send-saved-search-alerts','0 0,6,12,18 * * *','SELECT public.invoke_send_saved_search_alerts_cron();')) AND active) <> 3 THEN
    RAISE EXCEPTION 'scheduled_dispatch_cron_drift' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.to_regprocedure('net.http_post(text,jsonb,jsonb,integer)') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='net' AND p.proname='http_post') <> 1
     OR pg_catalog.pg_get_function_result('net.http_post(text,jsonb,jsonb,integer)'::regprocedure) IS DISTINCT FROM 'bigint'
     OR pg_catalog.to_regclass('net._http_response') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='net._http_response'::regclass
       AND a.attnum>0 AND NOT a.attisdropped AND (a.attname,a.atttypid::regtype::text) IN
         (('id','bigint'),('status_code','integer'),('content','text'),('timed_out','boolean'),('error_msg','text'))) <> 5
     OR pg_catalog.to_regclass('vault.decrypted_secrets') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid='vault.decrypted_secrets'::regclass
       AND a.attnum>0 AND NOT a.attisdropped AND (a.attname,a.atttypid::regtype::text) IN
         (('name','text'),('decrypted_secret','text'),('created_at','timestamp with time zone'))) <> 3 THEN
    RAISE EXCEPTION 'scheduled_dispatch_helper_shape_drift' USING ERRCODE='22023';
  END IF;
  FOR r IN
    SELECT n.nspname, p.proname, p.oid, p.proowner, p.prosecdef, p.proconfig,
      pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
      pg_catalog.pg_get_function_result(p.oid) AS result,
      p.proacl::text AS acl,
      pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r\n', E'\n')) AS body_md5
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('private','invoke_poll_os_auctions_cron'),('private','invoke_scheduled_followups_cron'),('public','invoke_send_saved_search_alerts_cron'))
  LOOP
    IF r.args IS DISTINCT FROM '' OR r.result IS DISTINCT FROM 'void' OR r.proowner IS DISTINCT FROM 'postgres'::regrole OR r.prosecdef IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'scheduled_dispatch_invoker_identity_drift:%',r.proname USING ERRCODE='22023';
    END IF;
    IF r.proname='invoke_poll_os_auctions_cron' THEN
      v_expected := '4eb2ec70811d2d8f9819476ce3bb59c0';
      IF r.proconfig IS DISTINCT FROM ARRAY['search_path=private, public'] OR r.acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
        RAISE EXCEPTION 'scheduled_dispatch_poll_acl_drift' USING ERRCODE='22023'; END IF;
    ELSIF r.proname='invoke_scheduled_followups_cron' THEN
      v_expected := '3740851e4519e30a7ae27efe3e1731a7';
      IF r.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR r.acl IS DISTINCT FROM '{postgres=X/postgres}' THEN
        RAISE EXCEPTION 'scheduled_dispatch_followup_acl_drift' USING ERRCODE='22023'; END IF;
    ELSE
      v_expected := '298f66b973474b0b95b9220e14613d05';
      IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public'] OR r.acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
        RAISE EXCEPTION 'scheduled_dispatch_alert_acl_drift' USING ERRCODE='22023'; END IF;
    END IF;
    IF (NOT v_repeat AND r.body_md5 NOT IN (v_expected,
      CASE WHEN r.proname='invoke_send_saved_search_alerts_cron' THEN 'c25b46119a0b3b76a1e9df50d61db737' ELSE v_expected END))
       OR (v_repeat AND r.body_md5 NOT IN (CASE r.proname
         WHEN 'invoke_poll_os_auctions_cron' THEN '2b0e68e117ac1d5fad04638af89f37af'
         WHEN 'invoke_scheduled_followups_cron' THEN 'f2ac89d9aef1eee4bb8ae72cfda0d86e'
         ELSE '0473a217d64e6349d75709885f254162' END,
         CASE WHEN r.proname='invoke_send_saved_search_alerts_cron' THEN '05481c2968907e6d6f9c8f500020e6db' ELSE '' END)) THEN
      RAISE EXCEPTION 'scheduled_dispatch_invoker_body_drift:%',r.proname USING ERRCODE='22023';
    END IF;
  END LOOP;
END;
$guard$;

CREATE TABLE IF NOT EXISTS public.scheduled_http_dispatches (
  dispatch_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  integration text NOT NULL CHECK (integration IN ('poll_os_auctions','scheduled_followups','saved_search_alerts')),
  origin text NOT NULL CHECK (origin IN ('cron','authorized_legacy')),
  net_request_id bigint UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  started_at timestamptz,
  finished_at timestamptz,
  execution_token uuid,
  transport_state text NOT NULL DEFAULT 'pending' CHECK (transport_state IN ('pending','enqueued','response','timeout','transport_error','transport_unknown','skipped_config','config_error','enqueue_failed')),
  application_state text NOT NULL DEFAULT 'queued' CHECK (application_state IN ('queued','running','unknown','finished','skipped_config','config_error','enqueue_failed')),
  application_outcome text CHECK (application_outcome IN ('succeeded','partial','failed','skipped')),
  response_outcome text CHECK (response_outcome IN ('succeeded','partial','failed','skipped')),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  error_code text CHECK (error_code IS NULL OR error_code IN ('enqueue_failed','config_error','missing_config','handler_failed','persistence_incomplete','response_conflict','transport_timeout','transport_error')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_conflict boolean NOT NULL DEFAULT false,
  CONSTRAINT scheduled_http_dispatches_terminal_check CHECK (
    (application_state='finished') = (finished_at IS NOT NULL)
    AND (application_state='finished') = (application_outcome IS NOT NULL)
  )
);
ALTER TABLE public.scheduled_http_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_http_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scheduled_http_dispatches TO service_role;
ALTER TABLE public.sync_log ADD COLUMN IF NOT EXISTS dispatch_id uuid;
DO $linked$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.sync_log'::regclass AND conname='sync_log_dispatch_id_fkey') THEN
    ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_dispatch_id_fkey FOREIGN KEY (dispatch_id)
      REFERENCES public.scheduled_http_dispatches(dispatch_id) ON DELETE SET NULL;
  END IF;
  IF pg_catalog.to_regclass('public.scheduled_http_dispatches_net_request_id_idx') IS NULL THEN
    CREATE INDEX scheduled_http_dispatches_net_request_id_idx ON public.scheduled_http_dispatches (net_request_id)
      WHERE net_request_id IS NOT NULL;
  END IF;
  IF pg_catalog.to_regclass('public.scheduled_http_dispatches_reconcile_pending_idx') IS NULL THEN
    CREATE INDEX scheduled_http_dispatches_reconcile_pending_idx
      ON public.scheduled_http_dispatches (requested_at,dispatch_id)
      WHERE transport_state='enqueued' OR application_state IN ('queued','running');
  END IF;
END;
$linked$;

CREATE OR REPLACE FUNCTION private.scheduled_dispatch_summary_valid(p_summary jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
  SELECT p_summary IS NOT NULL AND pg_catalog.jsonb_typeof(p_summary)='object'
    AND pg_catalog.octet_length(p_summary::text) <= 4096
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_summary) AS k(key)
      WHERE k.key NOT IN ('ok','success','outcome','processed','succeeded','failed','skipped',
        'imported','updated','errors','page_fetch_failures','total','emailsSent','checkpointsPersisted',
        'persistence_complete','import_complete','provider_accepted'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_summary) AS e(key,value)
      WHERE CASE WHEN e.key='outcome' THEN e.value NOT IN ('"succeeded"'::jsonb,'"partial"'::jsonb,'"failed"'::jsonb,'"skipped"'::jsonb)
        WHEN e.key IN ('ok','success','persistence_complete','import_complete','provider_accepted') THEN pg_catalog.jsonb_typeof(e.value)<>'boolean'
        ELSE pg_catalog.jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]{1,10}$' END);
$body$;
REVOKE ALL ON FUNCTION private.scheduled_dispatch_summary_valid(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_scheduled_http_dispatch_for_service(
  p_dispatch_id uuid, p_integration text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.scheduled_http_dispatches%ROWTYPE; v_token uuid;
BEGIN
  IF p_integration NOT IN ('poll_os_auctions','scheduled_followups','saved_search_alerts') OR p_integration IS NULL THEN
    RAISE EXCEPTION 'scheduled_dispatch_invalid_integration' USING ERRCODE='22023';
  END IF;
  IF p_dispatch_id IS NULL THEN
    INSERT INTO public.scheduled_http_dispatches(integration,origin)
      VALUES(p_integration,'authorized_legacy') RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.scheduled_http_dispatches
      WHERE dispatch_id=p_dispatch_id FOR UPDATE;
    IF NOT FOUND OR v_row.integration<>p_integration THEN
      RAISE EXCEPTION 'scheduled_dispatch_identity_mismatch' USING ERRCODE='22023';
    END IF;
  END IF;
  IF v_row.application_state='queued' AND
      (v_row.origin='authorized_legacy' OR v_row.transport_state='enqueued') THEN
    v_token:=pg_catalog.gen_random_uuid();
    UPDATE public.scheduled_http_dispatches SET application_state='running',
      started_at=pg_catalog.now(), execution_token=v_token
      WHERE dispatch_id=v_row.dispatch_id;
    RETURN pg_catalog.jsonb_build_object('decision','run','dispatch_id',v_row.dispatch_id,'execution_token',v_token);
  END IF;
  RETURN pg_catalog.jsonb_build_object('decision',CASE
      WHEN v_row.application_state='finished' THEN 'replay'
      WHEN v_row.application_state='unknown' THEN 'unknown'
      WHEN v_row.application_state='running' THEN 'in_progress'
      ELSE 'unknown' END,'dispatch_id',v_row.dispatch_id);
END;
$body$;
REVOKE ALL ON FUNCTION public.start_scheduled_http_dispatch_for_service(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_scheduled_http_dispatch_for_service(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_scheduled_http_dispatch_for_service(
  p_dispatch_id uuid,p_execution_token uuid,p_outcome text,p_summary jsonb,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.scheduled_http_dispatches%ROWTYPE;
BEGIN
  IF p_dispatch_id IS NULL OR p_execution_token IS NULL OR p_outcome NOT IN ('succeeded','partial','failed','skipped')
    OR p_outcome IS NULL OR NOT private.scheduled_dispatch_summary_valid(p_summary)
    OR (p_summary ? 'outcome' AND p_summary->>'outcome'<>p_outcome)
    OR (p_error_code IS NOT NULL AND p_error_code NOT IN ('handler_failed','persistence_incomplete')) THEN
    RAISE EXCEPTION 'scheduled_dispatch_invalid_result' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.scheduled_http_dispatches WHERE dispatch_id=p_dispatch_id FOR UPDATE;
  IF NOT FOUND OR v_row.execution_token IS DISTINCT FROM p_execution_token THEN
    RAISE EXCEPTION 'scheduled_dispatch_token_mismatch' USING ERRCODE='22023';
  END IF;
  IF v_row.application_state='finished' THEN
    IF v_row.application_outcome=p_outcome AND v_row.summary=p_summary AND v_row.error_code IS NOT DISTINCT FROM p_error_code THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'scheduled_dispatch_terminal_conflict' USING ERRCODE='22023';
  END IF;
  IF v_row.application_state NOT IN ('running','unknown') THEN
    RAISE EXCEPTION 'scheduled_dispatch_not_running' USING ERRCODE='22023';
  END IF;
  UPDATE public.scheduled_http_dispatches SET application_state='finished',application_outcome=p_outcome,
    summary=p_summary,error_code=p_error_code,finished_at=pg_catalog.now(),
    evidence_conflict=(response_outcome IS NOT NULL AND response_outcome<>p_outcome)
  WHERE dispatch_id=p_dispatch_id;
END;
$body$;
REVOKE ALL ON FUNCTION public.finish_scheduled_http_dispatch_for_service(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_scheduled_http_dispatch_for_service(uuid,uuid,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION private.reconcile_scheduled_http_dispatches(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row record; v_doc jsonb; v_outcome text; v_count integer:=0;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'scheduled_dispatch_invalid_limit' USING ERRCODE='22023';
  END IF;
  FOR v_row IN
    SELECT d.dispatch_id,d.net_request_id,d.requested_at,d.started_at,d.application_state,
      d.application_outcome,r.status_code,r.content,r.timed_out,r.error_msg
    FROM public.scheduled_http_dispatches d
    LEFT JOIN net._http_response r ON r.id=d.net_request_id
    WHERE (d.transport_state='enqueued' AND (r.id IS NOT NULL OR d.requested_at < pg_catalog.now()-INTERVAL '15 minutes'))
       OR (d.application_state IN ('queued','running')
         AND COALESCE(d.started_at,d.requested_at) < pg_catalog.now()-INTERVAL '15 minutes')
    ORDER BY d.requested_at,d.dispatch_id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
  LOOP
    v_doc:=NULL; v_outcome:=NULL;
    IF v_row.content IS NOT NULL AND pg_catalog.octet_length(v_row.content)<=4096 THEN
      BEGIN v_doc:=v_row.content::jsonb; EXCEPTION WHEN others THEN v_doc:=NULL; END;
      IF pg_catalog.jsonb_typeof(v_doc)='object'
         AND v_doc->>'dispatch_id'=v_row.dispatch_id::text
         AND v_doc->>'outcome' IN ('succeeded','partial','failed','skipped') THEN
        v_outcome:=v_doc->>'outcome';
      END IF;
    END IF;
    UPDATE public.scheduled_http_dispatches d SET
      transport_state=CASE WHEN v_row.net_request_id IS NULL THEN d.transport_state
        WHEN v_row.status_code IS NULL AND v_row.timed_out IS NULL AND v_row.error_msg IS NULL THEN 'transport_unknown'
        WHEN v_row.timed_out THEN 'timeout'
        WHEN v_row.error_msg IS NOT NULL THEN 'transport_error'
        ELSE 'response' END,
      http_status=CASE WHEN v_row.status_code BETWEEN 100 AND 599 THEN v_row.status_code ELSE NULL END,
      response_outcome=COALESCE(v_outcome,d.response_outcome),
      application_state=CASE WHEN d.application_state IN ('queued','running')
        AND COALESCE(d.started_at,d.requested_at)<pg_catalog.now()-INTERVAL '15 minutes'
        THEN 'unknown' ELSE d.application_state END,
      evidence_conflict=d.evidence_conflict OR (v_outcome IS NOT NULL AND d.application_outcome IS NOT NULL AND v_outcome<>d.application_outcome)
    WHERE d.dispatch_id=v_row.dispatch_id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$body$;
REVOKE ALL ON FUNCTION private.reconcile_scheduled_http_dispatches(integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_scheduled_http_dispatches_for_service(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $body$
  SELECT private.reconcile_scheduled_http_dispatches(p_limit);
$body$;
REVOKE ALL ON FUNCTION public.reconcile_scheduled_http_dispatches_for_service(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_scheduled_http_dispatches_for_service(integer) TO service_role;

CREATE OR REPLACE FUNCTION private.invoke_poll_os_auctions_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $body$
DECLARE
  v_cron_secret text := NULL;
  v_supabase_url text := NULL;
  v_dispatch_id uuid;
  v_net_request_id bigint;
BEGIN
  INSERT INTO public.scheduled_http_dispatches(integration,origin)
    VALUES('poll_os_auctions','cron') RETURNING dispatch_id INTO v_dispatch_id;
  BEGIN PERFORM private.reconcile_scheduled_http_dispatches(100);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    BEGIN
      SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets
      WHERE name='CRON_SECRET' LIMIT 1;
    EXCEPTION WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while invoking poll-os-auctions.';
    END;
    v_cron_secret := COALESCE(NULLIF(v_cron_secret,''),NULLIF(current_setting('app.settings.cron_secret',TRUE),''));
    IF v_cron_secret IS NULL OR v_cron_secret='' THEN
      UPDATE public.scheduled_http_dispatches SET application_state='skipped_config',transport_state='skipped_config',error_code='missing_config'
        WHERE dispatch_id=v_dispatch_id;
      RAISE WARNING 'CRON_SECRET is missing from Vault/app settings; skipping poll-os-auctions cron invocation.';
      RETURN;
    END IF;
    v_supabase_url := NULLIF(current_setting('app.settings.supabase_url',TRUE),'');
    IF v_supabase_url IS NULL OR v_supabase_url='' THEN
      BEGIN
        SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets
        WHERE name IN ('SUPABASE_URL','supabase_url') LIMIT 1;
      EXCEPTION WHEN invalid_schema_name OR undefined_table THEN
        RAISE NOTICE 'Vault decrypted secrets are not available while resolving Supabase URL.';
      END;
    END IF;
    IF v_supabase_url IS NULL OR v_supabase_url='' THEN
      UPDATE public.scheduled_http_dispatches SET application_state='skipped_config',transport_state='skipped_config',error_code='missing_config'
        WHERE dispatch_id=v_dispatch_id;
      RAISE WARNING 'Supabase URL is missing from Vault/app settings; skipping poll-os-auctions cron invocation.';
      RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='config_error',transport_state='config_error',error_code='config_error'
      WHERE dispatch_id=v_dispatch_id;
    RETURN;
  END;
  BEGIN
    SELECT net.http_post(
      url := rtrim(v_supabase_url,'/') || '/functions/v1/poll-os-auctions',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_cron_secret,
        'x-maiprop-dispatch-id',v_dispatch_id::text),
      body := jsonb_build_object('pageSize',600,'sampleAcrossGreece',true,'sortBy','AUCTION_DATE',
        'order','ASC','source','daily-canonical-pool'),
      timeout_milliseconds := 120000
    ) INTO v_net_request_id;
    IF v_net_request_id IS NULL THEN RAISE EXCEPTION 'net_request_id_missing'; END IF;
    UPDATE public.scheduled_http_dispatches SET net_request_id=v_net_request_id,transport_state='enqueued'
      WHERE dispatch_id=v_dispatch_id;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='enqueue_failed',transport_state='enqueue_failed',error_code='enqueue_failed'
      WHERE dispatch_id=v_dispatch_id;
  END;
END;
$body$;

CREATE OR REPLACE FUNCTION private.invoke_scheduled_followups_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
  v_supabase_url text;
  v_cron_secret text;
  v_dispatch_id uuid;
  v_net_request_id bigint;
BEGIN
  INSERT INTO public.scheduled_http_dispatches(integration,origin)
    VALUES('scheduled_followups','cron') RETURNING dispatch_id INTO v_dispatch_id;
  BEGIN PERFORM private.reconcile_scheduled_http_dispatches(100);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets
      WHERE name='SUPABASE_URL' ORDER BY created_at DESC LIMIT 1;
    SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets
      WHERE name='CRON_SECRET' ORDER BY created_at DESC LIMIT 1;
    IF nullif(v_supabase_url,'') IS NULL THEN v_supabase_url:=current_setting('app.settings.supabase_url',true); END IF;
    IF nullif(v_cron_secret,'') IS NULL THEN v_cron_secret:=current_setting('app.settings.cron_secret',true); END IF;
    IF nullif(v_supabase_url,'') IS NULL OR nullif(v_cron_secret,'') IS NULL THEN
      UPDATE public.scheduled_http_dispatches SET application_state='skipped_config',transport_state='skipped_config',error_code='missing_config'
        WHERE dispatch_id=v_dispatch_id;
      RAISE WARNING 'Skipping scheduled-followups cron: missing Supabase URL or cron secret';
      RETURN;
    END IF;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='config_error',transport_state='config_error',error_code='config_error'
      WHERE dispatch_id=v_dispatch_id;
    RETURN;
  END;
  BEGIN
    SELECT net.http_post(
      url := rtrim(v_supabase_url,'/') || '/functions/v1/scheduled-followups',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_cron_secret,
        'x-maiprop-dispatch-id',v_dispatch_id::text),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) INTO v_net_request_id;
    IF v_net_request_id IS NULL THEN RAISE EXCEPTION 'net_request_id_missing'; END IF;
    UPDATE public.scheduled_http_dispatches SET net_request_id=v_net_request_id,transport_state='enqueued'
      WHERE dispatch_id=v_dispatch_id;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='enqueue_failed',transport_state='enqueue_failed',error_code='enqueue_failed'
      WHERE dispatch_id=v_dispatch_id;
  END;
END;
$body$;

CREATE OR REPLACE FUNCTION private.invoke_saved_search_alerts_traced(p_fixed_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE
  v_cron_secret text:=NULL;
  v_supabase_url text:=NULL;
  v_dispatch_id uuid;
  v_net_request_id bigint;
BEGIN
  INSERT INTO public.scheduled_http_dispatches(integration,origin)
    VALUES('saved_search_alerts','cron') RETURNING dispatch_id INTO v_dispatch_id;
  BEGIN PERFORM private.reconcile_scheduled_http_dispatches(100);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    BEGIN
      SELECT decrypted_secret INTO v_cron_secret FROM vault.decrypted_secrets
        WHERE name='CRON_SECRET' LIMIT 1;
    EXCEPTION WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while invoking saved-search alerts.';
    END;
    v_cron_secret:=COALESCE(NULLIF(v_cron_secret,''),NULLIF(current_setting('app.settings.cron_secret',TRUE),''));
    IF v_cron_secret IS NULL OR v_cron_secret='' THEN
      UPDATE public.scheduled_http_dispatches SET application_state='skipped_config',transport_state='skipped_config',error_code='missing_config'
        WHERE dispatch_id=v_dispatch_id;
      RAISE WARNING 'CRON_SECRET is missing from Vault/app settings; skipping saved-search alert cron invocation.';
      RETURN;
    END IF;
    IF p_fixed_url IS NULL THEN
      v_supabase_url:=NULLIF(current_setting('app.settings.supabase_url',TRUE),'');
      IF v_supabase_url IS NULL OR v_supabase_url='' THEN
        BEGIN
          SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets
            WHERE name IN ('SUPABASE_URL','supabase_url','saved_search_alerts_project_url') LIMIT 1;
        EXCEPTION WHEN invalid_schema_name OR undefined_table THEN
          RAISE NOTICE 'Vault decrypted secrets are not available while resolving Supabase URL.';
        END;
      END IF;
      IF v_supabase_url IS NULL OR v_supabase_url='' THEN
        UPDATE public.scheduled_http_dispatches SET application_state='skipped_config',transport_state='skipped_config',error_code='missing_config'
          WHERE dispatch_id=v_dispatch_id;
        RAISE WARNING 'Supabase URL is missing from Vault/app settings; skipping saved-search alert cron invocation.';
        RETURN;
      END IF;
      v_supabase_url:=rtrim(v_supabase_url,'/') || '/functions/v1/send-saved-search-alerts';
    ELSE
      v_supabase_url:=p_fixed_url;
    END IF;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='config_error',transport_state='config_error',error_code='config_error'
      WHERE dispatch_id=v_dispatch_id;
    RETURN;
  END;
  BEGIN
    SELECT net.http_post(
      url := v_supabase_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_cron_secret,
        'x-maiprop-dispatch-id',v_dispatch_id::text),
      body := '{}'::jsonb
    ) INTO v_net_request_id;
    IF v_net_request_id IS NULL THEN RAISE EXCEPTION 'net_request_id_missing'; END IF;
    UPDATE public.scheduled_http_dispatches SET net_request_id=v_net_request_id,transport_state='enqueued'
      WHERE dispatch_id=v_dispatch_id;
  EXCEPTION WHEN others THEN
    UPDATE public.scheduled_http_dispatches SET application_state='enqueue_failed',transport_state='enqueue_failed',error_code='enqueue_failed'
      WHERE dispatch_id=v_dispatch_id;
  END;
END;
$body$;
REVOKE ALL ON FUNCTION private.invoke_saved_search_alerts_traced(text) FROM PUBLIC, anon, authenticated, service_role;

DO $saved$
DECLARE v_old_md5 text;
BEGIN
  SELECT pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) INTO v_old_md5
  FROM pg_catalog.pg_proc p WHERE p.oid='public.invoke_send_saved_search_alerts_cron()'::regprocedure;
  IF v_old_md5='298f66b973474b0b95b9220e14613d05' THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION public.invoke_send_saved_search_alerts_cron()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        PERFORM private.invoke_saved_search_alerts_traced('https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts');
      END;
      $body$;$sql$;
  ELSIF v_old_md5='c25b46119a0b3b76a1e9df50d61db737' THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION public.invoke_send_saved_search_alerts_cron()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
      BEGIN
        PERFORM private.invoke_saved_search_alerts_traced(NULL);
      END;
      $body$;$sql$;
  ELSIF v_old_md5='0473a217d64e6349d75709885f254162' THEN
    RETURN;
  ELSIF v_old_md5='05481c2968907e6d6f9c8f500020e6db' THEN
    RETURN;
  ELSE
    RAISE EXCEPTION 'scheduled_dispatch_saved_alert_body_drift' USING ERRCODE='22023';
  END IF;
END;
$saved$;
COMMIT;