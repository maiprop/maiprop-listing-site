-- Bounded synthetic captured A6a read surface, captured 2026-09-21.
-- NOT an all-source replay or full hosted schema. Owner-only setup.
-- Excludes all unchanged DML triggers, raw-table policies and project FK.
-- auth.users is a managed identity stub. Auth helper owner mapped to local postgres.
-- Only postgres/anon/authenticated/service_role/PUBLIC ACL principals retained;
-- hosted administrative owners and PG17 MAINTAIN privilege are not emulated.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database() OR inet_server_addr() IS NOT NULL OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921') THEN RAISE EXCEPTION 'Explicit matching disposable socket database required'; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
REVOKE ALL ON SCHEMA auth FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
REVOKE ALL ON SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
CREATE TYPE public."listing_status" AS ENUM ('draft','active','paused','sold','rented','expired');
CREATE TYPE public."listing_type" AS ENUM ('sale','rent','auction','firesale','open_house','new_build');
CREATE TYPE public."property_type" AS ENUM ('apartment','house','villa','land','commercial','office','studio','maisonette','warehouse','hotel','mixed_use','parking','storage');
CREATE TYPE public."user_role" AS ENUM ('buyer','agent','professional','seller','admin','investor','institutional','developer');
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$
;
REVOKE ALL ON FUNCTION auth.jwt() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;
CREATE OR REPLACE FUNCTION public.normalize_location_text(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION normalize_location_text(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION normalize_location_text(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION normalize_location_text(text) TO service_role;
CREATE OR REPLACE FUNCTION public.expand_location_search_aliases(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION expand_location_search_aliases(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION expand_location_search_aliases(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION expand_location_search_aliases(text) TO service_role;
CREATE OR REPLACE FUNCTION private.extract_os_auction_id(p_tags text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  WITH identities AS (
    SELECT lower(btrim(substr(tag.value, length('os_auction:') + 1))) AS value
    FROM unnest(COALESCE(p_tags, '{}'::text[])) AS tag(value)
    WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
  )
  SELECT CASE
    WHEN count(*) = 1
      AND min(value) ~ '^[a-z0-9:_-]{1,120}$'
      AND min(value) NOT IN ('unknown', 'null', 'undefined', 'none', 'na', 'n/a')
    THEN min(value)
    ELSE NULL
  END
  FROM identities;
$function$
;
REVOKE ALL ON FUNCTION private.extract_os_auction_id(text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.extract_os_auction_id(text[]) TO service_role;
CREATE TABLE public."profiles" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"role" user_role,
"first_name" text,
"last_name" text,
"display_name" text,
"avatar_url" text,
"phone" text,
"bio" text,
"city" text,
"country" text DEFAULT 'Greece'::text,
"website_url" text,
"verified" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"is_platform_admin" boolean DEFAULT false NOT NULL,
"video_link" text,
"subscription_product_id" text,
"participant_type" text,
"investor_mode" boolean DEFAULT false NOT NULL,
"force_pro_access" boolean DEFAULT false,
"role_switch_in_progress_at" timestamp with time zone,
"account_status" text DEFAULT 'active'::text NOT NULL,
"account_moderation_reason" text,
"account_moderated_at" timestamp with time zone,
"account_moderated_by" uuid
);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_account_status_check" CHECK (account_status = ANY (ARRAY['active'::text, 'suspended'::text, 'banned'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_participant_type_check" CHECK (participant_type = ANY (ARRAY['buyer'::text, 'seller'::text, 'agent'::text, 'developer'::text, 'professional'::text, 'investor'::text, 'institutional'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_user_id_key" UNIQUE (user_id);
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."profiles" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."profiles" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."profiles" TO service_role;
GRANT UPDATE ("first_name") ON public."profiles" TO authenticated;
GRANT UPDATE ("last_name") ON public."profiles" TO authenticated;
GRANT UPDATE ("display_name") ON public."profiles" TO authenticated;
GRANT UPDATE ("avatar_url") ON public."profiles" TO authenticated;
GRANT UPDATE ("phone") ON public."profiles" TO authenticated;
GRANT UPDATE ("bio") ON public."profiles" TO authenticated;
GRANT UPDATE ("city") ON public."profiles" TO authenticated;
GRANT UPDATE ("country") ON public."profiles" TO authenticated;
GRANT UPDATE ("website_url") ON public."profiles" TO authenticated;
GRANT UPDATE ("video_link") ON public."profiles" TO authenticated;
GRANT UPDATE ("participant_type") ON public."profiles" TO authenticated;
CREATE TABLE public."organizations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"slug" text NOT NULL,
"plan" text DEFAULT 'free'::text NOT NULL,
"procurement_status" text DEFAULT 'not_started'::text NOT NULL,
"security_review_status" text DEFAULT 'not_started'::text NOT NULL,
"created_by" uuid,
"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_name_check" CHECK (char_length(btrim(name)) >= 2 AND char_length(btrim(name)) <= 200);
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY (id);
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text, 'internal'::text]));
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_procurement_status_check" CHECK (procurement_status = ANY (ARRAY['not_started'::text, 'in_review'::text, 'approved'::text, 'blocked'::text]));
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_security_review_status_check" CHECK (security_review_status = ANY (ARRAY['not_started'::text, 'in_review'::text, 'approved'::text, 'blocked'::text]));
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_settings_check" CHECK (jsonb_typeof(settings) = 'object'::text);
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_slug_check" CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'::text);
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_slug_key" UNIQUE (slug);
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."organizations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public."organizations" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."organizations" TO service_role;
CREATE TABLE public."organization_memberships" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"organization_id" uuid NOT NULL,
"user_id" uuid NOT NULL,
"role" text DEFAULT 'member'::text NOT NULL,
"status" text DEFAULT 'active'::text NOT NULL,
"invited_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE (organization_id, user_id);
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY (id);
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text, 'billing_admin'::text, 'security_admin'::text]));
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_status_check" CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'suspended'::text]));
ALTER TABLE public."organization_memberships" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."organization_memberships" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE public."organization_memberships" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."organization_memberships" TO service_role;
CREATE TABLE public."listings" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"owner_id" uuid,
"title" text NOT NULL,
"description" text,
"address" text,
"city" text NOT NULL,
"region" text,
"postal_code" text,
"latitude" numeric(10,7),
"longitude" numeric(10,7),
"price" numeric(14,2) NOT NULL,
"price_per_sqm" numeric(10,2),
"sqm" numeric(8,2) NOT NULL,
"bedrooms" integer,
"bathrooms" integer,
"floor" integer,
"total_floors" integer,
"year_built" integer,
"energy_class" text,
"property_type" property_type NOT NULL,
"listing_type" listing_type DEFAULT 'sale'::listing_type NOT NULL,
"status" listing_status DEFAULT 'draft'::listing_status NOT NULL,
"auction_date" timestamp with time zone,
"auction_starting_bid" numeric(14,2),
"auction_court" text,
"has_parking" boolean DEFAULT false,
"has_pool" boolean DEFAULT false,
"has_elevator" boolean DEFAULT false,
"has_garden" boolean DEFAULT false,
"has_storage" boolean DEFAULT false,
"has_security" boolean DEFAULT false,
"has_smart_home" boolean DEFAULT false,
"has_video_tour" boolean DEFAULT false,
"has_virtual_tour" boolean DEFAULT false,
"views_count" integer DEFAULT 0 NOT NULL,
"ai_score" integer,
"cadastre_number" text,
"enfia_zone" text,
"tags" text[],
"cover_image_url" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"wc_count" integer,
"kitchens" integer,
"living_rooms" integer,
"levels" integer,
"heating_system" text,
"construction_status" text,
"has_ac" boolean DEFAULT false,
"has_solar_water" boolean DEFAULT false,
"has_fireplace" boolean DEFAULT false,
"has_underfloor_heating" boolean DEFAULT false,
"has_furnished" boolean DEFAULT false,
"has_alarm" boolean DEFAULT false,
"has_cctv" boolean DEFAULT false,
"has_secure_door" boolean DEFAULT false,
"has_internal_staircase" boolean DEFAULT false,
"has_double_glazing" boolean DEFAULT false,
"has_window_screens" boolean DEFAULT false,
"has_night_power" boolean DEFAULT false,
"has_attic" boolean DEFAULT false,
"has_satellite" boolean DEFAULT false,
"has_painted" boolean DEFAULT false,
"has_balcony" boolean DEFAULT false,
"has_view" boolean DEFAULT false,
"has_facade" boolean DEFAULT false,
"has_awning" boolean DEFAULT false,
"has_disability_access" boolean DEFAULT false,
"is_corner" boolean DEFAULT false,
"is_penthouse" boolean DEFAULT false,
"is_neoclassical" boolean DEFAULT false,
"is_preserved" boolean DEFAULT false,
"suitable_student" boolean DEFAULT false,
"suitable_holiday" boolean DEFAULT false,
"suitable_investment" boolean DEFAULT false,
"suitable_commercial_use" boolean DEFAULT false,
"deposit_months" integer,
"monthly_expenses" numeric,
"agent_fee_included" boolean DEFAULT false,
"pets_allowed" boolean DEFAULT false,
"short_term_rental" boolean DEFAULT false,
"available_from" date,
"min_rental_months" integer,
"is_buildable" boolean DEFAULT false,
"within_city_plan" boolean DEFAULT false,
"within_settlement" boolean DEFAULT false,
"coverage_ratio" numeric,
"building_allowance" numeric,
"facade_length" numeric,
"plot_depth" numeric,
"slope" text,
"zone_type" text,
"road_type" text,
"has_water_supply" boolean DEFAULT false,
"has_electricity_supply" boolean DEFAULT false,
"land_use" text,
"distance_from_sea" integer,
"distance_from_city" integer,
"has_land_concession" boolean DEFAULT false,
"plot_surface" numeric,
"commercial_subtype" text,
"floor_height" numeric,
"has_three_phase_power" boolean DEFAULT false,
"has_loading_dock" boolean DEFAULT false,
"has_structured_cabling" boolean DEFAULT false,
"has_equipped" boolean DEFAULT false,
"website_url" text,
"is_featured" boolean DEFAULT false NOT NULL,
"priority_placement" integer DEFAULT 0 NOT NULL,
"is_off_market" boolean DEFAULT false NOT NULL,
"is_pre_sale" boolean DEFAULT false NOT NULL,
"project_id" uuid,
"open_house_date" timestamp with time zone,
"featured_until" timestamp with time zone,
"walkability_score" smallint,
"safety_score" smallint,
"noise_score" smallint,
"open_house_transaction_type" text,
"organization_id" uuid,
"location_search_text" text GENERATED ALWAYS AS (expand_location_search_aliases(normalize_location_text(((((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(address, ''::text)) || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || COALESCE(region, ''::text)) || ' '::text) || COALESCE(postal_code, ''::text))))) STORED,
"priority_until" timestamp with time zone,
"os_auction_id" text GENERATED ALWAYS AS (
CASE
    WHEN (listing_type = 'auction'::listing_type) THEN private.extract_os_auction_id(tags)
    ELSE NULL::text
END) STORED
);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_new_build_ads_are_not_legacy_pre_sale" CHECK (listing_type <> 'new_build'::listing_type OR COALESCE(is_pre_sale, false) = false);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_noise_score_check" CHECK (noise_score >= 1 AND noise_score <= 10);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_open_house_transaction_type_check" CHECK (open_house_transaction_type IS NULL OR listing_type = 'open_house'::listing_type AND (open_house_transaction_type = ANY (ARRAY['sale'::text, 'rent'::text])));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_os_auction_source_identity_valid" CHECK (NOT COALESCE(tags, '{}'::text[]) @> ARRAY['source:maiprop-os'::text] OR COALESCE(tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine'::text] OR listing_type = 'auction'::listing_type AND private.extract_os_auction_id(tags) IS NOT NULL);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_pkey" PRIMARY KEY (id);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_priority_placement_boolean_check" CHECK (priority_placement = ANY (ARRAY[0, 1]));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_project_ads_are_new_build" CHECK (project_id IS NULL OR listing_type = 'new_build'::listing_type);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_safety_score_check" CHECK (safety_score >= 0 AND safety_score <= 100);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_tenant_rows_keep_user_owner" CHECK (organization_id IS NULL OR owner_id IS NOT NULL);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_walkability_score_check" CHECK (walkability_score >= 0 AND walkability_score <= 100);
ALTER TABLE public."listings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."listings" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."listings" TO service_role;
CREATE TABLE public."listing_images" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid NOT NULL,
"url" text NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."listing_images" ADD CONSTRAINT "listing_images_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_images" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."listing_images" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."listing_images" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."listing_images" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."listing_images" TO service_role;
CREATE TABLE public."open_house_settings" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid NOT NULL,
"timeslots" jsonb DEFAULT '[]'::jsonb,
"max_visitors_per_slot" integer DEFAULT 10,
"max_total_visitors" integer,
"broker_required" boolean DEFAULT false,
"require_proof_of_funds" boolean DEFAULT false,
"min_proof_amount" numeric,
"require_investor_declaration" boolean DEFAULT false,
"offer_deadline" timestamp with time zone,
"allow_sealed_bids" boolean DEFAULT true,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."open_house_settings" ADD CONSTRAINT "open_house_settings_listing_id_key" UNIQUE (listing_id);
ALTER TABLE public."open_house_settings" ADD CONSTRAINT "open_house_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."open_house_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."open_house_settings" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_settings" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_settings" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_settings" TO service_role;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_account_moderated_by_fkey" FOREIGN KEY (account_moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public."listings" ADD CONSTRAINT "listings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public."listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."open_house_settings" ADD CONSTRAINT "open_house_settings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION private.authoritative_role(_user_id uuid)
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role
  from public.profiles
  where user_id = _user_id
  limit 1
$function$
;
REVOKE ALL ON FUNCTION private.authoritative_role(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.authoritative_role(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.authoritative_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.authoritative_role((select auth.uid()))
$function$
;
REVOKE ALL ON FUNCTION private.authoritative_role() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.authoritative_role() TO service_role;
GRANT EXECUTE ON FUNCTION private.authoritative_role() TO authenticated;
CREATE OR REPLACE FUNCTION private.has_platform_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.authoritative_role(_user_id) = 'admin'::public.user_role
$function$
;
REVOKE ALL ON FUNCTION private.has_platform_admin(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_platform_admin(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.has_org_permission(p_org_id uuid, p_permission text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH active_membership AS (
    SELECT memberships.role
    FROM public.organization_memberships memberships
    WHERE memberships.organization_id = p_org_id
      AND memberships.user_id = p_user_id
      AND memberships.status = 'active'
    LIMIT 1
  )
  SELECT COALESCE(
    CASE
      WHEN p_org_id IS NULL OR p_permission IS NULL OR p_user_id IS NULL THEN false
      WHEN private.has_platform_admin(p_user_id) THEN true
      WHEN p_permission = ANY(ARRAY['organization:view', 'membership:view']) THEN
        EXISTS (SELECT 1 FROM active_membership)
      WHEN p_permission = ANY(ARRAY['listing:view', 'project:view']) THEN
        EXISTS (SELECT 1 FROM active_membership)
      WHEN p_permission = 'organization:update' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'billing_admin', 'security_admin'])
        )
      WHEN p_permission = 'membership:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin'])
        )
      WHEN p_permission = 'membership:manage_owner' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = 'owner'
        )
      WHEN p_permission = 'domain:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = 'sso:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = ANY(ARRAY['listing:manage', 'project:manage']) THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'member'])
        )
      WHEN p_permission = ANY(ARRAY['procurement:view', 'procurement:manage']) THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'billing_admin', 'security_admin'])
        )
      WHEN p_permission = 'audit:read' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = 'audit:append' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      ELSE false
    END,
    false
  )
