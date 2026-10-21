-- Selected automatic email admission only. Historical email_send_log rows are unchanged.
BEGIN;

DO $guard$
DECLARE v_repeat boolean; v_names text[] := ARRAY[
  'get_selected_email_operation_for_service','prepare_marketing_followup_for_service',
  'prepare_saved_search_alert_for_service','begin_email_dispatch_for_service',
  'record_email_dispatch_result_for_service','apply_email_dispatch_result_for_service',
  'maintain_selected_email_operations_for_service','list_accepted_unapplied_email_operations_for_service',
  'selected_email_payload_valid','selected_email_hash','selected_email_parent_valid',
  'selected_email_expire_locked'];
BEGIN
  IF pg_catalog.to_regclass('public.email_send_log') IS NULL
    OR pg_catalog.to_regclass('public.marketing_leads') IS NULL
    OR pg_catalog.to_regclass('public.saved_searches') IS NULL
    OR pg_catalog.to_regclass('public.scheduled_http_dispatches') IS NULL
    OR pg_catalog.to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'selected_email_required_relation_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname=ANY(v_names) AND n.nspname NOT IN ('public','private')) THEN
    RAISE EXCEPTION 'selected_email_routine_name_conflict';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_depend d ON d.objid=p.oid
      JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
      WHERE p.oid=pg_catalog.to_regprocedure('public.digest(bytea,text)') AND e.extname='pgcrypto') THEN
    RAISE EXCEPTION 'selected_email_digest_missing';
  END IF;
  IF (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'<null>'),'|' ORDER BY a.attnum))
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.scheduled_http_dispatches'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      IS DISTINCT FROM '160b657bff192a2fb1dcff961eef0a6c'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(x.conname||':'||x.convalidated||':'||pg_catalog.pg_get_constraintdef(x.oid),'|' ORDER BY x.conname))
      FROM pg_catalog.pg_constraint x WHERE x.conrelid='public.scheduled_http_dispatches'::regclass)
      IS DISTINCT FROM '9a88f187f0366c5264319eb76e61c3f0'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(ic.relname||':'||i.indisvalid||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY ic.relname))
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
      WHERE i.indrelid='public.scheduled_http_dispatches'::regclass)
      IS DISTINCT FROM '397db9e3e617216c1b976026d6573d49' THEN
    RAISE EXCEPTION 'selected_email_trace_dependency_drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='auth.users'::regclass
      AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='auth.users'::regclass
      AND attname='email' AND atttypid IN ('text'::regtype,'varchar'::regtype) AND NOT attisdropped) THEN
    RAISE EXCEPTION 'selected_email_auth_lookup_drift';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.saved_searches'::regclass AND NOT tgisinternal) <> 3
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.saved_searches'::regclass
      AND tgname='trg_check_saved_search_alert_update' AND tgenabled='O'
      AND pg_catalog.pg_get_triggerdef(oid) LIKE '%check_saved_search_alert_on_update()%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.saved_searches'::regclass
      AND tgname='trg_check_saved_search_limit' AND tgenabled='O'
      AND pg_catalog.pg_get_triggerdef(oid) LIKE '%check_saved_search_limit()%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.saved_searches'::regclass
      AND tgname='update_saved_searches_updated_at' AND tgenabled='O'
      AND pg_catalog.pg_get_triggerdef(oid) LIKE '%update_updated_at_column()%')
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.marketing_leads'::regclass AND NOT tgisinternal) NOT IN (0,1)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.marketing_leads'::regclass
      AND NOT tgisinternal AND (tgname<>'update_leads_updated_at' OR tgenabled<>'O'
        OR pg_catalog.pg_get_triggerdef(oid) NOT LIKE '%update_updated_at_column()%')) THEN
    RAISE EXCEPTION 'selected_email_trigger_drift';
  END IF;
  -- Whitespace-tolerant helper pins: long-lived staging/prod databases carry
  -- the same helper logic with reformatted prosrc whitespace (edited-in-place
  -- migrations apply by version, not content hash), so compare
  -- whitespace-collapsed definitions instead of exact bytes.
  IF (SELECT pg_catalog.md5(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef('public.check_saved_search_alert_on_update()'::regprocedure), '\s+', ' ', 'g')))
       IS DISTINCT FROM '47225b7a9a9c39ef77c0d4acf02169be'
    OR (SELECT pg_catalog.md5(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef('public.check_saved_search_limit()'::regprocedure), '\s+', ' ', 'g')))
       IS DISTINCT FROM 'c0b295790464736f5ead18b83e475a2c'
    OR (SELECT pg_catalog.md5(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef('public.update_updated_at_column()'::regprocedure), '\s+', ' ', 'g')))
       IS DISTINCT FROM '099e7b8f63e5d518296f09bb281cc194' THEN
    RAISE EXCEPTION 'selected_email_trigger_helper_drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass
      AND conname='email_send_log_status_check' AND convalidated
      AND pg_catalog.pg_get_constraintdef(oid) =
      'CHECK ((status = ANY (ARRAY[''pending''::text, ''sent''::text, ''suppressed''::text, ''failed''::text, ''bounced''::text, ''complained''::text, ''dlq''::text])))')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
      WHERE i.indrelid='public.email_send_log'::regclass AND c.relname='idx_email_send_log_message_sent_unique'
      AND i.indisvalid AND pg_catalog.pg_get_indexdef(i.indexrelid)=
      'CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = ''sent''::text)')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.saved_searches'::regclass
      AND attname='last_alert_listing_ids' AND atttypid='uuid[]'::regtype AND NOT attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.saved_searches'::regclass
      AND attname='filters' AND atttypid='jsonb'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.marketing_leads'::regclass
      AND attname='followup_step' AND atttypid='integer'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'selected_email_legacy_shape_drift';
  END IF;
  IF (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'<null>'),'|' ORDER BY a.attnum))
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.marketing_leads'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      NOT IN ('925a515077be32414da8f5df10c094dc','b330f78cfa631a704a71f74ddd5af88e')
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(x.conname||':'||x.convalidated||':'||pg_catalog.pg_get_constraintdef(x.oid),'|' ORDER BY x.conname))
      FROM pg_catalog.pg_constraint x WHERE x.conrelid='public.marketing_leads'::regclass)
      NOT IN ('fba58bb566f380e90b15b6705d1a7d61','f63f5145468ace5a1fc9865b7577a061')
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(ic.relname||':'||i.indisvalid||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY ic.relname))
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
      WHERE i.indrelid='public.marketing_leads'::regclass)
      NOT IN ('bdf9ec97790345b28ed3122158c7b525','27354aad5e555ddd76ff602d311740fc')
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'<null>'),'|' ORDER BY a.attnum))
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.saved_searches'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      IS DISTINCT FROM '55301da4ec5f0489cb879ea02562d263'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(x.conname||':'||x.convalidated||':'||pg_catalog.pg_get_constraintdef(x.oid),'|' ORDER BY x.conname))
      FROM pg_catalog.pg_constraint x WHERE x.conrelid='public.saved_searches'::regclass)
      IS DISTINCT FROM '7931c9f12405a800d5692d82d2f19437'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(ic.relname||':'||i.indisvalid||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY ic.relname))
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
      WHERE i.indrelid='public.saved_searches'::regclass)
      IS DISTINCT FROM '3c31c013b74fd22d2ca5a5f100885e64'
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_index WHERE indrelid IN
      ('public.email_send_log'::regclass,'public.marketing_leads'::regclass,'public.saved_searches'::regclass)
      AND NOT indisvalid)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid IN
      ('public.email_send_log'::regclass,'public.marketing_leads'::regclass,'public.saved_searches'::regclass)
      AND (c.relkind<>'r' OR NOT c.relrowsecurity OR c.relforcerowsecurity OR pg_catalog.pg_get_userbyid(c.relowner)<>'postgres'))
    OR NOT pg_catalog.has_table_privilege('service_role','public.email_send_log','SELECT')
    OR NOT pg_catalog.has_table_privilege('service_role','public.email_send_log','INSERT')
    OR NOT pg_catalog.has_table_privilege('service_role','public.email_send_log','UPDATE')
    OR pg_catalog.has_table_privilege('anon','public.email_send_log','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','public.email_send_log','SELECT')
    -- Role names, not OIDs: role OIDs vary by database, so compare names.
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(p.polname||':'||p.polcmd::text||':'||(SELECT pg_catalog.string_agg(pg_catalog.pg_get_userbyid(u.u),',' ORDER BY u.u) FROM pg_catalog.unnest(p.polroles) AS u(u))||':'||coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'<null>')||':'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'<null>'),'|' ORDER BY p.polname))
      FROM pg_catalog.pg_policy p WHERE p.polrelid='public.email_send_log'::regclass)
      IS DISTINCT FROM '83297634e60e2dd53339cff0eff3fafc'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(p.polname||':'||p.polcmd::text||':'||p.polroles::text||':'||coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'<null>')||':'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'<null>'),'|' ORDER BY p.polname))
      FROM pg_catalog.pg_policy p WHERE p.polrelid='public.marketing_leads'::regclass)
      IS DISTINCT FROM '2c6c312e89e53f4855ade87ae82348d5'
    OR (SELECT pg_catalog.md5(pg_catalog.string_agg(p.polname||':'||p.polcmd::text||':'||p.polroles::text||':'||coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'<null>')||':'||coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'<null>'),'|' ORDER BY p.polname))
      FROM pg_catalog.pg_policy p WHERE p.polrelid='public.saved_searches'::regclass)
      IS DISTINCT FROM 'd7a1b7d735812b7d80d7bdb0d0eb7624'
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger WHERE tgrelid='public.email_send_log'::regclass
      AND NOT tgisinternal)<>0 THEN
    RAISE EXCEPTION 'selected_email_selected_table_drift';
  END IF;
  v_repeat := EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.email_send_log'::regclass
    AND attname='operation_id' AND NOT attisdropped);
  IF v_repeat THEN
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute WHERE attrelid='public.email_send_log'::regclass
      AND attnum>0 AND NOT attisdropped) <> 32
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index WHERE indrelid='public.email_send_log'::regclass) <> 11
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass) <> 5
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'<null>'),'|' ORDER BY a.attnum))
        FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='public.email_send_log'::regclass AND a.attnum>0 AND NOT a.attisdropped)
        IS DISTINCT FROM 'e7394f98472c826d312a34b0d5eefa6e'
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(x.conname||':'||x.convalidated||':'||pg_catalog.pg_get_constraintdef(x.oid),'|' ORDER BY x.conname))
        FROM pg_catalog.pg_constraint x WHERE x.conrelid='public.email_send_log'::regclass)
        IS DISTINCT FROM 'ffc8456561c1e0cb503d3b9ec488f683'
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(ic.relname||':'||i.indisvalid||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY ic.relname))
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid='public.email_send_log'::regclass)
        IS DISTINCT FROM '12399807dd3dee78297c81808378a123' THEN
      RAISE EXCEPTION 'selected_email_repeat_shape_drift';
    END IF;
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private') AND p.proname=ANY(v_names))<>12
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private') AND p.proname=ANY(v_names)
          AND (pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) IS DISTINCT FROM CASE n.nspname||'.'||p.proname
            WHEN 'private.selected_email_expire_locked' THEN '723e552584dca235ad7ca5e88ca6501f'
            WHEN 'private.selected_email_hash' THEN '95aba8971b3f7173758fc137327ad602'
            WHEN 'private.selected_email_parent_valid' THEN '436db7d6053a774d07e3d00ec6ecb105'
            WHEN 'private.selected_email_payload_valid' THEN 'bdcc962814e13c32558d74c8304ef84f'
            WHEN 'public.apply_email_dispatch_result_for_service' THEN '989faa767744f316996719647f176b0f'
            WHEN 'public.begin_email_dispatch_for_service' THEN '0acd3adf07cc31a2292ab7eafae64b1e'
            WHEN 'public.get_selected_email_operation_for_service' THEN '05d543490f7bf50f2648a33e994ed5e8'
            WHEN 'public.list_accepted_unapplied_email_operations_for_service' THEN 'a94c615064df0a4a15c71ae6a088f57a'
            WHEN 'public.maintain_selected_email_operations_for_service' THEN '2697c8a71908218aec40c9acaf766a4c'
            WHEN 'public.prepare_marketing_followup_for_service' THEN '850a9afa8970b1a2bfede6138a97cd0c'
            WHEN 'public.prepare_saved_search_alert_for_service' THEN '00ae7fe46d07a20f93527c613762ce5b'
            WHEN 'public.record_email_dispatch_result_for_service' THEN '68243eb29a487c375feef55b5d410298'
            END
          OR pg_catalog.pg_get_userbyid(p.proowner)<>'postgres'
          OR p.prosecdef IS DISTINCT FROM
            (n.nspname='public' OR p.proname='selected_email_expire_locked')
          OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
          OR p.proacl::text IS DISTINCT FROM CASE WHEN n.nspname='public' THEN
            '{postgres=X/postgres,service_role=X/postgres}' ELSE '{postgres=X/postgres}' END)) THEN
      RAISE EXCEPTION 'selected_email_repeat_routine_drift';
    END IF;
  ELSE
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute WHERE attrelid='public.email_send_log'::regclass
      AND attnum>0 AND NOT attisdropped) <> 8
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index WHERE indrelid='public.email_send_log'::regclass) <> 5
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass) <> 2
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'<null>'),'|' ORDER BY a.attnum))
        FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='public.email_send_log'::regclass AND a.attnum>0 AND NOT a.attisdropped)
        IS DISTINCT FROM 'db70e5a7f88769d7be2cac08f8f62779'
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(x.conname||':'||x.convalidated||':'||pg_catalog.pg_get_constraintdef(x.oid),'|' ORDER BY x.conname))
        FROM pg_catalog.pg_constraint x WHERE x.conrelid='public.email_send_log'::regclass)
        IS DISTINCT FROM 'd3168791704f890753f06ef1d6624171'
      OR (SELECT pg_catalog.md5(pg_catalog.string_agg(ic.relname||':'||i.indisvalid||':'||pg_catalog.pg_get_indexdef(i.indexrelid),'|' ORDER BY ic.relname))
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid='public.email_send_log'::regclass)
        IS DISTINCT FROM 'e0c031cb0ecb96e4734db1e4db845f26'
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN ('public','private') AND p.proname=ANY(v_names))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname LIKE 'selected_email_%') THEN
      RAISE EXCEPTION 'selected_email_partial_or_drift';
    END IF;
  END IF;
