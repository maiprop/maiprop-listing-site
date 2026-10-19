-- Auth hook only: durable, content-free admission by verified event ID and slot.
CREATE TABLE IF NOT EXISTS public.auth_email_dispatch (
  webhook_id text NOT NULL CHECK (pg_catalog.length(webhook_id) BETWEEN 1 AND 512 AND webhook_id = pg_catalog.btrim(webhook_id)),
  slot text NOT NULL CHECK (slot IN ('signup','invite','magiclink','recovery','reauthentication','email_change_current','email_change_new')),
  state text NOT NULL CHECK (state IN ('sending','accepted','unknown')),
  attempt_token uuid NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count = 1),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  attempt_started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  accepted_at timestamptz,
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  result_code text CHECK (result_code IN ('accepted_2xx','http_unconfirmed','transport_unknown','sending_expired')),
  CONSTRAINT auth_email_dispatch_pkey PRIMARY KEY (webhook_id, slot),
  CONSTRAINT auth_email_dispatch_acceptance CHECK (
    (state = 'accepted' AND accepted_at IS NOT NULL AND http_status BETWEEN 200 AND 299 AND result_code = 'accepted_2xx')
    OR (state <> 'accepted' AND accepted_at IS NULL)
  )
);
ALTER TABLE public.auth_email_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_email_dispatch FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.begin_auth_email_dispatch_for_service(
  p_webhook_id text, p_slot text, p_attempt_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.auth_email_dispatch%ROWTYPE; v_inserted boolean;
BEGIN
  IF coalesce(auth.jwt()->>'role',nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'')) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_webhook_id IS NULL OR pg_catalog.length(p_webhook_id) NOT BETWEEN 1 AND 512
     OR p_webhook_id <> pg_catalog.btrim(p_webhook_id)
     OR p_slot IS NULL OR p_slot NOT IN ('signup','invite','magiclink','recovery','reauthentication','email_change_current','email_change_new')
     OR p_attempt_token IS NULL THEN
    RAISE EXCEPTION 'auth_email_invalid_begin' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.auth_email_dispatch(webhook_id,slot,state,attempt_token)
    VALUES (p_webhook_id,p_slot,'sending',p_attempt_token)
    ON CONFLICT (webhook_id,slot) DO NOTHING RETURNING true INTO v_inserted;
  SELECT * INTO STRICT v_row FROM public.auth_email_dispatch
    WHERE webhook_id=p_webhook_id AND slot=p_slot FOR UPDATE;
  IF coalesce(v_inserted,false) THEN
    RETURN pg_catalog.jsonb_build_object('decision','send','state','sending','webhook_id',p_webhook_id,'slot',p_slot,'attempt_token',p_attempt_token);
  END IF;
  IF v_row.state='accepted' THEN
    RETURN pg_catalog.jsonb_build_object('decision','replay_accepted','state','accepted','webhook_id',p_webhook_id,'slot',p_slot);
  END IF;
  IF v_row.state='sending' AND v_row.attempt_started_at < pg_catalog.now()-INTERVAL '15 minutes' THEN
    UPDATE public.auth_email_dispatch SET state='unknown',updated_at=pg_catalog.now(),result_code='sending_expired'
      WHERE webhook_id=p_webhook_id AND slot=p_slot;
    RETURN pg_catalog.jsonb_build_object('decision','unknown','webhook_id',p_webhook_id,'slot',p_slot);
  END IF;
  RETURN pg_catalog.jsonb_build_object('decision',CASE WHEN v_row.state='sending' THEN 'busy' ELSE 'unknown' END,
    'webhook_id',p_webhook_id,'slot',p_slot);
END;
$body$;
REVOKE ALL ON FUNCTION public.begin_auth_email_dispatch_for_service(text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_auth_email_dispatch_for_service(text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_auth_email_dispatch_result_for_service(
  p_webhook_id text, p_slot text, p_attempt_token uuid, p_outcome text,
  p_http_status integer, p_result_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $body$
DECLARE v_row public.auth_email_dispatch%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role',nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'')) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_webhook_id IS NULL OR pg_catalog.length(p_webhook_id) NOT BETWEEN 1 AND 512
     OR p_webhook_id <> pg_catalog.btrim(p_webhook_id)
     OR p_slot IS NULL OR p_slot NOT IN ('signup','invite','magiclink','recovery','reauthentication','email_change_current','email_change_new')
     OR p_attempt_token IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('accepted','unknown')
     OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599)
     OR (p_outcome='accepted' AND (p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299 OR p_result_code IS DISTINCT FROM 'accepted_2xx'))
     OR (p_outcome='unknown' AND (
        (p_result_code='http_unconfirmed' AND (p_http_status IS NULL OR p_http_status BETWEEN 200 AND 299))
        OR (p_result_code='transport_unknown' AND p_http_status IS NOT NULL)
        OR p_result_code IS NULL OR p_result_code NOT IN ('http_unconfirmed','transport_unknown')))
  THEN
    RAISE EXCEPTION 'auth_email_invalid_result' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.auth_email_dispatch
    WHERE webhook_id=p_webhook_id AND slot=p_slot FOR UPDATE;
  IF NOT FOUND OR v_row.attempt_token IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'auth_email_token_mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_row.state=p_outcome AND v_row.http_status IS NOT DISTINCT FROM p_http_status
     AND v_row.result_code IS NOT DISTINCT FROM p_result_code THEN
    RETURN pg_catalog.jsonb_build_object('decision','recorded','state',v_row.state,
      'webhook_id',p_webhook_id,'slot',p_slot,'attempt_token',p_attempt_token);
  END IF;
  IF v_row.state='accepted' OR (v_row.state='unknown' AND p_outcome<>'accepted' AND v_row.result_code<>'sending_expired') THEN
    RAISE EXCEPTION 'auth_email_result_conflict' USING ERRCODE = '22023';
  END IF;
  IF v_row.state NOT IN ('sending','unknown') THEN
    RAISE EXCEPTION 'auth_email_result_conflict' USING ERRCODE = '22023';
  END IF;
  UPDATE public.auth_email_dispatch SET state=p_outcome,http_status=p_http_status,result_code=p_result_code,
    accepted_at=CASE WHEN p_outcome='accepted' THEN pg_catalog.now() ELSE NULL END,
    updated_at=pg_catalog.now()
    WHERE webhook_id=p_webhook_id AND slot=p_slot;
  RETURN pg_catalog.jsonb_build_object('decision','recorded','state',p_outcome,
    'webhook_id',p_webhook_id,'slot',p_slot,'attempt_token',p_attempt_token);
END;
$body$;
REVOKE ALL ON FUNCTION public.record_auth_email_dispatch_result_for_service(text,text,uuid,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_email_dispatch_result_for_service(text,text,uuid,text,integer,text) TO service_role;
