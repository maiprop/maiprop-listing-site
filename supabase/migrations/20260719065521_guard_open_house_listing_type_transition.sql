-- A listing with an active paid, plan, or administrator promotion cannot be
-- converted into an Open House. Revoke the allocation first so customers do
-- not consume an entitlement on a catalogue where boosts have no effect.

CREATE OR REPLACE FUNCTION private.guard_open_house_listing_type_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.listing_type::text = 'open_house'
     AND OLD.listing_type IS DISTINCT FROM NEW.listing_type
     AND EXISTS (
       SELECT 1
       FROM public.listing_promotion_allocations AS allocation
       WHERE allocation.listing_id = NEW.id
         AND allocation.status = 'active'
         AND allocation.starts_at <= statement_timestamp()
         AND allocation.ends_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'open_house_active_promotion_must_be_revoked_first'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_open_house_listing_type_transition()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_open_house_listing_type_transition
  ON public.listings;
CREATE TRIGGER trg_guard_open_house_listing_type_transition
  BEFORE UPDATE OF listing_type ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.guard_open_house_listing_type_transition();

COMMENT ON FUNCTION private.guard_open_house_listing_type_transition() IS
  'Prevents an active general listing promotion from becoming inert through a listing-type change to Open House.';