END;
$guard$;

ALTER TABLE public.email_send_log ALTER COLUMN recipient_email DROP NOT NULL;
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS operation_key text,
  ADD COLUMN IF NOT EXISTS producer text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS step integer,
  ADD COLUMN IF NOT EXISTS first_dispatch_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_state text,
  ADD COLUMN IF NOT EXISTS attempt_token uuid,
  ADD COLUMN IF NOT EXISTS attempt_tokens uuid[],
  ADD COLUMN IF NOT EXISTS attempt_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_http_status integer,
  ADD COLUMN IF NOT EXISTS payload_fingerprint text,
  ADD COLUMN IF NOT EXISTS prepared_payload jsonb,
  ADD COLUMN IF NOT EXISTS expected_state jsonb,
  ADD COLUMN IF NOT EXISTS candidate_ids uuid[],
  ADD COLUMN IF NOT EXISTS sent_ids uuid[],
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS entity_hold boolean,
  ADD COLUMN IF NOT EXISTS not_before timestamptz,
  ADD COLUMN IF NOT EXISTS result_outcome text,
  ADD COLUMN IF NOT EXISTS result_error_code text;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass
      AND conname='email_send_log_recipient_compat_check') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_recipient_compat_check
      CHECK (operation_id IS NOT NULL OR recipient_email IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass
      AND conname='email_send_log_canonical_check') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_canonical_check CHECK (
      operation_id IS NULL OR (
        operation_key IS NOT NULL AND producer IN ('marketing_followup','saved_search_alert')
        AND entity_id IS NOT NULL AND dispatch_state IN
          ('prepared','sending','unknown','retryable','rejected_final','accepted','applied',
           'accepted_conflict','expired_unsent','checkpoint_payload_expired','superseded')
        AND entity_hold IS NOT NULL AND expires_at IS NOT NULL
        AND attempt_tokens IS NOT NULL
        AND (attempt_token IS NULL OR attempt_token=ANY(attempt_tokens))
        AND payload_fingerprint IS NOT NULL AND pg_catalog.length(payload_fingerprint)=64
        AND (accepted_at IS NULL OR status='sent' OR status IN ('bounced','complained'))
        AND (applied_at IS NULL OR accepted_at IS NOT NULL)
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.email_send_log'::regclass
      AND conname='email_send_log_first_dispatch_fkey') THEN
    ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_first_dispatch_fkey
      FOREIGN KEY (first_dispatch_id) REFERENCES public.scheduled_http_dispatches(dispatch_id)
      ON DELETE SET NULL;
  END IF;
END;
$constraints$;

DO $indexes$
BEGIN
  IF pg_catalog.to_regclass('public.selected_email_operation_id_uidx') IS NULL THEN
    CREATE UNIQUE INDEX selected_email_operation_id_uidx ON public.email_send_log(operation_id)
      WHERE operation_id IS NOT NULL;
  END IF;
  IF pg_catalog.to_regclass('public.selected_email_operation_key_uidx') IS NULL THEN
    CREATE UNIQUE INDEX selected_email_operation_key_uidx ON public.email_send_log(operation_key)
      WHERE operation_id IS NOT NULL;
  END IF;
  IF pg_catalog.to_regclass('public.selected_email_entity_hold_uidx') IS NULL THEN
    CREATE UNIQUE INDEX selected_email_entity_hold_uidx ON public.email_send_log(producer,entity_id)
      WHERE operation_id IS NOT NULL AND entity_hold;
  END IF;
  IF pg_catalog.to_regclass('public.selected_email_repair_idx') IS NULL THEN
    CREATE INDEX selected_email_repair_idx ON public.email_send_log(accepted_at,operation_id)
      WHERE operation_id IS NOT NULL AND accepted_at IS NOT NULL AND applied_at IS NULL
        AND dispatch_state='accepted';
  END IF;
  IF pg_catalog.to_regclass('public.selected_email_expiry_idx') IS NULL THEN
    CREATE INDEX selected_email_expiry_idx ON public.email_send_log(expires_at,operation_id)
      WHERE operation_id IS NOT NULL AND (prepared_payload IS NOT NULL OR expected_state IS NOT NULL
        OR candidate_ids IS NOT NULL OR sent_ids IS NOT NULL OR recipient_email IS NOT NULL);
  END IF;
  IF pg_catalog.to_regclass('public.selected_email_sending_idx') IS NULL THEN
    CREATE INDEX selected_email_sending_idx ON public.email_send_log(attempt_started_at,operation_id)
      WHERE operation_id IS NOT NULL AND dispatch_state='sending';
  END IF;
END;
$indexes$;

CREATE OR REPLACE FUNCTION private.selected_email_hash(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
  SELECT pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('schema_version',1,'value',p_value)::text,'UTF8'),'sha256'),'hex');
