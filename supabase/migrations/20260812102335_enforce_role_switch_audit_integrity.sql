-- Bind role-switch completion to one durable, retry-safe billing audit. Unknown
-- provider facts remain NULL, and the same audit UUID is the idempotency key for
-- user retries and the server-side reconciliation path.

-- Supabase applies each migration file transactionally. Fail quickly instead of
-- waiting indefinitely for DDL locks on live role/profile traffic, and bound all
-- legacy remediation and constraint-validation work in this phase.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

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

-- The retired browser endpoint accepted arbitrary destination/kind strings.
-- Preserve those facts for support review before normalizing rows so constraint
-- validation cannot abort this rollout on historical data.
UPDATE public.role_switch_history
SET
  legacy_invalid_facts = COALESCE(legacy_invalid_facts, '{}'::jsonb) ||
    jsonb_strip_nulls(jsonb_build_object(
      'to_type', CASE
        WHEN to_type IS NOT NULL AND to_type NOT IN (
          'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
        ) THEN to_type
        ELSE NULL
      END,
      'switch_kind', CASE
        WHEN switch_kind IS NOT NULL AND switch_kind NOT IN (
          'same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'
        ) THEN switch_kind
        ELSE NULL
      END
    )),
  to_type = CASE
    WHEN to_type IS NULL OR to_type IN (
      'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
    ) THEN to_type
    ELSE NULL
  END,
  switch_kind = CASE
    WHEN switch_kind IS NULL OR switch_kind IN (
      'same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'
    ) THEN switch_kind
    ELSE 'same-tier'
  END
WHERE
  (to_type IS NOT NULL AND to_type NOT IN (
    'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
  ))
  OR (switch_kind IS NOT NULL AND switch_kind NOT IN (
    'same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'
  ));

ALTER TABLE public.role_switch_history
  DROP CONSTRAINT IF EXISTS role_switch_history_switch_kind_check;
ALTER TABLE public.role_switch_history
  ADD CONSTRAINT role_switch_history_switch_kind_check
  CHECK (switch_kind IN ('same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'))
  NOT VALID;
ALTER TABLE public.role_switch_history
  VALIDATE CONSTRAINT role_switch_history_switch_kind_check;

ALTER TABLE public.role_switch_history
  DROP CONSTRAINT IF EXISTS role_switch_history_to_type_check;
ALTER TABLE public.role_switch_history
  ADD CONSTRAINT role_switch_history_to_type_check
  CHECK (
    to_type IS NULL OR to_type IN (
      'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
    )
  )
  NOT VALID;
ALTER TABLE public.role_switch_history
  VALIDATE CONSTRAINT role_switch_history_to_type_check;

ALTER TABLE public.role_switch_history
  DROP CONSTRAINT IF EXISTS role_switch_history_billing_outcome_check;
ALTER TABLE public.role_switch_history
  ADD CONSTRAINT role_switch_history_billing_outcome_check
  CHECK (
    billing_outcome IN (
      'legacy', 'not_required', 'pending', 'succeeded', 'already_pending', 'failed', 'unknown'
    )
  )
  NOT VALID;
ALTER TABLE public.role_switch_history
  VALIDATE CONSTRAINT role_switch_history_billing_outcome_check;

ALTER TABLE public.role_switch_history
  DROP CONSTRAINT IF EXISTS role_switch_history_billing_counts_check;
ALTER TABLE public.role_switch_history
  ADD CONSTRAINT role_switch_history_billing_counts_check
  CHECK (
    (billing_subscription_count IS NULL OR billing_subscription_count >= 0)
    AND (billing_cancelled_count IS NULL OR billing_cancelled_count >= 0)
    AND (
      billing_subscription_count IS NULL
      OR billing_cancelled_count IS NULL
      OR billing_cancelled_count <= billing_subscription_count
    )
  )
  NOT VALID;
ALTER TABLE public.role_switch_history
  VALIDATE CONSTRAINT role_switch_history_billing_counts_check;

ALTER TABLE public.role_switch_history
  DROP CONSTRAINT IF EXISTS role_switch_history_reconciliation_attempts_check;
ALTER TABLE public.role_switch_history
  ADD CONSTRAINT role_switch_history_reconciliation_attempts_check
  CHECK (billing_reconciliation_attempt_count >= 0)
  NOT VALID;