$function$
;
REVOKE ALL ON FUNCTION private.has_org_permission(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_org_permission(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.has_org_permission(uuid,text,uuid) TO authenticated;
CREATE VIEW public.listing_management_catalogue WITH (security_invoker=true,security_barrier=true) AS  SELECT id,
    owner_id,
    title,
    description,
    address,
    city,
    region,
    postal_code,
    latitude,
    longitude,
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
    status,
    auction_date,
    auction_starting_bid,
    auction_court,
    has_parking,
    has_pool,
    has_elevator,
    has_garden,
    has_storage,
    has_security,
    has_smart_home,
    has_video_tour,
    has_virtual_tour,
    views_count,
    ai_score,
    cadastre_number,
    enfia_zone,
    tags,
    cover_image_url,
    created_at,
    updated_at,
    wc_count,
    kitchens,
    living_rooms,
    levels,
    heating_system,
    construction_status,
    has_ac,
    has_solar_water,
    has_fireplace,
    has_underfloor_heating,
    has_furnished,
    has_alarm,
    has_cctv,
    has_secure_door,
    has_internal_staircase,
    has_double_glazing,
    has_window_screens,
    has_night_power,
    has_attic,
    has_satellite,
    has_painted,
    has_balcony,
    has_view,
    has_facade,
    has_awning,
    has_disability_access,
    is_corner,
    is_penthouse,
    is_neoclassical,
    is_preserved,
    suitable_student,
    suitable_holiday,
    suitable_investment,
    suitable_commercial_use,
    deposit_months,
    monthly_expenses,
    agent_fee_included,
    pets_allowed,
    short_term_rental,
    available_from,
    min_rental_months,
    is_buildable,
    within_city_plan,
    within_settlement,
    coverage_ratio,
    building_allowance,
    facade_length,
    plot_depth,
    slope,
    zone_type,
    road_type,
    has_water_supply,
    has_electricity_supply,
    land_use,
    distance_from_sea,
    distance_from_city,
    has_land_concession,
    plot_surface,
    commercial_subtype,
    floor_height,
    has_three_phase_power,
    has_loading_dock,
    has_structured_cabling,
    has_equipped,
    website_url,
    is_featured,
    priority_placement,
    is_off_market,
    is_pre_sale,
    project_id,
    open_house_date,
    featured_until,
    walkability_score,
    safety_score,
    noise_score,
    open_house_transaction_type,
    organization_id,
    location_search_text,
    priority_until,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('url', image.url, 'sort_order', image.sort_order) ORDER BY image.sort_order, image.id) AS jsonb_agg
           FROM listing_images image
          WHERE image.listing_id = listing.id), '[]'::jsonb) AS listing_images,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('offer_deadline', settings.offer_deadline) ORDER BY settings.created_at, settings.id) AS jsonb_agg
           FROM open_house_settings settings
          WHERE settings.listing_id = listing.id), '[]'::jsonb) AS open_house_settings
   FROM listings listing
  WHERE (( SELECT auth.uid() AS uid)) IS NOT NULL AND (owner_id = (( SELECT auth.uid() AS uid)) OR organization_id IS NOT NULL AND private.has_org_permission(organization_id, 'listing:view'::text, ( SELECT auth.uid() AS uid)) OR private.has_platform_admin(( SELECT auth.uid() AS uid)));
REVOKE ALL ON TABLE public.listing_management_catalogue FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_listing_management_catalogue()
 RETURNS SETOF listing_management_catalogue
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT catalogue.*
  FROM public.listing_management_catalogue AS catalogue;
$function$
;
REVOKE ALL ON FUNCTION public.get_listing_management_catalogue() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_listing_management_catalogue() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_listing_management_catalogue() TO authenticated;