$body$;
REVOKE ALL ON FUNCTION private.selected_email_hash(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.selected_email_payload_valid(p_payload jsonb,p_recipient text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
  SELECT coalesce(p_payload IS NOT NULL AND pg_catalog.jsonb_typeof(p_payload)='object'
    AND (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(p_payload) k)
      = ARRAY['htmlContent','sender','subject','to']::text[]
    AND pg_catalog.jsonb_typeof(p_payload->'sender')='object'
    AND (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(p_payload->'sender') k)
      = ARRAY['email','name']::text[]
    AND pg_catalog.jsonb_typeof(p_payload#>'{sender,email}')='string'
    AND pg_catalog.jsonb_typeof(p_payload#>'{sender,name}')='string'
    AND pg_catalog.length(p_payload#>>'{sender,email}') BETWEEN 5 AND 254
    AND pg_catalog.length(p_payload#>>'{sender,name}') BETWEEN 1 AND 100
    AND CASE WHEN pg_catalog.jsonb_typeof(p_payload->'to')='array'
      THEN pg_catalog.jsonb_array_length(p_payload->'to')=1 ELSE false END
    AND pg_catalog.jsonb_typeof(p_payload#>'{to,0}')='object'
    AND (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(p_payload#>'{to,0}') k)
      IN (ARRAY['email']::text[],ARRAY['email','name']::text[])
    AND p_payload#>>'{to,0,email}'=p_recipient
    AND pg_catalog.jsonb_typeof(p_payload#>'{to,0,email}')='string'
    AND (p_payload#>'{to,0,name}' IS NULL OR pg_catalog.jsonb_typeof(p_payload#>'{to,0,name}')='string')
    AND pg_catalog.jsonb_typeof(p_payload->'subject')='string'
    AND pg_catalog.jsonb_typeof(p_payload->'htmlContent')='string'
    AND pg_catalog.length(p_payload->>'subject') BETWEEN 1 AND 500
    AND pg_catalog.length(p_payload->>'htmlContent') BETWEEN 1 AND 200000,false);
$body$;
REVOKE ALL ON FUNCTION private.selected_email_payload_valid(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.selected_email_parent_valid(p_dispatch_id uuid,p_execution_token uuid,p_integration text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $body$
  SELECT EXISTS (SELECT 1 FROM public.scheduled_http_dispatches d
    WHERE d.dispatch_id=p_dispatch_id AND d.execution_token=p_execution_token
      AND d.integration=p_integration AND d.application_state='running');
$body$;
REVOKE ALL ON FUNCTION private.selected_email_parent_valid(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;

-- Every read and begin calls this under the row lock. It never creates a new lease.
CREATE OR REPLACE FUNCTION private.selected_email_expire_locked(p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
BEGIN
  UPDATE public.email_send_log SET
    dispatch_state=CASE
      WHEN accepted_at IS NOT NULL AND applied_at IS NULL THEN 'checkpoint_payload_expired'
      WHEN accepted_at IS NULL AND dispatch_state IN ('prepared','retryable') THEN 'expired_unsent'
      ELSE dispatch_state END,
    status=CASE WHEN accepted_at IS NULL AND dispatch_state IN ('prepared','retryable') THEN 'suppressed' ELSE status END,
    entity_hold=CASE WHEN accepted_at IS NULL AND dispatch_state IN ('prepared','retryable') THEN false ELSE entity_hold END,
    prepared_payload=NULL,expected_state=NULL,candidate_ids=NULL,sent_ids=NULL,recipient_email=NULL
  WHERE operation_id=p_operation_id AND expires_at<=pg_catalog.now()
    AND (prepared_payload IS NOT NULL OR expected_state IS NOT NULL OR candidate_ids IS NOT NULL
      OR sent_ids IS NOT NULL OR recipient_email IS NOT NULL);
END;
$body$;
REVOKE ALL ON FUNCTION private.selected_email_expire_locked(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_selected_email_operation_for_service(
  p_producer text,p_entity_id uuid,p_step integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.email_send_log%ROWTYPE;
BEGIN
  IF p_producer IS NULL OR p_producer NOT IN ('marketing_followup','saved_search_alert') OR p_entity_id IS NULL
    OR (p_producer='marketing_followup' AND (p_step IS NULL OR p_step NOT IN (1,2,3)))
    OR (p_producer='saved_search_alert' AND p_step IS NOT NULL) THEN
    RAISE EXCEPTION 'selected_email_invalid_lookup' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.email_send_log
    WHERE producer=p_producer AND entity_id=p_entity_id AND operation_id IS NOT NULL
      AND (p_producer='saved_search_alert' AND entity_hold OR p_producer='marketing_followup' AND step=p_step)
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('decision','absent'); END IF;
  PERFORM private.selected_email_expire_locked(v_row.operation_id);
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=v_row.operation_id;
  RETURN pg_catalog.jsonb_build_object('decision','existing','operation_id',v_row.operation_id,
    'state',v_row.dispatch_state,'entity_hold',v_row.entity_hold,'accepted',v_row.accepted_at IS NOT NULL,
    'payload',CASE WHEN v_row.expires_at>pg_catalog.now() THEN v_row.prepared_payload ELSE NULL END,
    'not_before',v_row.not_before);
END;
$body$;
REVOKE ALL ON FUNCTION public.get_selected_email_operation_for_service(text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_selected_email_operation_for_service(text,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_marketing_followup_for_service(
  p_lead_id uuid,p_step integer,p_dispatch_id uuid,p_execution_token uuid,p_expected jsonb,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_lead public.marketing_leads%ROWTYPE; v_existing public.email_send_log%ROWTYPE;
  v_key text; v_fingerprint text; v_expected jsonb; v_days integer;
BEGIN
  IF p_lead_id IS NULL OR p_step IS NULL OR p_step NOT IN (1,2,3) OR p_expected IS NULL
    OR pg_catalog.jsonb_typeof(p_expected)<>'object'
    OR NOT (p_expected ?& ARRAY['email','followup_step','status'])
    OR NOT private.selected_email_parent_valid(p_dispatch_id,p_execution_token,'scheduled_followups') THEN
    RAISE EXCEPTION 'selected_email_invalid_marketing_prepare' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_lead FROM public.marketing_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','lead_missing'); END IF;
  v_key:=private.selected_email_hash(pg_catalog.jsonb_build_array('marketing_followup',p_lead_id,'existing_sequence',p_step));
  v_fingerprint:=private.selected_email_hash(p_payload);
  SELECT * INTO v_existing FROM public.email_send_log WHERE operation_key=v_key
    AND operation_id IS NOT NULL FOR UPDATE;
  IF FOUND THEN
    PERFORM private.selected_email_expire_locked(v_existing.operation_id);
    IF v_existing.payload_fingerprint<>v_fingerprint THEN
      RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','payload_conflict','operation_id',v_existing.operation_id);
    END IF;
    RETURN pg_catalog.jsonb_build_object('decision','existing','operation_id',v_existing.operation_id,'state',v_existing.dispatch_state);
  END IF;
  IF EXISTS (SELECT 1 FROM public.email_send_log WHERE producer='marketing_followup' AND entity_id=p_lead_id
      AND step=p_step AND operation_id IS NOT NULL) THEN
    RETURN pg_catalog.jsonb_build_object('decision','held','reason','sequence_conflict');
  END IF;
  v_days:=CASE p_step WHEN 1 THEN 1 WHEN 2 THEN 8 ELSE 29 END;
  IF v_lead.email IS DISTINCT FROM p_expected->>'email'
    OR coalesce(pg_catalog.to_jsonb(v_lead.followup_step),'null'::jsonb)
      IS DISTINCT FROM p_expected->'followup_step'
    OR v_lead.status IS DISTINCT FROM p_expected->>'status'
    OR v_lead.status='closed' OR p_step<>coalesce(v_lead.followup_step,0)+1
    OR v_lead.created_at+pg_catalog.make_interval(days=>v_days)>pg_catalog.now()
    OR private.selected_email_payload_valid(p_payload,v_lead.email) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','current_eligibility');
  END IF;
  v_expected:=pg_catalog.jsonb_build_object('email',v_lead.email,'followup_step',v_lead.followup_step,
    'status',v_lead.status);
  INSERT INTO public.email_send_log(template_name,recipient_email,status,metadata,error_message,
    operation_id,operation_key,producer,entity_id,step,first_dispatch_id,dispatch_state,attempt_tokens,
    payload_fingerprint,prepared_payload,expected_state,expires_at,entity_hold)
  VALUES ('marketing_followup_step_'||p_step,v_lead.email,'pending','{}'::jsonb,NULL,
    pg_catalog.gen_random_uuid(),v_key,'marketing_followup',p_lead_id,p_step,p_dispatch_id,'prepared',ARRAY[]::uuid[],
    v_fingerprint,p_payload,v_expected,pg_catalog.now()+INTERVAL '7 days',true)
  RETURNING * INTO v_existing;
  RETURN pg_catalog.jsonb_build_object('decision','prepared','operation_id',v_existing.operation_id,'state','prepared');
END;
$body$;
REVOKE ALL ON FUNCTION public.prepare_marketing_followup_for_service(uuid,integer,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_marketing_followup_for_service(uuid,integer,uuid,uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_saved_search_alert_for_service(
  p_search_id uuid,p_dispatch_id uuid,p_execution_token uuid,p_expected jsonb,
  p_candidate_ids uuid[],p_sent_ids uuid[],p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_search public.saved_searches%ROWTYPE; v_hold public.email_send_log%ROWTYPE;
  v_old public.email_send_log%ROWTYPE; v_key text; v_fingerprint text; v_email text;
  v_expected jsonb; v_predecessor jsonb; v_expected_at timestamptz;
BEGIN
  IF p_search_id IS NULL OR p_expected IS NULL OR pg_catalog.jsonb_typeof(p_expected)<>'object'
    OR NOT (p_expected ?& ARRAY['user_id','filters','last_alert_listing_ids','last_alert_sent_at','recipient_email'])
    OR p_candidate_ids IS NULL OR p_sent_ids IS NULL
    OR pg_catalog.cardinality(p_candidate_ids) NOT BETWEEN 1 AND 20
    OR pg_catalog.cardinality(p_sent_ids) NOT BETWEEN 1 AND 20
    OR pg_catalog.array_position(p_candidate_ids,NULL) IS NOT NULL
    OR pg_catalog.array_position(p_sent_ids,NULL) IS NOT NULL
    OR (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(p_candidate_ids) x) <> pg_catalog.cardinality(p_candidate_ids)
    OR (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(p_sent_ids) x) <> pg_catalog.cardinality(p_sent_ids)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_sent_ids) x WHERE NOT x=ANY(p_candidate_ids))
    OR NOT private.selected_email_parent_valid(p_dispatch_id,p_execution_token,'saved_search_alerts') THEN
    RAISE EXCEPTION 'selected_email_invalid_saved_prepare' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_search FROM public.saved_searches WHERE id=p_search_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','search_missing'); END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.unnest(p_sent_ids) x
    WHERE x=ANY(coalesce(v_search.last_alert_listing_ids,ARRAY[]::uuid[]))) THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','sent_ids_not_new');
  END IF;
  v_expected_at:=CASE WHEN p_expected->'last_alert_sent_at'='null'::jsonb THEN NULL
    ELSE (p_expected->>'last_alert_sent_at')::timestamptz END;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id=v_search.user_id;
  IF v_email IS NULL OR v_email='' OR v_search.user_id::text IS DISTINCT FROM p_expected->>'user_id'
    OR v_search.filters IS DISTINCT FROM p_expected->'filters'
    OR coalesce(pg_catalog.to_jsonb(v_search.last_alert_listing_ids),'null'::jsonb)
      IS DISTINCT FROM p_expected->'last_alert_listing_ids'
    OR v_search.last_alert_sent_at IS DISTINCT FROM v_expected_at
    OR v_email IS DISTINCT FROM p_expected->>'recipient_email'
    OR NOT v_search.email_alerts
    OR private.selected_email_payload_valid(p_payload,v_email) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','reason','current_eligibility');
  END IF;
  SELECT * INTO v_old FROM public.email_send_log WHERE producer='saved_search_alert'
    AND entity_id=p_search_id AND applied_at IS NOT NULL ORDER BY applied_at DESC,id DESC LIMIT 1;
  v_predecessor:=CASE WHEN FOUND THEN pg_catalog.jsonb_build_object('applied_operation_id',v_old.operation_id)
    ELSE pg_catalog.jsonb_build_object('legacy_last_sent_at',v_search.last_alert_sent_at,
      'legacy_last_ids',coalesce(pg_catalog.to_jsonb(v_search.last_alert_listing_ids),'null'::jsonb)) END;
  v_key:=private.selected_email_hash(pg_catalog.jsonb_build_array('saved_search_alert',p_search_id,
    v_predecessor,v_search.user_id,v_search.filters,
    coalesce(pg_catalog.to_jsonb(v_search.last_alert_listing_ids),'null'::jsonb),p_candidate_ids));
  v_fingerprint:=private.selected_email_hash(p_payload);
  SELECT * INTO v_hold FROM public.email_send_log WHERE producer='saved_search_alert'
    AND entity_id=p_search_id AND entity_hold FOR UPDATE;
  IF FOUND THEN
    PERFORM private.selected_email_expire_locked(v_hold.operation_id);
    IF v_hold.operation_key=v_key THEN
      RETURN pg_catalog.jsonb_build_object('decision',
        CASE WHEN v_hold.payload_fingerprint=v_fingerprint THEN 'existing' ELSE 'conflict' END,
        'operation_id',v_hold.operation_id,'state',v_hold.dispatch_state);
    END IF;
    RETURN pg_catalog.jsonb_build_object('decision','held','operation_id',v_hold.operation_id,'state',v_hold.dispatch_state);
  END IF;
  SELECT * INTO v_hold FROM public.email_send_log WHERE operation_key=v_key
    AND operation_id IS NOT NULL FOR UPDATE;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('decision',CASE WHEN v_hold.payload_fingerprint=v_fingerprint THEN 'existing' ELSE 'conflict' END,
      'operation_id',v_hold.operation_id,'state',v_hold.dispatch_state);
  END IF;
  v_expected:=pg_catalog.jsonb_build_object('user_id',v_search.user_id,'filters',v_search.filters,
    'last_alert_listing_ids',coalesce(pg_catalog.to_jsonb(v_search.last_alert_listing_ids),'null'::jsonb),
    'last_alert_sent_at',v_search.last_alert_sent_at,'recipient_email',v_email);
  INSERT INTO public.email_send_log(template_name,recipient_email,status,metadata,error_message,
    operation_id,operation_key,producer,entity_id,first_dispatch_id,dispatch_state,attempt_tokens,
    payload_fingerprint,prepared_payload,expected_state,candidate_ids,sent_ids,expires_at,entity_hold)
  VALUES ('saved_search_alert',v_email,'pending','{}'::jsonb,NULL,
    pg_catalog.gen_random_uuid(),v_key,'saved_search_alert',p_search_id,p_dispatch_id,'prepared',ARRAY[]::uuid[],
    v_fingerprint,p_payload,v_expected,p_candidate_ids,p_sent_ids,pg_catalog.now()+INTERVAL '7 days',true)
  RETURNING * INTO v_hold;
  RETURN pg_catalog.jsonb_build_object('decision','prepared','operation_id',v_hold.operation_id,'state','prepared');
END;
$body$;
REVOKE ALL ON FUNCTION public.prepare_saved_search_alert_for_service(uuid,uuid,uuid,jsonb,uuid[],uuid[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_saved_search_alert_for_service(uuid,uuid,uuid,jsonb,uuid[],uuid[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_email_dispatch_for_service(p_operation_id uuid,p_attempt_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.email_send_log%ROWTYPE; v_lead public.marketing_leads%ROWTYPE;
  v_search public.saved_searches%ROWTYPE; v_email text; v_days integer; v_valid boolean;
BEGIN
  IF p_operation_id IS NULL OR p_attempt_token IS NULL THEN
    RAISE EXCEPTION 'selected_email_invalid_begin' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected_email_operation_missing' USING ERRCODE='22023'; END IF;
  -- All producer mutations lock entity before operation; another worker may have changed the row.
  IF v_row.producer='marketing_followup' THEN
    SELECT * INTO v_lead FROM public.marketing_leads WHERE id=v_row.entity_id FOR UPDATE;
  ELSE
    SELECT * INTO v_search FROM public.saved_searches WHERE id=v_row.entity_id FOR UPDATE;
  END IF;
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id FOR UPDATE;
  PERFORM private.selected_email_expire_locked(p_operation_id);
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id;
  IF v_row.accepted_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('decision','replay_accepted','operation_id',p_operation_id,'state',v_row.dispatch_state);
  END IF;
  IF v_row.dispatch_state='sending' AND v_row.attempt_started_at<pg_catalog.now()-INTERVAL '15 minutes' THEN
    UPDATE public.email_send_log SET dispatch_state='unknown' WHERE operation_id=p_operation_id;
    RETURN pg_catalog.jsonb_build_object('decision','unknown','operation_id',p_operation_id);
  END IF;
  IF v_row.dispatch_state IN ('sending','unknown') THEN
    RETURN pg_catalog.jsonb_build_object('decision',CASE WHEN v_row.dispatch_state='sending' THEN 'busy' ELSE 'unknown' END,
      'operation_id',p_operation_id);
  END IF;
  IF v_row.expires_at<=pg_catalog.now() OR v_row.prepared_payload IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('decision','expired','operation_id',p_operation_id);
  END IF;
  IF v_row.dispatch_state NOT IN ('prepared','retryable') THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id,'state',v_row.dispatch_state);
  END IF;
  IF v_row.not_before IS NOT NULL AND v_row.not_before>pg_catalog.now() THEN
    RETURN pg_catalog.jsonb_build_object('decision','busy','operation_id',p_operation_id,'not_before',v_row.not_before);
  END IF;
  IF p_attempt_token=ANY(v_row.attempt_tokens) THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id,
      'reason','attempt_token_reused');
  END IF;
  IF v_row.producer='marketing_followup' THEN
    v_days:=CASE v_row.step WHEN 1 THEN 1 WHEN 2 THEN 8 ELSE 29 END;
    v_valid:=v_lead.id IS NOT NULL AND v_lead.email=v_row.recipient_email
      AND v_lead.email=v_row.expected_state->>'email'
      AND coalesce(pg_catalog.to_jsonb(v_lead.followup_step),'null'::jsonb)
        IS NOT DISTINCT FROM v_row.expected_state->'followup_step'
      AND v_lead.status=v_row.expected_state->>'status' AND v_lead.status<>'closed'
      AND v_row.step=coalesce(v_lead.followup_step,0)+1
      AND v_lead.created_at+pg_catalog.make_interval(days=>v_days)<=pg_catalog.now();
  ELSE
    IF v_search.id IS NOT NULL THEN SELECT u.email INTO v_email FROM auth.users u WHERE u.id=v_search.user_id; END IF;
    v_valid:=v_search.id IS NOT NULL AND v_search.email_alerts AND v_email=v_row.recipient_email
      AND v_search.user_id::text=v_row.expected_state->>'user_id'
      AND v_search.filters=v_row.expected_state->'filters'
      AND coalesce(pg_catalog.to_jsonb(v_search.last_alert_listing_ids),'null'::jsonb)
        =v_row.expected_state->'last_alert_listing_ids'
      AND v_search.last_alert_sent_at IS NOT DISTINCT FROM
        (v_row.expected_state->>'last_alert_sent_at')::timestamptz;
  END IF;
  IF NOT coalesce(v_valid,false) THEN
    UPDATE public.email_send_log SET dispatch_state='superseded',status='suppressed',entity_hold=false
      WHERE operation_id=p_operation_id;
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id,'reason','current_eligibility');
  END IF;
  UPDATE public.email_send_log SET dispatch_state='sending',attempt_token=p_attempt_token,
    attempt_tokens=attempt_tokens||p_attempt_token,
    attempt_started_at=pg_catalog.now(),result_outcome=NULL,result_error_code=NULL,
    provider_message_id=NULL,provider_http_status=NULL,not_before=NULL,status='pending'
    WHERE operation_id=p_operation_id;
  RETURN pg_catalog.jsonb_build_object('decision','send','operation_id',p_operation_id,
    'attempt_token',p_attempt_token,'payload',v_row.prepared_payload);
END;
$body$;
REVOKE ALL ON FUNCTION public.begin_email_dispatch_for_service(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_email_dispatch_for_service(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_dispatch_result_for_service(
  p_operation_id uuid,p_attempt_token uuid,p_outcome text,p_provider_message_id text,
  p_http_status integer,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.email_send_log%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_attempt_token IS NULL
    OR p_outcome NOT IN ('accepted','rejected_retryable','rejected_final','unknown')
    OR p_outcome IS NULL OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599)
    OR (p_provider_message_id IS NOT NULL AND pg_catalog.length(p_provider_message_id)>512)
    OR (p_error_code IS NOT NULL AND p_error_code NOT IN
      ('provider_rejected','rate_limited','transport_unknown','response_lost','provider_5xx'))
    OR (p_outcome='accepted' AND (p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299))
    OR (p_outcome IN ('rejected_retryable','rejected_final') AND
      (p_http_status IS NULL OR p_http_status BETWEEN 200 AND 299)) THEN
    RAISE EXCEPTION 'selected_email_invalid_result' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_row.attempt_token IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'selected_email_token_mismatch' USING ERRCODE='22023';
  END IF;
  IF v_row.result_outcome=p_outcome AND v_row.provider_message_id IS NOT DISTINCT FROM p_provider_message_id
    AND v_row.provider_http_status IS NOT DISTINCT FROM p_http_status
    AND v_row.result_error_code IS NOT DISTINCT FROM p_error_code THEN RETURN; END IF;
  IF v_row.accepted_at IS NOT NULL OR v_row.result_outcome IN ('accepted','rejected_retryable','rejected_final') THEN
    RAISE EXCEPTION 'selected_email_result_conflict' USING ERRCODE='22023';
  END IF;
  IF v_row.dispatch_state NOT IN ('sending','unknown') THEN
    RAISE EXCEPTION 'selected_email_not_sending' USING ERRCODE='22023';
  END IF;
  IF v_row.result_outcome='unknown' AND p_outcome<>'accepted' THEN
    RAISE EXCEPTION 'selected_email_unknown_requires_acceptance_evidence' USING ERRCODE='22023';
  END IF;
  UPDATE public.email_send_log SET
    result_outcome=p_outcome,result_error_code=p_error_code,
    provider_message_id=p_provider_message_id,provider_http_status=p_http_status,
    accepted_at=CASE WHEN p_outcome='accepted' THEN pg_catalog.now() ELSE accepted_at END,
    dispatch_state=CASE p_outcome WHEN 'accepted' THEN 'accepted'
      WHEN 'rejected_retryable' THEN 'retryable' WHEN 'rejected_final' THEN 'rejected_final' ELSE 'unknown' END,
    status=CASE p_outcome WHEN 'accepted' THEN 'sent'
      WHEN 'rejected_retryable' THEN 'failed' WHEN 'rejected_final' THEN 'failed' ELSE 'pending' END,
    entity_hold=CASE WHEN p_outcome='rejected_final' THEN false ELSE true END,
    not_before=CASE WHEN p_outcome='rejected_retryable' THEN pg_catalog.now()+INTERVAL '1 minute' ELSE NULL END,
    error_message=CASE WHEN p_outcome='accepted' THEN NULL ELSE p_error_code END
  WHERE operation_id=p_operation_id;
END;
$body$;
REVOKE ALL ON FUNCTION public.record_email_dispatch_result_for_service(uuid,uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_dispatch_result_for_service(uuid,uuid,text,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_email_dispatch_result_for_service(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.email_send_log%ROWTYPE; v_step integer; v_expected_ids uuid[];
  v_count integer;
BEGIN
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'selected_email_invalid_apply' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected_email_operation_missing' USING ERRCODE='22023'; END IF;
  IF v_row.producer='marketing_followup' THEN
    PERFORM 1 FROM public.marketing_leads WHERE id=v_row.entity_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.saved_searches WHERE id=v_row.entity_id FOR UPDATE;
  END IF;
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id FOR UPDATE;
  PERFORM private.selected_email_expire_locked(p_operation_id);
  SELECT * INTO v_row FROM public.email_send_log WHERE operation_id=p_operation_id;
  IF v_row.applied_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('decision','already_applied','operation_id',p_operation_id);
  END IF;
  IF v_row.accepted_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id,'reason','not_accepted');
  END IF;
  IF v_row.expected_state IS NULL OR (v_row.producer='saved_search_alert' AND v_row.candidate_ids IS NULL) THEN
    UPDATE public.email_send_log SET dispatch_state='checkpoint_payload_expired' WHERE operation_id=p_operation_id;
    RETURN pg_catalog.jsonb_build_object('decision','expired','operation_id',p_operation_id);
  END IF;
  IF v_row.dispatch_state='accepted_conflict' THEN
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id);
  END IF;
  IF v_row.producer='marketing_followup' THEN
    v_step:=(v_row.expected_state->>'followup_step')::integer;
    UPDATE public.marketing_leads SET
      followup_step=greatest(coalesce(v_step,0),v_row.step),
      status=CASE WHEN v_row.expected_state->>'status'='new' THEN 'contacted' ELSE status END
    WHERE id=v_row.entity_id AND followup_step IS NOT DISTINCT FROM v_step
      AND (v_row.expected_state->>'status'<>'new' OR status='new');
  ELSE
    v_expected_ids:=CASE WHEN v_row.expected_state->'last_alert_listing_ids'='null'::jsonb THEN NULL
      ELSE ARRAY(SELECT x.value::uuid FROM pg_catalog.jsonb_array_elements_text(
        v_row.expected_state->'last_alert_listing_ids') WITH ORDINALITY AS x(value,ord)
        ORDER BY x.ord) END;
    UPDATE public.saved_searches SET last_alert_listing_ids=v_row.candidate_ids,
      last_alert_sent_at=v_row.accepted_at
    WHERE id=v_row.entity_id AND user_id=(v_row.expected_state->>'user_id')::uuid
      AND email_alerts=true AND filters=v_row.expected_state->'filters'
      AND last_alert_listing_ids IS NOT DISTINCT FROM v_expected_ids;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count<>1 THEN
    UPDATE public.email_send_log SET dispatch_state='accepted_conflict',entity_hold=true
      WHERE operation_id=p_operation_id;
    RETURN pg_catalog.jsonb_build_object('decision','conflict','operation_id',p_operation_id);
  END IF;
  UPDATE public.email_send_log SET dispatch_state='applied',applied_at=pg_catalog.now(),entity_hold=false
    WHERE operation_id=p_operation_id;
  RETURN pg_catalog.jsonb_build_object('decision','applied','operation_id',p_operation_id);
END;
$body$;
REVOKE ALL ON FUNCTION public.apply_email_dispatch_result_for_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_email_dispatch_result_for_service(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.maintain_selected_email_operations_for_service(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.email_send_log%ROWTYPE; v_examined integer:=0; v_unknown integer:=0; v_purged integer:=0;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'selected_email_invalid_limit' USING ERRCODE='22023';
  END IF;
  FOR v_row IN SELECT * FROM public.email_send_log
    WHERE operation_id IS NOT NULL AND expires_at<=pg_catalog.now()
      AND (prepared_payload IS NOT NULL OR expected_state IS NOT NULL
        OR candidate_ids IS NOT NULL OR sent_ids IS NOT NULL OR recipient_email IS NOT NULL)
    ORDER BY expires_at,operation_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    v_examined:=v_examined+1;
    IF v_row.dispatch_state='sending' AND v_row.attempt_started_at<pg_catalog.now()-INTERVAL '15 minutes' THEN
      UPDATE public.email_send_log SET dispatch_state='unknown' WHERE operation_id=v_row.operation_id;
      v_unknown:=v_unknown+1;
    END IF;
    PERFORM private.selected_email_expire_locked(v_row.operation_id);
    v_purged:=v_purged+1;
  END LOOP;
  FOR v_row IN SELECT * FROM public.email_send_log
    WHERE operation_id IS NOT NULL AND dispatch_state='sending'
      AND attempt_started_at<pg_catalog.now()-INTERVAL '15 minutes'
    ORDER BY attempt_started_at,operation_id LIMIT p_limit-v_examined FOR UPDATE SKIP LOCKED
  LOOP
    v_examined:=v_examined+1;
    UPDATE public.email_send_log SET dispatch_state='unknown' WHERE operation_id=v_row.operation_id;
    v_unknown:=v_unknown+1;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('examined',v_examined,'unknown',v_unknown,'purged',v_purged);
END;
$body$;
REVOKE ALL ON FUNCTION public.maintain_selected_email_operations_for_service(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_selected_email_operations_for_service(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.list_accepted_unapplied_email_operations_for_service(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'selected_email_invalid_limit' USING ERRCODE='22023';
  END IF;
  RETURN coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'operation_id',x.operation_id,'producer',x.producer,'state',x.dispatch_state,
    'accepted_at',x.accepted_at) ORDER BY x.accepted_at,x.operation_id)
    FROM (SELECT operation_id,producer,dispatch_state,accepted_at FROM public.email_send_log
      WHERE operation_id IS NOT NULL AND accepted_at IS NOT NULL AND applied_at IS NULL
        AND dispatch_state='accepted' AND expires_at>pg_catalog.now()
        AND expected_state IS NOT NULL
        AND (producer<>'saved_search_alert' OR candidate_ids IS NOT NULL)
      ORDER BY accepted_at,operation_id LIMIT p_limit) x),'[]'::jsonb);
END;
$body$;
REVOKE ALL ON FUNCTION public.list_accepted_unapplied_email_operations_for_service(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_accepted_unapplied_email_operations_for_service(integer) TO service_role;

COMMIT;
