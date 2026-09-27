-- Task 7c Design B. Additive expansion only; no customer normalization, enrollment,
-- backfill, dropped public overload, or scheduler mutation. Captured legacy bodies
-- are pinned to live-a6-routines.json (2026-09-21); see the Task 7c report.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.role_switch_rollout_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 strict_enrollment_enabled boolean NOT NULL DEFAULT false,
 legacy_begin_enabled boolean NOT NULL DEFAULT true,
 reconciliation_enabled boolean NOT NULL DEFAULT false,
 CHECK (NOT (strict_enrollment_enabled AND legacy_begin_enabled))
);
-- Refuse incompatible preexisting controls; never reset an operator's values.
DO $control$
DECLARE actual jsonb; expected jsonb;
BEGIN
 CREATE TEMP TABLE role_switch_control_expected (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  strict_enrollment_enabled boolean NOT NULL DEFAULT false,
  legacy_begin_enabled boolean NOT NULL DEFAULT true,
  reconciliation_enabled boolean NOT NULL DEFAULT false,
  CHECK(NOT(strict_enrollment_enabled AND legacy_begin_enabled))
 ) ON COMMIT DROP;
 SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 INTO expected FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='role_switch_control_expected'::regclass AND a.attnum>0 AND NOT a.attisdropped;
 SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='private.role_switch_rollout_control'::regclass AND a.attnum>0 AND NOT a.attisdropped;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'incompatible_role_switch_control_columns_or_defaults'; END IF;
 SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO expected FROM pg_constraint WHERE conrelid='role_switch_control_expected'::regclass;
 SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO actual FROM pg_constraint WHERE conrelid='private.role_switch_rollout_control'::regclass;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'incompatible_role_switch_control_constraints'; END IF;
 DROP TABLE role_switch_control_expected;
END; $control$;
ALTER TABLE private.role_switch_rollout_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.role_switch_rollout_control FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.role_switch_rollout_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.role_switch_history
  ADD COLUMN IF NOT EXISTS billing_outcome text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS billing_error text,
  ADD COLUMN IF NOT EXISTS billing_subscription_count integer,
  ADD COLUMN IF NOT EXISTS billing_cancelled_count integer,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_lock_token uuid,
  ADD COLUMN IF NOT EXISTS billing_reconciliation_exhausted_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_invalid_facts jsonb;

ALTER TABLE public.role_switch_history
  ALTER COLUMN had_active_sub DROP NOT NULL,
  ALTER COLUMN billing_subscription_count DROP NOT NULL,
  ALTER COLUMN billing_cancelled_count DROP NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_switch_audit_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_switch_audit_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_switch_audit_id_fkey
      FOREIGN KEY (role_switch_audit_id)
      REFERENCES public.role_switch_history(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_switch_audit_required boolean NOT NULL DEFAULT false;
-- Existing columns must retain the compatibility defaults; no silent drift repair.
DO $defaults$
DECLARE spec record; actual text; required boolean;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.profiles','role_switch_audit_required','false','boolean'),
  ('public.role_switch_history','billing_outcome',chr(39)||'legacy'||chr(39)||'::text','text'),
  ('public.role_switch_history','billing_reconciliation_required','false','boolean')
 ) AS expected(relation_name,column_name,default_sql,type_name) LOOP
  SELECT pg_get_expr(d.adbin,d.adrelid),a.attnotnull AND a.atttypid=spec.type_name::regtype INTO actual,required
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=spec.relation_name::regclass AND a.attname=spec.column_name;
  IF actual IS DISTINCT FROM spec.default_sql OR required IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'incompatible_role_switch_column_default: %.%',spec.relation_name,spec.column_name;
  END IF;
 END LOOP;
END; $defaults$;
REVOKE UPDATE(role_switch_audit_required,role_switch_audit_id) ON public.profiles FROM anon,authenticated;
-- Invoker trigger observes the effective DML role, including inside owner-held
-- definers. A nullable JWT subject and a caller-controlled GUC are not authority.
CREATE OR REPLACE FUNCTION private.guard_role_switch_binding() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.role_switch_audit_required AND NOT NEW.role_switch_audit_required THEN
  RAISE EXCEPTION 'role_switch_enrollment_monotonic' USING ERRCODE='42501';
 END IF;
 IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.profiles'::regclass)) THEN
  IF (TG_OP='INSERT' AND (NEW.role_switch_audit_required OR NEW.role_switch_audit_id IS NOT NULL))
   OR (TG_OP='UPDATE' AND (NEW.role_switch_audit_required IS DISTINCT FROM OLD.role_switch_audit_required
     OR NEW.role_switch_audit_id IS DISTINCT FROM OLD.role_switch_audit_id)) THEN
   RAISE EXCEPTION 'role_switch_binding_protected' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_role_switch_binding() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS profiles_guard_role_switch_binding ON public.profiles;
CREATE TRIGGER profiles_guard_role_switch_binding BEFORE INSERT OR UPDATE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION private.guard_role_switch_binding();
DO $constraint$
DECLARE actual text; expected text; legacy text;
BEGIN
 CREATE TEMP TABLE role_switch_constraint_probe (LIKE public.role_switch_history) ON COMMIT DROP;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (switch_kind IN ('same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'));
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') INTO actual FROM pg_constraint WHERE conrelid='public.role_switch_history'::regclass AND conname='role_switch_history_switch_kind_check';
 ALTER TABLE role_switch_constraint_probe DROP CONSTRAINT probe;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (switch_kind IN ('same-tier','upgrade','downgrade','proonly'));
 SELECT pg_get_constraintdef(oid) INTO legacy FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 IF actual=legacy THEN ALTER TABLE public.role_switch_history DROP CONSTRAINT role_switch_history_switch_kind_check; actual:=NULL; END IF;
 IF actual IS NULL THEN ALTER TABLE public.role_switch_history ADD CONSTRAINT role_switch_history_switch_kind_check CHECK (switch_kind IN ('same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only')) NOT VALID;
 ELSIF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected definition for role_switch_history_switch_kind_check: %',actual; END IF;
 DROP TABLE role_switch_constraint_probe;