ALTER TABLE public.role_switch_history
  VALIDATE CONSTRAINT role_switch_history_reconciliation_attempts_check;

UPDATE public.role_switch_history
SET billing_reconciliation_next_attempt_at = COALESCE(
  billing_reconciliation_next_attempt_at,
  now() + interval '15 minutes'
)
WHERE billing_reconciliation_required = true;

-- Existing in-progress switches predate the profile-to-audit binding. Give
-- each one a pending intent so the normal log-role-switch retry path can
-- reconcile billing and bind a destination instead of stranding the user.
WITH candidates AS MATERIALIZED (
  SELECT profile.user_id, profile.role::text AS from_type, gen_random_uuid() AS audit_id
  FROM public.profiles profile
  WHERE profile.role_switch_in_progress_at IS NOT NULL
    AND profile.role_switch_audit_id IS NULL
    AND profile.role::text IN (
      'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
    )
), inserted AS (
  INSERT INTO public.role_switch_history (
    id,
    user_id,
    from_type,
    to_type,
    switch_kind,
    had_active_sub,
    sub_cancelled,
    billing_outcome,
    billing_subscription_count,
    billing_cancelled_count,
    billing_reconciliation_required,
    billing_reconciliation_next_attempt_at
  )
  SELECT
    candidate.audit_id,
    candidate.user_id,
    candidate.from_type,
    NULL,
    'same-tier',
    NULL,
    false,
    'pending',
    NULL,
    NULL,
    true,
    now() + interval '15 minutes'
  FROM candidates candidate
  RETURNING id, user_id
)
UPDATE public.profiles profile
SET role_switch_audit_id = inserted.id
FROM inserted
WHERE profile.user_id = inserted.user_id
  AND profile.role_switch_audit_id IS NULL;

