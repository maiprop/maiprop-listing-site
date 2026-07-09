CREATE OR REPLACE FUNCTION public.normalize_location_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT trim(regexp_replace(
      translate(
        lower(coalesce(input, '')),
        'άέήίϊΐόύϋΰώς',
        'αεηιιιουυυωσ'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )) AS value
  )
  SELECT trim(regexp_replace(
    value || ' ' || coalesce((
      SELECT string_agg(
        CASE
          WHEN token ~ '^[[:alpha:]]{3,}ων$' THEN token || ' ' || regexp_replace(token, 'ων$', 'οι')
          ELSE token
        END,
        ' '
      )
      FROM regexp_split_to_table(value, ' ') AS token
    ), ''),
    '\s+',
    ' ',
    'g'
  ))
  FROM normalized;
$$;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS location_search_text text
  GENERATED ALWAYS AS (
    public.normalize_location_text(
      coalesce(title, '') || ' ' ||
      coalesce(address, '') || ' ' ||
      coalesce(city, '') || ' ' ||
      coalesce(region, '') || ' ' ||
      coalesce(postal_code, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_listings_location_search_text_trgm
  ON public.listings USING gin (location_search_text extensions.gin_trgm_ops);