END; $constraint$;
DO $constraint$
DECLARE actual text; expected text; legacy text;
BEGIN
 CREATE TEMP TABLE role_switch_constraint_probe (LIKE public.role_switch_history) ON COMMIT DROP;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (
    to_type IS NULL OR to_type IN (
      'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
    )
  );
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') INTO actual FROM pg_constraint WHERE conrelid='public.role_switch_history'::regclass AND conname='role_switch_history_to_type_check';
 IF actual IS NULL THEN ALTER TABLE public.role_switch_history ADD CONSTRAINT role_switch_history_to_type_check CHECK (
    to_type IS NULL OR to_type IN (
      'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
    )
  ) NOT VALID;
 ELSIF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected definition for role_switch_history_to_type_check: %',actual; END IF;
 DROP TABLE role_switch_constraint_probe;
END; $constraint$;
DO $constraint$
DECLARE actual text; expected text; legacy text;
BEGIN
 CREATE TEMP TABLE role_switch_constraint_probe (LIKE public.role_switch_history) ON COMMIT DROP;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (
    billing_outcome IN (
      'legacy', 'not_required', 'pending', 'succeeded', 'already_pending', 'failed', 'unknown'
    )
  );
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') INTO actual FROM pg_constraint WHERE conrelid='public.role_switch_history'::regclass AND conname='role_switch_history_billing_outcome_check';
 IF actual IS NULL THEN ALTER TABLE public.role_switch_history ADD CONSTRAINT role_switch_history_billing_outcome_check CHECK (
    billing_outcome IN (
      'legacy', 'not_required', 'pending', 'succeeded', 'already_pending', 'failed', 'unknown'
    )
  ) NOT VALID;
 ELSIF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected definition for role_switch_history_billing_outcome_check: %',actual; END IF;
 DROP TABLE role_switch_constraint_probe;
END; $constraint$;
DO $constraint$
DECLARE actual text; expected text; legacy text;
BEGIN
 CREATE TEMP TABLE role_switch_constraint_probe (LIKE public.role_switch_history) ON COMMIT DROP;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (
    (billing_subscription_count IS NULL OR billing_subscription_count >= 0)
    AND (billing_cancelled_count IS NULL OR billing_cancelled_count >= 0)
    AND (
      billing_subscription_count IS NULL
      OR billing_cancelled_count IS NULL
      OR billing_cancelled_count <= billing_subscription_count
    )
  );
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') INTO actual FROM pg_constraint WHERE conrelid='public.role_switch_history'::regclass AND conname='role_switch_history_billing_counts_check';
 IF actual IS NULL THEN ALTER TABLE public.role_switch_history ADD CONSTRAINT role_switch_history_billing_counts_check CHECK (
    (billing_subscription_count IS NULL OR billing_subscription_count >= 0)
    AND (billing_cancelled_count IS NULL OR billing_cancelled_count >= 0)
    AND (
      billing_subscription_count IS NULL
      OR billing_cancelled_count IS NULL
      OR billing_cancelled_count <= billing_subscription_count
    )
  ) NOT VALID;
 ELSIF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected definition for role_switch_history_billing_counts_check: %',actual; END IF;
 DROP TABLE role_switch_constraint_probe;
END; $constraint$;
DO $constraint$
DECLARE actual text; expected text; legacy text;
BEGIN
 CREATE TEMP TABLE role_switch_constraint_probe (LIKE public.role_switch_history) ON COMMIT DROP;
 ALTER TABLE role_switch_constraint_probe ADD CONSTRAINT probe CHECK (billing_reconciliation_attempt_count >= 0);
 SELECT pg_get_constraintdef(oid) INTO expected FROM pg_constraint WHERE conrelid='role_switch_constraint_probe'::regclass AND conname='probe';
 SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') INTO actual FROM pg_constraint WHERE conrelid='public.role_switch_history'::regclass AND conname='role_switch_history_reconciliation_attempts_check';
 IF actual IS NULL THEN ALTER TABLE public.role_switch_history ADD CONSTRAINT role_switch_history_reconciliation_attempts_check CHECK (billing_reconciliation_attempt_count >= 0) NOT VALID;
 ELSIF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected definition for role_switch_history_reconciliation_attempts_check: %',actual; END IF;
 DROP TABLE role_switch_constraint_probe;