DROP FUNCTION IF EXISTS public.record_role_switch_audit_for_user(
  uuid, text, text, text, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user(
  _operation_id uuid,
  _user_id uuid,
  _from_type text,
  _to_type text,
  _switch_kind text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _operation_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'audit_identity_required' USING ERRCODE = '22023';
  END IF;
  IF _from_type NOT IN (
    'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
  ) THEN
    RAISE EXCEPTION 'invalid_role_switch_source' USING ERRCODE = '22023';
  END IF;
  IF _to_type NOT IN (
    'buyer', 'seller', 'agent', 'developer', 'professional', 'investor', 'institutional'
  ) THEN
    RAISE EXCEPTION 'invalid_role_switch_destination' USING ERRCODE = '22023';
  END IF;
  IF _switch_kind NOT IN (
    'same-tier', 'upgrade', 'downgrade', 'proonly', 'invite-only'
  ) THEN
    RAISE EXCEPTION 'invalid_role_switch_kind' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.role_switch_history AS history (
    id,
    user_id,
    from_type,
    to_type,
    switch_kind,
    had_active_sub,
    sub_cancelled,
    billing_outcome,
    billing_subscription_count,
    billing_cancelled_count,
    billing_reconciliation_required,
    billing_reconciliation_next_attempt_at
  )
  VALUES (
    _operation_id,
    _user_id,
    _from_type,
    _to_type,
    _switch_kind,
    NULL,
    false,
    'pending',
    NULL,
    NULL,
    true,
    now() + interval '15 minutes'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    to_type = EXCLUDED.to_type,
    switch_kind = EXCLUDED.switch_kind
  WHERE history.user_id = EXCLUDED.user_id
    AND history.from_type = EXCLUDED.from_type
    AND (
      history.to_type = EXCLUDED.to_type
    )
  RETURNING history.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'role_switch_operation_conflict' USING ERRCODE = '23505';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_role_switch_audit_for_user(
  uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_role_switch_audit_for_user(
  uuid, uuid, text, text, text
) TO service_role;

DROP FUNCTION IF EXISTS public.finalize_role_switch_audit_for_user(uuid, uuid, boolean);

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
BEGIN
  IF _audit_id IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'audit_identity_required' USING ERRCODE = '22023';
  END IF;
  IF _billing_outcome NOT IN (
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

REVOKE ALL ON FUNCTION public.finalize_role_switch_audit_for_user(
  uuid, uuid, boolean, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_role_switch_audit_for_user(
  uuid, uuid, boolean, text, text, integer, integer
) TO service_role;

DROP FUNCTION IF EXISTS public.begin_role_switch_for_user(uuid);

CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user(
  _user_id uuid,
  _audit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_started_at timestamptz;
  v_existing_audit_id uuid;
BEGIN
  IF _user_id IS NULL OR _audit_id IS NULL THEN
    RAISE EXCEPTION 'role_switch_audit_required';
  END IF;

  SELECT role, role_switch_in_progress_at, role_switch_audit_id
  INTO v_role, v_started_at, v_existing_audit_id
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF v_started_at IS NOT NULL THEN
    IF v_existing_audit_id = _audit_id THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'role_switch_already_in_progress';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.role_switch_history history
    WHERE history.id = _audit_id
      AND history.user_id = _user_id
      AND history.from_type = v_role::text
      AND history.to_type IS NOT NULL
      AND history.billing_reconciliation_required = false
      AND history.billing_outcome IN ('not_required', 'succeeded', 'already_pending')
  ) THEN
    RAISE EXCEPTION 'role_switch_audit_not_ready';
  END IF;

  PERFORM public.archive_role_data(_user_id, v_role::text);

  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    role_switch_audit_id = _audit_id,
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_switch_for_user(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_switch_for_user(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user(
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

REVOKE ALL ON FUNCTION public.complete_onboarding_role_for_user(
  uuid, public.user_role, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_role_for_user(
  uuid, public.user_role, text, text, text, text
) TO service_role;

DROP FUNCTION IF EXISTS public.claim_role_switch_reconciliation_batch(
  uuid, integer, integer
);

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
  IF _worker_id IS NULL THEN
    RAISE EXCEPTION 'reconciliation_worker_required' USING ERRCODE = '22023';
  END IF;
  IF _batch_size < 1 OR _batch_size > 50 THEN
    RAISE EXCEPTION 'invalid_reconciliation_batch_size' USING ERRCODE = '22023';
  END IF;
  IF _max_attempts < 1 OR _max_attempts > 20 THEN
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

REVOKE ALL ON FUNCTION public.claim_role_switch_reconciliation_batch(
  uuid, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_role_switch_reconciliation_batch(
  uuid, integer, integer
) TO service_role;

DROP FUNCTION IF EXISTS public.release_role_switch_reconciliation_claims(
  uuid, uuid[]
);

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

REVOKE ALL ON FUNCTION public.release_role_switch_reconciliation_claims(
  uuid, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_role_switch_reconciliation_claims(
  uuid, uuid[]
) TO service_role;

DROP FUNCTION IF EXISTS public.complete_role_switch_reconciliation_attempt(
  uuid, uuid, uuid, text, text, boolean, integer, integer, integer
);

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
  IF _billing_outcome NOT IN (
    'not_required', 'succeeded', 'already_pending', 'unknown'
  ) THEN
    RAISE EXCEPTION 'invalid_billing_outcome' USING ERRCODE = '22023';
  END IF;
  IF _max_attempts < 1 OR _max_attempts > 20 THEN
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

REVOKE ALL ON FUNCTION public.complete_role_switch_reconciliation_attempt(
  uuid, uuid, uuid, text, text, boolean, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_role_switch_reconciliation_attempt(
  uuid, uuid, uuid, text, text, boolean, integer, integer, integer
) TO service_role;

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

REVOKE ALL ON FUNCTION private.invoke_role_switch_billing_reconciliation()
  FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.invoke_role_switch_billing_reconciliation() IS
  'Invokes the role-switch billing reconciliation worker with a Vault-backed cron secret.';

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'reconcile-role-switch-billing'
  ) THEN
    PERFORM cron.unschedule('reconcile-role-switch-billing');
  END IF;

  v_job_id := cron.schedule(
    'reconcile-role-switch-billing',
    '*/5 * * * *',
    'SELECT private.invoke_role_switch_billing_reconciliation();'
  );
  PERFORM cron.alter_job(
    job_id := v_job_id,
    active := FALSE
  );
END;
$$;

COMMIT;
