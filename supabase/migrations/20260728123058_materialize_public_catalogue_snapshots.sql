-- Public catalogue publications are immutable logical snapshots backed by
-- delta row versions. Publishing scans the explicit card projection, but only
-- new, changed, or removed listings write version rows.

DROP FUNCTION IF EXISTS public.ensure_public_listing_catalogue_snapshot(timestamptz);
DROP FUNCTION IF EXISTS private.materialize_public_catalogue_snapshot(timestamptz);
DROP TABLE IF EXISTS private.public_catalogue_snapshot_rows CASCADE;
DROP TABLE IF EXISTS private.public_catalogue_snapshot_batches CASCADE;

CREATE TABLE IF NOT EXISTS private.public_catalogue_publications (
  publication_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_minute timestamptz NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  retain_until timestamptz NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  changed_count integer NOT NULL DEFAULT 0 CHECK (changed_count >= 0),
  status text NOT NULL DEFAULT 'building'
    CHECK (status IN ('building', 'published')),
  homepage_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(homepage_payload) = 'object'),
  CHECK (retain_until = snapshot_minute + interval '40 minutes'),
  CHECK (
    (status = 'building' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS private.public_catalogue_current (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  publication_id bigint NOT NULL UNIQUE
    REFERENCES private.public_catalogue_publications(publication_id)
    ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS private.public_catalogue_versions (
  version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL,
  valid_from_publication bigint NOT NULL,
  valid_to_publication bigint,
  content_hash bytea NOT NULL,
  priority_rank integer NOT NULL DEFAULT 0 CHECK (priority_rank IN (0, 1)),
  spotlight_active boolean NOT NULL DEFAULT false,
  owner_id uuid,
  project_id uuid,
  created_at timestamptz NOT NULL,
  title text NOT NULL,
  address text,
  city text NOT NULL,
  region text,
  normalized_location text NOT NULL,
  price numeric NOT NULL,
  price_per_sqm numeric,
  sqm numeric NOT NULL,
  bedrooms numeric,
  bathrooms numeric,
  floor numeric,
  total_floors numeric,
  year_built integer,
  energy_class text,
  property_type text NOT NULL,
  listing_type text NOT NULL,
  os_tag text,
  open_house_date timestamptz,
  open_house_transaction_type text,
  auction_date timestamptz,
  auction_starting_bid numeric,
  ai_score numeric,
  walkability_score numeric,
  views_count bigint NOT NULL DEFAULT 0,
  heating_system text,
  construction_status text,
  commercial_subtype text,
  latitude numeric,
  longitude numeric,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  features text[] NOT NULL DEFAULT '{}'::text[],
  card_payload jsonb NOT NULL CHECK (jsonb_typeof(card_payload) = 'object'),
  detail_payload jsonb NOT NULL
    CONSTRAINT public_catalogue_versions_detail_payload_object
    CHECK (jsonb_typeof(detail_payload) = 'object'),
  CHECK (
    valid_to_publication IS NULL
    OR valid_to_publication > valid_from_publication
  )
);

ALTER TABLE private.public_catalogue_versions
  ADD COLUMN IF NOT EXISTS detail_payload jsonb;
ALTER TABLE private.public_catalogue_versions
  ADD COLUMN IF NOT EXISTS os_tag text;
UPDATE private.public_catalogue_versions
SET detail_payload = card_payload
WHERE detail_payload IS NULL;
UPDATE private.public_catalogue_versions AS version
SET os_tag = (
  SELECT substr(tag.value, length('os_auction:') + 1)
  FROM unnest(version.tags) AS tag(value)
  WHERE tag.value LIKE 'os_auction:%'
  ORDER BY tag.value
  LIMIT 1
)
WHERE version.listing_type = 'auction'
  AND version.os_tag IS NULL;
ALTER TABLE private.public_catalogue_versions
  ALTER COLUMN detail_payload SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.public_catalogue_versions'::regclass
      AND conname = 'public_catalogue_versions_detail_payload_object'
  ) THEN
    ALTER TABLE private.public_catalogue_versions
      ADD CONSTRAINT public_catalogue_versions_detail_payload_object
      CHECK (jsonb_typeof(detail_payload) = 'object');
  END IF;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.public_catalogue_versions'::regclass
      AND conname = 'public_catalogue_versions_os_tag_valid'
  ) THEN
    ALTER TABLE private.public_catalogue_versions
      ADD CONSTRAINT public_catalogue_versions_os_tag_valid
      CHECK (
        os_tag IS NULL
        OR (
          listing_type = 'auction'
          AND length(os_tag) BETWEEN 1 AND 120
          AND os_tag ~ '^[A-Za-z0-9:_-]+$'
        )
      );
  END IF;
END;
$$;

ALTER TABLE private.public_catalogue_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_catalogue_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.public_catalogue_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.public_catalogue_publications
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.public_catalogue_current
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.public_catalogue_versions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE private.public_catalogue_publications_publication_id_seq
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE private.public_catalogue_versions_version_id_seq
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_public_catalogue_publications_retention
  ON private.public_catalogue_publications (retain_until, publication_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_catalogue_versions_current_listing
  ON private.public_catalogue_versions (listing_id)
  WHERE valid_to_publication IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT version.os_tag
    FROM private.public_catalogue_versions AS version
    WHERE version.os_tag IS NOT NULL
      AND version.valid_to_publication IS NULL
    GROUP BY version.os_tag
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'public_catalogue_duplicate_os_tag'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_catalogue_versions_current_os_tag
  ON private.public_catalogue_versions (os_tag)
  WHERE os_tag IS NOT NULL AND valid_to_publication IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_os_tag_publication
  ON private.public_catalogue_versions (
    os_tag,
    valid_from_publication,
    valid_to_publication
  )
  WHERE os_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_newest
  ON private.public_catalogue_versions (
    priority_rank DESC,
    created_at DESC,
    listing_id DESC
  )
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_price_asc
  ON private.public_catalogue_versions (
    priority_rank DESC,
    price ASC,
    listing_id ASC
  )
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_price_desc
  ON private.public_catalogue_versions (
    priority_rank DESC,
    price DESC,
    listing_id DESC
  )
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_ai_score
  ON private.public_catalogue_versions (
    priority_rank DESC,
    ai_score DESC NULLS LAST,
    listing_id DESC
  )
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_views
  ON private.public_catalogue_versions (
    priority_rank DESC,
    views_count DESC,
    listing_id DESC
  )
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_open_house
  ON private.public_catalogue_versions (
    open_house_date ASC,
    listing_id ASC
  )
  INCLUDE (valid_from_publication, valid_to_publication)
  WHERE listing_type = 'open_house' AND open_house_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_type_property
  ON private.public_catalogue_versions (listing_type, property_type)
  INCLUDE (valid_from_publication, valid_to_publication);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_location
  ON private.public_catalogue_versions
  USING gin (normalized_location extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_public_catalogue_versions_features
  ON private.public_catalogue_versions USING gin (features);

CREATE OR REPLACE FUNCTION private.guard_public_catalogue_version_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'valid_to_publication')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'valid_to_publication')
     OR OLD.valid_to_publication IS NOT NULL
     OR NEW.valid_to_publication IS NULL
     OR NEW.valid_to_publication <= NEW.valid_from_publication THEN
    RAISE EXCEPTION 'public_catalogue_version_immutable'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_public_catalogue_version_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_public_catalogue_version_update
  ON private.public_catalogue_versions;
CREATE TRIGGER trg_guard_public_catalogue_version_update
BEFORE UPDATE ON private.public_catalogue_versions
FOR EACH ROW
EXECUTE FUNCTION private.guard_public_catalogue_version_update();

CREATE OR REPLACE FUNCTION private.resolve_public_catalogue_publication(
  p_publication_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint;
BEGIN
  IF p_publication_id IS NULL THEN
    SELECT current_publication.publication_id
    INTO v_publication_id
    FROM private.public_catalogue_current AS current_publication
    JOIN private.public_catalogue_publications AS publication
      ON publication.publication_id = current_publication.publication_id
    WHERE current_publication.singleton
      AND publication.status = 'published'
      AND publication.retain_until > statement_timestamp();
  ELSE
    SELECT publication.publication_id
    INTO v_publication_id
    FROM private.public_catalogue_publications AS publication
    WHERE publication.publication_id = p_publication_id
      AND publication.status = 'published'
      AND publication.retain_until > statement_timestamp();
  END IF;

  IF v_publication_id IS NULL THEN
    RAISE EXCEPTION 'public_catalogue_publication_expired'
      USING ERRCODE = '22023';
  END IF;
  RETURN v_publication_id;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_public_catalogue_publication(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_public_catalogue_publication(bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION private.publish_public_catalogue()
RETURNS TABLE(
  publication_id bigint,
  snapshot_minute timestamptz,
  published_at timestamptz,
  row_count integer,
  changed_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_snapshot timestamptz := date_trunc('minute', clock_timestamp());
  v_publication_id bigint;
  v_row_count integer;
  v_changed_count integer;
  v_published_at timestamptz;
  v_homepage_payload jsonb;
  v_oldest_retained bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('private.publish_public_catalogue', 0)
  );

  SELECT publication.publication_id
  INTO v_publication_id
  FROM private.public_catalogue_publications AS publication
  WHERE publication.snapshot_minute = v_snapshot
    AND publication.status = 'published';

  IF v_publication_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      publication.publication_id,
      publication.snapshot_minute,
      publication.published_at,
      publication.row_count,
      publication.changed_count
    FROM private.public_catalogue_publications AS publication
    WHERE publication.publication_id = v_publication_id;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS pg_temp.public_catalogue_stage;
  CREATE TEMP TABLE public_catalogue_stage
  ON COMMIT DROP
  AS
  WITH promotion_at_publication AS (
    SELECT
      allocation.listing_id,
      max(allocation.ends_at) FILTER (
        WHERE allocation.promotion_type = 'spotlight'
      ) AS spotlight_until,
      max(allocation.ends_at) FILTER (
        WHERE allocation.promotion_type = 'priority'
      ) AS priority_until
    FROM public.listing_promotion_allocations AS allocation
    WHERE allocation.starts_at <= v_snapshot
      AND allocation.ends_at > v_snapshot
      AND (
        allocation.revoked_at IS NULL
        OR allocation.revoked_at > v_snapshot
      )
    GROUP BY allocation.listing_id
  ),
  source_rows AS (
    SELECT
      listing.id AS listing_id,
      CASE
        WHEN promotion.priority_until IS NULL THEN 0
        ELSE 1
      END::integer AS priority_rank,
      (promotion.spotlight_until IS NOT NULL) AS spotlight_active,
      listing.owner_id,
      listing.project_id,
      listing.created_at,
      listing.title,
      listing.address,
      listing.city,
      listing.region,
      lower(
        concat_ws(
          ' ',
          COALESCE(listing.location_search_text, ''),
          COALESCE(listing.address, ''),
          COALESCE(listing.city, ''),
          COALESCE(listing.region, ''),
          COALESCE(listing.postal_code, ''),
          COALESCE(listing.tags::text, '')
        )
      ) AS normalized_location,
      listing.price,
      listing.price_per_sqm,
      listing.sqm,
      listing.bedrooms,
      listing.bathrooms,
      listing.floor,
      listing.total_floors,
      listing.year_built,
      listing.energy_class,
      listing.property_type::text AS property_type,
      listing.listing_type::text AS listing_type,
      CASE
        WHEN listing.listing_type::text <> 'auction' THEN NULL
        ELSE (
          SELECT substr(tag.value, length('os_auction:') + 1)
          FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
          WHERE tag.value LIKE 'os_auction:%'
          ORDER BY tag.value
          LIMIT 1
        )
      END AS os_tag,
      CASE
        WHEN listing.listing_type::text <> 'auction' THEN 0
        ELSE (
          SELECT count(*)::integer
          FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
          WHERE tag.value LIKE 'os_auction:%'
        )
      END AS os_tag_count,
      listing.open_house_date,
      listing.open_house_transaction_type,
      listing.auction_date,
      listing.auction_starting_bid,
      listing.ai_score,
      listing.walkability_score,
      listing.views_count::bigint AS views_count,
      listing.heating_system,
      listing.construction_status,
      listing.commercial_subtype,
      listing.latitude,
      listing.longitude,
      COALESCE(listing.tags, '{}'::text[]) AS tags,
      array_remove(
        ARRAY[
          CASE WHEN listing.has_parking IS TRUE THEN 'has_parking' END,
          CASE WHEN listing.has_elevator IS TRUE THEN 'has_elevator' END,
          CASE WHEN listing.has_balcony IS TRUE THEN 'has_balcony' END,
          CASE WHEN listing.has_pool IS TRUE THEN 'has_pool' END,
          CASE WHEN listing.pets_allowed IS TRUE THEN 'pets_allowed' END,
          CASE WHEN listing.has_furnished IS TRUE THEN 'has_furnished' END,
          CASE WHEN listing.has_garden IS TRUE THEN 'has_garden' END,
          CASE WHEN listing.has_ac IS TRUE THEN 'has_ac' END,
          CASE WHEN listing.has_fireplace IS TRUE THEN 'has_fireplace' END,
          CASE WHEN listing.has_storage IS TRUE THEN 'has_storage' END,
          CASE WHEN listing.has_view IS TRUE THEN 'has_view' END,
          CASE WHEN listing.has_smart_home IS TRUE THEN 'has_smart_home' END,
          CASE WHEN listing.has_attic IS TRUE THEN 'has_attic' END,
          CASE WHEN listing.has_double_glazing IS TRUE THEN 'has_double_glazing' END,
          CASE WHEN listing.has_secure_door IS TRUE THEN 'has_secure_door' END,
          CASE WHEN listing.has_alarm IS TRUE THEN 'has_alarm' END,
          CASE WHEN listing.has_loading_dock IS TRUE THEN 'has_loading_dock' END,
          CASE WHEN listing.has_three_phase_power IS TRUE THEN 'has_three_phase_power' END,
          CASE WHEN listing.has_cctv IS TRUE THEN 'has_cctv' END,
          CASE WHEN listing.has_disability_access IS TRUE THEN 'has_disability_access' END,
          CASE WHEN listing.has_structured_cabling IS TRUE THEN 'has_structured_cabling' END,
          CASE WHEN listing.has_facade IS TRUE THEN 'has_facade' END,
          CASE WHEN listing.has_night_power IS TRUE THEN 'has_night_power' END,
          CASE WHEN listing.has_solar_water IS TRUE THEN 'has_solar_water' END,
          CASE WHEN listing.has_video_tour IS TRUE THEN 'has_video_tour' END,
          CASE WHEN listing.has_virtual_tour IS TRUE THEN 'has_virtual_tour' END
        ]::text[],
        NULL
      ) AS features,
      jsonb_build_object(
        'id', listing.id,
        'owner_id', listing.owner_id,
        'project_id', listing.project_id,
        'created_at', listing.created_at,
        'status', 'active',
        'title', listing.title,
        'address', listing.address,
        'city', listing.city,
        'region', listing.region,
        'price', listing.price,
        'price_per_sqm', listing.price_per_sqm,
        'sqm', listing.sqm,
        'bedrooms', listing.bedrooms,
        'bathrooms', listing.bathrooms,
        'floor', listing.floor,
        'total_floors', listing.total_floors,
        'year_built', listing.year_built,
        'energy_class', listing.energy_class,
        'property_type', listing.property_type,
        'listing_type', listing.listing_type,
        'open_house_date', listing.open_house_date,
        'open_house_transaction_type', listing.open_house_transaction_type,
        'auction_date', listing.auction_date,
        'auction_starting_bid', listing.auction_starting_bid,
        'cover_image_url', listing.cover_image_url,
        'ai_score', listing.ai_score,
        'views_count', listing.views_count,
        'tags', COALESCE(listing.tags, '{}'::text[]),
        'heating_system', listing.heating_system,
        'construction_status', listing.construction_status,
        'commercial_subtype', listing.commercial_subtype,
        'walkability_score', listing.walkability_score,
        'safety_score', listing.safety_score,
        'noise_score', listing.noise_score,
        'latitude', listing.latitude,
        'longitude', listing.longitude
      ) || jsonb_build_object(
        'has_video_tour', listing.has_video_tour,
        'has_virtual_tour', listing.has_virtual_tour,
        'has_parking', listing.has_parking,
        'has_elevator', listing.has_elevator,
        'has_balcony', listing.has_balcony,
        'has_pool', listing.has_pool,
        'pets_allowed', listing.pets_allowed,
        'has_furnished', listing.has_furnished,
        'has_garden', listing.has_garden,
        'has_ac', listing.has_ac,
        'has_fireplace', listing.has_fireplace,
        'has_storage', listing.has_storage,
        'has_view', listing.has_view,
        'has_smart_home', listing.has_smart_home,
        'has_attic', listing.has_attic,
        'has_double_glazing', listing.has_double_glazing,
        'has_secure_door', listing.has_secure_door,
        'has_alarm', listing.has_alarm,
        'has_loading_dock', listing.has_loading_dock,
        'has_three_phase_power', listing.has_three_phase_power,
        'has_cctv', listing.has_cctv,
        'has_disability_access', listing.has_disability_access,
        'has_structured_cabling', listing.has_structured_cabling,
        'has_facade', listing.has_facade,
        'has_night_power', listing.has_night_power,
        'has_solar_water', listing.has_solar_water,
        'is_featured', promotion.spotlight_until IS NOT NULL,
        'featured_until', promotion.spotlight_until,
        'priority_placement',
          CASE WHEN promotion.priority_until IS NULL THEN 0 ELSE 1 END,
        'priority_until', promotion.priority_until,
        'is_pre_sale', listing.is_pre_sale,
        'is_off_market', false,
        'project',
          CASE
            WHEN listing.project_id IS NULL THEN NULL
            ELSE (
              SELECT jsonb_build_object(
                'name', project.name,
                'delivery_date', project.delivery_date
              )
              FROM public.projects AS project
              WHERE project.id = listing.project_id
                AND project.status = 'active'
            )
          END,
        'listing_images',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'url', image.url,
                  'sort_order', image.sort_order
                )
                ORDER BY image.sort_order
              )
              FROM (
                SELECT listing_image.url, listing_image.sort_order
                FROM public.listing_images AS listing_image
                WHERE listing_image.listing_id = listing.id
                ORDER BY listing_image.sort_order
                LIMIT 3
              ) AS image
            ),
            '[]'::jsonb
          )
      ) AS card_payload,
      (
        to_jsonb(detail)
        - 'listing_images_detail'
        - 'project_detail'
        - 'location_search_text'
        - 'is_off_market'
      ) || jsonb_build_object(
        'status', 'active',
        'listing_images', detail.listing_images_detail,
        'project', detail.project_detail,
        'is_featured', promotion.spotlight_until IS NOT NULL,
        'featured_until', promotion.spotlight_until,
        'priority_placement',
          CASE WHEN promotion.priority_until IS NULL THEN 0 ELSE 1 END,
        'priority_until', promotion.priority_until
      ) AS detail_payload
    FROM public.listings AS listing
    JOIN public.public_listing_catalogue AS detail
      ON detail.id = listing.id
    LEFT JOIN promotion_at_publication AS promotion
      ON promotion.listing_id = listing.id
    WHERE listing.status = 'active'
      AND COALESCE(listing.is_off_market, false) = false
      AND listing.created_at <= v_snapshot
      AND lower(
        concat_ws(
          ' ',
          COALESCE(listing.title, ''),
          COALESCE(listing.address, ''),
          COALESCE(listing.tags::text, '')
        )
      ) !~ '(supervisor-[0-9]+|e2e-full-publish|qa-full-publish|devin test|test free listing)'
  )
  SELECT
    source_rows.*,
    decode(md5(to_jsonb(source_rows)::text), 'hex') AS content_hash
  FROM source_rows;

  CREATE UNIQUE INDEX IF NOT EXISTS public_catalogue_stage_listing_id_idx
    ON public_catalogue_stage (listing_id);

  IF EXISTS (
    SELECT 1
    FROM pg_temp.public_catalogue_stage AS stage
    WHERE stage.os_tag_count > 1
       OR (
         stage.os_tag IS NOT NULL
         AND (
           length(stage.os_tag) > 120
           OR stage.os_tag !~ '^[A-Za-z0-9:_-]+$'
         )
       )
  ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_os_tag'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT stage.os_tag
    FROM pg_temp.public_catalogue_stage AS stage
    WHERE stage.os_tag IS NOT NULL
    GROUP BY stage.os_tag
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'public_catalogue_duplicate_os_tag'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO private.public_catalogue_publications (
    snapshot_minute,
    retain_until
  )
  VALUES (
    v_snapshot,
    v_snapshot + interval '40 minutes'
  )
  RETURNING private.public_catalogue_publications.publication_id
  INTO v_publication_id;

  SELECT count(*)::integer
  INTO v_changed_count
  FROM pg_temp.public_catalogue_stage AS stage
  FULL JOIN private.public_catalogue_versions AS current_version
    ON current_version.listing_id = stage.listing_id
   AND current_version.valid_to_publication IS NULL
  WHERE stage.listing_id IS NULL
     OR current_version.listing_id IS NULL
     OR current_version.content_hash IS DISTINCT FROM stage.content_hash;

  UPDATE private.public_catalogue_versions AS current_version
  SET valid_to_publication = v_publication_id
  WHERE current_version.valid_to_publication IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.public_catalogue_stage AS stage
      WHERE stage.listing_id = current_version.listing_id
        AND stage.content_hash = current_version.content_hash
    );

  INSERT INTO private.public_catalogue_versions (
    listing_id,
    valid_from_publication,
    content_hash,
    priority_rank,
    spotlight_active,
    owner_id,
    project_id,
    created_at,
    title,
    address,
    city,
    region,
    normalized_location,
    price,
    price_per_sqm,
    sqm,
    bedrooms,
    bathrooms,
    floor,
    total_floors,
    year_built,
    energy_class,
    property_type,
    listing_type,
    os_tag,
    open_house_date,
    open_house_transaction_type,
    auction_date,
    auction_starting_bid,
    ai_score,
    walkability_score,
    views_count,
    heating_system,
    construction_status,
    commercial_subtype,
    latitude,
    longitude,
    tags,
    features,
    card_payload,
    detail_payload
  )
  SELECT
    stage.listing_id,
    v_publication_id,
    stage.content_hash,
    stage.priority_rank,
    stage.spotlight_active,
    stage.owner_id,
    stage.project_id,
    stage.created_at,
    stage.title,
    stage.address,
    stage.city,
    stage.region,
    stage.normalized_location,
    stage.price,
    stage.price_per_sqm,
    stage.sqm,
    stage.bedrooms,
    stage.bathrooms,
    stage.floor,
    stage.total_floors,
    stage.year_built,
    stage.energy_class,
    stage.property_type,
    stage.listing_type,
    stage.os_tag,
    stage.open_house_date,
    stage.open_house_transaction_type,
    stage.auction_date,
    stage.auction_starting_bid,
    stage.ai_score,
    stage.walkability_score,
    stage.views_count,
    stage.heating_system,
    stage.construction_status,
    stage.commercial_subtype,
    stage.latitude,
    stage.longitude,
    stage.tags,
    stage.features,
    stage.card_payload,
    stage.detail_payload
  FROM pg_temp.public_catalogue_stage AS stage
  LEFT JOIN private.public_catalogue_versions AS current_version
    ON current_version.listing_id = stage.listing_id
   AND current_version.valid_to_publication IS NULL
  WHERE current_version.listing_id IS NULL;

  SELECT count(*)::integer
  INTO v_row_count
  FROM pg_temp.public_catalogue_stage;

  SELECT jsonb_build_object(
    'publication_id', v_publication_id,
    'snapshot_minute', v_snapshot,
    'featured',
      COALESCE(
        (
          SELECT jsonb_agg(featured.card_payload ORDER BY featured.created_at DESC)
          FROM (
            SELECT stage.card_payload, stage.created_at
            FROM pg_temp.public_catalogue_stage AS stage
            WHERE stage.spotlight_active
              AND stage.listing_type IN ('sale', 'new_build')
            ORDER BY stage.created_at DESC, stage.listing_id DESC
            LIMIT 12
          ) AS featured
        ),
        '[]'::jsonb
      ),
    'open_houses',
      COALESCE(
        (
          SELECT jsonb_agg(open_house.card_payload ORDER BY open_house.open_house_date)
          FROM (
            SELECT stage.card_payload, stage.open_house_date
            FROM pg_temp.public_catalogue_stage AS stage
            WHERE stage.listing_type = 'open_house'
              AND stage.open_house_date >= v_snapshot
            ORDER BY stage.open_house_date, stage.listing_id
            LIMIT 12
          ) AS open_house
        ),
        '[]'::jsonb
      ),
    'property_type_counts',
      COALESCE(
        (
          SELECT jsonb_object_agg(counts.property_type, counts.listing_count)
          FROM (
            SELECT stage.property_type, count(*)::integer AS listing_count
            FROM pg_temp.public_catalogue_stage AS stage
            GROUP BY stage.property_type
          ) AS counts
        ),
        '{}'::jsonb
      ),
    'popular_locations',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'city', locations.city,
              'listing_count', locations.listing_count
            )
            ORDER BY locations.listing_count DESC, locations.city
          )
          FROM (
            SELECT stage.city, count(*)::integer AS listing_count
            FROM pg_temp.public_catalogue_stage AS stage
            GROUP BY stage.city
            ORDER BY count(*) DESC, stage.city
            LIMIT 12
          ) AS locations
        ),
        '[]'::jsonb
      ),
    'price_index',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'city', prices.city,
              'avg_price_per_sqm', prices.avg_price_per_sqm,
              'listing_count', prices.listing_count
            )
            ORDER BY prices.listing_count DESC, prices.city
          )
          FROM (
            SELECT
              stage.city,
              round(avg(stage.price_per_sqm)) AS avg_price_per_sqm,
              count(*)::integer AS listing_count
            FROM pg_temp.public_catalogue_stage AS stage
            WHERE stage.price_per_sqm IS NOT NULL
            GROUP BY stage.city
            ORDER BY count(*) DESC, stage.city
            LIMIT 12
          ) AS prices
        ),
        '[]'::jsonb
      ),
    'auction_count',
      (
        SELECT count(*)::integer
        FROM pg_temp.public_catalogue_stage AS stage
        WHERE stage.listing_type = 'auction'
      )
  )
  INTO v_homepage_payload;

  v_published_at := clock_timestamp();
  UPDATE private.public_catalogue_publications AS publication
  SET
    status = 'published',
    published_at = v_published_at,
    row_count = v_row_count,
    changed_count = v_changed_count,
    homepage_payload = v_homepage_payload
  WHERE publication.publication_id = v_publication_id;

  INSERT INTO private.public_catalogue_current (
    singleton,
    publication_id,
    updated_at
  )
  VALUES (true, v_publication_id, v_published_at)
  ON CONFLICT (singleton) DO UPDATE
  SET
    publication_id = EXCLUDED.publication_id,
    updated_at = EXCLUDED.updated_at;

  SELECT min(retained.publication_id)
  INTO v_oldest_retained
  FROM (
    SELECT publication.publication_id
    FROM private.public_catalogue_publications AS publication
    WHERE publication.status = 'published'
    ORDER BY publication.publication_id DESC
    LIMIT 46
  ) AS retained;

  DELETE FROM private.public_catalogue_versions AS version
  WHERE version.valid_to_publication IS NOT NULL
    AND version.valid_to_publication <= v_oldest_retained;

  DELETE FROM private.public_catalogue_publications AS publication
  WHERE publication.publication_id <> v_publication_id
    AND (
      (
        publication.status = 'published'
        AND publication.retain_until <= v_now
        AND publication.publication_id < v_oldest_retained
      )
      OR (
        publication.status = 'building'
        AND publication.started_at < v_now - interval '5 minutes'
      )
    );

  RETURN QUERY
  SELECT
    v_publication_id,
    v_snapshot,
    v_published_at,
    v_row_count,
    v_changed_count;
