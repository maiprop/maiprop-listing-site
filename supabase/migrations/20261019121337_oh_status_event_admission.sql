-- Phase A only. Apply before the compatible handler; this migration emits no events.
-- Restricted ready snapshots persist until disposition. Terminal tombstones must not be pruned.
CREATE TABLE IF NOT EXISTS public.oh_registration_status_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_status text NOT NULL,
  new_status text NOT NULL CHECK (new_status IN ('approved','rejected') AND new_status <> old_status),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','sending','accepted','unknown')),
  registration_id uuid, requester_id uuid, listing_id uuid,
  rejection_reason text, timeslot_index integer,
  attempt_token uuid, attempt_started_at timestamptz, accepted_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  result_code text,
  CONSTRAINT oh_event_snapshot CHECK (
    (state IN ('ready','sending') AND registration_id IS NOT NULL AND requester_id IS NOT NULL AND listing_id IS NOT NULL
      AND (new_status='rejected' OR rejection_reason IS NULL))
    OR (state IN ('accepted','unknown') AND registration_id IS NULL AND requester_id IS NULL AND listing_id IS NULL AND rejection_reason IS NULL AND timeslot_index IS NULL)
  ),
  CONSTRAINT oh_event_evidence CHECK (
    (state='ready' AND attempt_count=0 AND attempt_token IS NULL AND attempt_started_at IS NULL AND accepted_at IS NULL AND http_status IS NULL AND result_code IS NULL)
    OR (state='sending' AND attempt_count=1 AND attempt_token IS NOT NULL AND attempt_started_at IS NOT NULL AND accepted_at IS NULL AND http_status IS NULL AND result_code IS NULL)
    OR (state='accepted' AND attempt_count=1 AND attempt_token IS NOT NULL AND attempt_started_at IS NOT NULL AND accepted_at IS NOT NULL AND http_status IS NOT NULL AND http_status BETWEEN 200 AND 299 AND result_code IS NOT NULL AND result_code='accepted_2xx')
    OR (state='unknown' AND attempt_count=1 AND attempt_token IS NOT NULL AND attempt_started_at IS NOT NULL AND accepted_at IS NULL AND result_code IS NOT NULL AND (
      (result_code IN ('transport_unknown','preparation_failed','sending_expired') AND http_status IS NULL)
      OR (result_code='http_unconfirmed' AND http_status IS NOT NULL AND http_status NOT BETWEEN 200 AND 299)))
  )
);
ALTER TABLE public.oh_registration_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oh_registration_status_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.begin_oh_registration_status_event_for_service(p_event_id uuid, p_attempt_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE r public.oh_registration_status_events%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role',nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'')) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_event_id IS NULL OR p_attempt_token IS NULL THEN
    RAISE EXCEPTION 'oh_event_invalid_begin' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.oh_registration_status_events WHERE event_id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('decision','not_found','event_id',p_event_id); END IF;
  IF r.state='accepted' THEN
    RETURN pg_catalog.jsonb_build_object('decision','replay_accepted','state','accepted','event_id',p_event_id,'new_status',r.new_status);
  END IF;
  IF r.state='ready' THEN
    UPDATE public.oh_registration_status_events SET state='sending',attempt_count=1,attempt_token=p_attempt_token,attempt_started_at=pg_catalog.now(),updated_at=pg_catalog.now() WHERE event_id=p_event_id;
    RETURN pg_catalog.jsonb_build_object('decision','send','state','sending','event_id',p_event_id,'attempt_token',p_attempt_token,
      'snapshot',pg_catalog.jsonb_build_object('id',r.registration_id,'requester_id',r.requester_id,'listing_id',r.listing_id,'status',r.new_status,'rejection_reason',r.rejection_reason,'timeslot_index',r.timeslot_index));
  END IF;
  IF r.state='sending' AND r.attempt_started_at < pg_catalog.now()-INTERVAL '15 minutes' THEN
    UPDATE public.oh_registration_status_events SET state='unknown',result_code='sending_expired',updated_at=pg_catalog.now(),
      registration_id=NULL,requester_id=NULL,listing_id=NULL,rejection_reason=NULL,timeslot_index=NULL WHERE event_id=p_event_id;
    RETURN pg_catalog.jsonb_build_object('decision','unknown','event_id',p_event_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object('decision',CASE WHEN r.state='sending' THEN 'busy' ELSE 'unknown' END,'event_id',p_event_id);
END;
$body$;
REVOKE ALL ON FUNCTION public.begin_oh_registration_status_event_for_service(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_oh_registration_status_event_for_service(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_oh_registration_status_event_result_for_service(
  p_event_id uuid,p_attempt_token uuid,p_outcome text,p_http_status integer,p_result_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE r public.oh_registration_status_events%ROWTYPE;
BEGIN
  IF coalesce(auth.jwt()->>'role',nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'')) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_event_id IS NULL OR p_attempt_token IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('accepted','unknown')
    OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599)
    OR (p_outcome='accepted' AND (p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299 OR p_result_code IS DISTINCT FROM 'accepted_2xx'))
    OR (p_outcome='unknown' AND (p_result_code IS NULL OR p_result_code NOT IN ('http_unconfirmed','transport_unknown','preparation_failed')
      OR (p_result_code='http_unconfirmed' AND (p_http_status IS NULL OR p_http_status BETWEEN 200 AND 299))
      OR (p_result_code IN ('transport_unknown','preparation_failed') AND p_http_status IS NOT NULL))) THEN
    RAISE EXCEPTION 'oh_event_invalid_result' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.oh_registration_status_events WHERE event_id=p_event_id FOR UPDATE;
  IF NOT FOUND OR r.attempt_token IS DISTINCT FROM p_attempt_token THEN
    RAISE EXCEPTION 'oh_event_token_mismatch' USING ERRCODE='22023';
  END IF;
  IF r.state=p_outcome AND r.http_status IS NOT DISTINCT FROM p_http_status AND r.result_code IS NOT DISTINCT FROM p_result_code THEN
    RETURN pg_catalog.jsonb_build_object('decision','recorded','state',r.state,'event_id',p_event_id,'attempt_token',p_attempt_token);
  END IF;
  IF r.state NOT IN ('sending','unknown') OR (r.state='unknown' AND p_outcome<>'accepted' AND r.result_code<>'sending_expired') THEN
    RAISE EXCEPTION 'oh_event_result_conflict' USING ERRCODE='22023';
  END IF;
  UPDATE public.oh_registration_status_events SET state=p_outcome,http_status=p_http_status,result_code=p_result_code,
    accepted_at=CASE WHEN p_outcome='accepted' THEN pg_catalog.now() ELSE NULL END,updated_at=pg_catalog.now(),
    registration_id=NULL,requester_id=NULL,listing_id=NULL,rejection_reason=NULL,timeslot_index=NULL WHERE event_id=p_event_id;
  RETURN pg_catalog.jsonb_build_object('decision','recorded','state',p_outcome,'event_id',p_event_id,'attempt_token',p_attempt_token);
END;
$body$;
REVOKE ALL ON FUNCTION public.record_oh_registration_status_event_result_for_service(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_oh_registration_status_event_result_for_service(uuid,uuid,text,integer,text) TO service_role;
