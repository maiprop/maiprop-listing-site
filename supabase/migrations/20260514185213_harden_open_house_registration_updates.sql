-- Harden requester-side open-house registration updates.
--
-- The existing requester policy allowed users to update their own registration
-- row, which is needed for uploads, waivers, and screening answers. Without a
-- column guard, direct Supabase calls could also self-set host-controlled
-- fields such as id_verified_at, status=attended, approved_by, or proof review
-- state. Keep requester self-service fields, but enforce host-only decision
-- fields in a trigger that runs for every API path.

CREATE OR REPLACE FUNCTION public.guard_open_house_registration_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Edge/service-role maintenance tasks run without an end-user JWT and are
  -- already trusted by function-level authorization.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.owner_id
    INTO v_owner_id
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  IF v_uid = OLD.requester_id AND v_uid IS DISTINCT FROM v_owner_id THEN
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
      OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
      OR NEW.id_verified_at IS DISTINCT FROM OLD.id_verified_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.attended_at IS DISTINCT FROM OLD.attended_at
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      OR NEW.pof_verified_status IS DISTINCT FROM OLD.pof_verified_status
    THEN
      RAISE EXCEPTION 'host_controlled_open_house_fields';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'requester_can_only_cancel_registration';
    END IF;

    IF NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
      OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
    THEN
      NEW.pof_verified_status := 'unreviewed';
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid = v_owner_id THEN
    IF NEW.status = 'attended' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'only_approved_registrations_can_be_attended';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not_authorized_for_open_house_registration';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_open_house_registration_update
  ON public.open_house_registrations;
CREATE TRIGGER trg_guard_open_house_registration_update
  BEFORE UPDATE ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_open_house_registration_update();

DROP POLICY IF EXISTS "oh_regs_requester" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester_select" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester_insert" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester_update" ON public.open_house_registrations;

CREATE POLICY "oh_regs_requester_select"
  ON public.open_house_registrations FOR SELECT
  USING (requester_id = (select auth.uid()));

CREATE POLICY "oh_regs_requester_insert"
  ON public.open_house_registrations FOR INSERT
  WITH CHECK (requester_id = (select auth.uid()) AND status = 'pending');

CREATE POLICY "oh_regs_requester_update"
  ON public.open_house_registrations FOR UPDATE
  USING (requester_id = (select auth.uid()))
  WITH CHECK (requester_id = (select auth.uid()));

COMMENT ON FUNCTION public.guard_open_house_registration_update() IS
  'Prevents open-house requesters from self-setting host-controlled verification, approval, attendance, or proof-review fields.';
