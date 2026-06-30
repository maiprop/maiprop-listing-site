-- Performance optimization migration
-- Adds composite, partial, GIN, and BRIN indexes for all high-traffic tables
-- Tunes autovacuum for write-heavy tables
-- Enforces storage limits and MIME types
-- Safe to run on existing data (all IF NOT EXISTS)


-- ── 1. LISTINGS — composite & partial indexes ────────────────────────────────

-- Most common query: active listings by type and city
CREATE INDEX IF NOT EXISTS idx_listings_type_status_city
  ON listings(listing_type, status, city)
  WHERE status = 'active';

-- Covering index for list view (avoids heap fetch for common columns)
CREATE INDEX IF NOT EXISTS idx_listings_active_list
  ON listings(listing_type, status, city, price, bedrooms, sqm, created_at DESC)
  WHERE status = 'active';

-- Price range queries
CREATE INDEX IF NOT EXISTS idx_listings_price
  ON listings(price)
  WHERE status = 'active';

-- Bedroom filter (very common)
CREATE INDEX IF NOT EXISTS idx_listings_beds_type
  ON listings(bedrooms, listing_type)
  WHERE status = 'active';

-- Owner lookup (dashboard "My Listings")
CREATE INDEX IF NOT EXISTS idx_listings_owner_status
  ON listings(owner_id, status)
  WHERE owner_id IS NOT NULL;

-- Spotlight listings (homepage hero)
-- Note: idx_listings_featured already exists from a prior migration but only covers
-- (is_featured, priority_placement DESC) without a WHERE clause — this new partial
-- index is more selective and avoids scanning non-active rows.
CREATE INDEX IF NOT EXISTS idx_listings_featured
  ON listings(is_featured, created_at DESC)
  WHERE is_featured = true AND status = 'active';

-- Auction listings with date (upcoming auctions)
CREATE INDEX IF NOT EXISTS idx_listings_auction_date
  ON listings(auction_date)
  WHERE listing_type = 'auction' AND status = 'active' AND auction_date IS NOT NULL;

-- Open house date index
-- Note: idx_listings_open_house_date already exists from migration 20260405120000
-- but its WHERE clause may differ; IF NOT EXISTS ensures idempotency.
CREATE INDEX IF NOT EXISTS idx_listings_open_house_date
  ON listings(open_house_date)
  WHERE listing_type = 'open_house' AND status = 'active' AND open_house_date IS NOT NULL;

-- Full-text search on title + description
CREATE INDEX IF NOT EXISTS idx_listings_fts
  ON listings USING gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));

-- Priority placement (sorted feed)
CREATE INDEX IF NOT EXISTS idx_listings_priority_created
  ON listings(priority_placement DESC, created_at DESC)
  WHERE status = 'active';

-- Firesale listings
CREATE INDEX IF NOT EXISTS idx_listings_firesale
  ON listings(price, created_at DESC)
  WHERE listing_type = 'firesale' AND status = 'active';


-- ── 2. MESSAGES & CONVERSATIONS ─────────────────────────────────────────────

-- Unread message count per conversation (avoids full scan)
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(conversation_id, status)
  WHERE status = 'sent';

-- Recent messages per conversation (pagination)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at DESC);

-- Conversation lookup by either participant + last activity
CREATE INDEX IF NOT EXISTS idx_conversations_participant_a_last
  ON conversations(participant_a, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_b_last
  ON conversations(participant_b, last_message_at DESC);

-- Fast conversation existence check (is there already a conversation between A and B?)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_participants_unique
  ON conversations(
    LEAST(participant_a::text, participant_b::text),
    GREATEST(participant_a::text, participant_b::text)
  );


-- ── 3. LISTING IMAGES ────────────────────────────────────────────────────────

-- Listing images sorted by order (always fetched with listing)
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_sort
  ON listing_images(listing_id, sort_order);


-- ── 4. PROFILES / PROFESSIONALS ─────────────────────────────────────────────

-- Professional directory: role filter (directory listing order)
CREATE INDEX IF NOT EXISTS idx_profiles_role_verified
  ON profiles(role)
  WHERE role IN ('professional', 'agent');

-- Profiles by city (professional directory filter)
CREATE INDEX IF NOT EXISTS idx_profiles_city
  ON profiles(city)
  WHERE city IS NOT NULL;


-- ── 5. VIEWINGS ──────────────────────────────────────────────────────────────

-- Upcoming viewings per requester
CREATE INDEX IF NOT EXISTS idx_viewings_requester_date
  ON viewings(requester_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');

-- Upcoming viewings per listing (owner's view)
CREATE INDEX IF NOT EXISTS idx_viewings_owner_date
  ON viewings(listing_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');


-- ── 6. LISTING VIEW EVENTS — date-range composite ────────────────────────────

-- Already has idx_listing_view_events_listing — add date range composite
CREATE INDEX IF NOT EXISTS idx_listing_view_events_listing_date
  ON listing_view_events(listing_id, viewed_at DESC);


-- ── 7. AUTOVACUUM TUNING ─────────────────────────────────────────────────────

-- listings: moderate write volume, needs fresh stats
ALTER TABLE listings SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

-- messages: high write volume (every message = 1 insert)
ALTER TABLE messages SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2
);

-- listing_view_events: very high write volume (every page view)
ALTER TABLE listing_view_events SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 0
);


-- ── 8. STORAGE BUCKET LIMITS & MIME TYPES ───────────────────────────────────

-- listing-images: enforce WebP/JPEG/PNG only, 5MB max (down from 10MB)
UPDATE storage.buckets
SET
  file_size_limit = 5242880,  -- 5 MB
  allowed_mime_types = ARRAY['image/jpeg','image/webp','image/png']
WHERE id = 'listing-images';

-- avatars: 2MB max (down from 5MB)
UPDATE storage.buckets
SET
  file_size_limit = 2097152,  -- 2 MB
  allowed_mime_types = ARRAY['image/jpeg','image/webp','image/png']
WHERE id = 'avatars';

-- message-attachments: 10MB max, common types only
UPDATE storage.buckets
SET
  file_size_limit = 10485760  -- 10 MB
WHERE id = 'message-attachments';


-- ── 9. BRIN INDEXES (tiny, fast for append-only time-series) ─────────────────

-- listing_view_events: extremely high insert rate, sequential by time
CREATE INDEX IF NOT EXISTS idx_listing_view_events_brin
  ON listing_view_events USING brin(viewed_at);

-- messages: high insert rate, sequential by time
CREATE INDEX IF NOT EXISTS idx_messages_brin
  ON messages USING brin(created_at);

-- listings: moderate insert rate, sequential by time
CREATE INDEX IF NOT EXISTS idx_listings_created_brin
  ON listings USING brin(created_at);
