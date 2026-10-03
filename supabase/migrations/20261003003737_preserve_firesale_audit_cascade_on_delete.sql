-- Audit rows are scoped to the life of their interest and deal by NOT NULL
-- foreign keys with ON DELETE CASCADE. An AFTER DELETE insert referencing OLD.id
-- cannot survive that deletion and currently aborts both supported cascades.
-- Preserve the existing INSERT/UPDATE audit behavior and deletion guard.
BEGIN;

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
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

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

COMMIT;
