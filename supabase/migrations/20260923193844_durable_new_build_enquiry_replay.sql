BEGIN;

DO $preflight$
DECLARE
  v_policy_count integer;
  v_known_count integer;
  v_insert_count integer;
  v_policy record;
  v_insert_policy record;
BEGIN
  IF to_regprocedure('private.current_user_owns_listing(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_existing_current_user_owns_listing';
  END IF;

  SELECT count(*)::integer INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'new_building_leads'
    AND cmd = 'SELECT';

  SELECT count(*)::integer INTO v_known_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'new_building_leads'
    AND cmd = 'SELECT'
    AND policyname IN ('user_or_owner_select_new_building_lead', 'new_building_leads_select');

  IF v_policy_count <> 1 OR v_known_count <> 1 THEN
    RAISE EXCEPTION 'unsupported_new_building_leads_select_policy_set';
  END IF;

  SELECT * INTO STRICT v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'new_building_leads'
    AND cmd = 'SELECT';

  IF v_policy.permissive <> 'PERMISSIVE' THEN
    RAISE EXCEPTION 'unsupported_new_building_leads_select_policy_mode';
  END IF;

  SELECT count(*)::integer INTO v_insert_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'new_building_leads'
    AND cmd = 'INSERT';

  IF v_insert_count <> 1 THEN
    RAISE EXCEPTION 'unsupported_new_building_leads_insert_policy_set';
  END IF;

  SELECT * INTO STRICT v_insert_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'new_building_leads'
    AND cmd = 'INSERT';

  IF v_insert_policy.permissive <> 'PERMISSIVE'
     OR v_insert_policy.roles <> ARRAY['authenticated']::name[]
     OR v_insert_policy.qual IS NOT NULL
     OR md5(v_insert_policy.with_check) <> '6a6b7c2a3a520c44377894171204e8d2' THEN
    RAISE EXCEPTION 'unsupported_new_building_leads_insert_policy';
  END IF;

  IF v_policy.policyname = 'user_or_owner_select_new_building_lead' THEN
    IF v_policy.roles <> ARRAY['public']::name[]
       OR v_insert_policy.policyname <> 'user_insert_own_new_building_lead'
       OR md5(v_policy.qual) <> 'dd9324abcc8bc1db9b3c46b517875070' THEN
      RAISE EXCEPTION 'unexpected_captured_new_building_leads_select_policy';
    END IF;
  ELSIF v_policy.policyname = 'new_building_leads_select' THEN
    IF v_policy.roles <> ARRAY['authenticated']::name[]
       OR v_insert_policy.policyname <> 'new_building_leads_insert'
       OR md5(v_policy.qual) <> '7565a7e5fb289a7df690040f1c3acddb' THEN
      RAISE EXCEPTION 'unexpected_source_new_building_leads_select_policy';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_new_building_leads_select_policy';
  END IF;
END
$preflight$;

CREATE FUNCTION private.current_user_owns_listing(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.listings AS l
      WHERE l.id = p_listing_id
        AND l.owner_id = (SELECT auth.uid())
    ),
    false
  )
$function$;