END;
$$;

REVOKE ALL ON FUNCTION private.publish_public_catalogue()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.publish_public_catalogue()
  TO service_role;

CREATE OR REPLACE FUNCTION public.publish_public_catalogue()
RETURNS TABLE(
  publication_id bigint,
  snapshot_minute timestamptz,
  published_at timestamptz,
  row_count integer,
  changed_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM private.publish_public_catalogue();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_public_catalogue()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_public_catalogue()
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_catalogue_publication(
  p_publication_id bigint DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  snapshot_minute timestamptz,
  published_at timestamptz,
  retain_until timestamptz,
  row_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
BEGIN
  RETURN QUERY
  SELECT
    publication.publication_id,
    publication.snapshot_minute,
    publication.published_at,
    publication.retain_until,
    publication.row_count
  FROM private.public_catalogue_publications AS publication
  WHERE publication.publication_id = v_publication_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalogue_publication(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalogue_publication(bigint)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.query_public_catalogue(
  p_publication_id bigint DEFAULT NULL,
  p_listing_type text DEFAULT NULL,
  p_property_type text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_bedrooms_min numeric DEFAULT NULL,
  p_bedrooms_max numeric DEFAULT NULL,
  p_bathrooms_min numeric DEFAULT NULL,
  p_bathrooms_max numeric DEFAULT NULL,
  p_sqm_min numeric DEFAULT NULL,
  p_sqm_max numeric DEFAULT NULL,
  p_floor_min numeric DEFAULT NULL,
  p_floor_max numeric DEFAULT NULL,
  p_year_min integer DEFAULT NULL,
  p_year_max integer DEFAULT NULL,
  p_energy_classes text[] DEFAULT NULL,
  p_heating_system text DEFAULT NULL,
  p_construction_status text DEFAULT NULL,
  p_commercial_subtype text DEFAULT NULL,
  p_transaction_type text DEFAULT NULL,
  p_features text[] DEFAULT NULL,
  p_ai_score_min numeric DEFAULT NULL,
  p_walkability_min numeric DEFAULT NULL,
  p_bounds_west numeric DEFAULT NULL,
  p_bounds_south numeric DEFAULT NULL,
  p_bounds_east numeric DEFAULT NULL,
  p_bounds_north numeric DEFAULT NULL,
  p_priority_mode text DEFAULT 'all',
  p_open_house_mode text DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_cursor_timestamp timestamptz DEFAULT NULL,
  p_cursor_numeric numeric DEFAULT NULL,
  p_cursor_listing_id uuid DEFAULT NULL,
  p_cursor_is_null boolean DEFAULT false,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_location_groups jsonb DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  published_at timestamptz,
  listing_id uuid,
  priority_rank integer,
  created_at timestamptz,
  price numeric,
  ai_score numeric,
  views_count bigint,
  open_house_date timestamptz,
  card_payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
  v_snapshot timestamptz;
  v_order_sql text;
  v_cursor_sql text := '';
BEGIN
  IF p_sort IS NULL
     OR p_sort NOT IN ('newest', 'price_asc', 'price_desc', 'ai_score', 'views') THEN
    RAISE EXCEPTION 'public_catalogue_invalid_sort' USING ERRCODE = '22023';
  END IF;
  IF p_priority_mode IS NULL
     OR p_priority_mode NOT IN ('all', 'priority', 'organic') THEN
    RAISE EXCEPTION 'public_catalogue_invalid_priority_mode'
      USING ERRCODE = '22023';
  END IF;
  IF p_open_house_mode IS NOT NULL
     AND p_open_house_mode NOT IN ('upcoming', 'past') THEN
    RAISE EXCEPTION 'public_catalogue_invalid_open_house_mode'
      USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 201 THEN
    RAISE EXCEPTION 'public_catalogue_invalid_limit' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'public_catalogue_invalid_offset' USING ERRCODE = '22023';
  END IF;
  IF p_listing_type IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(string_to_array(p_listing_type, ',')) AS requested(listing_type)
    WHERE requested.listing_type NOT IN (
      'sale',
      'rent',
      'firesale',
      'auction',
      'open_house',
      'new_build'
    )
  ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_listing_type'
      USING ERRCODE = '22023';
  END IF;
  IF p_location_groups IS NOT NULL AND (
    jsonb_typeof(p_location_groups) <> 'array'
    OR jsonb_array_length(p_location_groups) < 1
    OR jsonb_array_length(p_location_groups) > 6
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_location_groups) AS location_group(value)
      WHERE jsonb_typeof(location_group.value) <> 'array'
        OR jsonb_array_length(location_group.value) < 1
        OR jsonb_array_length(location_group.value) > 6
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(location_group.value) AS token(value)
          WHERE jsonb_typeof(token.value) <> 'string'
            OR length(token.value #>> '{}') < 1
            OR length(token.value #>> '{}') > 80
        )
    )
  ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_location_groups'
      USING ERRCODE = '22023';
  END IF;
  IF p_cursor_listing_id IS NULL
     AND (
       p_cursor_timestamp IS NOT NULL
       OR p_cursor_numeric IS NOT NULL
       OR p_cursor_is_null
     ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_cursor' USING ERRCODE = '22023';
  END IF;

  SELECT publication.snapshot_minute
  INTO v_snapshot
  FROM private.public_catalogue_publications AS publication
  WHERE publication.publication_id = v_publication_id;

  IF p_cursor_listing_id IS NOT NULL THEN
    IF p_open_house_mode IS NOT NULL THEN
      IF p_cursor_timestamp IS NULL THEN
        RAISE EXCEPTION 'public_catalogue_invalid_cursor' USING ERRCODE = '22023';
      END IF;
      IF p_open_house_mode = 'upcoming' THEN
        v_cursor_sql :=
          ' AND (version.open_house_date, version.listing_id) > ($33, $35)';
      ELSE
        v_cursor_sql :=
          ' AND (version.open_house_date, version.listing_id) < ($33, $35)';
      END IF;
    ELSIF p_sort = 'newest' THEN
      IF p_cursor_timestamp IS NULL THEN
        RAISE EXCEPTION 'public_catalogue_invalid_cursor' USING ERRCODE = '22023';
      END IF;
      v_cursor_sql :=
        ' AND (version.created_at, version.listing_id) < ($33, $35)';
    ELSIF p_sort = 'price_asc' THEN
      IF p_cursor_numeric IS NULL THEN
        RAISE EXCEPTION 'public_catalogue_invalid_cursor' USING ERRCODE = '22023';
      END IF;
      v_cursor_sql :=
        ' AND (version.price, version.listing_id) > ($34, $35)';
    ELSIF p_sort = 'price_desc' OR p_sort = 'views' THEN
      IF p_cursor_numeric IS NULL THEN
        RAISE EXCEPTION 'public_catalogue_invalid_cursor' USING ERRCODE = '22023';
      END IF;
      v_cursor_sql := CASE
        WHEN p_sort = 'price_desc'
          THEN ' AND (version.price, version.listing_id) < ($34, $35)'
        ELSE
          ' AND (version.views_count, version.listing_id) < ($34, $35)'
      END;
    ELSIF p_sort = 'ai_score' THEN
      IF p_cursor_is_null THEN
        v_cursor_sql :=
          ' AND version.ai_score IS NULL AND version.listing_id < $35';
      ELSE
        IF p_cursor_numeric IS NULL THEN
          RAISE EXCEPTION 'public_catalogue_invalid_cursor'
            USING ERRCODE = '22023';
        END IF;
        v_cursor_sql :=
          ' AND (version.ai_score < $34'
          || ' OR (version.ai_score = $34 AND version.listing_id < $35)'
          || ' OR version.ai_score IS NULL)';
      END IF;
    END IF;
  END IF;

  v_order_sql := CASE
    WHEN p_open_house_mode = 'upcoming'
      THEN 'version.open_house_date ASC, version.listing_id ASC'
    WHEN p_open_house_mode = 'past'
      THEN 'version.open_house_date DESC, version.listing_id DESC'
    WHEN p_sort = 'newest'
      THEN 'version.created_at DESC, version.listing_id DESC'
    WHEN p_sort = 'price_asc'
      THEN 'version.price ASC, version.listing_id ASC'
    WHEN p_sort = 'price_desc'
      THEN 'version.price DESC, version.listing_id DESC'
    WHEN p_sort = 'ai_score'
      THEN 'version.ai_score DESC NULLS LAST, version.listing_id DESC'
    ELSE 'version.views_count DESC, version.listing_id DESC'
  END;

  RETURN QUERY EXECUTE
    'SELECT'
    || ' $1::bigint, publication.published_at, version.listing_id,'
    || ' version.priority_rank, version.created_at, version.price,'
    || ' version.ai_score, version.views_count, version.open_house_date,'
    || ' version.card_payload'
    || ' FROM private.public_catalogue_versions AS version'
    || ' JOIN private.public_catalogue_publications AS publication'
    || '   ON publication.publication_id = $1'
    || ' WHERE version.valid_from_publication <= $1'
    || '   AND (version.valid_to_publication IS NULL'
    || '        OR $1 < version.valid_to_publication)'
    || '   AND ($2 IS NULL'
    || '        OR version.listing_type = ANY(string_to_array($2, '','')))'
    || '   AND ($3 IS NULL OR version.property_type = $3)'
    || '   AND ($4 IS NULL OR lower(version.city) = lower($4))'
    || '   AND ($5 IS NULL OR version.normalized_location ILIKE ''%'' || lower($5) || ''%'')'
    || '   AND ($39 IS NULL OR NOT EXISTS ('
    || '     SELECT 1 FROM jsonb_array_elements($39) AS location_group(value)'
    || '     WHERE NOT EXISTS ('
    || '       SELECT 1'
    || '       FROM jsonb_array_elements_text(location_group.value) AS token(value)'
    || '       WHERE version.normalized_location ILIKE ''%'' || lower(token.value) || ''%'''
    || '     )'
    || '   ))'
    || '   AND ($6 IS NULL OR version.price >= $6)'
    || '   AND ($7 IS NULL OR version.price <= $7)'
    || '   AND ($8 IS NULL OR version.bedrooms >= $8)'
    || '   AND ($9 IS NULL OR version.bedrooms <= $9)'
    || '   AND ($10 IS NULL OR version.bathrooms >= $10)'
    || '   AND ($11 IS NULL OR version.bathrooms <= $11)'
    || '   AND ($12 IS NULL OR version.sqm >= $12)'
    || '   AND ($13 IS NULL OR version.sqm <= $13)'
    || '   AND ($14 IS NULL OR version.floor >= $14)'
    || '   AND ($15 IS NULL OR version.floor <= $15)'
    || '   AND ($16 IS NULL OR version.year_built >= $16)'
    || '   AND ($17 IS NULL OR version.year_built <= $17)'
    || '   AND ($18 IS NULL OR version.energy_class = ANY($18))'
    || '   AND ($19 IS NULL OR version.heating_system = $19)'
    || '   AND ($20 IS NULL OR version.construction_status = $20)'
    || '   AND ($21 IS NULL OR version.commercial_subtype = $21)'
    || '   AND ($22 IS NULL OR version.open_house_transaction_type = $22)'
    || '   AND ($23 IS NULL OR version.features @> $23)'
    || '   AND ($24 IS NULL OR version.ai_score >= $24)'
    || '   AND ($25 IS NULL OR version.walkability_score >= $25)'
    || '   AND ($26 IS NULL OR version.longitude >= $26)'
    || '   AND ($27 IS NULL OR version.latitude >= $27)'
    || '   AND ($28 IS NULL OR version.longitude <= $28)'
    || '   AND ($29 IS NULL OR version.latitude <= $29)'
    || '   AND ($30 = ''all'''
    || '        OR ($30 = ''priority'' AND version.priority_rank = 1)'
    || '        OR ($30 = ''organic'' AND version.priority_rank = 0))'
    || '   AND ($31 IS NULL'
    || '        OR ($31 = ''upcoming'''
    || '            AND version.listing_type = ''open_house'''
    || '            AND version.open_house_date >= $32)'
    || '        OR ($31 = ''past'''
    || '            AND version.listing_type = ''open_house'''
    || '            AND version.open_house_date < $32))'
    || v_cursor_sql
    || ' ORDER BY ' || v_order_sql
    || ' LIMIT $37 OFFSET $38'
  USING
    v_publication_id,
    p_listing_type,
    p_property_type,
    p_city,
    p_location,
    p_price_min,
    p_price_max,
    p_bedrooms_min,
    p_bedrooms_max,
    p_bathrooms_min,
    p_bathrooms_max,
    p_sqm_min,
    p_sqm_max,
    p_floor_min,
    p_floor_max,
    p_year_min,
    p_year_max,
    p_energy_classes,
    p_heating_system,
    p_construction_status,
    p_commercial_subtype,
    p_transaction_type,
    p_features,
    p_ai_score_min,
    p_walkability_min,
    p_bounds_west,
    p_bounds_south,
    p_bounds_east,
    p_bounds_north,
    p_priority_mode,
    p_open_house_mode,
    v_snapshot,
    p_cursor_timestamp,
    p_cursor_numeric,
    p_cursor_listing_id,
    p_cursor_is_null,
    p_limit,
    p_offset,
    p_location_groups;
END;
$$;

REVOKE ALL ON FUNCTION public.query_public_catalogue(
  bigint, text, text, text, text, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, integer, integer, text[], text,
  text, text, text, text[], numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, timestamptz, numeric, uuid, boolean, integer, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_public_catalogue(
  bigint, text, text, text, text, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, integer, integer, text[], text,
  text, text, text, text[], numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, timestamptz, numeric, uuid, boolean, integer, integer, jsonb
) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_catalogue_listing(bigint, uuid, text);
CREATE OR REPLACE FUNCTION public.get_public_catalogue_listing(
  p_publication_id bigint DEFAULT NULL,
  p_listing_id uuid DEFAULT NULL,
  p_os_tag text DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  published_at timestamptz,
  detail_payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
  v_match_count integer;
BEGIN
  IF (p_listing_id IS NULL) = (p_os_tag IS NULL) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_listing_identity'
      USING ERRCODE = '22023';
  END IF;
  IF p_os_tag IS NOT NULL
     AND (
       length(p_os_tag) > 120
       OR p_os_tag !~ '^[A-Za-z0-9:_-]+$'
     ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_listing_identity'
      USING ERRCODE = '22023';
  END IF;

  IF p_os_tag IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_match_count
    FROM private.public_catalogue_versions AS version
    WHERE version.valid_from_publication <= v_publication_id
      AND (
        version.valid_to_publication IS NULL
        OR v_publication_id < version.valid_to_publication
      )
      AND version.os_tag = p_os_tag;

    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'public_catalogue_duplicate_os_tag'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    publication.publication_id,
    publication.published_at,
    version.detail_payload
  FROM private.public_catalogue_versions AS version
  JOIN private.public_catalogue_publications AS publication
    ON publication.publication_id = v_publication_id
  WHERE version.valid_from_publication <= v_publication_id
    AND (
      version.valid_to_publication IS NULL
      OR v_publication_id < version.valid_to_publication
    )
    AND (
      (p_listing_id IS NOT NULL AND version.listing_id = p_listing_id)
      OR (
        p_os_tag IS NOT NULL
        AND version.listing_type = 'auction'
        AND version.os_tag = p_os_tag
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalogue_listing(bigint, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalogue_listing(bigint, uuid, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_catalogue_homepage(
  p_publication_id bigint DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  published_at timestamptz,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
BEGIN
  RETURN QUERY
  SELECT
    publication.publication_id,
    publication.published_at,
    publication.homepage_payload
  FROM private.public_catalogue_publications AS publication
  WHERE publication.publication_id = v_publication_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalogue_homepage(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalogue_homepage(bigint)
  TO anon, authenticated;

-- One-release compatibility reader. New public workers must use
-- query_public_catalogue so filtering and keysets stay on typed indexes.
DROP FUNCTION IF EXISTS public.get_public_listing_catalogue();
DROP FUNCTION IF EXISTS public.get_public_listing_catalogue(timestamptz);
CREATE OR REPLACE FUNCTION public.get_public_listing_catalogue(
  p_as_of timestamptz DEFAULT NULL
)
RETURNS SETOF public.public_listing_catalogue
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint;
BEGIN
  IF p_as_of IS NULL THEN
    v_publication_id :=
      private.resolve_public_catalogue_publication(NULL);
  ELSE
    SELECT publication.publication_id
    INTO v_publication_id
    FROM private.public_catalogue_publications AS publication
    WHERE publication.snapshot_minute = date_trunc('minute', p_as_of)
      AND publication.status = 'published'
      AND publication.retain_until > statement_timestamp();
    IF v_publication_id IS NULL THEN
      RAISE EXCEPTION 'public_catalogue_publication_expired'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  SELECT populated.*
  FROM private.public_catalogue_versions AS version
  CROSS JOIN LATERAL jsonb_populate_record(
    NULL::public.public_listing_catalogue,
    version.detail_payload
  ) AS populated
  WHERE version.valid_from_publication <= v_publication_id
    AND (
      version.valid_to_publication IS NULL
      OR v_publication_id < version.valid_to_publication
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_listing_catalogue(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_listing_catalogue(timestamptz)
  TO anon, authenticated;

COMMENT ON FUNCTION private.publish_public_catalogue() IS
  'The only catalogue writer. Publishes one immutable minute and stores only changed card versions.';
COMMENT ON FUNCTION public.publish_public_catalogue() IS
  'Service-role-only wrapper for scheduled or deployment bootstrap publication.';
COMMENT ON FUNCTION public.query_public_catalogue(
  bigint, text, text, text, text, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, integer, integer, text[], text,
  text, text, text, text[], numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, timestamptz, numeric, uuid, boolean, integer, integer, jsonb
) IS
  'Read-only typed keyset query pinned to one retained public catalogue publication.';
COMMENT ON FUNCTION public.get_public_listing_catalogue(timestamptz) IS
  'Read-only compatibility projection. Public workers should migrate to query_public_catalogue.';

DO $$
DECLARE
  v_job record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    FOR v_job IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'publish-public-catalogue'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'publish-public-catalogue',
      '* * * * *',
      'SELECT private.publish_public_catalogue();'
    );
  END IF;
END;
$$;

-- Bootstrap a complete current publication in the same migration transaction.
SELECT * FROM private.publish_public_catalogue();
