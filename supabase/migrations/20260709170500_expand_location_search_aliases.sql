CREATE OR REPLACE FUNCTION public.expand_location_search_aliases(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH base AS (
    SELECT trim(regexp_replace(coalesce(input, ''), '\s+', ' ', 'g')) AS value
  ),
  aliases AS (
    SELECT string_agg(
      CASE token
        WHEN 'agioi' THEN 'agion agios'
        WHEN 'agion' THEN 'agioi agios'
        WHEN 'agios' THEN 'agioi agion'
        WHEN 'anargiroi' THEN 'anargiron anargyroi anargyron'
        WHEN 'anargiron' THEN 'anargiroi anargyroi anargyron'
        WHEN 'anargyroi' THEN 'anargiroi anargiron anargyron'
        WHEN 'anargyron' THEN 'anargiroi anargiron anargyroi'
        WHEN 'kalimnou' THEN 'kalymnou'
        WHEN 'kalymnou' THEN 'kalimnou'
        ELSE ''
      END,
      ' '
    ) AS value
    FROM base, regexp_split_to_table(base.value, ' ') AS token
  )
  SELECT trim(regexp_replace(base.value || ' ' || coalesce(aliases.value, ''), '\s+', ' ', 'g'))
  FROM base, aliases;
$$;

DROP INDEX IF EXISTS public.idx_listings_location_search_text_trgm;

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS location_search_text;

ALTER TABLE public.listings
  ADD COLUMN location_search_text text
  GENERATED ALWAYS AS (
    public.expand_location_search_aliases(
      public.normalize_location_text(
        coalesce(title, '') || ' ' ||
        coalesce(address, '') || ' ' ||
        coalesce(city, '') || ' ' ||
        coalesce(region, '') || ' ' ||
        coalesce(postal_code, '')
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_listings_location_search_text_trgm
  ON public.listings USING gin (location_search_text extensions.gin_trgm_ops);
