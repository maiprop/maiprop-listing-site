-- Quick Sale investor workflow hardening:
-- - richer firesale_interest states
-- - one active reservation per deal
-- - investor-safe mutation guards
-- - audit trail for claim / reservation transitions

ALTER TABLE public.firesale_interest
  ADD COLUMN IF NOT EXISTS proof_of_funds_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_of_funds_verified_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserved_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.firesale_interest
SET
  status = CASE
    WHEN status = 'shortlisted' THEN 'prioritized'
    ELSE status
  END,
  last_status_changed_at = COALESCE(last_status_changed_at, updated_at, created_at, now())
WHERE status = 'shortlisted'
   OR last_status_changed_at IS NULL;

ALTER TABLE public.firesale_interest
  DROP CONSTRAINT IF EXISTS firesale_interest_status_check;

ALTER TABLE public.firesale_interest
  ADD CONSTRAINT firesale_interest_status_check
  CHECK (status IN ('interested', 'prioritized', 'reserved', 'engaged', 'won', 'passed', 'expired'));

CREATE INDEX IF NOT EXISTS idx_firesale_interest_reservation_lookup
  ON public.firesale_interest (deal_id, status, reservation_expires_at);

CREATE TABLE IF NOT EXISTS public.firesale_interest_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interest_id UUID NOT NULL REFERENCES public.firesale_interest(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.firesale_requests(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firesale_interest_audit_interest
  ON public.firesale_interest_audit_log (interest_id, created_at DESC);

ALTER TABLE public.firesale_interest_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS firesale_interest_audit_admin_select ON public.firesale_interest_audit_log;
CREATE POLICY firesale_interest_audit_admin_select
  ON public.firesale_interest_audit_log
  FOR SELECT
  USING (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS firesale_interest_audit_admin_insert ON public.firesale_interest_audit_log;
CREATE POLICY firesale_interest_audit_admin_insert
  ON public.firesale_interest_audit_log
  FOR INSERT
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.guard_firesale_interest_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN := COALESCE(public.has_platform_admin(v_actor), FALSE);
  v_is_system_cleanup BOOLEAN := COALESCE(NULLIF(current_setting('maiprop.firesale_system_cleanup', TRUE), '')::BOOLEAN, FALSE);
  v_active_conflict UUID;
  v_active_hold_statuses CONSTANT TEXT[] := ARRAY['reserved', 'engaged', 'won'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := 'interested';
    END IF;

    IF NEW.last_status_changed_at IS NULL THEN
      NEW.last_status_changed_at := now();
    END IF;

    IF NOT v_is_admin THEN
      IF NEW.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_create_interest_for_other_user';
      END IF;

      IF NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'invalid_initial_interest_status';
      END IF;

      NEW.proof_of_funds_verified_at := NULL;
      NEW.proof_of_funds_verified_by := NULL;
      NEW.reservation_expires_at := NULL;
      NEW.reserved_at := NULL;
      NEW.reserved_by := NULL;
      NEW.admin_note := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.last_status_changed_at := now();
    ELSE
      NEW.last_status_changed_at := COALESCE(NEW.last_status_changed_at, OLD.last_status_changed_at, now());
    END IF;

    IF NOT v_is_admin AND NOT v_is_system_cleanup THEN
      IF OLD.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_update_other_user_interest';
      END IF;

      IF NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'investor_cannot_change_admin_managed_fields';
      END IF;

      IF OLD.status IN ('reserved', 'engaged', 'won') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'active_or_closed_interest_is_admin_managed';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized')
         AND OLD.status NOT IN ('interested', 'prioritized', 'passed', 'expired') THEN
        RAISE EXCEPTION 'invalid_investor_status_transition';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'investor_can_only_rejoin_or_prioritize';
      END IF;
    ELSIF v_is_system_cleanup THEN
      IF OLD.status IS DISTINCT FROM 'reserved'
         OR NEW.status IS DISTINCT FROM 'expired'
         OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'invalid_system_cleanup_transition';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin
       AND OLD.investor_id = v_actor
       AND OLD.status IN ('reserved', 'engaged', 'won') THEN
      RAISE EXCEPTION 'cannot_delete_active_or_closed_interest';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.status = ANY(v_active_hold_statuses) THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.deal_id::text));

    IF NEW.reservation_expires_at IS NULL OR NEW.reservation_expires_at <= now() THEN
      NEW.reservation_expires_at := now() + interval '24 hours';
    END IF;

    IF NEW.reserved_at IS NULL THEN
      NEW.reserved_at := now();
    END IF;

    IF NEW.reserved_by IS NULL THEN
      NEW.reserved_by := v_actor;
    END IF;

    SELECT id
    INTO v_active_conflict
    FROM public.firesale_interest
    WHERE deal_id = NEW.deal_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        status IN ('engaged', 'won')
        OR (
          status = 'reserved'
          AND COALESCE(reservation_expires_at, now() + interval '100 years') > now()
        )
      )
    LIMIT 1;

    IF v_active_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'active_reservation_exists_for_deal';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_firesale_interest_mutation ON public.firesale_interest;
CREATE TRIGGER trg_guard_firesale_interest_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.firesale_interest
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_firesale_interest_mutation();

CREATE OR REPLACE FUNCTION public.audit_firesale_interest_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_actor_text TEXT := NULLIF(current_setting('maiprop.audit_actor', TRUE), '');
  v_actor UUID := CASE WHEN v_actor_text IS NULL THEN (SELECT auth.uid()) ELSE v_actor_text::uuid END;
  v_forced_action TEXT := NULLIF(current_setting('maiprop.audit_action', TRUE), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := COALESCE(v_forced_action, 'interest_created');
    INSERT INTO public.firesale_interest_audit_log (interest_id, deal_id, actor_id, action, to_status, metadata)
    VALUES (
      NEW.id,
      NEW.deal_id,
      v_actor,
      v_action,
      NEW.status,
      jsonb_build_object(
        'proof_amount', NEW.proof_amount,
        'reservation_expires_at', NEW.reservation_expires_at
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_action := COALESCE(v_forced_action, 'interest_deleted');
    INSERT INTO public.firesale_interest_audit_log (interest_id, deal_id, actor_id, action, from_status, metadata)
    VALUES (
      OLD.id,
      OLD.deal_id,
      v_actor,
      v_action,
      OLD.status,
      jsonb_build_object(
        'proof_amount', OLD.proof_amount,
        'reservation_expires_at', OLD.reservation_expires_at
      )
    );
    RETURN OLD;
  END IF;

  v_action := COALESCE(
    v_forced_action,
    CASE
      WHEN NEW.status = 'reserved'
        AND OLD.status = 'reserved'
        AND NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at THEN 'reservation_extended'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'reserved' THEN 'reservation_assigned'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'reserved' AND NEW.status = 'expired' THEN 'reservation_expired'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'reserved' THEN 'reservation_released'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
      WHEN NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at THEN 'proof_verified'
      WHEN NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url THEN 'proof_uploaded'
      ELSE 'interest_updated'
    END
  );

  INSERT INTO public.firesale_interest_audit_log (
    interest_id,
    deal_id,
    actor_id,
    action,
    from_status,
    to_status,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.deal_id,
    v_actor,
    v_action,
    OLD.status,
    NEW.status,
    jsonb_build_object(
      'proof_amount_before', OLD.proof_amount,
      'proof_amount_after', NEW.proof_amount,
      'reservation_expires_at_before', OLD.reservation_expires_at,
      'reservation_expires_at_after', NEW.reservation_expires_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_firesale_interest_mutation ON public.firesale_interest;
CREATE TRIGGER trg_audit_firesale_interest_mutation
  AFTER INSERT OR UPDATE OR DELETE ON public.firesale_interest
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_firesale_interest_mutation();

CREATE OR REPLACE FUNCTION public.release_expired_firesale_reservations(p_deal_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  PERFORM set_config('maiprop.firesale_system_cleanup', 'true', TRUE);
  PERFORM set_config('maiprop.audit_actor', '', TRUE);
  PERFORM set_config('maiprop.audit_action', 'reservation_expired', TRUE);

  UPDATE public.firesale_interest
  SET
    status = 'expired',
    reservation_expires_at = NULL,
    last_status_changed_at = now()
  WHERE status = 'reserved'
    AND reservation_expires_at IS NOT NULL
    AND reservation_expires_at <= now()
    AND (p_deal_id IS NULL OR deal_id = p_deal_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_firesale_interest_workflow(
  p_interest_id UUID,
  p_status TEXT,
  p_reservation_hours INTEGER DEFAULT NULL,
  p_verify_pof BOOLEAN DEFAULT FALSE,
  p_admin_note TEXT DEFAULT NULL,
  p_proof_amount NUMERIC DEFAULT NULL
)
RETURNS public.firesale_interest
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_interest public.firesale_interest%ROWTYPE;
  v_hours INTEGER := GREATEST(COALESCE(p_reservation_hours, 24), 1);
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  PERFORM public.release_expired_firesale_reservations(NULL);

  UPDATE public.firesale_interest
  SET
    status = p_status,
    reservation_expires_at = CASE
      WHEN p_status = 'reserved' THEN now() + make_interval(hours => v_hours)
      WHEN p_status IN ('interested', 'prioritized', 'engaged', 'won', 'passed', 'expired') THEN NULL
      ELSE reservation_expires_at
    END,
    reserved_at = CASE
      WHEN p_status = 'reserved' THEN COALESCE(reserved_at, now())
      ELSE reserved_at
    END,
    reserved_by = CASE
      WHEN p_status = 'reserved' THEN COALESCE(reserved_by, v_actor)
      WHEN p_status IN ('interested', 'prioritized', 'passed', 'expired') THEN NULL
      ELSE reserved_by
    END,
    proof_amount = COALESCE(p_proof_amount, proof_amount),
    proof_of_funds_verified_at = CASE
      WHEN p_verify_pof THEN COALESCE(proof_of_funds_verified_at, now())
      ELSE proof_of_funds_verified_at
    END,
    proof_of_funds_verified_by = CASE
      WHEN p_verify_pof THEN COALESCE(proof_of_funds_verified_by, v_actor)
      ELSE proof_of_funds_verified_by
    END,
    admin_note = COALESCE(p_admin_note, admin_note)
  WHERE id = p_interest_id
  RETURNING * INTO v_interest;

  IF v_interest.id IS NULL THEN
    RAISE EXCEPTION 'firesale_interest_not_found';
  END IF;

  RETURN v_interest;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_firesale_reservations(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_firesale_interest_workflow(UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_firesale_interest_workflow(UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC) TO authenticated, service_role;

COMMENT ON FUNCTION public.release_expired_firesale_reservations(UUID) IS
  'Expires overdue firesale reservations through a trusted local GUC so the mutation trigger allows only reserved -> expired cleanup. Explicitly revoked from PUBLIC/anon.';
COMMENT ON FUNCTION public.admin_update_firesale_interest_workflow(UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC) IS
  'Admin-only workflow transition RPC for firesale interest. Explicitly revoked from PUBLIC/anon and guarded by has_platform_admin.';

-- Rollback notes:
-- 1. Disable client/admin use of the workflow RPCs before rollback.
-- 2. DROP TRIGGER IF EXISTS trg_guard_firesale_interest_mutation ON public.firesale_interest;
-- 3. DROP TRIGGER IF EXISTS trg_audit_firesale_interest_mutation ON public.firesale_interest;
-- 4. DROP FUNCTION IF EXISTS public.release_expired_firesale_reservations(UUID);
-- 5. DROP FUNCTION IF EXISTS public.admin_update_firesale_interest_workflow(UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC);
-- 6. DROP FUNCTION IF EXISTS public.guard_firesale_interest_mutation();
-- 7. DROP FUNCTION IF EXISTS public.audit_firesale_interest_mutation();
-- 8. Re-apply the previous client-side/admin transition path only after confirming no active reservations are mid-transition.
