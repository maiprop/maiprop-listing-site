-- Synthetic fixture for a disposable local PostgreSQL cluster only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;
CREATE TABLE private.auction_test_limits (user_id UUID PRIMARY KEY, cap INTEGER NOT NULL);
INSERT INTO private.auction_test_limits VALUES
  ('00000000-0000-4000-8000-000000000060', 60),
  ('00000000-0000-4000-8000-000000000600', 600);
CREATE FUNCTION public.get_auction_listing_visible_limit(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT cap FROM private.auction_test_limits WHERE user_id=p_user_id),60)
$$;
REVOKE ALL ON FUNCTION public.get_auction_listing_visible_limit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID) TO service_role;

CREATE TYPE public.listing_status AS ENUM ('active','inactive');
CREATE TYPE public.listing_type AS ENUM ('auction','sale');
CREATE TYPE public.property_type AS ENUM ('apartment','land');
CREATE TABLE public.listings (
  id UUID PRIMARY KEY, title TEXT NOT NULL, address TEXT, city TEXT NOT NULL,
  price NUMERIC NOT NULL, price_per_sqm NUMERIC, bedrooms INTEGER, bathrooms INTEGER,
  sqm NUMERIC NOT NULL, floor INTEGER, total_floors INTEGER, year_built INTEGER,
  energy_class TEXT, cover_image_url TEXT, property_type public.property_type NOT NULL,
  listing_type public.listing_type NOT NULL, ai_score INTEGER, views_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT[], auction_date TIMESTAMPTZ, auction_starting_bid NUMERIC, latitude NUMERIC,
  longitude NUMERIC, auction_court TEXT, website_url TEXT, region TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE, featured_until TIMESTAMPTZ,
  priority_placement INTEGER NOT NULL DEFAULT 0, priority_until TIMESTAMPTZ,
  construction_status TEXT, is_off_market BOOLEAN NOT NULL DEFAULT FALSE,
  status public.listing_status NOT NULL DEFAULT 'active',
  owner_email TEXT DEFAULT 'private-fixture@example.invalid', private_notes TEXT DEFAULT 'must not leak'
);
CREATE TABLE public.listing_images (
  id UUID PRIMARY KEY, listing_id UUID REFERENCES public.listings(id), url TEXT, sort_order INTEGER
);
CREATE TABLE public.marketing_leads (id INTEGER PRIMARY KEY, notes TEXT, extra_production_field TEXT);
INSERT INTO public.marketing_leads VALUES (1,'keep','keep');
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version TEXT PRIMARY KEY, name TEXT, statements TEXT[]);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260707000000','historical_alias',ARRAY['select 42;']);

INSERT INTO public.listings(id,title,city,price,sqm,property_type,listing_type,tags,auction_date,auction_starting_bid,year_built)
SELECT md5(i::TEXT)::UUID, 'Auction fixture '||i,
  CASE WHEN i <= 350 THEN 'Athens' ELSE 'Patras' END, i*1000, 100,
  'apartment','auction',ARRAY['source:maiprop-os','os_auction:fixture-'||i,'round:2','ownership:full'],
  (CURRENT_DATE+7)::TIMESTAMPTZ + i*INTERVAL '1 second',i*1000,2010
FROM generate_series(1,700) i;
INSERT INTO public.listing_images(id,listing_id,url,sort_order)
SELECT md5('image-'||i)::UUID,md5('1')::UUID,'https://example.invalid/image-'||i,i
FROM generate_series(1,5) i;

INSERT INTO public.listings(id,title,city,price,sqm,property_type,listing_type,tags,auction_date,priority_placement,priority_until)
SELECT md5('priority-'||i)::UUID,'Priority fixture '||i,'Athens',100000,100,'apartment','auction',
  ARRAY['source:maiprop-os','os_auction:priority-'||i],(CURRENT_DATE+7)::TIMESTAMPTZ,
  1,NOW()+INTERVAL '1 day' FROM generate_series(1,10) i;
INSERT INTO public.listings(id,title,city,price,sqm,property_type,listing_type,tags,auction_date,status,is_off_market)
SELECT md5('excluded-'||i)::UUID,'Excluded fixture '||i,'Athens',100,100,'apartment',
  CASE WHEN i=4 THEN 'sale' ELSE 'auction' END::public.listing_type,
  CASE WHEN i=3 THEN ARRAY['source:other'] ELSE ARRAY['source:maiprop-os'] END,
  CASE WHEN i=5 THEN NOW()-INTERVAL '1 day' ELSE (CURRENT_DATE+1)::TIMESTAMPTZ END,
  CASE WHEN i=1 THEN 'inactive' ELSE 'active' END::public.listing_status,i=2
FROM generate_series(1,5) i;
