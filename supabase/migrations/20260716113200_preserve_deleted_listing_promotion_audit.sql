-- Preserve paid promotion evidence when an owner deletes a listing. The
-- listing itself may be removed, but consumed plan/add-on allocations remain
-- auditable and cannot silently become reusable credits.

ALTER TABLE public.listing_promotion_allocations
  ADD COLUMN IF NOT EXISTS listing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.listing_promotion_allocations
  DROP CONSTRAINT IF EXISTS listing_promotion_allocations_listing_id_fkey;

ALTER TABLE public.listing_promotion_allocations
  ALTER COLUMN listing_id DROP NOT NULL;

ALTER TABLE public.listing_promotion_allocations
  ADD CONSTRAINT listing_promotion_allocations_listing_id_fkey
  FOREIGN KEY (listing_id)
  REFERENCES public.listings(id)
  ON DELETE SET NULL;

ALTER TABLE public.listing_promotion_allocations
  DROP CONSTRAINT IF EXISTS listing_promotion_active_requires_listing;
ALTER TABLE public.listing_promotion_allocations
  ADD CONSTRAINT listing_promotion_active_requires_listing
  CHECK (status <> 'active' OR listing_id IS NOT NULL) NOT VALID;
ALTER TABLE public.listing_promotion_allocations
  VALIDATE CONSTRAINT listing_promotion_active_requires_listing;

CREATE OR REPLACE FUNCTION private.preserve_deleted_listing_promotion_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.listing_promotion_allocations AS allocation
  SET
    listing_id = NULL,
    listing_snapshot = jsonb_build_object(
      'id', OLD.id,
      'title', OLD.title,
      'listing_type', OLD.listing_type,
      'property_type', OLD.property_type,
      'address', OLD.address,
      'city', OLD.city,
      'region', OLD.region,
      'postal_code', OLD.postal_code,
      'owner_id', OLD.owner_id,
      'price', OLD.price,
      'deleted_at', statement_timestamp()
    ),
    status = CASE
      WHEN allocation.status = 'active' THEN 'revoked'
      ELSE allocation.status
    END,
    revoked_at = CASE
      WHEN allocation.status = 'active'
        THEN COALESCE(allocation.revoked_at, statement_timestamp())
      ELSE allocation.revoked_at
    END,
    revoke_reason = CASE
      WHEN allocation.status = 'active' THEN 'listing_deleted'
      ELSE allocation.revoke_reason
    END,
    updated_at = statement_timestamp()
  WHERE allocation.listing_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.preserve_deleted_listing_promotion_audit()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_00_preserve_deleted_listing_promotion_audit
  ON public.listings;
CREATE TRIGGER trg_00_preserve_deleted_listing_promotion_audit
  BEFORE DELETE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.preserve_deleted_listing_promotion_audit();

COMMENT ON COLUMN public.listing_promotion_allocations.listing_snapshot IS
  'Immutable business evidence retained when a promoted listing is deleted.';
