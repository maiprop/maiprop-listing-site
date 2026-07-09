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
  ),
  expanded AS (
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
    )) AS value
    FROM normalized
  ),
  greeklish AS (
    SELECT
      value,
      translate(
        replace(replace(replace(replace(value, 'ου', 'ou'), 'θ', 'th'), 'χ', 'ch'), 'ψ', 'ps'),
        'αβγδεζηικλμνξοπρστυφω',
        'avgdeziiklmnxoprstifo'
      ) AS greeklish_i,
      translate(
        replace(replace(replace(replace(value, 'ου', 'ou'), 'θ', 'th'), 'χ', 'ch'), 'ψ', 'ps'),
        'αβγδεζηικλμνξοπρστυφω',
        'avgdeziiklmnxoprstyfo'
      ) AS greeklish_y,
      replace(value, 'y', 'i') AS latin_i
    FROM expanded
  )
  SELECT trim(regexp_replace(
    value || ' ' || greeklish_i || ' ' || greeklish_y || ' ' || latin_i,
    '\s+',
    ' ',
    'g'
  ))
  FROM greeklish;
$$;

DROP INDEX IF EXISTS public.idx_listings_location_search_text_trgm;

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS location_search_text;

ALTER TABLE public.listings
  ADD COLUMN location_search_text text
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