END; $constraint$;
-- Pinned captured definition SHA256 be8af5ae31ce3bbce19d3d92e652d387b41b48fe99fa01529998ec2327fffce8
CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user(_user_id uuid, _from_type text, _to_type text, _switch_kind text, _had_active_sub boolean, _sub_cancelled boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.role_switch_history(
    user_id, from_type, to_type, switch_kind, had_active_sub, sub_cancelled
  ) VALUES (
    _user_id,
    _from_type,
    NULLIF(_to_type, ''),
    _switch_kind,
    _had_active_sub,
    _sub_cancelled
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean) TO service_role;
-- Pinned captured definition SHA256 4cb36a24eff5ce7142edb3e014cc35326c6e0f63d6ae5e272f098f2b6e3014a6
CREATE OR REPLACE FUNCTION private.begin_role_switch_legacy(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.archive_role_data(_user_id, v_role::text);

  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION private.begin_role_switch_legacy(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Pinned captured definition SHA256 d78f0b0cd8f5f1145addacc5e83c39e5223f2188e902c7aedbdf0d54e4f6f016
CREATE OR REPLACE FUNCTION private.complete_onboarding_role_legacy(p_user_id uuid, p_role user_role, p_participant_type text, p_display_name text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_role public.user_role;
  v_was_switching boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, role_switch_in_progress_at IS NOT NULL
    INTO v_old_role, v_was_switching
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_old_role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'admin_role_locked';
  END IF;

  IF p_participant_type NOT IN ('buyer','seller','agent','developer','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;

  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;

  IF p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role,
    'developer'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  IF p_role = 'professional'::public.user_role THEN
    IF nullif(trim(coalesce(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.user_id = p_user_id AND pr.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  IF p_role = 'developer'::public.user_role THEN
    IF nullif(trim(coalesce(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF nullif(trim(coalesce(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION private.complete_onboarding_role_legacy(uuid,user_role,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.complete_onboarding_role_strict(
  p_user_id uuid,
  p_role public.user_role,
  p_participant_type text,
  p_display_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_role public.user_role;
  v_old_participant_type text;
  v_was_switching boolean;
  v_role_switch_audit_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT
    role,
    participant_type,
    role_switch_in_progress_at IS NOT NULL,
    role_switch_audit_id
  INTO
    v_old_role,
    v_old_participant_type,
    v_was_switching,
    v_role_switch_audit_id
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF v_old_role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'admin_role_locked';
  END IF;
  IF p_participant_type IS NULL OR p_participant_type NOT IN ('buyer','seller','agent','developer','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;
  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;
  IF p_role IS NULL OR p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role,
    'developer'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  -- A non-null participant_type proves that onboarding has already completed.
  -- Such a profile may only change role inside the sentinel + exact finalized
  -- audit flow. The only unaudited established-profile call allowed here is an
  -- idempotent completion of the same role/participant pair.
  IF NOT v_was_switching
     AND v_old_participant_type IS NOT NULL
     AND (
       v_old_role IS DISTINCT FROM p_role
       OR v_old_participant_type IS DISTINCT FROM p_participant_type
     ) THEN
    RAISE EXCEPTION 'role_switch_audit_required';
  END IF;

  IF v_was_switching THEN
    IF v_role_switch_audit_id IS NULL THEN
      RAISE EXCEPTION 'role_switch_audit_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.role_switch_history history
      WHERE history.id = v_role_switch_audit_id
        AND history.user_id = p_user_id
        AND history.from_type = v_old_role::text
        AND history.to_type = p_participant_type
        AND history.billing_finalized_at IS NOT NULL
        AND history.billing_reconciliation_lock_token IS NULL
        AND history.billing_reconciliation_required = false
        AND history.billing_outcome IN ('not_required', 'succeeded', 'already_pending')
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'role_switch_audit_destination_mismatch';
    END IF;
  END IF;

  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  IF p_role = 'professional'::public.user_role THEN
    IF nullif(trim(coalesce(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.user_id = p_user_id AND pr.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  IF p_role = 'developer'::public.user_role THEN
    IF nullif(trim(coalesce(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF nullif(trim(coalesce(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    role_switch_in_progress_at = NULL,
    role_switch_audit_id = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.complete_onboarding_role_strict(uuid,public.user_role,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.finalize_role_switch_audit_for_user(
  _audit_id uuid,
  _user_id uuid,
  _had_active_sub boolean,
  _billing_outcome text,
  _billing_error text,
  _subscription_count integer,
  _cancelled_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE existing public.role_switch_history%ROWTYPE;
BEGIN
  IF _audit_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'audit_identity_required' USING ERRCODE = '22023';
  END IF;
  IF _billing_outcome IS NULL OR _billing_outcome NOT IN (
    'not_required', 'pending', 'succeeded', 'already_pending', 'failed', 'unknown'
  ) THEN
    RAISE EXCEPTION 'invalid_billing_outcome' USING ERRCODE = '22023';
  END IF;
  IF (_subscription_count IS NOT NULL AND _subscription_count < 0)
     OR (_cancelled_count IS NOT NULL AND _cancelled_count < 0)
     OR (
       _subscription_count IS NOT NULL
       AND _cancelled_count IS NOT NULL
       AND _cancelled_count > _subscription_count
     ) THEN
    RAISE EXCEPTION 'invalid_billing_counts' USING ERRCODE = '22023';
  END IF;

  -- Same profile-first order as record/begin/completion. Workers only lock audits.
  PERFORM 1 FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
  SELECT * INTO existing FROM public.role_switch_history WHERE id=_audit_id AND user_id=_user_id FOR UPDATE;
  IF NOT FOUND OR existing.billing_reconciliation_lock_token IS NOT NULL OR existing.billing_outcome='legacy' THEN
    RAISE EXCEPTION 'role_switch_audit_not_reconcilable' USING ERRCODE='P0002';
  END IF;
  IF existing.billing_finalized_at IS NOT NULL AND NOT existing.billing_reconciliation_required THEN
    IF existing.billing_outcome IS DISTINCT FROM _billing_outcome
      OR existing.had_active_sub IS DISTINCT FROM COALESCE(_had_active_sub,existing.had_active_sub)
      OR existing.billing_subscription_count IS DISTINCT FROM COALESCE(_subscription_count,existing.billing_subscription_count)
      OR existing.billing_cancelled_count IS DISTINCT FROM COALESCE(_cancelled_count,existing.billing_cancelled_count)
      OR existing.billing_error IS DISTINCT FROM NULLIF(left(COALESCE(_billing_error,''),1000),'') THEN
      RAISE EXCEPTION 'role_switch_finalized_conflict';
    END IF;
    RETURN;
  END IF;
  UPDATE public.role_switch_history
  SET
    had_active_sub = COALESCE(_had_active_sub, had_active_sub),
    sub_cancelled = sub_cancelled OR COALESCE(_cancelled_count, 0) > 0,
    billing_outcome = _billing_outcome,
    billing_error = NULLIF(left(COALESCE(_billing_error, ''), 1000), ''),
    billing_subscription_count = COALESCE(
      _subscription_count,
      billing_subscription_count
    ),
    billing_cancelled_count = COALESCE(
      _cancelled_count,
      billing_cancelled_count
    ),
    billing_reconciliation_required = _billing_outcome IN ('pending', 'unknown'),
    billing_reconciliation_next_attempt_at = CASE
      WHEN _billing_outcome IN ('pending', 'unknown')
        THEN now() + interval '5 minutes'
      ELSE NULL
    END,
    billing_reconciliation_exhausted_at = NULL,
    billing_finalized_at = CASE
      WHEN _billing_outcome IN ('pending', 'unknown') THEN NULL
      ELSE now()
    END
  WHERE id = _audit_id
    AND user_id = _user_id
    AND (
      billing_reconciliation_required = true
      OR billing_outcome = _billing_outcome
    )
    AND billing_reconciliation_lock_token IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_switch_audit_not_reconcilable' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.claim_role_switch_reconciliation_batch(
  _worker_id uuid,
  _batch_size integer DEFAULT 10,
  _max_attempts integer DEFAULT 6
)
RETURNS TABLE (
  audit_id uuid,
  user_id uuid,
  lock_token uuid,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT COALESCE((SELECT reconciliation_enabled FROM private.role_switch_rollout_control WHERE singleton),false) THEN RETURN; END IF;
  IF _worker_id IS NULL THEN
    RAISE EXCEPTION 'reconciliation_worker_required' USING ERRCODE = '22023';
  END IF;
  IF _batch_size IS NULL OR _batch_size < 1 OR _batch_size > 50 THEN
    RAISE EXCEPTION 'invalid_reconciliation_batch_size' USING ERRCODE = '22023';
  END IF;
  IF _max_attempts IS NULL OR _max_attempts < 1 OR _max_attempts > 20 THEN
    RAISE EXCEPTION 'invalid_reconciliation_max_attempts' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT history.id
    FROM public.role_switch_history history
    WHERE history.billing_reconciliation_required = true
      AND history.billing_reconciliation_attempt_count < _max_attempts
      AND COALESCE(
        history.billing_reconciliation_next_attempt_at,
        history.switched_at
      ) <= now()
      AND (
        history.billing_reconciliation_lock_token IS NULL
        OR history.billing_reconciliation_locked_at < now() - interval '15 minutes'
      )
    ORDER BY
      COALESCE(history.billing_reconciliation_next_attempt_at, history.switched_at),
      history.switched_at,
      history.id
    FOR UPDATE SKIP LOCKED
    LIMIT _batch_size
  ), claimed AS (
    UPDATE public.role_switch_history history
    SET
      billing_reconciliation_lock_token = _worker_id,
      billing_reconciliation_locked_at = now()
    FROM candidates
    WHERE history.id = candidates.id
    RETURNING
      history.id,
      history.user_id,
      history.billing_reconciliation_lock_token,
      history.billing_reconciliation_attempt_count + 1
        AS billing_reconciliation_attempt_count
  )
  SELECT
    claimed.id,
    claimed.user_id,
    claimed.billing_reconciliation_lock_token,
    claimed.billing_reconciliation_attempt_count
  FROM claimed;
END;
$$;
CREATE OR REPLACE FUNCTION public.release_role_switch_reconciliation_claims(
  _worker_id uuid,
  _audit_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _released integer;
BEGIN
  IF _worker_id IS NULL THEN
    RAISE EXCEPTION 'reconciliation_worker_required' USING ERRCODE = '22023';
  END IF;
  IF _audit_ids IS NULL
     OR cardinality(_audit_ids) < 1
     OR cardinality(_audit_ids) > 50
     OR array_position(_audit_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_reconciliation_release_batch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.role_switch_history history
  SET
    billing_reconciliation_lock_token = NULL,
    billing_reconciliation_locked_at = NULL
  WHERE history.id = ANY(_audit_ids)
    AND history.billing_reconciliation_required = true
    AND history.billing_reconciliation_lock_token = _worker_id;

  GET DIAGNOSTICS _released = ROW_COUNT;
  RETURN _released;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_role_switch_reconciliation_attempt(
  _audit_id uuid,
  _user_id uuid,
  _lock_token uuid,
  _billing_outcome text,
  _billing_error text,
  _had_active_sub boolean,
  _subscription_count integer,
  _cancelled_count integer,
  _max_attempts integer DEFAULT 6
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF _audit_id IS NULL OR _user_id IS NULL OR _lock_token IS NULL THEN
    RAISE EXCEPTION 'reconciliation_binding_required' USING ERRCODE = '22023';
  END IF;
  IF _billing_outcome IS NULL OR _billing_outcome NOT IN (
    'not_required', 'succeeded', 'already_pending', 'unknown'
  ) THEN
    RAISE EXCEPTION 'invalid_billing_outcome' USING ERRCODE = '22023';
  END IF;
  IF _max_attempts IS NULL OR _max_attempts < 1 OR _max_attempts > 20 THEN
    RAISE EXCEPTION 'invalid_reconciliation_max_attempts' USING ERRCODE = '22023';
  END IF;
  IF (_subscription_count IS NOT NULL AND _subscription_count < 0)
     OR (_cancelled_count IS NOT NULL AND _cancelled_count < 0)
     OR (
       _subscription_count IS NOT NULL
       AND _cancelled_count IS NOT NULL
       AND _cancelled_count > _subscription_count
     ) THEN
    RAISE EXCEPTION 'invalid_billing_counts' USING ERRCODE = '22023';
  END IF;

  UPDATE public.role_switch_history history
  SET
    billing_reconciliation_last_attempt_at = now(),
    billing_reconciliation_attempt_count =
      history.billing_reconciliation_attempt_count + 1,
    had_active_sub = COALESCE(_had_active_sub, history.had_active_sub),
    sub_cancelled = history.sub_cancelled
      OR COALESCE(_cancelled_count, 0) > 0,
    billing_outcome = CASE
      WHEN _billing_outcome = 'unknown'
        AND history.billing_reconciliation_attempt_count + 1 >= _max_attempts
        THEN 'failed'
      ELSE _billing_outcome
    END,
    billing_error = CASE
      WHEN _billing_outcome = 'unknown'
        AND history.billing_reconciliation_attempt_count + 1 >= _max_attempts
        THEN left(
          'reconciliation_exhausted:' || COALESCE(
            NULLIF(_billing_error, ''),
            'billing_verification_failed'
          ),
          1000
        )
      ELSE NULLIF(left(COALESCE(_billing_error, ''), 1000), '')
    END,
    billing_subscription_count = COALESCE(
      _subscription_count,
      history.billing_subscription_count
    ),
    billing_cancelled_count = COALESCE(
      _cancelled_count,
      history.billing_cancelled_count
    ),
    billing_reconciliation_required = _billing_outcome = 'unknown'
      AND history.billing_reconciliation_attempt_count + 1 < _max_attempts,
    billing_reconciliation_next_attempt_at = CASE
      WHEN _billing_outcome = 'unknown'
        AND history.billing_reconciliation_attempt_count + 1 < _max_attempts
        THEN now() + make_interval(
          secs => LEAST(
            21600,
            (
              300 * power(
                2::numeric,
                GREATEST(history.billing_reconciliation_attempt_count, 0)::numeric
              )
            )::integer
          )
        )
      ELSE NULL
    END,
    billing_reconciliation_exhausted_at = CASE
      WHEN _billing_outcome = 'unknown'
        AND history.billing_reconciliation_attempt_count + 1 >= _max_attempts
        THEN now()
      ELSE NULL
    END,
    billing_finalized_at = CASE
      WHEN _billing_outcome = 'unknown'
        AND history.billing_reconciliation_attempt_count + 1 < _max_attempts
        THEN NULL
      ELSE now()
    END,
    billing_reconciliation_lock_token = NULL,
    billing_reconciliation_locked_at = NULL
  WHERE history.id = _audit_id
    AND history.user_id = _user_id
    AND history.billing_reconciliation_required = true
    AND history.billing_reconciliation_lock_token = _lock_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_switch_reconciliation_lease_lost' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION private.invoke_role_switch_billing_reconciliation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supabase_url text;
  v_cron_secret text;
BEGIN
  IF NOT COALESCE((SELECT reconciliation_enabled FROM private.role_switch_rollout_control WHERE singleton),false) THEN RETURN; END IF;
  SELECT decrypted_secret
  INTO v_supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF nullif(v_supabase_url, '') IS NULL THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;
  IF nullif(v_cron_secret, '') IS NULL THEN
    v_cron_secret := current_setting('app.settings.cron_secret', true);
  END IF;

  IF nullif(v_supabase_url, '') IS NULL OR nullif(v_cron_secret, '') IS NULL THEN
    RAISE WARNING 'Skipping role-switch reconciliation: missing Supabase URL or cron secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_supabase_url, '/') ||
      '/functions/v1/reconcile-role-switch-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 IF NOT COALESCE((SELECT legacy_begin_enabled FROM private.role_switch_rollout_control WHERE singleton),false)
  OR p.role_switch_audit_required OR p.role_switch_audit_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.role_switch_history WHERE user_id=_user_id AND billing_outcome<>'legacy'
   AND (billing_reconciliation_required OR billing_finalized_at IS NULL)) THEN
  RAISE EXCEPTION 'legacy_role_switch_admission_closed';
 END IF;
 PERFORM private.begin_role_switch_legacy(_user_id);
END; $$;

CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user(
 _operation_id uuid,_user_id uuid,_from_type text,_to_type text,_switch_kind text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE; a public.role_switch_history%ROWTYPE;
BEGIN
 IF _operation_id IS NULL OR _user_id IS NULL THEN RAISE EXCEPTION 'audit_identity_required' USING ERRCODE='22023'; END IF;
 IF _from_type IS NULL OR _from_type NOT IN ('buyer','seller','agent','developer','professional','investor','institutional') THEN
  RAISE EXCEPTION 'invalid_role_switch_source' USING ERRCODE='22023'; END IF;
 IF _to_type IS NULL OR _to_type NOT IN ('buyer','seller','agent','developer','professional','investor','institutional') THEN
  RAISE EXCEPTION 'invalid_role_switch_destination' USING ERRCODE='22023'; END IF;
 IF _switch_kind IS NULL OR _switch_kind NOT IN ('same-tier','upgrade','downgrade','proonly','invite-only') THEN
  RAISE EXCEPTION 'invalid_role_switch_kind' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 SELECT * INTO a FROM public.role_switch_history WHERE id=_operation_id FOR UPDATE;
 IF FOUND THEN
  IF a.user_id IS DISTINCT FROM _user_id OR a.from_type IS DISTINCT FROM _from_type
   OR a.to_type IS DISTINCT FROM _to_type OR a.switch_kind IS DISTINCT FROM _switch_kind
   OR a.billing_outcome='legacy' THEN RAISE EXCEPTION 'role_switch_operation_conflict' USING ERRCODE='23505'; END IF;
  IF NOT p.role_switch_audit_required AND p.role_switch_audit_id IS DISTINCT FROM _operation_id THEN
   RAISE EXCEPTION 'role_switch_enrollment_required'; END IF;
  IF p.role_switch_in_progress_at IS NOT NULL AND p.role_switch_audit_id IS DISTINCT FROM _operation_id THEN
   RAISE EXCEPTION 'role_switch_already_in_progress'; END IF;
  UPDATE public.profiles SET role_switch_audit_required=true WHERE user_id=_user_id;
  RETURN a.id;
 END IF;
 IF NOT COALESCE((SELECT strict_enrollment_enabled FROM private.role_switch_rollout_control WHERE singleton),false) THEN
  RAISE EXCEPTION 'role_switch_enrollment_closed'; END IF;
 IF p.role_switch_in_progress_at IS NOT NULL OR p.role_switch_audit_id IS NOT NULL THEN
  RAISE EXCEPTION 'role_switch_already_in_progress'; END IF;
 IF p.role::text IS DISTINCT FROM _from_type THEN RAISE EXCEPTION 'role_switch_source_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.role_switch_history WHERE user_id=_user_id AND billing_outcome<>'legacy'
   AND (billing_reconciliation_required OR billing_finalized_at IS NULL)) THEN
  RAISE EXCEPTION 'role_switch_unresolved_intent'; END IF;
 INSERT INTO public.role_switch_history(id,user_id,from_type,to_type,switch_kind,had_active_sub,sub_cancelled,
  billing_outcome,billing_reconciliation_required,billing_reconciliation_next_attempt_at)
 VALUES(_operation_id,_user_id,_from_type,_to_type,_switch_kind,NULL,false,'pending',true,now()+interval '15 minutes');
 UPDATE public.profiles SET role_switch_audit_required=true WHERE user_id=_user_id;
 RETURN _operation_id;
END; $$;

CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user(_user_id uuid,_audit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE; a public.role_switch_history%ROWTYPE;
BEGIN
 IF _user_id IS NULL OR _audit_id IS NULL THEN RAISE EXCEPTION 'role_switch_audit_required'; END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 IF NOT p.role_switch_audit_required AND p.role_switch_audit_id IS DISTINCT FROM _audit_id THEN
  RAISE EXCEPTION 'role_switch_enrollment_required'; END IF;
 IF p.role_switch_in_progress_at IS NOT NULL AND p.role_switch_audit_id IS DISTINCT FROM _audit_id THEN
  RAISE EXCEPTION 'role_switch_already_in_progress'; END IF;
 PERFORM 1 FROM public.professionals WHERE user_id=_user_id FOR UPDATE;
 SELECT * INTO a FROM public.role_switch_history WHERE id=_audit_id FOR UPDATE;
 IF NOT FOUND OR a.user_id IS DISTINCT FROM _user_id OR a.from_type IS DISTINCT FROM p.role::text
  OR a.to_type IS NULL OR a.billing_finalized_at IS NULL OR a.billing_reconciliation_required
  OR a.billing_reconciliation_lock_token IS NOT NULL
  OR a.billing_outcome NOT IN ('not_required','succeeded','already_pending') THEN
  RAISE EXCEPTION 'role_switch_audit_not_ready'; END IF;
 UPDATE public.profiles SET role_switch_audit_required=true WHERE user_id=_user_id;
 IF p.role_switch_in_progress_at IS NOT NULL AND p.role_switch_audit_id=_audit_id THEN RETURN; END IF;
 PERFORM public.archive_role_data(_user_id,p.role::text);
 UPDATE public.profiles SET participant_type=NULL,bio=NULL,role_switch_in_progress_at=now(),
  role_switch_audit_id=_audit_id,updated_at=now() WHERE user_id=_user_id;
END; $$;

-- Both public completion contracts use this one atomic transaction body.
CREATE OR REPLACE FUNCTION private.complete_onboarding_role_transaction(
 p_user_id uuid,p_role public.user_role,p_participant_type text,
 p_display_name text,p_city text,p_phone text,p_professional_profile jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%ROWTYPE; legacy_lane boolean; professional_id uuid; item record;
 profile_title text; profile_category public.professional_category;
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_role IS NULL OR p_participant_type IS NULL THEN RAISE EXCEPTION 'role_not_allowed'; END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 legacy_lane := NOT p.role_switch_audit_required AND p.role_switch_audit_id IS NULL AND p.role_switch_in_progress_at IS NOT NULL;
 IF legacy_lane AND EXISTS(SELECT 1 FROM public.role_switch_history WHERE user_id=p_user_id AND billing_outcome<>'legacy'
   AND (billing_reconciliation_required OR billing_finalized_at IS NULL)) THEN
  RAISE EXCEPTION 'role_switch_unresolved_intent'; END IF;
 IF p.role_switch_audit_id IS NOT NULL THEN
  IF p.role_switch_in_progress_at IS NULL THEN RAISE EXCEPTION 'role_switch_audit_required'; END IF;
  UPDATE public.profiles SET role_switch_audit_required=true WHERE user_id=p_user_id;
 END IF;
 -- Reserve the actor professional row before any audit lock, including null-profile calls.
 PERFORM 1 FROM public.professionals WHERE user_id=p_user_id FOR UPDATE;
 IF p_professional_profile IS NOT NULL THEN
  IF jsonb_typeof(p_professional_profile) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'invalid_professional_profile' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(p_professional_profile) LOOP
   IF item.key NOT IN ('title','category','displayName','city','licenseNumber') THEN
    RAISE EXCEPTION 'invalid_professional_profile_key' USING ERRCODE='22023'; END IF;
   IF item.key IN ('title','category') AND jsonb_typeof(item.value) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'invalid_professional_profile' USING ERRCODE='22023'; END IF;
   IF item.key IN ('displayName','city','licenseNumber') AND jsonb_typeof(item.value) NOT IN ('null','string') THEN
    RAISE EXCEPTION 'invalid_professional_profile' USING ERRCODE='22023'; END IF;
  END LOOP;
  profile_title:=btrim(p_professional_profile->>'title');
  IF profile_title IS NULL OR length(profile_title)=0 OR length(profile_title)>160
   OR NOT (p_professional_profile ? 'category') OR p_professional_profile->>'category' IS NULL
   OR length(btrim(p_professional_profile->>'displayName'))>160
   OR length(btrim(p_professional_profile->>'city'))>120
   OR length(btrim(p_professional_profile->>'licenseNumber'))>120 THEN
   RAISE EXCEPTION 'invalid_professional_profile' USING ERRCODE='22023'; END IF;
  IF p_professional_profile->>'category' NOT IN ('architect','civil_engineer','lawyer','notary','electrician','plumber','contractor','property_manager','valuer','interior_designer','financial_advisor','real_estate_agent','insurance_broker','utility_certification_provider','esg_sustainability_consultant','relocation_immigration_consultant','facility_manager','short_term_rental_operator','hotel_hospitality_operator','marketing_agency','crm_listing_data_provider','concrete_contractor','steel_structure_contractor','carpenter','tile_installer','painter','building_permit_consultant','urban_planning_consultant','legalization_specialist','energy_certificate_inspector','building_regulation_consultant','fire_protection_consultant','drywall_installer','waterproofing_specialist','insulation_contractor','roofing_contractor','window_aluminum_installer','elevator_installer','smart_home_installer') THEN
   RAISE EXCEPTION 'invalid_professional_profile_category' USING ERRCODE='22023'; END IF;
  BEGIN profile_category:=(p_professional_profile->>'category')::public.professional_category;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'invalid_professional_profile_category' USING ERRCODE='22023'; END;
  INSERT INTO public.professionals(user_id,title,category,display_name,city,license_number)
  VALUES(p_user_id,profile_title,profile_category,NULLIF(btrim(p_professional_profile->>'displayName'),''),
   NULLIF(btrim(p_professional_profile->>'city'),''),NULLIF(btrim(p_professional_profile->>'licenseNumber'),''))
  ON CONFLICT(user_id) DO UPDATE SET title=excluded.title,category=excluded.category,
   display_name=excluded.display_name,city=excluded.city,license_number=excluded.license_number
  RETURNING id INTO professional_id;
 END IF;
 IF legacy_lane THEN
  PERFORM private.complete_onboarding_role_legacy(p_user_id,p_role,p_participant_type,p_display_name,p_city,p_phone);
 ELSE
  PERFORM private.complete_onboarding_role_strict(p_user_id,p_role,p_participant_type,p_display_name,p_city,p_phone);
 END IF;
 RETURN jsonb_build_object('professionalId',professional_id);
END; $$;
REVOKE ALL ON FUNCTION private.complete_onboarding_role_transaction(uuid,public.user_role,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user(
 p_user_id uuid,p_role public.user_role,p_participant_type text,
 p_display_name text DEFAULT NULL,p_city text DEFAULT NULL,p_phone text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM private.complete_onboarding_role_transaction(p_user_id,p_role,p_participant_type,p_display_name,p_city,p_phone,NULL);
END; $$;
CREATE OR REPLACE FUNCTION public.complete_onboarding_role_with_profile_for_user(
 p_user_id uuid,p_role public.user_role,p_participant_type text,
 p_display_name text DEFAULT NULL,p_city text DEFAULT NULL,p_phone text DEFAULT NULL,p_professional_profile jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 RETURN private.complete_onboarding_role_transaction(p_user_id,p_role,p_participant_type,p_display_name,p_city,p_phone,p_professional_profile);
END; $$;

REVOKE ALL ON FUNCTION public.begin_role_switch_for_user(uuid),public.begin_role_switch_for_user(uuid,uuid),
 public.record_role_switch_audit_for_user(uuid,uuid,text,text,text),
 public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text),
 public.complete_onboarding_role_with_profile_for_user(uuid,public.user_role,text,text,text,text,jsonb),
 public.finalize_role_switch_audit_for_user(uuid,uuid,boolean,text,text,integer,integer),
 public.claim_role_switch_reconciliation_batch(uuid,integer,integer),
 public.release_role_switch_reconciliation_claims(uuid,uuid[]),
 public.complete_role_switch_reconciliation_attempt(uuid,uuid,uuid,text,text,boolean,integer,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_switch_for_user(uuid),public.begin_role_switch_for_user(uuid,uuid),
 public.record_role_switch_audit_for_user(uuid,uuid,text,text,text),
 public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text),
 public.complete_onboarding_role_with_profile_for_user(uuid,public.user_role,text,text,text,text,jsonb),
 public.finalize_role_switch_audit_for_user(uuid,uuid,boolean,text,text,integer,integer),
 public.claim_role_switch_reconciliation_batch(uuid,integer,integer),
 public.release_role_switch_reconciliation_claims(uuid,uuid[]),
 public.complete_role_switch_reconciliation_attempt(uuid,uuid,uuid,text,text,boolean,integer,integer,integer)
 TO service_role;
REVOKE ALL ON FUNCTION private.invoke_role_switch_billing_reconciliation() FROM PUBLIC,anon,authenticated,service_role;
-- Preserve valid source indexes, reject mismatches, bound new builds to small tables.
DO $migration$
DECLARE
  v_profiles_index_ready boolean;
  v_reconciliation_index_ready boolean;
  v_profiles_heap_bytes bigint;
  v_history_heap_bytes bigint;
  v_online_finalization_required boolean := false;
BEGIN
  SELECT COALESCE(bool_and(
    index_state.indisvalid
    AND index_state.indisready
    AND index_state.indislive
    AND index_state.indisunique = false
    AND index_state.indrelid = 'public.profiles'::regclass
    AND access_method.amname = 'btree'
    AND index_state.indnatts = 1
    AND index_state.indnkeyatts = 1
    AND pg_get_indexdef(index_state.indexrelid, 1, true) =
      'role_switch_audit_id'
    AND pg_get_expr(index_state.indpred, index_state.indrelid, true) =
      'role_switch_audit_id IS NOT NULL'
    AND pg_get_indexdef(index_state.indexrelid) =
      'CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles USING btree (role_switch_audit_id) WHERE (role_switch_audit_id IS NOT NULL)'
  ), false)
  INTO v_profiles_index_ready
  FROM pg_index index_state
  JOIN pg_class index_relation
    ON index_relation.oid = index_state.indexrelid
  JOIN pg_am access_method
    ON access_method.oid = index_relation.relam
  WHERE index_state.indexrelid = to_regclass('public.idx_profiles_role_switch_audit_id');

  SELECT COALESCE(bool_and(
    index_state.indisvalid
    AND index_state.indisready
    AND index_state.indislive
    AND index_state.indisunique = false
    AND index_state.indrelid = 'public.role_switch_history'::regclass
    AND access_method.amname = 'btree'
    AND index_state.indnatts = 3
    AND index_state.indnkeyatts = 3
    AND pg_get_indexdef(index_state.indexrelid, 1, true) =
      'billing_reconciliation_next_attempt_at'
    AND pg_get_indexdef(index_state.indexrelid, 2, true) =
      'billing_reconciliation_attempt_count'
    AND pg_get_indexdef(index_state.indexrelid, 3, true) = 'switched_at'
    AND pg_get_expr(index_state.indpred, index_state.indrelid, true) =
      'billing_reconciliation_required = true'
    AND pg_get_indexdef(index_state.indexrelid) =
      'CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history USING btree (billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE (billing_reconciliation_required = true)'
  ), false)
  INTO v_reconciliation_index_ready
  FROM pg_index index_state
  JOIN pg_class index_relation
    ON index_relation.oid = index_state.indexrelid
  JOIN pg_am access_method
    ON access_method.oid = index_relation.relam
  WHERE index_state.indexrelid = to_regclass('public.idx_role_switch_history_reconciliation_due');

  IF to_regclass('public.idx_profiles_role_switch_audit_id') IS NOT NULL
     AND NOT v_profiles_index_ready THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'role_switch_audit_invalid_index_requires_cleanup',
      DETAIL = 'idx_profiles_role_switch_audit_id exists but is not ready and valid.',
      HINT = 'Outside a transaction, drop the invalid index concurrently, then rerun the online prebuild command.';
  END IF;

  IF to_regclass('public.idx_role_switch_history_reconciliation_due') IS NOT NULL
     AND NOT v_reconciliation_index_ready THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'role_switch_audit_invalid_index_requires_cleanup',
      DETAIL = 'idx_role_switch_history_reconciliation_due exists but is not ready and valid.',
      HINT = 'Outside a transaction, drop the invalid index concurrently, then rerun the online prebuild command.';
  END IF;

  IF NOT v_profiles_index_ready THEN
    v_profiles_heap_bytes := pg_relation_size('public.profiles'::regclass);
    IF v_profiles_heap_bytes > 134217728 THEN
      v_online_finalization_required := true;
    ELSE
      LOCK TABLE public.profiles IN SHARE MODE NOWAIT;
      EXECUTE 'CREATE INDEX idx_profiles_role_switch_audit_id ON public.profiles(role_switch_audit_id) WHERE role_switch_audit_id IS NOT NULL';
    END IF;
  END IF;

  IF NOT v_reconciliation_index_ready THEN
    v_history_heap_bytes := pg_relation_size('public.role_switch_history'::regclass);
    IF v_history_heap_bytes > 134217728 THEN
      v_online_finalization_required := true;
    ELSE
      LOCK TABLE public.role_switch_history IN SHARE MODE NOWAIT;
      EXECUTE 'CREATE INDEX idx_role_switch_history_reconciliation_due ON public.role_switch_history(billing_reconciliation_next_attempt_at, billing_reconciliation_attempt_count, switched_at) WHERE billing_reconciliation_required = true';
    END IF;
  END IF;

  IF v_online_finalization_required THEN RAISE EXCEPTION 'role_switch_online_index_prebuild_required'; END IF;
END;
$migration$;

DO $fk$ BEGIN
 IF (SELECT regexp_replace(pg_get_constraintdef(oid),' NOT VALID$','') FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_role_switch_audit_id_fkey')
  IS DISTINCT FROM 'FOREIGN KEY (role_switch_audit_id) REFERENCES role_switch_history(id) ON DELETE SET NULL' THEN
  RAISE EXCEPTION 'incompatible_role_switch_binding_foreign_key'; END IF;
END; $fk$;
COMMIT;
