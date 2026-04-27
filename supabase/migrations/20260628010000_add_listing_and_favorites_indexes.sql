-- =============================================================================
-- 20260628010000_add_listing_and_favorites_indexes.sql
--
-- Add indexes for columns used as filters in buildListingsQuery
-- (src/hooks/useListings.ts) and for the favorites lookup pattern.
--
-- All indexes are created with IF NOT EXISTS and CONCURRENTLY is NOT used
-- here because Supabase migrations run inside a transaction. The table
-- has 154 rows so build time is negligible.
-- =============================================================================

-- 1. Single-column indexes on listings filter columns ────────────────────────

CREATE INDEX IF NOT EXISTS idx_listings_price
  ON public.listings (price);

CREATE INDEX IF NOT EXISTS idx_listings_sqm
  ON public.listings (sqm);

CREATE INDEX IF NOT EXISTS idx_listings_bedrooms
  ON public.listings (bedrooms);

CREATE INDEX IF NOT EXISTS idx_listings_property_type
  ON public.listings (property_type);

CREATE INDEX IF NOT EXISTS idx_listings_year_built
  ON public.listings (year_built);

CREATE INDEX IF NOT EXISTS idx_listings_construction_status
  ON public.listings (construction_status);

CREATE INDEX IF NOT EXISTS idx_listings_energy_class
  ON public.listings (energy_class);

CREATE INDEX IF NOT EXISTS idx_listings_heating_system
  ON public.listings (heating_system);

-- 2. Composite index for the most common filter combination ──────────────────
--    Matches: city + listing_type + status + price (range scan on price)

CREATE INDEX IF NOT EXISTS idx_listings_city_type_status_price
  ON public.listings (city, listing_type, status, price);

-- 3. Favorites composite index ───────────────────────────────────────────────
--    Lookup pattern: .eq("user_id", uid).eq("listing_id", lid)
--    Also enforces logical uniqueness at the index level.

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_listing
  ON public.favorites (user_id, listing_id);
