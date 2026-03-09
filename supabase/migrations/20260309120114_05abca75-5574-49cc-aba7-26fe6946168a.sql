
-- Allow OS-imported listings to have a nullable owner_id.
-- OS auction listings have no Hub user owner — tracked via tags array (os_auction:{id}).

-- 1. Make owner_id nullable
ALTER TABLE public.listings ALTER COLUMN owner_id DROP NOT NULL;

-- 2. Drop the FK constraint on owner_id (references auth.users we can't insert into)
DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.listings'::regclass
    AND contype = 'f'
    AND conname ILIKE '%owner%'
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.listings DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

-- 3. Update the SELECT policy to also expose OS-imported (owner_id IS NULL) active listings
DROP POLICY IF EXISTS "Active listings are public" ON public.listings;
CREATE POLICY "Active listings are public"
  ON public.listings
  FOR SELECT
  USING (
    status = 'active'::listing_status
    OR auth.uid() = owner_id
    OR owner_id IS NULL
  );