ALTER FUNCTION private.current_user_owns_listing(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.current_user_owns_listing(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_owns_listing(uuid) TO anon, authenticated;

DO $policy$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'new_building_leads'
      AND policyname = 'user_or_owner_select_new_building_lead'
  ) THEN
    ALTER POLICY user_or_owner_select_new_building_lead
      ON public.new_building_leads
      USING (
        user_id = (SELECT auth.uid())
        OR private.current_user_owns_listing(new_building_id)
      );
  ELSE
    ALTER POLICY new_building_leads_select
      ON public.new_building_leads
      USING (
        user_id = (SELECT auth.uid())
        OR private.has_platform_admin((SELECT auth.uid()))
        OR private.current_user_owns_listing(new_building_id)
      );
  END IF;
END
$policy$;

ALTER TABLE public.new_building_leads
  ADD COLUMN submission_key uuid NULL DEFAULT NULL;

ALTER TABLE public.new_building_leads
  ADD CONSTRAINT new_building_leads_user_submission_key_key
  UNIQUE (user_id, submission_key);

CREATE FUNCTION private.preserve_new_build_enquiry_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (OLD.submission_key IS NOT NULL OR NEW.submission_key IS NOT NULL)
     AND ROW(
       OLD.id, OLD.user_id, OLD.submission_key, OLD.new_building_id,
       OLD.email, OLD.full_name, OLD.phone, OLD.investment_budget,
       OLD.notes, OLD.utm_source, OLD.created_at
     ) IS DISTINCT FROM ROW(
       NEW.id, NEW.user_id, NEW.submission_key, NEW.new_building_id,
       NEW.email, NEW.full_name, NEW.phone, NEW.investment_budget,
       NEW.notes, NEW.utm_source, NEW.created_at
     ) THEN
    RAISE EXCEPTION 'enquiry_submission_immutable' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END
$function$;

ALTER FUNCTION private.preserve_new_build_enquiry_submission() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.preserve_new_build_enquiry_submission() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER new_building_leads_preserve_submission_identity
BEFORE UPDATE ON public.new_building_leads
FOR EACH ROW
EXECUTE FUNCTION private.preserve_new_build_enquiry_submission();

CREATE FUNCTION public.submit_new_build_enquiry(
  p_submission_key uuid,
  p_user_id uuid,
  p_new_building_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_notes text
)
RETURNS TABLE (id uuid, new_building_id uuid, created_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_email text;
  v_full_name text;
  v_phone text;
  v_notes text;
  v_existing public.new_building_leads%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'enquiry_actor_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_submission_key IS NULL OR p_new_building_id IS NULL
     OR p_email IS NULL OR p_full_name IS NULL OR p_notes IS NULL THEN
    RAISE EXCEPTION 'enquiry_submission_required_fields' USING ERRCODE = '22023';
  END IF;

  v_email := lower(btrim(p_email));
  v_full_name := btrim(p_full_name);
  v_phone := nullif(btrim(p_phone), '');
  v_notes := btrim(p_notes);

  IF v_email = '' OR v_full_name = ''
     OR length(v_email) > 320 OR length(v_full_name) > 160
     OR length(v_phone) > 60 OR length(v_notes) > 2000
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'enquiry_submission_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.new_building_leads AS lead (
    new_building_id, user_id, email, full_name, phone,
    investment_budget, notes, utm_source, submission_key
  ) VALUES (
    p_new_building_id, v_actor, v_email, v_full_name, v_phone,
    0, v_notes, 'newbuild_detail_register', p_submission_key
  )
  ON CONFLICT ON CONSTRAINT new_building_leads_user_submission_key_key DO NOTHING
  RETURNING lead.id, lead.new_building_id, lead.created_at
  INTO id, new_building_id, created_at;

  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT lead.* INTO v_existing
  FROM public.new_building_leads AS lead
  WHERE lead.user_id = v_actor
    AND lead.submission_key = p_submission_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enquiry_submission_retry' USING ERRCODE = '40001';
  END IF;

  IF ROW(
    v_existing.new_building_id, v_existing.email, v_existing.full_name,
    v_existing.phone, v_existing.investment_budget, v_existing.notes,
    v_existing.utm_source
  ) IS DISTINCT FROM ROW(
    p_new_building_id, v_email, v_full_name,
    v_phone, 0::numeric, v_notes,
    'newbuild_detail_register'::text
  ) THEN
    RAISE EXCEPTION 'enquiry_submission_payload_conflict' USING ERRCODE = 'PT409';
  END IF;

  id := v_existing.id;
  new_building_id := v_existing.new_building_id;
  created_at := v_existing.created_at;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION public.submit_new_build_enquiry(uuid, uuid, uuid, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_new_build_enquiry(uuid, uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_new_build_enquiry(uuid, uuid, uuid, text, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.submit_new_build_enquiry(uuid, uuid, uuid, text, text, text, text)
IS 'Authenticated, actor-bound, replay-safe new-build enquiry submission for the mounted NewBuildDetail flow.';

COMMIT;
