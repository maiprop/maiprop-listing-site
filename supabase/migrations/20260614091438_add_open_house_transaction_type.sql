ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS open_house_transaction_type TEXT;

COMMENT ON COLUMN public.listings.open_house_transaction_type IS
  'Open-house transaction subcategory: sale or rent. Null is treated as sale for backward compatibility.';

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_open_house_transaction_type_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_open_house_transaction_type_check
  CHECK (
    open_house_transaction_type IS NULL
    OR (
      listing_type = 'open_house'::public.listing_type
      AND open_house_transaction_type IN ('sale', 'rent')
    )
  )
  NOT VALID;

UPDATE public.listings
SET open_house_transaction_type = 'sale'
WHERE listing_type = 'open_house'::public.listing_type
  AND open_house_transaction_type IS NULL;

ALTER TABLE public.listings
  VALIDATE CONSTRAINT listings_open_house_transaction_type_check;
