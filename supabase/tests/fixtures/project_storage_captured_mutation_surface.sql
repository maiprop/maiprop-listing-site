-- Bounded captured A6b mutation fixture. Synthetic data only.
-- PG16 mapping of captured PG17 schema; managed auth/storage/Vault/net implementations omitted.
-- Auth/users, addon_purchases and user_roles provisioning triggers excluded (setup targets only).
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database() OR inet_server_addr() IS NOT NULL OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921') THEN RAISE EXCEPTION 'Explicit matching Task7b disposable socket database required'; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA storage; CREATE SCHEMA net; CREATE SCHEMA vault;
CREATE EXTENSION pgcrypto; CREATE EXTENSION pg_trgm;
SET check_function_bodies=off;
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
CREATE TYPE public.listing_status AS ENUM ('draft','active','paused','sold','rented','expired');
CREATE TYPE public.listing_type AS ENUM ('sale','rent','auction','firesale','open_house','new_build');
CREATE TYPE public.property_type AS ENUM ('apartment','house','villa','land','commercial','office','studio','maisonette','warehouse','hotel','mixed_use','parking','storage');
CREATE TYPE public.user_role AS ENUM ('buyer','agent','professional','seller','admin','investor','institutional','developer');
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TYPE public.oh_id_doc_type AS ENUM ('id_card','passport');
CREATE TYPE public.oh_offer_status AS ENUM ('submitted','revealed','accepted','rejected','withdrawn');
CREATE TYPE public.oh_registration_status AS ENUM ('pending','approved','rejected','attended','cancelled');
CREATE TYPE public.professional_category AS ENUM ('architect','civil_engineer','lawyer','notary','electrician','plumber','contractor','property_manager','valuer','interior_designer','financial_advisor','real_estate_agent','insurance_broker','utility_certification_provider','esg_sustainability_consultant','relocation_immigration_consultant','facility_manager','short_term_rental_operator','hotel_hospitality_operator','marketing_agency','crm_listing_data_provider','concrete_contractor','steel_structure_contractor','carpenter','tile_installer','painter','building_permit_consultant','urban_planning_consultant','legalization_specialist','energy_certificate_inspector','building_regulation_consultant','fire_protection_consultant','drywall_installer','waterproofing_specialist','insulation_contractor','roofing_contractor','window_aluminum_installer','elevator_installer','smart_home_installer');
CREATE TYPE public.viewing_status AS ENUM ('pending','confirmed','cancelled','completed');
CREATE TYPE public.viewing_type AS ENUM ('in_person','video');
CREATE TYPE storage.buckettype AS ENUM ('STANDARD','ANALYTICS','VECTOR');
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
CREATE TABLE public."billing_customers" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"stripe_customer_id" text NOT NULL,
"email" text,
"runtime_mode" text DEFAULT 'test'::text NOT NULL,
"livemode" boolean DEFAULT false NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."billing_customers" ADD CONSTRAINT "billing_customers_pkey" PRIMARY KEY (id);
ALTER TABLE public."billing_customers" ADD CONSTRAINT "billing_customers_runtime_mode_check" CHECK (runtime_mode = ANY (ARRAY['test'::text, 'live'::text]));
ALTER TABLE public."billing_customers" ADD CONSTRAINT "billing_customers_stripe_customer_id_key" UNIQUE (stripe_customer_id);
ALTER TABLE public."billing_customers" ADD CONSTRAINT "billing_customers_user_id_runtime_mode_key" UNIQUE (user_id, runtime_mode);
ALTER TABLE public."billing_customers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."billing_customers" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public."billing_customers" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."billing_customers" TO service_role;
CREATE TABLE public."billing_subscriptions" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"stripe_customer_id" text NOT NULL,
"stripe_subscription_id" text NOT NULL,
"stripe_product_id" text,
"stripe_price_id" text,
"plan_key" text,
"audience" text,
"status" text NOT NULL,
"billing_cycle" text,
"current_period_start" timestamp with time zone,
"current_period_end" timestamp with time zone,
"cancel_at_period_end" boolean DEFAULT false NOT NULL,
"trial_start" timestamp with time zone,
"trial_end" timestamp with time zone,
"runtime_mode" text DEFAULT 'test'::text NOT NULL,
"livemode" boolean DEFAULT false NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"state_source" text DEFAULT 'legacy'::text NOT NULL,
"state_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
"stripe_event_id" text,
"stripe_event_created_at" timestamp with time zone
);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_active_canonical" CHECK ((status <> ALL (ARRAY['active'::text, 'past_due'::text])) OR plan_key IS NOT NULL AND audience IS NOT NULL AND stripe_product_id IS NOT NULL AND stripe_price_id IS NOT NULL);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_active_period_bounded" CHECK ((status <> ALL (ARRAY['active'::text, 'past_due'::text])) OR current_period_end IS NOT NULL);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_cycle_check" CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text]));
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_runtime_livemode_consistent" CHECK ((runtime_mode = 'live'::text) = livemode);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_runtime_mode_check" CHECK (runtime_mode = ANY (ARRAY['test'::text, 'live'::text]));
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_state_source_check" CHECK (state_source = ANY (ARRAY['legacy'::text, 'webhook_canonical'::text, 'reconciliation'::text]));
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_stripe_subscription_id_key" UNIQUE (stripe_subscription_id);
ALTER TABLE public."billing_subscriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."billing_subscriptions" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public."billing_subscriptions" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."billing_subscriptions" TO service_role;
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
CREATE TABLE public."project_leads" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"project_id" uuid NOT NULL,
"name" text NOT NULL,
"email" text,
"phone" text,
"source" text,
"unit_id" text,
"status" text DEFAULT 'new'::text NOT NULL,
"notes" text,
"metadata" jsonb DEFAULT '{}'::jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."project_leads" ADD CONSTRAINT "project_leads_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_leads" ADD CONSTRAINT "project_leads_status_check" CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'converted'::text, 'lost'::text]));
ALTER TABLE public."project_leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_leads" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_leads" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_leads" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_leads" TO service_role;
CREATE TABLE public."project_media" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"project_id" uuid NOT NULL,
"url" text NOT NULL,
"media_type" text NOT NULL,
"title" text,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."project_media" ADD CONSTRAINT "project_media_media_type_check" CHECK (media_type = ANY (ARRAY['rendering'::text, 'floor_plan'::text, 'site_plan'::text, 'brochure_pdf'::text, 'drone'::text, 'walkthrough'::text, 'progress'::text, 'video'::text]));
ALTER TABLE public."project_media" ADD CONSTRAINT "project_media_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_media" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_media" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_media" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_media" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_media" TO service_role;
CREATE TABLE public."project_units" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"project_id" uuid NOT NULL,
"unit_id" text,
"floor" integer,
"unit_number" text,
"availability_status" text DEFAULT 'available'::text NOT NULL,
"internal_sqm" numeric(8,2),
"balcony_sqm" numeric(6,2),
"storage_sqm" numeric(6,2),
"parking_sqm" numeric(6,2),
"bedrooms" integer,
"bathrooms" integer,
"kitchen_type" text,
"living_rooms" integer,
"price" numeric(14,2),
"price_per_sqm" numeric(10,2),
"vat_included" boolean DEFAULT true,
"parking_price" numeric(10,2),
"storage_price" numeric(10,2),
"sea_view" boolean DEFAULT false,
"city_view" boolean DEFAULT false,
"mountain_view" boolean DEFAULT false,
"energy_class" text,
"heating_system" text,
"cooling_system" text,
"listing_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."project_units" ADD CONSTRAINT "project_units_availability_status_check" CHECK (availability_status = ANY (ARRAY['available'::text, 'reserved'::text, 'sold'::text]));
ALTER TABLE public."project_units" ADD CONSTRAINT "project_units_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_units" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."project_units" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_units" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_units" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."project_units" TO service_role;
CREATE TABLE public."projects" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"owner_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"city" text,
"address" text,
"cover_image_url" text,
"status" text DEFAULT 'active'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"building_permit_number" text,
"developer_company" text,
"architect_group" text,
"construction_company" text,
"municipality" text,
"latitude" numeric(10,7),
"longitude" numeric(10,7),
"area_description" text,
"permit_approval_date" date,
"construction_start_date" date,
"structural_completion_date" date,
"delivery_date" date,
"archived_at" timestamp with time zone,
"organization_id" uuid
);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_tenant_rows_keep_user_owner" CHECK (organization_id IS NULL OR owner_id IS NOT NULL);
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."projects" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."projects" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."projects" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."projects" TO service_role;
CREATE TABLE public."role_switch_history" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"from_type" text NOT NULL,
"to_type" text,
"from_plan_key" text,
"to_plan_key" text,
"switch_kind" text,
"had_active_sub" boolean DEFAULT false NOT NULL,
"sub_cancelled" boolean DEFAULT false NOT NULL,
"switched_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."role_switch_history" ADD CONSTRAINT "role_switch_history_from_type_check" CHECK (from_type = ANY (ARRAY['buyer'::text, 'seller'::text, 'agent'::text, 'developer'::text, 'professional'::text, 'investor'::text, 'institutional'::text]));
ALTER TABLE public."role_switch_history" ADD CONSTRAINT "role_switch_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."role_switch_history" ADD CONSTRAINT "role_switch_history_switch_kind_check" CHECK (switch_kind = ANY (ARRAY['same-tier'::text, 'upgrade'::text, 'downgrade'::text, 'proonly'::text]));
ALTER TABLE public."role_switch_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."role_switch_history" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."role_switch_history" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."role_switch_history" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."role_switch_history" TO service_role;
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
CREATE TABLE public."account_deletion_jobs" (
"user_id" uuid NOT NULL,
"attempt_id" uuid DEFAULT gen_random_uuid() NOT NULL,
"stage" text DEFAULT 'requested'::text NOT NULL,
"status" text DEFAULT 'in_progress'::text NOT NULL,
"attempts" integer DEFAULT 1 NOT NULL,
"last_error" text,
"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
"leased_until" timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
"completed_at" timestamp with time zone
);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_attempts_check" CHECK (attempts > 0);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_completion_state_check" CHECK (status = 'completed'::text AND stage = 'completed'::text AND completed_at IS NOT NULL OR status <> 'completed'::text AND stage <> 'completed'::text AND completed_at IS NULL);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_failure_state_check" CHECK (status = 'failed'::text AND last_error IS NOT NULL OR status <> 'failed'::text AND last_error IS NULL);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_last_error_check" CHECK (last_error IS NULL OR char_length(last_error) <= 128);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_stage_check" CHECK (stage = ANY (ARRAY['requested'::text, 'listings'::text, 'subscriptions'::text, 'storage'::text, 'firesale_photos'::text, 'auth'::text, 'completed'::text]));
ALTER TABLE public."account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'failed'::text, 'completed'::text]));
ALTER TABLE public."account_deletion_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."account_deletion_jobs" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public."account_deletion_jobs" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."account_deletion_jobs" TO service_role;
CREATE TABLE public."consultation_requests" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"professional_id" uuid NOT NULL,
"requester_id" uuid,
"requester_name" text NOT NULL,
"requester_email" text NOT NULL,
"requester_phone" text,
"request_type" text NOT NULL,
"message" text,
"service" text,
"preferred_date" date,
"preferred_time" text,
"callback_time" text,
"status" text DEFAULT 'pending'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"notes" text,
"lead_status" text DEFAULT 'new'::text,
"meeting_type" text
);
ALTER TABLE public."consultation_requests" ADD CONSTRAINT "consultation_requests_lead_status_check" CHECK (lead_status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'converted'::text, 'lost'::text]));
ALTER TABLE public."consultation_requests" ADD CONSTRAINT "consultation_requests_meeting_type_check" CHECK (meeting_type IS NULL OR (meeting_type = ANY (ARRAY['in_person'::text, 'video'::text])));
ALTER TABLE public."consultation_requests" ADD CONSTRAINT "consultation_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."consultation_requests" ADD CONSTRAINT "consultation_requests_request_type_check" CHECK (request_type = ANY (ARRAY['consultation'::text, 'callback'::text, 'message'::text]));
ALTER TABLE public."consultation_requests" ADD CONSTRAINT "consultation_requests_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text]));
ALTER TABLE public."consultation_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."consultation_requests" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."consultation_requests" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."consultation_requests" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."consultation_requests" TO service_role;
CREATE TABLE public."contacts" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"name" text NOT NULL,
"email" text,
"phone" text,
"source" text,
"notes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deal_stage" text DEFAULT 'new'::text NOT NULL,
"follow_up_at" timestamp with time zone,
"listing_id" uuid
);
ALTER TABLE public."contacts" ADD CONSTRAINT "contacts_deal_stage_check" CHECK (deal_stage = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'proposal'::text, 'negotiation'::text, 'won'::text, 'lost'::text]));
ALTER TABLE public."contacts" ADD CONSTRAINT "contacts_pkey" PRIMARY KEY (id);
ALTER TABLE public."contacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."contacts" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."contacts" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."contacts" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."contacts" TO service_role;
CREATE TABLE public."conversations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"last_message_at" timestamp with time zone DEFAULT now(),
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"participant_a" uuid NOT NULL,
"participant_b" uuid NOT NULL,
"listing_id" uuid,
"closed_at" timestamp with time zone,
"closed_reason" text,
"closed_by" uuid
);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."conversations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."conversations" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."conversations" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."conversations" TO service_role;
CREATE TABLE public."favorites" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"listing_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"price_alert" boolean DEFAULT false NOT NULL,
"price_when_saved" numeric
);
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_pkey" PRIMARY KEY (id);
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_user_id_listing_id_key" UNIQUE (user_id, listing_id);
ALTER TABLE public."favorites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."favorites" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."favorites" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."favorites" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."favorites" TO service_role;
CREATE TABLE public."firesale_interest" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"deal_id" uuid NOT NULL,
"investor_id" uuid NOT NULL,
"proof_of_funds_url" text,
"proof_amount" numeric,
"message" text,
"status" text DEFAULT 'interested'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"proof_of_funds_verified_at" timestamp with time zone,
"proof_of_funds_verified_by" uuid,
"reservation_expires_at" timestamp with time zone,
"reserved_at" timestamp with time zone,
"reserved_by" uuid,
"admin_note" text,
"last_status_changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_deal_id_investor_id_key" UNIQUE (deal_id, investor_id);
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_pkey" PRIMARY KEY (id);
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_status_check" CHECK (status = ANY (ARRAY['interested'::text, 'prioritized'::text, 'reserved'::text, 'engaged'::text, 'won'::text, 'passed'::text, 'expired'::text]));
ALTER TABLE public."firesale_interest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."firesale_interest" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest" TO service_role;
CREATE TABLE public."investor_subscriptions" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"tier" text NOT NULL,
"status" text DEFAULT 'active'::text NOT NULL,
"started_at" timestamp with time zone DEFAULT now() NOT NULL,
"expires_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"stripe_customer_id" text,
"stripe_session_id" text,
"activated_at" timestamp with time zone,
"runtime_mode" text DEFAULT 'test'::text NOT NULL,
"livemode" boolean DEFAULT false NOT NULL
);
ALTER TABLE public."investor_subscriptions" ADD CONSTRAINT "investor_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."investor_subscriptions" ADD CONSTRAINT "investor_subscriptions_runtime_mode_valid" CHECK (runtime_mode = ANY (ARRAY['test'::text, 'live'::text]));
ALTER TABLE public."investor_subscriptions" ADD CONSTRAINT "investor_subscriptions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'trial'::text, 'pending_payment'::text]));
ALTER TABLE public."investor_subscriptions" ADD CONSTRAINT "investor_subscriptions_tier_check" CHECK (tier = ANY (ARRAY['private'::text, 'institutional'::text, 'developer'::text]));
ALTER TABLE public."investor_subscriptions" ADD CONSTRAINT "investor_subscriptions_user_id_key" UNIQUE (user_id);
ALTER TABLE public."investor_subscriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."investor_subscriptions" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."investor_subscriptions" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."investor_subscriptions" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."investor_subscriptions" TO service_role;
CREATE TABLE public."leads" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"owner_id" uuid NOT NULL,
"source" text DEFAULT 'manual'::text NOT NULL,
"listing_id" uuid,
"professional_id" uuid,
"project_id" uuid,
"name" text NOT NULL,
"email" text,
"phone" text,
"message" text,
"status" text DEFAULT 'new'::text NOT NULL,
"notes" text,
"follow_up_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"origin_context_key" text DEFAULT 'general'::text NOT NULL
);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_pkey1" PRIMARY KEY (id);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_source_check" CHECK (source = ANY (ARRAY['manual'::text, 'listing_inquiry'::text, 'consultation'::text, 'callback'::text, 'project_inquiry'::text, 'viewing'::text, 'message'::text]));
ALTER TABLE public."leads" ADD CONSTRAINT "leads_status_check" CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'proposal'::text, 'negotiation'::text, 'won'::text, 'lost'::text]));
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."leads" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."leads" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."leads" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."leads" TO service_role;
CREATE TABLE public."listing_promotion_allocations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid,
"owner_id" uuid,
"promotion_type" text NOT NULL,
"source_type" text NOT NULL,
"status" text DEFAULT 'active'::text NOT NULL,
"billing_subscription_id" uuid,
"addon_purchase_id" uuid,
"request_key" text NOT NULL,
"plan_cycle_start" date,
"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
"ends_at" timestamp with time zone NOT NULL,
"revoked_at" timestamp with time zone,
"revoke_reason" text,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"listing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
"owner_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_active_requires_listing" CHECK (status <> 'active'::text OR listing_id IS NOT NULL);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_check" CHECK (ends_at > starts_at);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_check1" CHECK (source_type = 'plan'::text AND billing_subscription_id IS NOT NULL AND addon_purchase_id IS NULL OR source_type = 'addon'::text AND addon_purchase_id IS NOT NULL OR source_type = 'admin'::text AND billing_subscription_id IS NULL AND addon_purchase_id IS NULL);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_owner_id_request_key_promotio_key" UNIQUE (owner_id, request_key, promotion_type);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_promotion_type_check" CHECK (promotion_type = ANY (ARRAY['spotlight'::text, 'priority'::text]));
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_source_type_check" CHECK (source_type = ANY (ARRAY['plan'::text, 'addon'::text, 'admin'::text]));
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text]));
ALTER TABLE public."listing_promotion_allocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."listing_promotion_allocations" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public."listing_promotion_allocations" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE public."listing_promotion_allocations" TO service_role;
CREATE TABLE public."notifications" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"title" text NOT NULL,
"body" text,
"type" text DEFAULT 'general'::text NOT NULL,
"read" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"link" text
);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notifications" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."notifications" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."notifications" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."notifications" TO service_role;
CREATE TABLE public."open_house_offers" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid NOT NULL,
"bidder_id" uuid NOT NULL,
"amount" numeric NOT NULL,
"currency" text DEFAULT 'EUR'::text,
"message" text,
"status" oh_offer_status DEFAULT 'submitted'::oh_offer_status,
"submitted_at" timestamp with time zone DEFAULT now(),
"revealed_at" timestamp with time zone,
"decided_by" uuid,
"decided_at" timestamp with time zone
);
ALTER TABLE public."open_house_offers" ADD CONSTRAINT "open_house_offers_listing_id_bidder_id_key" UNIQUE (listing_id, bidder_id);
ALTER TABLE public."open_house_offers" ADD CONSTRAINT "open_house_offers_pkey" PRIMARY KEY (id);
ALTER TABLE public."open_house_offers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."open_house_offers" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_offers" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_offers" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_offers" TO service_role;
CREATE TABLE public."open_house_registrations" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid NOT NULL,
"requester_id" uuid NOT NULL,
"timeslot_index" integer,
"id_doc_type" oh_id_doc_type,
"id_doc_url" text,
"id_verified_at" timestamp with time zone,
"waiver_signed_at" timestamp with time zone,
"waiver_url" text,
"proof_of_funds_url" text,
"proof_amount" numeric,
"investor_declaration_signed_at" timestamp with time zone,
"status" oh_registration_status DEFAULT 'pending'::oh_registration_status,
"approved_by" uuid,
"approved_at" timestamp with time zone,
"rejection_reason" text,
"attended_at" timestamp with time zone,
"note" text,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"mortgage_status" text,
"budget_range" text,
"working_with_agent" text,
"screening_doc_url" text,
"screening_score" integer GENERATED ALWAYS AS (((
CASE
    WHEN (mortgage_status = 'yes'::text) THEN 2
    ELSE 0
END +
CASE
    WHEN (working_with_agent = 'yes'::text) THEN 1
    ELSE 0
END) +
CASE
    WHEN (screening_doc_url IS NOT NULL) THEN 2
    ELSE 0
END)) STORED,
"pof_verified_status" text DEFAULT 'unreviewed'::text,
"contact_name" text,
"contact_email" text,
"contact_phone" text,
"visit_purpose" text,
"contact_permission_at" timestamp with time zone,
"id_verification_consent_at" timestamp with time zone,
"privacy_acknowledged_at" timestamp with time zone,
"pof_rejection_reason" text
);
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_listing_id_requester_id_key" UNIQUE (listing_id, requester_id);
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_pkey" PRIMARY KEY (id);
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_pof_verified_status_check" CHECK (pof_verified_status = ANY (ARRAY['unreviewed'::text, 'verified'::text, 'rejected'::text]));
ALTER TABLE public."open_house_registrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."open_house_registrations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_registrations" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_registrations" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."open_house_registrations" TO service_role;
CREATE TABLE public."pricing_configs" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"key" text NOT NULL,
"label" text NOT NULL,
"description" text,
"audience" text NOT NULL,
"module" text NOT NULL,
"unit" text DEFAULT 'monthly'::text NOT NULL,
"currency" text DEFAULT 'EUR'::text NOT NULL,
"amount" numeric(14,2) DEFAULT 0 NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."pricing_configs" ADD CONSTRAINT "pricing_configs_key_key" UNIQUE (key);
ALTER TABLE public."pricing_configs" ADD CONSTRAINT "pricing_configs_pkey" PRIMARY KEY (id);
ALTER TABLE public."pricing_configs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."pricing_configs" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."pricing_configs" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."pricing_configs" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."pricing_configs" TO service_role;
CREATE TABLE public."professionals" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"category" professional_category NOT NULL,
"title" text NOT NULL,
"bio" text,
"city" text,
"experience_years" integer,
"license_number" text,
"verified" boolean DEFAULT false NOT NULL,
"rating" numeric(3,2) DEFAULT 0,
"reviews_count" integer DEFAULT 0,
"projects_count" integer DEFAULT 0,
"specialties" text[],
"languages" text[],
"hourly_rate" numeric(10,2),
"avatar_url" text,
"website_url" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"display_name" text,
"video_link" text,
"calendar_notes" text,
"subscription_tier" text DEFAULT 'free'::text,
"average_deal_size" text,
"average_portfolio_asset_size" text,
"notes" text,
"archived_at" timestamp with time zone,
"rejection_reason" text,
"verified_at" timestamp with time zone
);
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_pkey" PRIMARY KEY (id);
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_user_id_key" UNIQUE (user_id);
ALTER TABLE public."professionals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."professionals" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professionals" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professionals" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professionals" TO service_role;
CREATE TABLE public."profiles_public" (
"user_id" uuid NOT NULL,
"display_name" text,
"avatar_url" text,
"first_name" text,
"last_name" text,
"role" user_role,
"owner_participant_type" text
);
ALTER TABLE public."profiles_public" ADD CONSTRAINT "profiles_public_owner_participant_type_check" CHECK (owner_participant_type IS NULL OR (owner_participant_type = ANY (ARRAY['agent'::text, 'seller'::text])));
ALTER TABLE public."profiles_public" ADD CONSTRAINT "profiles_public_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."profiles_public" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."profiles_public" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."profiles_public" TO service_role;
CREATE TABLE public."viewings" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"listing_id" uuid NOT NULL,
"requester_id" uuid NOT NULL,
"owner_id" uuid NOT NULL,
"viewing_type" viewing_type DEFAULT 'in_person'::viewing_type NOT NULL,
"status" viewing_status DEFAULT 'pending'::viewing_status NOT NULL,
"scheduled_at" timestamp with time zone NOT NULL,
"note" text,
"video_link" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."viewings" ADD CONSTRAINT "viewings_pkey" PRIMARY KEY (id);
ALTER TABLE public."viewings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."viewings" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."viewings" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."viewings" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."viewings" TO service_role;
CREATE TABLE private."billing_runtime_config" (
"singleton" boolean DEFAULT true NOT NULL,
"runtime_mode" text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE private."billing_runtime_config" ADD CONSTRAINT "billing_runtime_config_pkey" PRIMARY KEY (singleton);
ALTER TABLE private."billing_runtime_config" ADD CONSTRAINT "billing_runtime_config_runtime_mode_check" CHECK (runtime_mode = ANY (ARRAY['test'::text, 'live'::text]));
ALTER TABLE private."billing_runtime_config" ADD CONSTRAINT "billing_runtime_config_singleton_check" CHECK (singleton);
REVOKE ALL ON TABLE private."billing_runtime_config" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE ON TABLE private."billing_runtime_config" TO service_role;
CREATE TABLE public."firesale_interest_audit_log" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"interest_id" uuid NOT NULL,
"deal_id" uuid NOT NULL,
"actor_id" uuid,
"action" text NOT NULL,
"from_status" text,
"to_status" text,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."firesale_interest_audit_log" ADD CONSTRAINT "firesale_interest_audit_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."firesale_interest_audit_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."firesale_interest_audit_log" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest_audit_log" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest_audit_log" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_interest_audit_log" TO service_role;
CREATE TABLE public."firesale_requests" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid,
"address" text NOT NULL,
"city" text NOT NULL,
"sqm" numeric(8,2) NOT NULL,
"condition" text,
"property_type" property_type,
"bedrooms" integer,
"asking_price" numeric(14,2),
"ai_estimate" numeric(14,2),
"offer_price" numeric(14,2),
"status" text DEFAULT 'pending'::text NOT NULL,
"contact_email" text NOT NULL,
"contact_phone" text,
"notes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"admin_notes" text,
"published_to_investors" boolean DEFAULT false NOT NULL,
"seller_response" text,
"seller_response_price" numeric,
"seller_responded_at" timestamp with time zone
);
ALTER TABLE public."firesale_requests" ADD CONSTRAINT "firesale_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."firesale_requests" ADD CONSTRAINT "firesale_requests_seller_response_check" CHECK (seller_response IS NULL OR (seller_response = ANY (ARRAY['accepted'::text, 'countered'::text, 'rejected'::text])));
ALTER TABLE public."firesale_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."firesale_requests" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_requests" TO anon;
GRANT SELECT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_requests" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."firesale_requests" TO service_role;
CREATE TABLE public."professional_availability" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"professional_id" uuid NOT NULL,
"day_of_week" smallint NOT NULL,
"start_time" time without time zone NOT NULL,
"end_time" time without time zone NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."professional_availability" ADD CONSTRAINT "professional_availability_day_of_week_check" CHECK (day_of_week >= 0 AND day_of_week <= 6);
ALTER TABLE public."professional_availability" ADD CONSTRAINT "professional_availability_pkey" PRIMARY KEY (id);
ALTER TABLE public."professional_availability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."professional_availability" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professional_availability" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professional_availability" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."professional_availability" TO service_role;
CREATE TABLE auth."users" (
"instance_id" uuid,
"id" uuid NOT NULL,
"aud" character varying(255),
"role" character varying(255),
"email" character varying(255),
"encrypted_password" character varying(255),
"email_confirmed_at" timestamp with time zone,
"invited_at" timestamp with time zone,
"confirmation_token" character varying(255),
"confirmation_sent_at" timestamp with time zone,
"recovery_token" character varying(255),
"recovery_sent_at" timestamp with time zone,
"email_change_token_new" character varying(255),
"email_change" character varying(255),
"email_change_sent_at" timestamp with time zone,
"last_sign_in_at" timestamp with time zone,
"raw_app_meta_data" jsonb,
"raw_user_meta_data" jsonb,
"is_super_admin" boolean,
"created_at" timestamp with time zone,
"updated_at" timestamp with time zone,
"phone" text DEFAULT NULL::character varying,
"phone_confirmed_at" timestamp with time zone,
"phone_change" text DEFAULT ''::character varying,
"phone_change_token" character varying(255) DEFAULT ''::character varying,
"phone_change_sent_at" timestamp with time zone,
"confirmed_at" timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
"email_change_token_current" character varying(255) DEFAULT ''::character varying,
"email_change_confirm_status" smallint DEFAULT 0,
"banned_until" timestamp with time zone,
"reauthentication_token" character varying(255) DEFAULT ''::character varying,
"reauthentication_sent_at" timestamp with time zone,
"is_sso_user" boolean DEFAULT false NOT NULL,
"deleted_at" timestamp with time zone,
"is_anonymous" boolean DEFAULT false NOT NULL
);
ALTER TABLE auth."users" ADD CONSTRAINT "users_email_change_confirm_status_check" CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);
ALTER TABLE auth."users" ADD CONSTRAINT "users_phone_key" UNIQUE (phone);
ALTER TABLE auth."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE auth."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE auth."users" FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public."addon_purchases" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"addon_key" text NOT NULL,
"module" text NOT NULL,
"audience" text NOT NULL,
"unit" text NOT NULL,
"quantity" integer DEFAULT 1 NOT NULL,
"checkout_mode" text NOT NULL,
"status" text DEFAULT 'paid'::text NOT NULL,
"stripe_session_id" text NOT NULL,
"stripe_subscription_id" text,
"stripe_customer_id" text,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"credits_granted" integer DEFAULT 0 NOT NULL,
"credits_consumed" integer DEFAULT 0 NOT NULL,
"credits_refunded" integer DEFAULT 0 NOT NULL,
"refund_status" text DEFAULT 'none'::text NOT NULL,
"last_refund_id" text,
"refunded_at" timestamp with time zone,
"stripe_payment_intent_id" text,
"runtime_mode" text DEFAULT 'test'::text NOT NULL,
"livemode" boolean DEFAULT false NOT NULL,
"stripe_charge_id" text,
"stripe_invoice_id" text,
"stripe_amount_total" bigint,
"stripe_currency" text
);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_checkout_mode_check" CHECK (checkout_mode = ANY (ARRAY['payment'::text, 'subscription'::text]));
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_credits_consumed_lte_granted" CHECK (credits_consumed <= credits_granted);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_credits_consumed_nonnegative" CHECK (credits_consumed >= 0);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_credits_granted_nonnegative" CHECK (credits_granted >= 0);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_credits_refunded_nonnegative" CHECK (credits_refunded >= 0);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_pkey" PRIMARY KEY (id);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_quantity_check" CHECK (quantity > 0);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_refund_status_valid" CHECK (refund_status = ANY (ARRAY['none'::text, 'partial_refund'::text, 'refunded'::text, 'failed'::text]));
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_runtime_livemode_consistent" CHECK ((runtime_mode = 'live'::text) = livemode);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_runtime_mode_valid" CHECK (runtime_mode = ANY (ARRAY['test'::text, 'live'::text]));
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_status_check" CHECK (status = ANY (ARRAY['paid'::text, 'active'::text, 'cancelled'::text, 'refunded'::text]));
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_stripe_amount_total_positive" CHECK (stripe_amount_total IS NULL OR stripe_amount_total > 0);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_stripe_currency_normalized" CHECK (stripe_currency IS NULL OR stripe_currency ~ '^[a-z]{3}$'::text);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_stripe_session_id_key" UNIQUE (stripe_session_id);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_stripe_session_runtime_consistent" CHECK (stripe_session_id IS NULL OR stripe_session_id ~~ 'cs_live_%'::text AND runtime_mode = 'live'::text AND livemode IS TRUE OR stripe_session_id ~~ 'cs_test_%'::text AND runtime_mode = 'test'::text AND livemode IS FALSE OR stripe_session_id !~~ 'cs_live_%'::text AND stripe_session_id !~~ 'cs_test_%'::text);
ALTER TABLE public."addon_purchases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."addon_purchases" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public."addon_purchases" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."addon_purchases" TO service_role;
CREATE TABLE public."user_roles" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"role" app_role NOT NULL
);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE (user_id, role);
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."user_roles" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."user_roles" TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."user_roles" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public."user_roles" TO service_role;
CREATE TABLE vault."decrypted_secrets" (
"id" uuid,
"name" text,
"description" text,
"secret" text,
"decrypted_secret" text,
"key_id" uuid,
"nonce" bytea,
"created_at" timestamp with time zone,
"updated_at" timestamp with time zone
);
REVOKE ALL ON TABLE vault."decrypted_secrets" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,DELETE ON TABLE vault."decrypted_secrets" TO service_role;
CREATE TABLE net."_http_response" (
"id" bigint,
"status_code" integer,
"content_type" text,
"headers" jsonb,
"content" text,
"timed_out" boolean,
"error_msg" text,
"created" timestamp with time zone DEFAULT now() NOT NULL
);
REVOKE ALL ON TABLE net."_http_response" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE net."_http_response" TO PUBLIC;
CREATE TABLE storage."buckets" (
"id" text NOT NULL,
"name" text NOT NULL,
"owner" uuid,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"public" boolean DEFAULT false,
"avif_autodetection" boolean DEFAULT false,
"file_size_limit" bigint,
"allowed_mime_types" text[],
"owner_id" text,
"type" storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
"versioning_status" text DEFAULT 'DISABLED'::text NOT NULL
);
ALTER TABLE storage."buckets" ADD CONSTRAINT "buckets_pkey" PRIMARY KEY (id);
ALTER TABLE storage."buckets" ADD CONSTRAINT "buckets_versioning_dark_check" CHECK (versioning_status = 'DISABLED'::text);
ALTER TABLE storage."buckets" ADD CONSTRAINT "buckets_versioning_standard_only_check" CHECK (type = 'STANDARD'::storage.buckettype OR versioning_status = 'DISABLED'::text);
ALTER TABLE storage."buckets" ADD CONSTRAINT "buckets_versioning_status_check" CHECK (versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text]));
ALTER TABLE storage."buckets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE storage."buckets" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."buckets" TO service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."buckets" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."buckets" TO anon;
CREATE TABLE storage."objects" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"bucket_id" text,
"name" text,
"owner" uuid,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"last_accessed_at" timestamp with time zone DEFAULT now(),
"metadata" jsonb,
"path_tokens" text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
"version" text,
"owner_id" text,
"user_metadata" jsonb,
"archived_at" timestamp with time zone,
"is_delete_marker" boolean DEFAULT false NOT NULL,
"is_versioned" boolean DEFAULT false NOT NULL
);
ALTER TABLE storage."objects" ADD CONSTRAINT "objects_pkey" PRIMARY KEY (id);
ALTER TABLE storage."objects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE storage."objects" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."objects" TO service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."objects" TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE storage."objects" TO anon;
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
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$
;
REVOKE ALL ON FUNCTION auth.role() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;
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
CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission_denied: tenant resource ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION private.guard_tenant_resource_owner_update() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.guard_tenant_resource_owner_update() TO service_role;
CREATE OR REPLACE FUNCTION private.has_developer_listing_access(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT COALESCE(
    private.has_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.user_id = _user_id
        AND profile.role = 'developer'::public.user_role
        AND profile.role_switch_in_progress_at IS NULL
        AND (
          profile.force_pro_access
          OR private.has_current_billing_subscription_for_user(_user_id)
        )
    ),
    FALSE
  )
$function$
;
REVOKE ALL ON FUNCTION private.has_developer_listing_access(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_developer_listing_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.has_developer_listing_access(uuid) TO authenticated;
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
CREATE OR REPLACE FUNCTION public.archive_role_data(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'archive_role_data_user_id_required';
  END IF;

  PERFORM private.cleanup_role_switch_dependencies(p_user_id, p_role);

  IF p_role = 'professional' THEN
    UPDATE public.professionals
    SET archived_at = now(), updated_at = now()
    WHERE user_id = p_user_id AND archived_at IS NULL;
  ELSIF p_role = 'developer' THEN
    UPDATE public.projects
    SET archived_at = now(), updated_at = now()
    WHERE owner_id = p_user_id AND archived_at IS NULL;
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION archive_role_data(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION archive_role_data(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.authoritative_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.authoritative_role(auth.uid())
$function$
;
REVOKE ALL ON FUNCTION authoritative_role() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION authoritative_role() TO service_role;
CREATE OR REPLACE FUNCTION public.authoritative_role(_user_id uuid)
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE(auth.role(), '') AS jwt_role
  )
  SELECT target.role
  FROM public.profiles AS target
  CROSS JOIN caller
  WHERE target.user_id = _user_id
    AND (
      _user_id = caller.uid
      OR caller.jwt_role = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.profiles AS admin_profile
        WHERE admin_profile.user_id = caller.uid
          AND admin_profile.role = 'admin'::public.user_role
      )
    )
  LIMIT 1
$function$
;
REVOKE ALL ON FUNCTION authoritative_role(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION authoritative_role(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.archive_role_data(_user_id, v_role::text);

  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION begin_role_switch_for_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION begin_role_switch_for_user(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.check_listing_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_listing_limit(NEW.owner_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'listing_not_allowed' USING HINT = 'Your account type cannot create listings';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.listings WHERE owner_id = NEW.owner_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'listing_limit_reached' USING HINT = 'Upgrade to Pro for more listings';
  END IF;

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION check_listing_limit() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION check_listing_limit() TO service_role;
CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user(p_user_id uuid, p_role user_role, p_participant_type text, p_display_name text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_role public.user_role;
  v_was_switching boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, role_switch_in_progress_at IS NOT NULL
    INTO v_old_role, v_was_switching
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_old_role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'admin_role_locked';
  END IF;

  IF p_participant_type NOT IN ('buyer','seller','agent','developer','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;

  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;

  IF p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role,
    'developer'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  IF p_role = 'professional'::public.user_role THEN
    IF nullif(trim(coalesce(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.user_id = p_user_id AND pr.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  IF p_role = 'developer'::public.user_role THEN
    IF nullif(trim(coalesce(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF nullif(trim(coalesce(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION complete_onboarding_role_for_user(uuid,user_role,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION complete_onboarding_role_for_user(uuid,user_role,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.get_listing_limit(p_role text, p_is_pro boolean)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_role
    WHEN 'seller'      THEN CASE WHEN p_is_pro THEN 5    ELSE 2  END
    WHEN 'agent'       THEN CASE WHEN p_is_pro THEN NULL ELSE 5  END
    WHEN 'developer'   THEN CASE WHEN p_is_pro THEN NULL ELSE 0  END
    WHEN 'professional'THEN CASE WHEN p_is_pro THEN 5    ELSE 1  END
    WHEN 'buyer'       THEN 0
    WHEN 'admin'       THEN NULL
    ELSE                    CASE WHEN p_is_pro THEN 5    ELSE 2  END
  END;
$function$
;
REVOKE ALL ON FUNCTION get_listing_limit(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_listing_limit(text,boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_listing_limit(text,boolean) TO anon;
GRANT EXECUTE ON FUNCTION get_listing_limit(text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_listing_limit(text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
  v_limit INTEGER;
BEGIN
  v_role := public.authoritative_role(p_user_id)::text;
  v_limit := public.get_listing_limit(v_role, public.is_pro(p_user_id));
  RETURN COALESCE(v_limit, 999);
END;
$function$
;
REVOKE ALL ON FUNCTION get_listing_limit(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_listing_limit(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.authoritative_role(_user_id) = 'admin'::public.user_role, false)
$function$
;
REVOKE ALL ON FUNCTION has_platform_admin(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION has_platform_admin(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT
          profile.role_switch_in_progress_at IS NULL
          AND profile.force_pro_access
        FROM public.profiles AS profile
        WHERE profile.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR private.has_current_billing_subscription_for_user(p_user_id)
    OR private.has_investor_subscription_for_user(p_user_id)
$function$
;
REVOKE ALL ON FUNCTION is_pro(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION is_pro(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.record_role_switch_audit_for_user(_user_id uuid, _from_type text, _to_type text, _switch_kind text, _had_active_sub boolean, _sub_cancelled boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.role_switch_history(
    user_id, from_type, to_type, switch_kind, had_active_sub, sub_cancelled
  ) VALUES (
    _user_id,
    _from_type,
    NULLIF(_to_type, ''),
    _switch_kind,
    _had_active_sub,
    _sub_cancelled
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$
;
REVOKE ALL ON FUNCTION record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION record_role_switch_audit_for_user(uuid,text,text,text,boolean,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.unarchive_role_data(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'unarchive_role_data_user_id_required';
  END IF;

  IF p_role = 'professional' THEN
    UPDATE public.professionals
    SET archived_at = NULL, updated_at = now()
    WHERE user_id = p_user_id AND archived_at IS NOT NULL;
  ELSIF p_role = 'developer' THEN
    UPDATE public.projects
    SET archived_at = NULL, updated_at = now()
    WHERE owner_id = p_user_id AND archived_at IS NOT NULL;
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION unarchive_role_data(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION unarchive_role_data(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.validate_role_switch_for_user(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.firesale_interest fi
    WHERE fi.investor_id = _user_id
      AND (
        fi.status IN ('engaged', 'won')
        OR (
          fi.status = 'reserved'
          AND COALESCE(fi.reservation_expires_at, now() + interval '100 years') > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'active_firesale_commitment_blocks_role_switch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.open_house_offers o
    JOIN public.listings l ON l.id = o.listing_id
    WHERE (o.bidder_id = _user_id OR l.owner_id = _user_id)
      AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'accepted_open_house_offer_blocks_role_switch';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION validate_role_switch_for_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION validate_role_switch_for_user(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.has_org_role(p_org_id uuid, p_roles text[], p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.organization_memberships memberships
      WHERE memberships.organization_id = p_org_id
        AND memberships.user_id = p_user_id
        AND memberships.status = 'active'
        AND memberships.role = ANY(p_roles)
    ),
    false
  )
$function$
;
REVOKE ALL ON FUNCTION private.has_org_role(uuid,text[],uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid,text[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid,text[],uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
      select exists (
        select 1
        from public.user_roles
        where user_id = _user_id
          and role::text = _role::text
      )
    $function$
;
REVOKE ALL ON FUNCTION private.has_role(uuid,app_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid,app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid,app_role) TO service_role;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role user_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.authoritative_role(_user_id) = _role
$function$
;
REVOKE ALL ON FUNCTION private.has_role(uuid,user_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid,user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid,user_role) TO service_role;
CREATE OR REPLACE FUNCTION private.remaining_plan_limit_role(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT COALESCE(NULLIF(p.participant_type::TEXT, ''), NULLIF(p.role::TEXT, ''))
  INTO v_role
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;

  RETURN CASE COALESCE(v_role, 'buyer')
    WHEN 'individual' THEN 'buyer'
    WHEN 'seller_landlord' THEN 'seller'
    ELSE COALESCE(v_role, 'buyer')
  END;
END;
$function$
;
REVOKE ALL ON FUNCTION private.remaining_plan_limit_role(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE(auth.role(), '') AS jwt_role
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    CROSS JOIN caller AS c
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        _user_id = c.uid
        OR c.jwt_role = 'service_role'
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS admin_profile
          WHERE admin_profile.user_id = c.uid
            AND admin_profile.role = 'admin'::public.user_role
        )
      )
  )
$function$
;
REVOKE ALL ON FUNCTION has_role(uuid,app_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION has_role(uuid,app_role) TO service_role;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role user_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.authoritative_role(_user_id) = _role, false)
$function$
;
REVOKE ALL ON FUNCTION has_role(uuid,user_role) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION has_role(uuid,user_role) TO service_role;
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$
;
REVOKE ALL ON FUNCTION storage.foldername(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.count_monthly_property_contact_threads(p_user_id uuid, p_month_start timestamp with time zone, p_exclude_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COUNT(*)::INTEGER
  FROM public.conversations c
  JOIN LATERAL (
    SELECT m.sender_id, m.created_at
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 1
  ) first_message ON TRUE
  WHERE (c.participant_a = p_user_id OR c.participant_b = p_user_id)
    AND first_message.sender_id = p_user_id
    AND first_message.created_at >= p_month_start
    AND (
      p_exclude_conversation_id IS NULL
      OR c.id IS DISTINCT FROM p_exclude_conversation_id
    )
    AND private.is_property_contact_conversation(
      c.participant_a,
      c.participant_b,
      c.listing_id,
      p_user_id
    );
$function$
;
REVOKE ALL ON FUNCTION private.count_monthly_property_contact_threads(uuid,timestamp with time zone,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.is_property_contact_conversation(p_participant_a uuid, p_participant_b uuid, p_listing_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_other_user_id UUID;
  v_other_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_participant_a IS DISTINCT FROM p_user_id
     AND p_participant_b IS DISTINCT FROM p_user_id THEN
    RETURN FALSE;
  END IF;

  -- Listing-scoped conversations are property contacts regardless of the
  -- owner's current role label.
  IF p_listing_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  v_other_user_id := CASE
    WHEN p_participant_a = p_user_id THEN p_participant_b
    ELSE p_participant_a
  END;

  IF v_other_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_other_role := private.remaining_plan_limit_role(v_other_user_id);

  RETURN v_other_role IN ('seller', 'agent', 'developer');
END;
$function$
;
REVOKE ALL ON FUNCTION private.is_property_contact_conversation(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.sync_listing_promotion_projection(p_listing_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_spotlight_until timestamptz;
  v_priority_until timestamptz;
BEGIN
  SELECT
    max(ends_at) FILTER (WHERE promotion_type = 'spotlight'),
    max(ends_at) FILTER (WHERE promotion_type = 'priority')
  INTO v_spotlight_until, v_priority_until
  FROM public.listing_promotion_allocations
  WHERE listing_id = p_listing_id
    AND status = 'active'
    AND ends_at > now();

  UPDATE public.listings
  SET
    is_featured = v_spotlight_until IS NOT NULL,
    featured_until = v_spotlight_until,
    priority_placement = CASE WHEN v_priority_until IS NULL THEN 0 ELSE 1 END,
    priority_until = v_priority_until
  WHERE id = p_listing_id;
END;
$function$
;
REVOKE ALL ON FUNCTION private.sync_listing_promotion_projection(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.sync_listing_promotion_projection(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.get_contact_monthly_limit(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role = 'buyer' THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 1 END;
  END IF;

  RETURN 999;
END;
$function$
;
REVOKE ALL ON FUNCTION get_contact_monthly_limit(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_contact_monthly_limit(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.get_open_house_rsvp_monthly_limit(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role = 'buyer' THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$function$
;
REVOKE ALL ON FUNCTION get_open_house_rsvp_monthly_limit(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_open_house_rsvp_monthly_limit(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.get_viewing_limit(p_user_id uuid, p_is_requester boolean)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := private.authoritative_role(p_user_id);

  IF p_is_requester
     AND v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 1 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 3 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'seller'::public.user_role THEN
    RETURN 999;
  END IF;

  IF v_role IS NULL THEN
    RETURN 0;
  END IF;

  RETURN 999;
END;
$function$
;
REVOKE ALL ON FUNCTION get_viewing_limit(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION get_viewing_limit(uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION private.close_role_switch_conversations(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conversation RECORD;
  v_counterparty UUID;
  v_count INTEGER := 0;
  v_updated INTEGER := 0;
BEGIN
  FOR v_conversation IN
    SELECT id, participant_a, participant_b
    FROM public.conversations
    WHERE closed_at IS NULL
      AND (participant_a = p_user_id OR participant_b = p_user_id)
    FOR UPDATE
  LOOP
    v_counterparty := CASE
      WHEN v_conversation.participant_a = p_user_id THEN v_conversation.participant_b
      ELSE v_conversation.participant_a
    END;

    UPDATE public.conversations
    SET
      closed_at = now(),
      closed_reason = 'role_switch',
      closed_by = p_user_id
    WHERE id = v_conversation.id
      AND closed_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_count := v_count + v_updated;

    PERFORM private.insert_interaction_notification(
      v_counterparty,
      p_user_id,
      'Conversation closed',
      'This conversation was closed because the other participant switched account type.',
      'role_switch',
      '/messages'
    );
  END LOOP;

  RETURN v_count;
END;
$function$
;
REVOKE ALL ON FUNCTION private.close_role_switch_conversations(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.current_billing_subscription_for_user(p_user_id uuid, p_required_stripe_subscription_id text DEFAULT NULL::text)
 RETURNS SETOF billing_subscriptions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT subscription.*
  FROM public.billing_subscriptions AS subscription
  JOIN public.profiles AS profile
    ON profile.user_id = subscription.user_id
  JOIN public.pricing_configs AS pricing
    ON pricing.is_active = true
   AND pricing.audience = public.profile_pricing_audience(
     profile.role,
     profile.participant_type::text
   )
   AND pricing.key = subscription.plan_key
   AND pricing.module IN (
     'user_subscription',
     'agent_subscription',
     'developer_subscription',
     'professional_subscription'
   )
   AND pricing.metadata->>'stripe_product_id' = subscription.stripe_product_id
  WHERE subscription.user_id = p_user_id
    AND profile.role_switch_in_progress_at IS NULL
    AND subscription.runtime_mode = public.current_billing_runtime_mode()
    AND subscription.livemode = (public.current_billing_runtime_mode() = 'live')
    AND subscription.audience = public.profile_pricing_audience(
      profile.role,
      profile.participant_type::text
    )
    AND subscription.status IN ('active', 'trialing', 'past_due')
    AND (
      p_required_stripe_subscription_id IS NULL
      OR subscription.stripe_subscription_id = p_required_stripe_subscription_id
    )
    AND CASE
      WHEN subscription.status = 'trialing' THEN
        COALESCE(subscription.trial_end, subscription.current_period_end) IS NOT NULL
        AND COALESCE(subscription.trial_end, subscription.current_period_end) > now()
      ELSE
        subscription.current_period_end IS NOT NULL
        AND subscription.current_period_end > now()
    END
  ORDER BY subscription.updated_at DESC, subscription.id DESC
  LIMIT 1
$function$
;
REVOKE ALL ON FUNCTION private.current_billing_subscription_for_user(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.current_billing_subscription_for_user(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION private.listing_client_writable_columns()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT ARRAY[
    'title', 'description', 'address', 'city', 'region', 'postal_code',
    'latitude', 'longitude', 'price', 'price_per_sqm', 'sqm', 'bedrooms',
    'bathrooms', 'floor', 'total_floors', 'year_built', 'energy_class',
    'property_type', 'listing_type', 'status', 'auction_date',
    'auction_starting_bid', 'auction_court', 'has_parking', 'has_pool',
    'has_elevator', 'has_garden', 'has_storage', 'has_security',
    'has_smart_home', 'has_video_tour', 'has_virtual_tour',
    'cadastre_number', 'enfia_zone', 'tags', 'cover_image_url', 'wc_count',
    'kitchens', 'living_rooms', 'levels', 'heating_system',
    'construction_status', 'has_ac', 'has_solar_water', 'has_fireplace',
    'has_underfloor_heating', 'has_furnished', 'has_alarm', 'has_cctv',
    'has_secure_door', 'has_internal_staircase', 'has_double_glazing',
    'has_window_screens', 'has_night_power', 'has_attic', 'has_satellite',
    'has_painted', 'has_balcony', 'has_view', 'has_facade', 'has_awning',
    'has_disability_access', 'is_corner', 'is_penthouse',
    'is_neoclassical', 'is_preserved', 'suitable_student',
    'suitable_holiday', 'suitable_investment', 'suitable_commercial_use',
    'deposit_months', 'monthly_expenses', 'agent_fee_included',
    'pets_allowed', 'short_term_rental', 'available_from',
    'min_rental_months', 'is_buildable', 'within_city_plan',
    'within_settlement', 'coverage_ratio', 'building_allowance',
    'facade_length', 'plot_depth', 'slope', 'zone_type', 'road_type',
    'has_water_supply', 'has_electricity_supply', 'land_use',
    'distance_from_sea', 'distance_from_city', 'has_land_concession',
    'plot_surface', 'commercial_subtype', 'floor_height',
    'has_three_phase_power', 'has_loading_dock', 'has_structured_cabling',
    'has_equipped', 'website_url', 'is_off_market', 'is_pre_sale',
    'open_house_date', 'open_house_transaction_type'
  ]::text[];
$function$
;
REVOKE ALL ON FUNCTION private.listing_client_writable_columns() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_runtime_mode text;
BEGIN
  SELECT runtime_mode
  INTO v_runtime_mode
  FROM private.billing_runtime_config
  WHERE singleton;

  IF v_runtime_mode IS NULL THEN
    RAISE EXCEPTION 'billing_runtime_mode_not_configured'
      USING ERRCODE = '55000';
  END IF;
  RETURN v_runtime_mode;
END;
$function$
;
REVOKE ALL ON FUNCTION current_billing_runtime_mode() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION current_billing_runtime_mode() TO service_role;
CREATE OR REPLACE FUNCTION public.has_audience_scoped_pro_entitlement(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT private.has_current_billing_subscription_for_user(p_user_id)
$function$
;
REVOKE ALL ON FUNCTION has_audience_scoped_pro_entitlement(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION has_audience_scoped_pro_entitlement(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.profile_pricing_audience(p_role user_role, p_participant_type text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN 'participant'
    WHEN p_role IN (
      'agent'::public.user_role,
      'developer'::public.user_role,
      'professional'::public.user_role,
      'investor'::public.user_role,
      'institutional'::public.user_role
    ) THEN p_role::text
    WHEN p_role = 'admin'::public.user_role THEN 'agent'
    WHEN p_role IS NULL AND p_participant_type IN ('buyer', 'seller', 'participant', 'pro', 'user') THEN 'participant'
    ELSE NULL
  END
$function$
;
REVOKE ALL ON FUNCTION profile_pricing_audience(user_role,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION profile_pricing_audience(user_role,text) TO service_role;
GRANT EXECUTE ON FUNCTION profile_pricing_audience(user_role,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.release_expired_firesale_reservations(p_deal_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_batch_size CONSTANT INTEGER := 250;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('release_expired_firesale_reservations')) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('maiprop.firesale_system_cleanup', 'true', TRUE);
  PERFORM set_config('maiprop.audit_actor', '', TRUE);
  PERFORM set_config('maiprop.audit_action', 'reservation_expired', TRUE);

  IF p_deal_id IS NULL THEN
    WITH candidates AS (
      SELECT fi.id
      FROM public.firesale_interest fi
      WHERE fi.status = 'reserved'
        AND fi.reservation_expires_at IS NOT NULL
        AND fi.reservation_expires_at <= now()
      ORDER BY fi.reservation_expires_at, fi.id
      LIMIT v_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    expired AS (
      UPDATE public.firesale_interest fi
      SET
        status = 'expired',
        reservation_expires_at = NULL,
        last_status_changed_at = now()
      FROM candidates c
      WHERE fi.id = c.id
      RETURNING fi.investor_id, fi.deal_id
    ),
    notified AS (
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        type,
        read,
        link
      )
      SELECT
        e.investor_id,
        'Quick Sale reservation expired',
        'Your first-look reservation for ' ||
          COALESCE(NULLIF(concat_ws(', ', nullif(fr.address, ''), nullif(fr.city, '')), ''), 'a Quick Sale property') ||
          ' has expired. You can rejoin the queue if the deal is still available.',
        'investor_alert',
        false,
        '/investor-dashboard'
      FROM expired e
      LEFT JOIN public.firesale_requests fr ON fr.id = e.deal_id
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM expired;
  ELSE
    WITH candidates AS (
      SELECT fi.id
      FROM public.firesale_interest fi
      WHERE fi.deal_id = p_deal_id
        AND fi.status = 'reserved'
        AND fi.reservation_expires_at IS NOT NULL
        AND fi.reservation_expires_at <= now()
      ORDER BY fi.reservation_expires_at, fi.id
      FOR UPDATE SKIP LOCKED
    ),
    expired AS (
      UPDATE public.firesale_interest fi
      SET
        status = 'expired',
        reservation_expires_at = NULL,
        last_status_changed_at = now()
      FROM candidates c
      WHERE fi.id = c.id
      RETURNING fi.investor_id, fi.deal_id
    ),
    notified AS (
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        type,
        read,
        link
      )
      SELECT
        e.investor_id,
        'Quick Sale reservation expired',
        'Your first-look reservation for ' ||
          COALESCE(NULLIF(concat_ws(', ', nullif(fr.address, ''), nullif(fr.city, '')), ''), 'a Quick Sale property') ||
          ' has expired. You can rejoin the queue if the deal is still available.',
        'investor_alert',
        false,
        '/investor-dashboard'
      FROM expired e
      LEFT JOIN public.firesale_requests fr ON fr.id = e.deal_id
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM expired;
  END IF;

  PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
    RAISE;
END;
$function$
;
REVOKE ALL ON FUNCTION release_expired_firesale_reservations(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION release_expired_firesale_reservations(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.assert_listing_payload_keys(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_unknown text[];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_listing_payload' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_unknown
  FROM jsonb_object_keys(p_payload) AS key_name
  WHERE NOT key_name = ANY (private.listing_client_writable_columns());

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'listing_fields_not_writable: %', array_to_string(v_unknown, ', ')
      USING ERRCODE = '42501';
  END IF;
END;
$function$
;
REVOKE ALL ON FUNCTION private.assert_listing_payload_keys(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.check_listing_quota()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.check_listing_quota();
END;
$function$
;
REVOKE ALL ON FUNCTION private.check_listing_quota() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO service_role;
CREATE OR REPLACE FUNCTION private.cleanup_role_switch_dependencies(p_user_id uuid, p_leaving_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_listing RECORD;
  v_viewing RECORD;
  v_registration RECORD;
  v_offer RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'role_switch_user_id_required';
  END IF;

  IF NULLIF(btrim(p_leaving_role), '') IS NULL THEN
    RAISE EXCEPTION 'role_switch_leaving_role_required';
  END IF;

  -- Let overdue Quick Sale reservations expire first. Remaining reserved,
  -- engaged, or won rows are live commitments and must be resolved before a
  -- role switch can proceed.
  PERFORM public.release_expired_firesale_reservations(NULL);

  IF EXISTS (
    SELECT 1
    FROM public.firesale_interest fi
    WHERE fi.investor_id = p_user_id
      AND (
        fi.status IN ('engaged', 'won')
        OR (
          fi.status = 'reserved'
          AND COALESCE(fi.reservation_expires_at, now() + interval '100 years') > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'active_firesale_commitment_blocks_role_switch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.open_house_offers o
    JOIN public.listings l ON l.id = o.listing_id
    WHERE (o.bidder_id = p_user_id OR l.owner_id = p_user_id)
      AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'accepted_open_house_offer_blocks_role_switch';
  END IF;

  -- Owner-side listing commitments: make the public inventory non-bookable and
  -- cancel pending appointments/RSVPs. The listing row remains in the dashboard
  -- as paused so the user can deliberately republish after switching back.
  FOR v_listing IN
    SELECT id, title, listing_type
    FROM public.listings
    WHERE owner_id = p_user_id
      AND status = 'active'::public.listing_status
    FOR UPDATE
  LOOP
    UPDATE public.viewings
    SET status = 'cancelled'::public.viewing_status,
        updated_at = now()
    WHERE listing_id = v_listing.id
      AND status IN ('pending'::public.viewing_status, 'confirmed'::public.viewing_status);

    FOR v_registration IN
      SELECT requester_id
      FROM public.open_house_registrations
      WHERE listing_id = v_listing.id
        AND status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status)
      FOR UPDATE
    LOOP
      UPDATE public.open_house_registrations
      SET status = 'cancelled'::public.oh_registration_status,
          updated_at = now()
      WHERE listing_id = v_listing.id
        AND requester_id = v_registration.requester_id
        AND status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status);

      PERFORM private.insert_interaction_notification(
        v_registration.requester_id,
        p_user_id,
        'Open-house registration cancelled',
        concat_ws(' ', COALESCE(NULLIF(v_listing.title, ''), 'An open-house listing'), 'is no longer available for registration.'),
        'open_house',
        CASE
          WHEN v_listing.listing_type = 'open_house' THEN '/open-house/' || v_listing.id::TEXT
          ELSE '/dashboard?tab=viewings'
        END
      );
    END LOOP;

    UPDATE public.open_house_offers
    SET status = 'rejected'::public.oh_offer_status,
        decided_by = p_user_id,
        decided_at = now()
    WHERE listing_id = v_listing.id
      AND status IN ('submitted'::public.oh_offer_status, 'revealed'::public.oh_offer_status);

    UPDATE public.listings
    SET status = 'paused'::public.listing_status,
        updated_at = now()
    WHERE id = v_listing.id
      AND status = 'active'::public.listing_status;
  END LOOP;

  -- Requester-side commitments.
  FOR v_viewing IN
    SELECT v.id, v.owner_id, l.title
    FROM public.viewings v
    LEFT JOIN public.listings l ON l.id = v.listing_id
    WHERE v.requester_id = p_user_id
      AND v.status IN ('pending'::public.viewing_status, 'confirmed'::public.viewing_status)
    FOR UPDATE OF v
  LOOP
    PERFORM private.insert_interaction_notification(
      v_viewing.owner_id,
      p_user_id,
      'Viewing request cancelled',
      concat_ws(' ', 'A viewing request for', COALESCE(NULLIF(v_viewing.title, ''), 'your listing'), 'was cancelled because the requester switched account type.'),
      'viewing',
      '/dashboard?tab=viewings'
    );

    UPDATE public.viewings
    SET status = 'cancelled'::public.viewing_status,
        updated_at = now()
    WHERE id = v_viewing.id;
  END LOOP;

  FOR v_registration IN
    SELECT r.id, r.listing_id, l.owner_id, l.title
    FROM public.open_house_registrations r
    JOIN public.listings l ON l.id = r.listing_id
    WHERE r.requester_id = p_user_id
      AND r.status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status)
    FOR UPDATE OF r
  LOOP
    PERFORM private.insert_interaction_notification(
      v_registration.owner_id,
      p_user_id,
      'Open-house registration cancelled',
      concat_ws(' ', 'A registration for', COALESCE(NULLIF(v_registration.title, ''), 'your open house'), 'was cancelled because the requester switched account type.'),
      'open_house',
      '/dashboard?tab=open-houses'
    );

    UPDATE public.open_house_registrations
    SET status = 'cancelled'::public.oh_registration_status,
        updated_at = now()
    WHERE id = v_registration.id;
  END LOOP;

  FOR v_offer IN
    SELECT o.id, l.owner_id, l.title
    FROM public.open_house_offers o
    JOIN public.listings l ON l.id = o.listing_id
    WHERE o.bidder_id = p_user_id
      AND o.status IN ('submitted'::public.oh_offer_status, 'revealed'::public.oh_offer_status)
    FOR UPDATE OF o
  LOOP
    PERFORM private.insert_interaction_notification(
      v_offer.owner_id,
      p_user_id,
      'Open-house offer withdrawn',
      concat_ws(' ', 'An offer for', COALESCE(NULLIF(v_offer.title, ''), 'your open house'), 'was withdrawn because the bidder switched account type.'),
      'open_house_offer',
      '/dashboard?tab=open-houses'
    );

    UPDATE public.open_house_offers
    SET status = 'withdrawn'::public.oh_offer_status
    WHERE id = v_offer.id;
  END LOOP;

  UPDATE public.firesale_interest
  SET status = 'passed',
      reservation_expires_at = NULL,
      reserved_at = NULL,
      reserved_by = NULL,
      last_status_changed_at = now()
  WHERE investor_id = p_user_id
    AND status IN ('interested', 'prioritized', 'expired');

  -- Professional-side requests.
  UPDATE public.consultation_requests cr
  SET status = 'cancelled',
      updated_at = now()
  FROM public.professionals p
  WHERE p.id = cr.professional_id
    AND p.user_id = p_user_id
    AND cr.status IN ('pending', 'confirmed');

  -- Private CRM state stays available but is no longer actionable.
  UPDATE public.leads
  SET status = 'lost',
      follow_up_at = NULL,
      notes = concat_ws(E'\n', NULLIF(notes, ''), '[Role switch] Archived as inactive during account type switch.'),
      updated_at = now()
  WHERE owner_id = p_user_id
    AND status NOT IN ('won', 'lost');

  UPDATE public.contacts
  SET deal_stage = 'lost',
      follow_up_at = NULL,
      notes = concat_ws(E'\n', NULLIF(notes, ''), '[Role switch] Archived as inactive during account type switch.'),
      updated_at = now()
  WHERE user_id = p_user_id
    AND COALESCE(deal_stage, 'new') <> 'lost';

  PERFORM private.close_role_switch_conversations(p_user_id);

  PERFORM private.insert_interaction_notification(
    p_user_id,
    NULL,
    'Account type switch started',
    'Your active listings and open requests were paused or cancelled while you choose a new account type.',
    'role_switch',
    '/onboarding'
  );
END;
$function$
;
REVOKE ALL ON FUNCTION private.cleanup_role_switch_dependencies(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.create_listing_for_actor(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_payload jsonb;
  v_keys text[];
  v_columns text;
  v_values text;
  v_row public.listings%ROWTYPE;
  v_price numeric;
  v_sqm numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_listing_payload_keys(p_payload);

  IF NOT p_payload ?& ARRAY['title', 'city', 'price', 'sqm', 'property_type', 'listing_type'] THEN
    RAISE EXCEPTION 'listing_required_fields_missing' USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'listing_type' = 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  -- Price per square metre is derived server-side. Existing clients may still
  -- send the field, but its value is intentionally ignored.
  v_payload := p_payload - 'price_per_sqm';
  v_price := NULLIF(v_payload->>'price', '')::numeric;
  v_sqm := NULLIF(v_payload->>'sqm', '')::numeric;
  v_payload := v_payload || jsonb_build_object(
    'price_per_sqm',
    CASE WHEN v_price > 0 AND v_sqm > 0 THEN round(v_price / v_sqm) ELSE NULL END
  );

  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_payload) AS key_name
  WHERE key_name = ANY (
    private.listing_client_writable_columns() || ARRAY['price_per_sqm']::text[]
  );

  SELECT string_agg(format('%I', key_name), ', '),
         string_agg(
           format('(jsonb_populate_record(NULL::public.listings, $2)).%I', key_name),
           ', '
         )
  INTO v_columns, v_values
  FROM unnest(v_keys) AS key_name;

  EXECUTE format(
    'INSERT INTO public.listings (owner_id, %s) SELECT $1, %s RETURNING *',
    v_columns,
    v_values
  )
  USING v_actor, v_payload
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'status', v_row.status,
    'listing_type', v_row.listing_type,
    'updated_at', v_row.updated_at
  );
END;
$function$
;
REVOKE ALL ON FUNCTION private.create_listing_for_actor(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.create_listing_for_actor(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION private.delete_listing_for_actor(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_listing public.listings%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT listing.*
  INTO v_listing
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (
    (v_listing.organization_id IS NULL AND v_listing.owner_id = v_actor)
    OR (
      v_listing.organization_id IS NOT NULL
      AND private.has_org_permission(v_listing.organization_id, 'listing:manage', v_actor)
    )
  ) THEN
    RAISE EXCEPTION 'listing_not_managed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.listings WHERE id = p_id;
  RETURN true;
END;
$function$
;
REVOKE ALL ON FUNCTION private.delete_listing_for_actor(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.delete_listing_for_actor(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.has_current_billing_subscription_for_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM private.current_billing_subscription_for_user(p_user_id, NULL)
  )
$function$
;
REVOKE ALL ON FUNCTION private.has_current_billing_subscription_for_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_current_billing_subscription_for_user(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.investor_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = p_user_id
      AND profile.role_switch_in_progress_at IS NULL
      AND public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      ) IN ('investor', 'institutional')
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.livemode = (
        public.current_billing_runtime_mode() = 'live'
      )
      AND subscription.status IN ('active', 'trial')
      AND (
        subscription.expires_at IS NULL
        OR subscription.expires_at > now()
      )
  )
$function$
;
REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid) TO service_role;
CREATE OR REPLACE FUNCTION private.insert_interaction_notification(p_user_id uuid, p_actor_id uuid, p_title text, p_body text, p_type text, p_link text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (p_user_id, p_title, p_body, p_type, p_link);
  EXCEPTION WHEN undefined_column THEN
    -- Older environments may not have the later notifications.link column yet.
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (p_user_id, p_title, p_body, p_type);
  END;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not create interaction notification for user %: %', p_user_id, SQLERRM;
END;
$function$
;
REVOKE ALL ON FUNCTION private.insert_interaction_notification(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_allocations(p_subscription_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reconciled integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || candidate.listing_id::text, 0)
  )
  FROM (
    SELECT DISTINCT allocation.listing_id
    FROM public.listing_promotion_allocations AS allocation
    JOIN public.billing_subscriptions AS subscription
      ON subscription.id = allocation.billing_subscription_id
    WHERE allocation.source_type = 'plan'
      AND allocation.status = 'active'
      AND (p_subscription_id IS NULL OR subscription.id = p_subscription_id)
      AND (
        subscription.current_period_end IS NULL
        OR subscription.current_period_end <= statement_timestamp()
        OR subscription.status NOT IN ('active', 'trialing', 'past_due')
      )
    ORDER BY allocation.listing_id
  ) AS candidate;

  UPDATE public.listing_promotion_allocations AS allocation
  SET
    status = 'revoked',
    revoked_at = statement_timestamp(),
    revoke_reason = CASE
      WHEN subscription.current_period_end IS NULL
        OR subscription.current_period_end <= statement_timestamp()
        THEN 'subscription_entitlement_lapsed'
      ELSE 'subscription_entitlement_terminal'
    END,
    updated_at = statement_timestamp()
  FROM public.billing_subscriptions AS subscription
  WHERE allocation.billing_subscription_id = subscription.id
    AND allocation.source_type = 'plan'
    AND allocation.status = 'active'
    AND (
      p_subscription_id IS NULL
      OR subscription.id = p_subscription_id
    )
    AND (
      subscription.current_period_end IS NULL
      OR subscription.current_period_end <= statement_timestamp()
      OR subscription.status NOT IN ('active', 'trialing', 'past_due')
    );

  GET DIAGNOSTICS v_reconciled = ROW_COUNT;
  RETURN v_reconciled;
END;
$function$
;
REVOKE ALL ON FUNCTION private.reconcile_plan_promotion_allocations(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.update_listing_for_actor(p_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_existing public.listings%ROWTYPE;
  v_updates jsonb;
  v_keys text[];
  v_assignments text;
  v_row public.listings%ROWTYPE;
  v_target_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_listing_payload_keys(p_updates);

  SELECT listing.*
  INTO v_existing
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_existing.owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_not_owned' USING ERRCODE = '42501';
  END IF;

  IF p_updates ? 'listing_type'
     AND p_updates->>'listing_type' = 'new_build'
     AND v_existing.listing_type::text <> 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  v_updates := p_updates - 'price_per_sqm';
  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_updates) AS key_name
  WHERE key_name = ANY (private.listing_client_writable_columns())
    AND key_name <> 'price_per_sqm';

  IF v_keys IS NULL OR cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION 'listing_update_empty' USING ERRCODE = '22023';
  END IF;

  v_target_status := COALESCE(v_updates->>'status', v_existing.status::text);
  IF v_existing.status::text <> 'active'
     AND v_target_status = 'active'
     AND NOT public.check_listing_quota() THEN
    RAISE EXCEPTION 'listing_limit_reached'
      USING ERRCODE = 'P0001', HINT = 'Upgrade to Pro for more listings';
  END IF;

  SELECT string_agg(
    format('%1$I = (jsonb_populate_record(listing, $2)).%1$I', key_name),
    ', '
  )
  INTO v_assignments
  FROM unnest(v_keys) AS key_name;

  IF v_updates ? 'price' OR v_updates ? 'sqm' THEN
    v_assignments := v_assignments || ', price_per_sqm = CASE'
      || ' WHEN COALESCE((jsonb_populate_record(listing, $2)).price, 0) > 0'
      || ' AND COALESCE((jsonb_populate_record(listing, $2)).sqm, 0) > 0'
      || ' THEN round((jsonb_populate_record(listing, $2)).price'
      || ' / (jsonb_populate_record(listing, $2)).sqm) ELSE NULL END';
  END IF;

  EXECUTE format(
    'UPDATE public.listings AS listing SET %s WHERE listing.id = $1 RETURNING listing.*',
    v_assignments
  )
  USING p_id, v_updates
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'status', v_row.status,
    'listing_type', v_row.listing_type,
    'updated_at', v_row.updated_at
  );
END;
$function$
;
REVOKE ALL ON FUNCTION private.update_listing_for_actor(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.update_listing_for_actor(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION private.upsert_owner_lead(p_owner_id uuid, p_source text, p_listing_id uuid DEFAULT NULL::uuid, p_professional_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_status text DEFAULT 'new'::text, p_notes text DEFAULT NULL::text, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_source text;
  v_status text;
  v_name text;
  v_email text;
  v_phone text;
  v_phone_key text;
  v_context_key text;
  v_lead_id uuid;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_source := CASE
    WHEN p_source IN (
      'manual', 'listing_inquiry', 'consultation', 'callback',
      'project_inquiry', 'viewing', 'message'
    ) THEN p_source
    ELSE 'manual'
  END;

  v_status := CASE
    WHEN p_status IN (
      'new', 'contacted', 'qualified', 'proposal',
      'negotiation', 'won', 'lost'
    ) THEN p_status
    ELSE 'new'
  END;

  v_name := COALESCE(
    NULLIF(btrim(p_name), ''),
    NULLIF(btrim(p_email), ''),
    NULLIF(btrim(p_phone), ''),
    'Inbound lead'
  );
  v_email := lower(NULLIF(btrim(p_email), ''));
  v_phone := NULLIF(btrim(p_phone), '');
  v_phone_key := NULLIF(
    regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g'),
    ''
  );
  v_context_key := COALESCE(
    'listing:' || p_listing_id::text,
    'professional:' || p_professional_id::text,
    'project:' || p_project_id::text,
    'general'
  );

  IF v_source <> 'manual' AND (v_email IS NOT NULL OR v_phone_key IS NOT NULL) THEN
    WITH matched AS (
      SELECT lead.id
      FROM public.leads AS lead
      WHERE lead.owner_id = p_owner_id
        AND lead.source <> 'manual'
        AND lead.origin_context_key = v_context_key
        AND (
          (
            v_email IS NOT NULL
            AND lower(btrim(COALESCE(lead.email, ''))) = v_email
          )
          OR (
            v_phone_key IS NOT NULL
            AND regexp_replace(COALESCE(lead.phone, ''), '\D', '', 'g') = v_phone_key
          )
        )
      ORDER BY lead.created_at, lead.id
      LIMIT 1
    )
    UPDATE public.leads AS existing
    SET source = CASE
          WHEN v_source = 'project_inquiry' THEN 'project_inquiry'
          ELSE existing.source
        END,
        listing_id = COALESCE(existing.listing_id, p_listing_id),
        professional_id = COALESCE(existing.professional_id, p_professional_id),
        project_id = COALESCE(existing.project_id, p_project_id),
        name = CASE
          WHEN existing.name IN (
            'Inbound lead', 'Message inquiry', 'Viewing request',
            'Consultation request', 'New-build inquiry'
          ) THEN v_name
          ELSE existing.name
        END,
        email = COALESCE(NULLIF(existing.email, ''), v_email),
        phone = COALESCE(NULLIF(existing.phone, ''), v_phone),
        message = COALESCE(existing.message, NULLIF(btrim(p_message), '')),
        notes = CASE
          WHEN NULLIF(btrim(p_notes), '') IS NULL THEN existing.notes
          WHEN NULLIF(btrim(COALESCE(existing.notes, '')), '') IS NULL THEN btrim(p_notes)
          WHEN position(btrim(p_notes) in existing.notes) > 0 THEN existing.notes
          ELSE concat_ws(E'\n\n', existing.notes, btrim(p_notes))
        END,
        follow_up_at = COALESCE(existing.follow_up_at, p_follow_up_at),
        updated_at = now()
    FROM matched
    WHERE existing.id = matched.id
    RETURNING existing.id INTO v_lead_id;
  END IF;

  IF v_lead_id IS NOT NULL THEN
    RETURN v_lead_id;
  END IF;

  BEGIN
    INSERT INTO public.leads (
      owner_id,
      source,
      listing_id,
      professional_id,
      project_id,
      name,
      email,
      phone,
      message,
      status,
      notes,
      follow_up_at
    )
    VALUES (
      p_owner_id,
      v_source,
      p_listing_id,
      p_professional_id,
      p_project_id,
      v_name,
      v_email,
      v_phone,
      NULLIF(btrim(p_message), ''),
      v_status,
      NULLIF(btrim(p_notes), ''),
      p_follow_up_at
    )
    RETURNING id INTO v_lead_id;
  EXCEPTION WHEN unique_violation THEN
    WITH matched AS (
      SELECT lead.id
      FROM public.leads AS lead
      WHERE lead.owner_id = p_owner_id
        AND lead.source <> 'manual'
        AND lead.origin_context_key = v_context_key
        AND (
          (
            v_email IS NOT NULL
            AND lower(btrim(COALESCE(lead.email, ''))) = v_email
          )
          OR (
            v_phone_key IS NOT NULL
            AND regexp_replace(COALESCE(lead.phone, ''), '\D', '', 'g') = v_phone_key
          )
        )
      ORDER BY lead.created_at, lead.id
      LIMIT 1
    )
    UPDATE public.leads AS existing
    SET source = CASE
          WHEN v_source = 'project_inquiry' THEN 'project_inquiry'
          ELSE existing.source
        END,
        listing_id = COALESCE(existing.listing_id, p_listing_id),
        professional_id = COALESCE(existing.professional_id, p_professional_id),
        project_id = COALESCE(existing.project_id, p_project_id),
        email = COALESCE(NULLIF(existing.email, ''), v_email),
        phone = COALESCE(NULLIF(existing.phone, ''), v_phone),
        updated_at = now()
    FROM matched
    WHERE existing.id = matched.id
    RETURNING existing.id INTO v_lead_id;
  END;

  RETURN v_lead_id;
END;
$function$
;
REVOKE ALL ON FUNCTION private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.check_listing_quota()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role TEXT;
  v_is_pro BOOLEAN;
  v_limit INT;
  v_count INT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('listing_quota:' || v_actor::text));

  SELECT
    COALESCE(p.role, 'buyer'),
    public.has_audience_scoped_pro_entitlement(p.user_id)
      OR COALESCE(p.force_pro_access, FALSE)
      OR public.has_platform_admin(p.user_id)
  INTO v_role, v_is_pro
  FROM public.profiles p
  WHERE p.user_id = v_actor;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_limit := public.get_listing_limit(v_role, v_is_pro);

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.listings
  WHERE owner_id = v_actor
    AND status = 'active'::public.listing_status;

  RETURN v_count < v_limit;
END;
$function$
;
REVOKE ALL ON FUNCTION check_listing_quota() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION check_listing_quota() TO service_role;
CREATE OR REPLACE FUNCTION public.is_account_deletion_active(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_jobs job
    WHERE job.user_id = p_user_id
      AND job.status IN ('in_progress', 'completed')
  );
$function$
;
REVOKE ALL ON FUNCTION is_account_deletion_active(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION is_account_deletion_active(uuid) TO service_role;
ALTER TABLE public."billing_customers" ADD CONSTRAINT "billing_customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_billing_customers_user_id ON public.billing_customers USING btree (user_id);
ALTER TABLE public."billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_billing_subscriptions_user_status ON public.billing_subscriptions USING btree (user_id, status);
CREATE INDEX idx_billing_subscriptions_customer_id ON public.billing_subscriptions USING btree (stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_entitlement_lookup ON public.billing_subscriptions USING btree (user_id, runtime_mode, livemode, audience, status, updated_at DESC, id) WHERE (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text]));
ALTER TABLE public."listing_images" ADD CONSTRAINT "listing_images_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
CREATE INDEX idx_listing_images_listing_sort ON public.listing_images USING btree (listing_id, sort_order);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public."listings" ADD CONSTRAINT "listings_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_listings_public_auction_order_v1 ON public.listings USING btree (auction_date, id) WHERE ((status = 'active'::listing_status) AND (listing_type = 'auction'::listing_type) AND (COALESCE(is_off_market, false) = false) AND (tags @> ARRAY['source:maiprop-os'::text]));
CREATE INDEX idx_listings_featured ON public.listings USING btree (is_featured, priority_placement DESC);
CREATE INDEX idx_listings_is_pre_sale ON public.listings USING btree (is_pre_sale) WHERE (is_pre_sale = true);
CREATE INDEX idx_listings_project ON public.listings USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_listings_off_market ON public.listings USING btree (is_off_market) WHERE (is_off_market = true);
CREATE INDEX idx_listings_featured_placement ON public.listings USING btree (is_featured, priority_placement DESC) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_open_house_date ON public.listings USING btree (open_house_date) WHERE ((listing_type = 'open_house'::listing_type) AND (status = 'active'::listing_status));
CREATE INDEX idx_listings_type_status_city ON public.listings USING btree (listing_type, status, city) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_active_list ON public.listings USING btree (listing_type, status, city, price, bedrooms, sqm, created_at DESC) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_price ON public.listings USING btree (price) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_beds_type ON public.listings USING btree (bedrooms, listing_type) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_owner_status ON public.listings USING btree (owner_id, status) WHERE (owner_id IS NOT NULL);
CREATE INDEX idx_listings_auction_date ON public.listings USING btree (auction_date) WHERE ((listing_type = 'auction'::listing_type) AND (status = 'active'::listing_status) AND (auction_date IS NOT NULL));
CREATE INDEX idx_listings_fts ON public.listings USING gin (to_tsvector('simple'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text))));
CREATE INDEX idx_listings_priority_created ON public.listings USING btree (priority_placement DESC, created_at DESC) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_firesale ON public.listings USING btree (price, created_at DESC) WHERE ((listing_type = 'firesale'::listing_type) AND (status = 'active'::listing_status));
CREATE INDEX idx_listings_created_brin ON public.listings USING brin (created_at);
CREATE INDEX idx_listings_active_public_updated_at ON public.listings USING btree (updated_at DESC) WHERE ((status = 'active'::listing_status) AND (is_off_market = false));
CREATE INDEX idx_listings_public_property_type ON public.listings USING btree (property_type) WHERE ((status = 'active'::listing_status) AND (is_off_market = false));
CREATE INDEX idx_listings_featured_until ON public.listings USING btree (featured_until) WHERE ((is_featured = true) AND (featured_until IS NOT NULL));
CREATE INDEX idx_listings_walkability_score ON public.listings USING btree (walkability_score) WHERE (walkability_score IS NOT NULL);
CREATE INDEX idx_listings_safety_score ON public.listings USING btree (safety_score) WHERE (safety_score IS NOT NULL);
CREATE INDEX idx_listings_noise_score ON public.listings USING btree (noise_score) WHERE (noise_score IS NOT NULL);
CREATE INDEX idx_listings_feed_sort ON public.listings USING btree (is_featured DESC, priority_placement DESC, created_at DESC) WHERE (status = 'active'::listing_status);
CREATE INDEX idx_listings_sqm ON public.listings USING btree (sqm);
CREATE INDEX idx_listings_bedrooms ON public.listings USING btree (bedrooms);
CREATE INDEX idx_listings_property_type ON public.listings USING btree (property_type);
CREATE INDEX idx_listings_year_built ON public.listings USING btree (year_built);
CREATE INDEX idx_listings_construction_status ON public.listings USING btree (construction_status);
CREATE INDEX idx_listings_energy_class ON public.listings USING btree (energy_class);
CREATE INDEX idx_listings_heating_system ON public.listings USING btree (heating_system);
CREATE INDEX idx_listings_city_type_status_price ON public.listings USING btree (city, listing_type, status, price);
CREATE INDEX idx_listings_public_city_trgm ON public.listings USING gin (city gin_trgm_ops) WHERE ((status = 'active'::listing_status) AND (is_off_market = false));
CREATE UNIQUE INDEX idx_listings_os_auction_id_unique ON public.listings USING btree (os_auction_id);
CREATE INDEX idx_listings_organization_id ON public.listings USING btree (organization_id) WHERE (organization_id IS NOT NULL);
CREATE INDEX idx_listings_location_search_text_trgm ON public.listings USING gin (location_search_text gin_trgm_ops);
CREATE UNIQUE INDEX idx_listings_one_per_project ON public.listings USING btree (project_id) WHERE (project_id IS NOT NULL);
CREATE INDEX idx_listings_priority_catalogue ON public.listings USING btree (priority_placement DESC, created_at DESC, id DESC) WHERE ((status = 'active'::listing_status) AND (is_off_market = false));
CREATE INDEX idx_listings_spotlight_catalogue ON public.listings USING btree (created_at DESC, id DESC) INCLUDE (featured_until, listing_type) WHERE ((status = 'active'::listing_status) AND (is_off_market = false) AND (is_featured = true));
ALTER TABLE public."organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
CREATE INDEX idx_organizations_created_by ON public.organizations USING btree (created_by) WHERE (created_by IS NOT NULL);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_account_moderated_by_fkey" FOREIGN KEY (account_moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_profiles_role_verified ON public.profiles USING btree (role) WHERE (role = ANY (ARRAY['professional'::user_role, 'agent'::user_role]));
CREATE INDEX idx_profiles_city ON public.profiles USING btree (city) WHERE (city IS NOT NULL);
CREATE INDEX idx_profiles_participant_type ON public.profiles USING btree (participant_type) WHERE (participant_type IS NOT NULL);
CREATE INDEX idx_profiles_account_moderated_by ON public.profiles USING btree (account_moderated_by);
ALTER TABLE public."project_leads" ADD CONSTRAINT "project_leads_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_project_leads_project ON public.project_leads USING btree (project_id);
CREATE INDEX idx_project_leads_status ON public.project_leads USING btree (status);
ALTER TABLE public."project_media" ADD CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_project_media_project ON public.project_media USING btree (project_id);
ALTER TABLE public."project_units" ADD CONSTRAINT "project_units_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE public."project_units" ADD CONSTRAINT "project_units_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX idx_project_units_project ON public.project_units USING btree (project_id);
CREATE INDEX idx_project_units_status ON public.project_units USING btree (availability_status);
CREATE INDEX idx_project_units_listing_id ON public.project_units USING btree (listing_id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_projects_owner_id ON public.projects USING btree (owner_id);
CREATE INDEX idx_projects_archived_at ON public.projects USING btree (owner_id) WHERE (archived_at IS NOT NULL);
CREATE INDEX idx_projects_organization_id ON public.projects USING btree (organization_id) WHERE (organization_id IS NOT NULL);
ALTER TABLE public."role_switch_history" ADD CONSTRAINT "role_switch_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_role_switch_history_user_id ON public.role_switch_history USING btree (user_id, switched_at DESC);
ALTER TABLE public."open_house_settings" ADD CONSTRAINT "open_house_settings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_organization_memberships_invited_by ON public.organization_memberships USING btree (invited_by) WHERE (invited_by IS NOT NULL);
CREATE INDEX idx_organization_memberships_user_id ON public.organization_memberships USING btree (user_id);
CREATE INDEX idx_organization_memberships_org_status_role ON public.organization_memberships USING btree (organization_id, status, role);
CREATE INDEX idx_consultation_requests_video_room_access ON public.consultation_requests USING btree (id, professional_id, requester_id) WHERE ((request_type = 'consultation'::text) AND (status = 'confirmed'::text) AND (meeting_type = 'video'::text));
ALTER TABLE public."contacts" ADD CONSTRAINT "contacts_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);
CREATE INDEX idx_contacts_deal_stage ON public.contacts USING btree (deal_stage);
CREATE INDEX idx_contacts_follow_up_at ON public.contacts USING btree (follow_up_at);
CREATE INDEX idx_contacts_listing_id ON public.contacts USING btree (listing_id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
CREATE INDEX conversations_listing_id_idx ON public.conversations USING btree (listing_id);
CREATE INDEX idx_conversations_participant_a_last ON public.conversations USING btree (participant_a, last_message_at DESC);
CREATE INDEX idx_conversations_participant_b_last ON public.conversations USING btree (participant_b, last_message_at DESC);
CREATE UNIQUE INDEX idx_conversations_participants_unique ON public.conversations USING btree (LEAST((participant_a)::text, (participant_b)::text), GREATEST((participant_a)::text, (participant_b)::text));
CREATE INDEX idx_conversations_closed_by ON public.conversations USING btree (closed_by);
CREATE INDEX idx_conversations_participant_a_created_at ON public.conversations USING btree (participant_a, created_at);
CREATE INDEX idx_conversations_participant_b_created_at ON public.conversations USING btree (participant_b, created_at);
CREATE INDEX idx_conversations_listing_created_at ON public.conversations USING btree (listing_id, created_at) WHERE (listing_id IS NOT NULL);
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_favorites_listing_id ON public.favorites USING btree (listing_id);
CREATE INDEX idx_favorites_listing_price_alert ON public.favorites USING btree (listing_id) WHERE (price_alert = true);
CREATE INDEX idx_favorites_listing_created_at ON public.favorites USING btree (listing_id, created_at);
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES firesale_requests(id) ON DELETE CASCADE;
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_investor_id_fkey" FOREIGN KEY (investor_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_proof_of_funds_verified_by_fkey" FOREIGN KEY (proof_of_funds_verified_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."firesale_interest" ADD CONSTRAINT "firesale_interest_reserved_by_fkey" FOREIGN KEY (reserved_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
CREATE INDEX idx_firesale_interest_investor_id ON public.firesale_interest USING btree (investor_id);
CREATE INDEX idx_firesale_interest_status ON public.firesale_interest USING btree (status);
CREATE INDEX idx_firesale_interest_proof_of_funds_verified_by ON public.firesale_interest USING btree (proof_of_funds_verified_by);
CREATE INDEX idx_firesale_interest_reserved_by ON public.firesale_interest USING btree (reserved_by);
CREATE INDEX idx_firesale_interest_reservation_lookup ON public.firesale_interest USING btree (deal_id, status, reservation_expires_at);
CREATE INDEX idx_firesale_interest_reserved_expiry ON public.firesale_interest USING btree (reservation_expires_at, deal_id, id) WHERE ((status = 'reserved'::text) AND (reservation_expires_at IS NOT NULL));
CREATE UNIQUE INDEX idx_investor_subscriptions_stripe_session_id ON public.investor_subscriptions USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);
ALTER TABLE public."leads" ADD CONSTRAINT "leads_listing_id_fkey1" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_owner_id_fkey1" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_professional_id_fkey1" FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL;
ALTER TABLE public."leads" ADD CONSTRAINT "leads_project_id_fkey1" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_professional_id ON public.leads USING btree (professional_id);
CREATE INDEX idx_leads_project_id ON public.leads USING btree (project_id);
CREATE INDEX idx_leads_owner ON public.leads USING btree (owner_id);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_source ON public.leads USING btree (source);
CREATE INDEX idx_leads_follow_up ON public.leads USING btree (follow_up_at);
CREATE INDEX idx_leads_listing ON public.leads USING btree (listing_id);
CREATE INDEX idx_leads_created ON public.leads USING btree (created_at DESC);
CREATE UNIQUE INDEX idx_leads_auto_unique_email_context ON public.leads USING btree (owner_id, origin_context_key, lower(btrim(email))) WHERE ((source <> 'manual'::text) AND (NULLIF(btrim(COALESCE(email, ''::text)), ''::text) IS NOT NULL));
CREATE UNIQUE INDEX idx_leads_auto_unique_phone_context ON public.leads USING btree (owner_id, origin_context_key, regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text)) WHERE ((source <> 'manual'::text) AND (NULLIF(btrim(COALESCE(email, ''::text)), ''::text) IS NULL) AND (NULLIF(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NOT NULL));
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_addon_purchase_id_fkey" FOREIGN KEY (addon_purchase_id) REFERENCES addon_purchases(id) ON DELETE SET NULL;
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_billing_subscription_id_fkey" FOREIGN KEY (billing_subscription_id) REFERENCES billing_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE public."listing_promotion_allocations" ADD CONSTRAINT "listing_promotion_allocations_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(user_id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_listing_promotion_one_active_type ON public.listing_promotion_allocations USING btree (listing_id, promotion_type) WHERE (status = 'active'::text);
CREATE INDEX idx_listing_promotion_owner_cycle ON public.listing_promotion_allocations USING btree (owner_id, promotion_type, source_type, plan_cycle_start, created_at);
CREATE INDEX idx_listing_promotion_expiry ON public.listing_promotion_allocations USING btree (ends_at, listing_id) WHERE (status = 'active'::text);
CREATE INDEX idx_listing_promotion_addon_purchase_id ON public.listing_promotion_allocations USING btree (addon_purchase_id);
CREATE INDEX idx_listing_promotion_billing_subscription_id ON public.listing_promotion_allocations USING btree (billing_subscription_id);
CREATE INDEX idx_listing_promotion_created_by ON public.listing_promotion_allocations USING btree (created_by);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_notifications_user_id_unread ON public.notifications USING btree (user_id) WHERE (read = false);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
ALTER TABLE public."open_house_offers" ADD CONSTRAINT "open_house_offers_bidder_id_fkey" FOREIGN KEY (bidder_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public."open_house_offers" ADD CONSTRAINT "open_house_offers_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE public."open_house_offers" ADD CONSTRAINT "open_house_offers_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
CREATE INDEX idx_oh_offers_bidder ON public.open_house_offers USING btree (bidder_id);
CREATE INDEX idx_open_house_offers_decided_by ON public.open_house_offers USING btree (decided_by);
CREATE UNIQUE INDEX idx_open_house_one_accepted_offer_per_listing ON public.open_house_offers USING btree (listing_id) WHERE (status = 'accepted'::oh_offer_status);
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."open_house_registrations" ADD CONSTRAINT "open_house_registrations_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_oh_reg_requester ON public.open_house_registrations USING btree (requester_id);
CREATE INDEX idx_oh_reg_status ON public.open_house_registrations USING btree (status);
CREATE INDEX idx_open_house_registrations_approved_by ON public.open_house_registrations USING btree (approved_by);
CREATE INDEX idx_open_house_registrations_requester_month_active ON public.open_house_registrations USING btree (requester_id, created_at) WHERE (status <> ALL (ARRAY['cancelled'::oh_registration_status, 'rejected'::oh_registration_status]));
CREATE INDEX idx_open_house_registrations_listing_status ON public.open_house_registrations USING btree (listing_id, status);
CREATE INDEX idx_professionals_archived_at ON public.professionals USING btree (user_id) WHERE (archived_at IS NOT NULL);
CREATE INDEX idx_professionals_verification_status ON public.professionals USING btree (verified, verified_at) WHERE (archived_at IS NULL);
ALTER TABLE public."profiles_public" ADD CONSTRAINT "profiles_public_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."viewings" ADD CONSTRAINT "viewings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."viewings" ADD CONSTRAINT "viewings_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."viewings" ADD CONSTRAINT "viewings_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_viewings_requester_date ON public.viewings USING btree (requester_id, scheduled_at) WHERE (status = ANY (ARRAY['pending'::viewing_status, 'confirmed'::viewing_status]));
CREATE INDEX idx_viewings_owner_date ON public.viewings USING btree (listing_id, scheduled_at) WHERE (status = ANY (ARRAY['pending'::viewing_status, 'confirmed'::viewing_status]));
CREATE INDEX idx_viewings_owner_id ON public.viewings USING btree (owner_id);
CREATE INDEX idx_viewings_requester_id ON public.viewings USING btree (requester_id);
CREATE INDEX idx_viewings_listing_status ON public.viewings USING btree (listing_id, status);
ALTER TABLE public."firesale_interest_audit_log" ADD CONSTRAINT "firesale_interest_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public."firesale_interest_audit_log" ADD CONSTRAINT "firesale_interest_audit_log_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES firesale_requests(id) ON DELETE CASCADE;
ALTER TABLE public."firesale_interest_audit_log" ADD CONSTRAINT "firesale_interest_audit_log_interest_id_fkey" FOREIGN KEY (interest_id) REFERENCES firesale_interest(id) ON DELETE CASCADE;
CREATE INDEX idx_firesale_interest_audit_log_actor_id ON public.firesale_interest_audit_log USING btree (actor_id);
CREATE INDEX idx_firesale_interest_audit_log_deal_id ON public.firesale_interest_audit_log USING btree (deal_id);
CREATE INDEX idx_firesale_interest_audit_interest ON public.firesale_interest_audit_log USING btree (interest_id, created_at DESC);
ALTER TABLE public."firesale_requests" ADD CONSTRAINT "firesale_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_firesale_requests_published_to_investors ON public.firesale_requests USING btree (published_to_investors);
CREATE INDEX idx_firesale_requests_published ON public.firesale_requests USING btree (published_to_investors) WHERE (published_to_investors = true);
CREATE INDEX idx_firesale_requests_user_id ON public.firesale_requests USING btree (user_id);
CREATE INDEX idx_firesale_requests_seller_status ON public.firesale_requests USING btree (user_id, status, created_at DESC) WHERE (user_id IS NOT NULL);
CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);
CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));
CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);
CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);
CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);
ALTER TABLE public."addon_purchases" ADD CONSTRAINT "addon_purchases_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_addon_purchases_user_id ON public.addon_purchases USING btree (user_id);
CREATE INDEX idx_addon_purchases_credit_lookup ON public.addon_purchases USING btree (user_id, status, addon_key, created_at) WHERE (credits_granted > credits_consumed);
CREATE INDEX idx_addon_purchases_payment_intent ON public.addon_purchases USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);
CREATE INDEX idx_addon_purchases_runtime_credit_lookup ON public.addon_purchases USING btree (user_id, runtime_mode, status, addon_key, created_at) WHERE (((credits_granted - credits_consumed) - credits_refunded) <> 0);
CREATE UNIQUE INDEX idx_addon_purchases_runtime_payment_intent ON public.addon_purchases USING btree (runtime_mode, stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);
CREATE UNIQUE INDEX idx_addon_purchases_runtime_charge ON public.addon_purchases USING btree (runtime_mode, stripe_charge_id) WHERE (stripe_charge_id IS NOT NULL);
CREATE UNIQUE INDEX idx_addon_purchases_runtime_invoice ON public.addon_purchases USING btree (runtime_mode, stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);
ALTER TABLE public."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX _http_response_created_idx ON net._http_response USING btree (created);
CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);
ALTER TABLE storage."objects" ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);
CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);
CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);
CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");
CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");
CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);
CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);
CREATE OR REPLACE FUNCTION public.touch_stripe_billing_state_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_touch_billing_customers_updated_at BEFORE UPDATE ON billing_customers FOR EACH ROW EXECUTE FUNCTION touch_stripe_billing_state_updated_at();
CREATE OR REPLACE FUNCTION private.guard_billing_subscription_state_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
BEGIN
  IF OLD.stripe_event_created_at IS NOT NULL
     AND NEW.stripe_event_created_at IS NOT NULL
     AND NEW.stripe_event_created_at < OLD.stripe_event_created_at THEN
    RETURN OLD;
  END IF;

  IF NEW.state_observed_at < OLD.state_observed_at THEN
    RETURN OLD;
  END IF;

  -- Reconciliation has no Stripe event timestamp. Preserve the latest event
  -- watermark so a subsequently delivered stale event remains rejectable.
  IF NEW.stripe_event_created_at IS NULL THEN
    NEW.stripe_event_created_at := OLD.stripe_event_created_at;
    NEW.stripe_event_id := OLD.stripe_event_id;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_00_guard_billing_subscription_state_order BEFORE UPDATE ON billing_subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_billing_subscription_state_order();
CREATE OR REPLACE FUNCTION private.reconcile_plan_promotion_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.reconcile_plan_promotion_allocations(NEW.id);
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_reconcile_plan_promotion_subscription AFTER INSERT OR UPDATE OF status, current_period_end ON billing_subscriptions FOR EACH ROW EXECUTE FUNCTION private.reconcile_plan_promotion_subscription();
CREATE OR REPLACE FUNCTION public.touch_stripe_billing_state_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_touch_billing_subscriptions_updated_at BEFORE UPDATE ON billing_subscriptions FOR EACH ROW EXECUTE FUNCTION touch_stripe_billing_state_updated_at();
CREATE OR REPLACE FUNCTION private.notify_favorite_price_drop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.price IS NULL
     OR NEW.price IS NULL
     OR NEW.price >= OLD.price
     OR NEW.status IS DISTINCT FROM 'active'::public.listing_status THEN
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    f.user_id,
    NEW.owner_id,
    'Price drop alert',
    concat(
      COALESCE(NULLIF(NEW.title, ''), 'A saved listing'),
      ' dropped from EUR ',
      OLD.price::TEXT,
      ' to EUR ',
      NEW.price::TEXT,
      '.'
    ),
    'price_alert',
    CASE
      WHEN NEW.listing_type = 'auction' THEN '/auction/' || NEW.id::TEXT
      WHEN NEW.listing_type = 'open_house' THEN '/open-house/' || NEW.id::TEXT
      ELSE '/property/' || NEW.id::TEXT
    END
  )
  FROM public.favorites f
  WHERE f.listing_id = NEW.id
    AND f.price_alert = TRUE
    AND f.user_id IS DISTINCT FROM NEW.owner_id
    AND (
      f.price_when_saved IS NULL
      OR NEW.price < f.price_when_saved
    );

  UPDATE public.favorites f
  SET price_when_saved = NEW.price
  WHERE f.listing_id = NEW.id
    AND f.price_alert = TRUE
    AND f.user_id IS DISTINCT FROM NEW.owner_id
    AND (
      f.price_when_saved IS NULL
      OR NEW.price < f.price_when_saved
    );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER listing_price_drop_notify_favorites AFTER UPDATE OF price ON listings FOR EACH ROW EXECUTE FUNCTION private.notify_favorite_price_drop();
CREATE OR REPLACE FUNCTION private.handle_listing_terminal_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_title TEXT := COALESCE(NULLIF(NEW.title, ''), 'A listing');
  v_status TEXT := NEW.status::TEXT;
  v_requester_id UUID;
  v_favorite_user_id UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN (
    'sold'::public.listing_status,
    'rented'::public.listing_status,
    'expired'::public.listing_status
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN (
    'sold'::public.listing_status,
    'rented'::public.listing_status,
    'expired'::public.listing_status
  ) THEN
    RETURN NEW;
  END IF;

  -- Existing viewing status triggers notify requesters about the cancellation,
  -- so this update intentionally relies on those triggers instead of inserting
  -- a second viewing notification here.
  UPDATE public.viewings v
  SET status = 'cancelled'::public.viewing_status,
      updated_at = now()
  WHERE v.listing_id = NEW.id
    AND v.status IN (
      'pending'::public.viewing_status,
      'confirmed'::public.viewing_status
    );

  FOR v_requester_id IN
    UPDATE public.open_house_registrations r
    SET status = 'cancelled'::public.oh_registration_status,
        updated_at = now()
    WHERE r.listing_id = NEW.id
      AND r.status IN (
        'pending'::public.oh_registration_status,
        'approved'::public.oh_registration_status
      )
    RETURNING r.requester_id
  LOOP
    PERFORM private.insert_interaction_notification(
      v_requester_id,
      NEW.owner_id,
      'Open-house registration cancelled',
      concat(v_title, ' is now ', v_status, ', so your open-house registration was cancelled.'),
      'open_house',
      '/open-house/' || NEW.id::TEXT
    );
  END LOOP;

  FOR v_favorite_user_id IN
    SELECT f.user_id
    FROM public.favorites f
    WHERE f.listing_id = NEW.id
      AND f.user_id IS DISTINCT FROM NEW.owner_id
  LOOP
    PERFORM private.insert_interaction_notification(
      v_favorite_user_id,
      NEW.owner_id,
      'Saved listing update',
      concat(v_title, ' is now ', v_status, '.'),
      'listing',
      CASE
        WHEN NEW.listing_type = 'auction' THEN '/auction/' || NEW.id::TEXT
        WHEN NEW.listing_type = 'open_house' THEN '/open-house/' || NEW.id::TEXT
        ELSE '/property/' || NEW.id::TEXT
      END
    );
  END LOOP;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER listing_terminal_status_lifecycle AFTER UPDATE OF status ON listings FOR EACH ROW EXECUTE FUNCTION private.handle_listing_terminal_status();
CREATE OR REPLACE FUNCTION private.enforce_listing_project_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project_owner_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project.owner_id
  INTO v_project_owner_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  IF FOUND AND v_project_owner_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'listing_project_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_00_enforce_listing_project_owner_insert AFTER INSERT ON listings FOR EACH ROW EXECUTE FUNCTION private.enforce_listing_project_owner();
CREATE OR REPLACE FUNCTION private.enforce_listing_project_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_project_owner_id uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project.owner_id
  INTO v_project_owner_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  IF FOUND AND v_project_owner_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'listing_project_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_00_enforce_listing_project_owner_update AFTER UPDATE OF project_id, owner_id ON listings FOR EACH ROW EXECUTE FUNCTION private.enforce_listing_project_owner();
CREATE OR REPLACE FUNCTION private.preserve_deleted_listing_promotion_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.listing_promotion_allocations AS allocation
  SET
    listing_id = NULL,
    listing_snapshot = jsonb_build_object(
      'id', OLD.id,
      'title', OLD.title,
      'listing_type', OLD.listing_type,
      'property_type', OLD.property_type,
      'address', OLD.address,
      'city', OLD.city,
      'region', OLD.region,
      'postal_code', OLD.postal_code,
      'owner_id', OLD.owner_id,
      'price', OLD.price,
      'deleted_at', statement_timestamp()
    ),
    status = CASE
      WHEN allocation.status = 'active' THEN 'revoked'
      ELSE allocation.status
    END,
    revoked_at = CASE
      WHEN allocation.status = 'active'
        THEN COALESCE(allocation.revoked_at, statement_timestamp())
      ELSE allocation.revoked_at
    END,
    revoke_reason = CASE
      WHEN allocation.status = 'active' THEN 'listing_deleted'
      ELSE allocation.revoke_reason
    END,
    updated_at = statement_timestamp()
  WHERE allocation.listing_id = OLD.id;

  RETURN OLD;
END;
$function$
;
CREATE TRIGGER trg_00_preserve_deleted_listing_promotion_audit BEFORE DELETE ON listings FOR EACH ROW EXECUTE FUNCTION private.preserve_deleted_listing_promotion_audit();
CREATE OR REPLACE FUNCTION public.check_listing_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_listing_limit(NEW.owner_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'listing_not_allowed' USING HINT = 'Your account type cannot create listings';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.listings WHERE owner_id = NEW.owner_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'listing_limit_reached' USING HINT = 'Upgrade to Pro for more listings';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_check_listing_limit BEFORE INSERT ON listings FOR EACH ROW EXECUTE FUNCTION check_listing_limit();
CREATE OR REPLACE FUNCTION private.notify_featured_listing_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    v_title := CASE WHEN NEW.is_featured THEN 'Spotlight enabled' ELSE 'Spotlight removed' END;
    v_body := CASE
      WHEN NEW.is_featured THEN concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'now has Spotlight visibility.')
      ELSE concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'no longer has Spotlight visibility.')
    END;
  ELSIF NEW.featured_until IS DISTINCT FROM OLD.featured_until AND NEW.is_featured THEN
    v_title := 'Spotlight expiry updated';
    v_body := concat_ws(' ', 'The Spotlight expiry was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSIF NEW.priority_placement IS DISTINCT FROM OLD.priority_placement THEN
    v_title := 'Priority Rank updated';
    v_body := concat_ws(' ', 'The Priority Rank was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    NEW.owner_id,
    v_actor,
    v_title,
    v_body,
    'featured_listing',
    '/dashboard/listings'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_featured_listing_notify AFTER UPDATE OF is_featured, priority_placement ON listings FOR EACH ROW EXECUTE FUNCTION private.notify_featured_listing_change();
CREATE OR REPLACE FUNCTION private.guard_deleted_account_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := NEW.owner_id;
  IF v_user_id IS NOT NULL AND public.is_account_deletion_active(v_user_id) THEN
    RAISE EXCEPTION 'account_deletion_in_progress'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_deleted_account_listing_write BEFORE INSERT OR UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION private.guard_deleted_account_write();
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_projection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_privileged boolean := current_user = ANY (
    ARRAY['postgres', 'service_role', 'supabase_admin']::name[]
  );
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_featured, false)
       OR NEW.featured_until IS NOT NULL
       OR COALESCE(NEW.priority_placement, 0) <> 0
       OR NEW.priority_until IS NOT NULL THEN
      RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured
     OR NEW.featured_until IS DISTINCT FROM OLD.featured_until
     OR NEW.priority_placement IS DISTINCT FROM OLD.priority_placement
     OR NEW.priority_until IS DISTINCT FROM OLD.priority_until THEN
    RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_listing_promotion_projection_insert BEFORE INSERT ON listings FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_projection();
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_projection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_privileged boolean := current_user = ANY (
    ARRAY['postgres', 'service_role', 'supabase_admin']::name[]
  );
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_featured, false)
       OR NEW.featured_until IS NOT NULL
       OR COALESCE(NEW.priority_placement, 0) <> 0
       OR NEW.priority_until IS NOT NULL THEN
      RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured
     OR NEW.featured_until IS DISTINCT FROM OLD.featured_until
     OR NEW.priority_placement IS DISTINCT FROM OLD.priority_placement
     OR NEW.priority_until IS DISTINCT FROM OLD.priority_until THEN
    RAISE EXCEPTION 'listing_promotion_fields_are_server_managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_listing_promotion_projection_update BEFORE UPDATE OF is_featured, featured_until, priority_placement, priority_until ON listings FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_projection();
CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission_denied: tenant resource ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_listings_tenant_resource_owner_update BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION private.guard_tenant_resource_owner_update();
CREATE OR REPLACE FUNCTION private.guard_open_house_listing_type_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.listing_type::text = 'open_house'
     AND OLD.listing_type IS DISTINCT FROM NEW.listing_type
     AND EXISTS (
       SELECT 1
       FROM public.listing_promotion_allocations AS allocation
       WHERE allocation.listing_id = NEW.id
         AND allocation.status = 'active'
         AND allocation.starts_at <= statement_timestamp()
         AND allocation.ends_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'open_house_active_promotion_must_be_revoked_first'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_open_house_listing_type_transition BEFORE UPDATE OF listing_type ON listings FOR EACH ROW EXECUTE FUNCTION private.guard_open_house_listing_type_transition();
CREATE OR REPLACE FUNCTION private.guard_organization_governance_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.plan <> 'free'
       OR NEW.procurement_status <> 'not_started'
       OR NEW.security_review_status <> 'not_started' THEN
      RAISE EXCEPTION 'organization governance fields require platform administration'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.plan IS DISTINCT FROM OLD.plan
        OR NEW.procurement_status IS DISTINCT FROM OLD.procurement_status
        OR NEW.security_review_status IS DISTINCT FROM OLD.security_review_status THEN
    RAISE EXCEPTION 'organization governance fields require platform administration'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_organization_governance_fields BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION private.guard_organization_governance_fields();
CREATE OR REPLACE FUNCTION private.create_org_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
    VALUES (NEW.id, NEW.created_by, 'owner', 'active')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_organizations_owner_membership AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION private.create_org_owner_membership();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER trg_touch_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.profiles_guard_account_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service_actor_text TEXT := current_setting('maiprop.admin_report_moderation_actor', TRUE);
  v_service_actor UUID;
  v_service_actor_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_service_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_service_actor := v_service_actor_text::UUID;
    v_service_actor_is_admin := public.has_platform_admin(v_service_actor);
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.account_moderation_reason IS DISTINCT FROM OLD.account_moderation_reason
     OR NEW.account_moderated_at IS DISTINCT FROM OLD.account_moderated_at
     OR NEW.account_moderated_by IS DISTINCT FROM OLD.account_moderated_by THEN
    IF NOT (
      v_service_actor_is_admin
      OR public.has_platform_admin((SELECT auth.uid()))
    ) THEN
      NEW.account_status := OLD.account_status;
      NEW.account_moderation_reason := OLD.account_moderation_reason;
      NEW.account_moderated_at := OLD.account_moderated_at;
      NEW.account_moderated_by := OLD.account_moderated_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER profiles_guard_account_moderation BEFORE UPDATE OF account_status, account_moderation_reason, account_moderated_at, account_moderated_by ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard_account_moderation();
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_via_rpc boolean := COALESCE(
    current_setting('maiprop.onboarding_rpc_active', true),
    'false'
  ) = 'true';
  v_via_owner_auth_trigger boolean := COALESCE(
    current_setting('maiprop.owner_auth_trigger_active', true),
    'false'
  ) = 'true';
  v_is_admin boolean := public.has_platform_admin((SELECT auth.uid()));
BEGIN
  -- is_platform_admin column flips remain admin-only.
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT v_is_admin THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;

  -- The owner auth trigger runs as SECURITY DEFINER immediately after a new
  -- auth.users row is inserted. It sets a local transaction marker before it
  -- writes the initial trusted owner role.
  IF v_via_owner_auth_trigger THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF v_is_admin THEN
      NULL;
    ELSE
      IF NOT v_via_rpc THEN
        RAISE EXCEPTION
          'role_change_via_direct_update_not_permitted: '
          'use rpc("complete_onboarding_role", {...}) instead';
      END IF;

      IF NEW.role IN (
        'admin'::public.user_role,
        'investor'::public.user_role,
        'institutional'::public.user_role
      ) THEN
        RAISE EXCEPTION
          'role_not_self_assignable: %', NEW.role;
      END IF;

      IF NEW.participant_type IS NULL OR NEW.role::text IS DISTINCT FROM NEW.participant_type THEN
        RAISE EXCEPTION
          'role_participant_mismatch: role % does not match participant_type %',
          NEW.role,
          NEW.participant_type;
      END IF;
    END IF;
  END IF;

  IF NEW.participant_type IS DISTINCT FROM OLD.participant_type THEN
    IF v_is_admin THEN
      NULL;
    ELSIF NEW.participant_type IS NULL
      AND NEW.role IS NOT DISTINCT FROM OLD.role
      AND NEW.role_switch_in_progress_at IS NOT NULL THEN
      -- begin_role_switch() intentionally clears participant_type before the
      -- completion RPC writes a new aligned role/participant_type pair.
      NULL;
    ELSE
      IF NOT v_via_rpc THEN
        RAISE EXCEPTION
          'participant_type_change_via_direct_update_not_permitted: '
          'use rpc("complete_onboarding_role", {...}) instead';
      END IF;

      IF NEW.participant_type IS NULL OR NEW.role::text IS DISTINCT FROM NEW.participant_type THEN
        RAISE EXCEPTION
          'role_participant_mismatch: role % does not match participant_type %',
          NEW.role,
          NEW.participant_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER profiles_guard_admin_and_role_trg BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard_admin_and_role();
CREATE OR REPLACE FUNCTION private.preserve_deleted_promotion_owner_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.listing_promotion_allocations AS allocation
  SET
    owner_snapshot = jsonb_build_object(
      'user_id', OLD.user_id,
      'role', OLD.role,
      'participant_type', OLD.participant_type,
      'deleted_at', statement_timestamp()
    ),
    owner_id = NULL,
    updated_at = statement_timestamp()
  WHERE allocation.owner_id = OLD.user_id;

  RETURN OLD;
END;
$function$
;
CREATE TRIGGER trg_00_preserve_deleted_promotion_owner_audit BEFORE DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION private.preserve_deleted_promotion_owner_audit();
CREATE OR REPLACE FUNCTION public.guard_sensitive_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only admins (via service role / RPC) can change these columns.
  -- Regular authenticated users must not self-assign subscription or privilege fields.
  -- When auth.uid() IS NULL (service-role edge functions like stripe-webhook),
  -- the guard is skipped so those writes go through.

  -- Guard subscription_product_id
  IF NEW.subscription_product_id IS DISTINCT FROM OLD.subscription_product_id THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.subscription_product_id := OLD.subscription_product_id;
    END IF;
  END IF;

  -- Guard force_pro_access
  IF NEW.force_pro_access IS DISTINCT FROM OLD.force_pro_access THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.force_pro_access := OLD.force_pro_access;
    END IF;
  END IF;

  -- Guard verified (trust badge — admin-only)
  IF NEW.verified IS DISTINCT FROM OLD.verified THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.verified := OLD.verified;
    END IF;
  END IF;

  -- Guard participant_type: non-admins can only set allowed values.
  -- 'investor' and 'institutional' require admin approval.
  IF NEW.participant_type IS DISTINCT FROM OLD.participant_type THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_platform_admin((SELECT auth.uid())) THEN
      IF NEW.participant_type NOT IN ('buyer', 'seller', 'agent', 'developer', 'professional') THEN
        NEW.participant_type := OLD.participant_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_sensitive_profile_columns BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_sensitive_profile_columns();
CREATE OR REPLACE FUNCTION public.sync_profiles_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  projected_owner_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.profiles_public WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  projected_owner_type := CASE
    WHEN NEW.is_platform_admin
      OR NEW.role::text IN ('agent', 'developer', 'admin')
      THEN 'agent'
    WHEN NEW.role::text = 'seller' THEN 'seller'
    ELSE NULL
  END;

  INSERT INTO public.profiles_public (
    user_id,
    display_name,
    avatar_url,
    first_name,
    last_name,
    role,
    owner_participant_type
  )
  VALUES (
    NEW.user_id,
    NEW.display_name,
    NEW.avatar_url,
    NEW.first_name,
    NEW.last_name,
    NEW.role,
    projected_owner_type
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    owner_participant_type = EXCLUDED.owner_participant_type;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_sync_profiles_public AFTER INSERT OR DELETE OR UPDATE OF display_name, avatar_url, first_name, last_name, role, is_platform_admin ON profiles FOR EACH ROW EXECUTE FUNCTION sync_profiles_public();
CREATE OR REPLACE FUNCTION private.sync_project_lead_to_owner_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid;
  v_listing_id uuid;
  v_status text;
  v_lead_id uuid;
  v_notes text;
BEGIN
  BEGIN
    SELECT p.owner_id
      INTO v_owner_id
      FROM public.projects p
     WHERE p.id = NEW.project_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      v_listing_id := NULLIF(NEW.metadata->>'new_building_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_listing_id := NULL;
    END;

    v_status := CASE NEW.status
      WHEN 'converted' THEN 'won'
      WHEN 'lost' THEN 'lost'
      WHEN 'qualified' THEN 'qualified'
      WHEN 'contacted' THEN 'contacted'
      ELSE 'new'
    END;

    v_notes := NULLIF(btrim(concat_ws(
      E'\n',
      NULLIF(NEW.notes, ''),
      CASE
        WHEN NULLIF(NEW.source, '') IS NULL THEN NULL
        ELSE concat('Project source: ', NEW.source)
      END,
      CASE
        WHEN NULLIF(NEW.unit_id, '') IS NULL THEN NULL
        ELSE concat('Unit interest: ', NEW.unit_id)
      END
    )), '');

    v_lead_id := private.upsert_owner_lead(
      v_owner_id,
      'project_inquiry',
      v_listing_id,
      NULL,
      NEW.project_id,
      NEW.name,
      NEW.email,
      NEW.phone,
      'Project lead',
      v_status,
      v_notes,
      NULL
    );

    IF v_lead_id IS NOT NULL THEN
      UPDATE public.leads
         SET status = v_status,
             updated_at = now()
       WHERE id = v_lead_id
         AND owner_id = v_owner_id
         AND source = 'project_inquiry';
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not sync project lead % into CRM: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER project_leads_sync_owner_lead AFTER INSERT OR UPDATE OF name, email, phone, source, status, notes, unit_id, project_id ON project_leads FOR EACH ROW EXECUTE FUNCTION private.sync_project_lead_to_owner_lead();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_project_leads_updated_at BEFORE UPDATE ON project_leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_project_units_updated_at BEFORE UPDATE ON project_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.enforce_project_listing_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND EXISTS (
       SELECT 1
       FROM public.listings AS listing
       WHERE listing.project_id = NEW.id
         AND listing.owner_id IS DISTINCT FROM NEW.owner_id
     ) THEN
    RAISE EXCEPTION 'project_listing_owner_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_00_enforce_project_listing_owner BEFORE UPDATE OF owner_id ON projects FOR EACH ROW EXECUTE FUNCTION private.enforce_project_listing_owner();
CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission_denied: tenant resource ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_projects_tenant_resource_owner_update BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION private.guard_tenant_resource_owner_update();
CREATE OR REPLACE FUNCTION private.unlink_project_listings_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.listings
  SET
    project_id = NULL,
    listing_type = 'sale'::public.listing_type,
    is_pre_sale = false
  WHERE project_id = OLD.id;

  RETURN OLD;
END;
$function$
;
CREATE TRIGGER trg_unlink_project_listings_before_delete BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION private.unlink_project_listings_before_delete();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.set_open_house_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER open_house_settings_updated_at BEFORE UPDATE ON open_house_settings FOR EACH ROW EXECUTE FUNCTION set_open_house_updated_at();
CREATE OR REPLACE FUNCTION private.guard_org_membership_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'permission_denied: membership identity cannot be changed';
  END IF;

  IF NEW.user_id = v_actor
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'permission_denied: users cannot change their own organization role or status';
  END IF;

  IF (OLD.role = 'owner' OR NEW.role = 'owner')
     AND NOT private.has_org_role(OLD.organization_id, ARRAY['owner'], v_actor) THEN
    RAISE EXCEPTION 'permission_denied: only organization owners can manage owner memberships';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_org_membership_update BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION private.guard_org_membership_update();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER trg_touch_organization_memberships_updated_at BEFORE UPDATE ON organization_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.capture_consultation_owner_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid;
  v_source text;
  v_follow_up_at timestamptz;
BEGIN
  BEGIN
    SELECT p.user_id
      INTO v_owner_id
      FROM public.professionals p
     WHERE p.id = NEW.professional_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_source := CASE NEW.request_type
      WHEN 'callback' THEN 'callback'
      WHEN 'message' THEN 'message'
      ELSE 'consultation'
    END;

    BEGIN
      IF NEW.preferred_date IS NOT NULL THEN
        v_follow_up_at := (
          NEW.preferred_date::date + COALESCE(NULLIF(NEW.preferred_time, '')::time, time '09:00')
        )::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      v_follow_up_at := NULL;
    END;

    PERFORM private.upsert_owner_lead(
      v_owner_id,
      v_source,
      NULL,
      NEW.professional_id,
      NULL,
      COALESCE(NULLIF(NEW.requester_name, ''), 'Consultation request'),
      NULLIF(NEW.requester_email, ''),
      NULLIF(NEW.requester_phone, ''),
      NEW.message,
      'new',
      NULL,
      v_follow_up_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create consultation lead for request %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER consultation_requests_create_owner_lead AFTER INSERT ON consultation_requests FOR EACH ROW EXECUTE FUNCTION private.capture_consultation_owner_lead();
CREATE OR REPLACE FUNCTION public.enforce_professional_pro_consultation_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_tier text;
BEGIN
  SELECT lower(coalesce(subscription_tier, 'free'))
    INTO target_tier
  FROM public.professionals
  WHERE id = NEW.professional_id;

  IF target_tier IS NULL THEN
    RAISE EXCEPTION 'Professional profile not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF target_tier <> 'pro' THEN
    RAISE EXCEPTION 'Client actions are available only for Pro professional profiles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER enforce_professional_pro_consultation_request BEFORE INSERT ON consultation_requests FOR EACH ROW EXECUTE FUNCTION enforce_professional_pro_consultation_request();
CREATE OR REPLACE FUNCTION private.notify_consultation_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_professional_user_id uuid;
BEGIN
  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    v_professional_user_id,
    NEW.requester_id,
    'New consultation request',
    concat_ws(' ', COALESCE(NULLIF(NEW.requester_name, ''), 'A client'), 'requested', COALESCE(NULLIF(NEW.service, ''), NEW.request_type)),
    'message',
    '/dashboard?tab=booking'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER interaction_notify_consultation_created AFTER INSERT ON consultation_requests FOR EACH ROW EXECUTE FUNCTION private.notify_consultation_created();
CREATE OR REPLACE FUNCTION private.notify_consultation_status_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_professional_user_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.requester_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_professional_user_id,
    'Consultation status updated',
    concat_ws(' ', 'Your', COALESCE(NULLIF(NEW.service, ''), NEW.request_type), 'request is now', NEW.status),
    'message',
    '/dashboard?tab=booking'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER interaction_notify_consultation_status_changed AFTER UPDATE OF status ON consultation_requests FOR EACH ROW EXECUTE FUNCTION private.notify_consultation_status_changed();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_consultation_requests_updated_at BEFORE UPDATE ON consultation_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.validate_consultation_request_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_preferred_time time;
  v_active_availability_count integer;
BEGIN
  IF NEW.request_type IS DISTINCT FROM 'consultation' THEN
    RETURN NEW;
  END IF;

  NEW.preferred_time := NULLIF(BTRIM(COALESCE(NEW.preferred_time, '')), '');

  IF NEW.preferred_date IS NULL AND NEW.preferred_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.preferred_date IS NULL OR NEW.preferred_time IS NULL THEN
    RAISE EXCEPTION 'Consultation requests need both preferred_date and preferred_time when either is supplied'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    v_preferred_time := NEW.preferred_time::time;
  EXCEPTION
    WHEN invalid_datetime_format OR invalid_text_representation THEN
      RAISE EXCEPTION 'preferred_time must be a valid time'
        USING ERRCODE = '22007';
  END;

  SELECT COUNT(*)
    INTO v_active_availability_count
    FROM public.professional_availability pa
   WHERE pa.professional_id = NEW.professional_id
     AND pa.is_active = true;

  IF v_active_availability_count = 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.professional_availability pa
     WHERE pa.professional_id = NEW.professional_id
       AND pa.is_active = true
       AND pa.day_of_week = EXTRACT(DOW FROM NEW.preferred_date)::smallint
       AND v_preferred_time >= pa.start_time
       AND v_preferred_time <= pa.end_time
  ) THEN
    RAISE EXCEPTION 'Preferred consultation time is outside professional availability'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER validate_consultation_request_availability BEFORE INSERT OR UPDATE OF professional_id, request_type, preferred_date, preferred_time ON consultation_requests FOR EACH ROW EXECUTE FUNCTION validate_consultation_request_availability();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.capture_conversation_owner_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_listing_owner_id uuid;
  v_owner_id uuid;
  v_requester_id uuid;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
  v_source text;
BEGIN
  BEGIN
    IF NEW.participant_a IS NULL OR NEW.participant_b IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.listing_id IS NOT NULL THEN
      SELECT l.owner_id, l.title
        INTO v_listing_owner_id, v_listing_title
        FROM public.listings l
       WHERE l.id = NEW.listing_id
       LIMIT 1;

      IF v_listing_owner_id = NEW.participant_a THEN
        v_owner_id := NEW.participant_a;
        v_requester_id := NEW.participant_b;
      ELSIF v_listing_owner_id = NEW.participant_b THEN
        v_owner_id := NEW.participant_b;
        v_requester_id := NEW.participant_a;
      ELSE
        RETURN NEW;
      END IF;
      v_source := 'listing_inquiry';
    ELSE
      v_owner_id := NEW.participant_b;
      v_requester_id := NEW.participant_a;
      v_source := 'message';
    END IF;

    IF v_owner_id IS NULL OR v_requester_id IS NULL OR v_owner_id = v_requester_id THEN
      RETURN NEW;
    END IF;

    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = v_requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = v_requester_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Message inquiry'
    );

    PERFORM private.upsert_owner_lead(
      v_owner_id,
      v_source,
      NEW.listing_id,
      NULL,
      NULL,
      v_name,
      v_requester_email,
      v_phone,
      CASE
        WHEN NEW.listing_id IS NULL THEN 'New message inquiry'
        ELSE concat('New listing inquiry for ', COALESCE(NULLIF(v_listing_title, ''), 'listing'))
      END,
      'new',
      NULL,
      NULL
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create conversation lead for conversation %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER conversations_create_owner_lead AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION private.capture_conversation_owner_lead();
CREATE OR REPLACE FUNCTION public.check_conversation_contact_monthly_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
BEGIN
  -- Service-role maintenance and system inserts do not have an end-user JWT.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_property_contact_conversation(
    NEW.participant_a,
    NEW.participant_b,
    NEW.listing_id,
    v_uid
  ) THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_contact_monthly_limit(v_uid);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('contact_limit:' || v_uid::TEXT || ':' || to_char(v_month_start, 'YYYY-MM'), 0)
  );

  SELECT private.count_monthly_property_contact_threads(v_uid, v_month_start)
  INTO v_count;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'contact_limit_reached'
      USING HINT = 'Upgrade to Pro for more property contacts per month';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_check_conversation_contact_monthly_limit BEFORE INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION check_conversation_contact_monthly_limit();
CREATE OR REPLACE FUNCTION public.audit_firesale_interest_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action TEXT;
  v_actor_text TEXT := NULLIF(current_setting('maiprop.audit_actor', TRUE), '');
  v_actor UUID := CASE WHEN v_actor_text IS NULL THEN (SELECT auth.uid()) ELSE v_actor_text::uuid END;
  v_forced_action TEXT := NULLIF(current_setting('maiprop.audit_action', TRUE), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := COALESCE(v_forced_action, 'interest_created');
    INSERT INTO public.firesale_interest_audit_log (interest_id, deal_id, actor_id, action, to_status, metadata)
    VALUES (
      NEW.id,
      NEW.deal_id,
      v_actor,
      v_action,
      NEW.status,
      jsonb_build_object(
        'proof_amount', NEW.proof_amount,
        'reservation_expires_at', NEW.reservation_expires_at
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_action := COALESCE(v_forced_action, 'interest_deleted');
    INSERT INTO public.firesale_interest_audit_log (interest_id, deal_id, actor_id, action, from_status, metadata)
    VALUES (
      OLD.id,
      OLD.deal_id,
      v_actor,
      v_action,
      OLD.status,
      jsonb_build_object(
        'proof_amount', OLD.proof_amount,
        'reservation_expires_at', OLD.reservation_expires_at
      )
    );
    RETURN OLD;
  END IF;

  v_action := COALESCE(
    v_forced_action,
    CASE
      WHEN NEW.status = 'reserved'
        AND OLD.status = 'reserved'
        AND NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at THEN 'reservation_extended'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'reserved' THEN 'reservation_assigned'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'reserved' AND NEW.status = 'expired' THEN 'reservation_expired'
      WHEN NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'reserved' THEN 'reservation_released'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed'
      WHEN NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at THEN 'proof_verified'
      WHEN NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url THEN 'proof_uploaded'
      ELSE 'interest_updated'
    END
  );

  INSERT INTO public.firesale_interest_audit_log (
    interest_id,
    deal_id,
    actor_id,
    action,
    from_status,
    to_status,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.deal_id,
    v_actor,
    v_action,
    OLD.status,
    NEW.status,
    jsonb_build_object(
      'proof_amount_before', OLD.proof_amount,
      'proof_amount_after', NEW.proof_amount,
      'reservation_expires_at_before', OLD.reservation_expires_at,
      'reservation_expires_at_after', NEW.reservation_expires_at
    )
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_audit_firesale_interest_mutation AFTER INSERT OR DELETE OR UPDATE ON firesale_interest FOR EACH ROW EXECUTE FUNCTION audit_firesale_interest_mutation();
CREATE OR REPLACE FUNCTION public.guard_firesale_interest_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN := COALESCE(public.has_platform_admin(v_actor), FALSE);
  v_is_system_cleanup BOOLEAN := COALESCE(NULLIF(current_setting('maiprop.firesale_system_cleanup', TRUE), '')::BOOLEAN, FALSE);
  v_active_conflict UUID;
  v_active_hold_statuses CONSTANT TEXT[] := ARRAY['reserved', 'engaged', 'won'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := 'interested';
    END IF;

    IF NEW.last_status_changed_at IS NULL THEN
      NEW.last_status_changed_at := now();
    END IF;

    IF NOT v_is_admin THEN
      IF NEW.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_create_interest_for_other_user';
      END IF;

      IF NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'invalid_initial_interest_status';
      END IF;

      NEW.proof_of_funds_verified_at := NULL;
      NEW.proof_of_funds_verified_by := NULL;
      NEW.reservation_expires_at := NULL;
      NEW.reserved_at := NULL;
      NEW.reserved_by := NULL;
      NEW.admin_note := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.last_status_changed_at := now();
    ELSE
      NEW.last_status_changed_at := COALESCE(NEW.last_status_changed_at, OLD.last_status_changed_at, now());
    END IF;

    IF NOT v_is_admin AND NOT v_is_system_cleanup THEN
      IF OLD.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_update_other_user_interest';
      END IF;

      IF NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'investor_cannot_change_admin_managed_fields';
      END IF;

      IF OLD.proof_of_funds_verified_at IS NOT NULL
         AND (
           NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
           OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
         ) THEN
        RAISE EXCEPTION 'verified_proof_is_admin_managed';
      END IF;

      IF OLD.status IN ('reserved', 'engaged', 'won') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'active_or_closed_interest_is_admin_managed';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized')
         AND OLD.status NOT IN ('interested', 'prioritized', 'passed', 'expired') THEN
        RAISE EXCEPTION 'invalid_investor_status_transition';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'investor_can_only_rejoin_or_prioritize';
      END IF;
    ELSIF v_is_system_cleanup THEN
      IF OLD.status IS DISTINCT FROM 'reserved'
         OR NEW.status IS DISTINCT FROM 'expired'
         OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
         OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'invalid_system_cleanup_transition';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin
       AND OLD.investor_id = v_actor
       AND OLD.status IN ('reserved', 'engaged', 'won') THEN
      RAISE EXCEPTION 'cannot_delete_active_or_closed_interest';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.status = ANY(v_active_hold_statuses) THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.deal_id::text));

    IF NEW.reservation_expires_at IS NULL OR NEW.reservation_expires_at <= now() THEN
      NEW.reservation_expires_at := now() + interval '24 hours';
    END IF;

    IF NEW.reserved_at IS NULL THEN
      NEW.reserved_at := now();
    END IF;

    IF NEW.reserved_by IS NULL THEN
      NEW.reserved_by := v_actor;
    END IF;

    SELECT id
    INTO v_active_conflict
    FROM public.firesale_interest
    WHERE deal_id = NEW.deal_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        status IN ('engaged', 'won')
        OR (
          status = 'reserved'
          AND COALESCE(reservation_expires_at, now() + interval '100 years') > now()
        )
      )
    LIMIT 1;

    IF v_active_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'active_reservation_exists_for_deal';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_firesale_interest_mutation BEFORE INSERT OR DELETE OR UPDATE ON firesale_interest FOR EACH ROW EXECUTE FUNCTION guard_firesale_interest_mutation();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_firesale_interest_updated_at BEFORE UPDATE ON firesale_interest FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.notify_investor_subscription_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_has_active_access BOOLEAN;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled', 'expired') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = NEW.user_id
        AND s.id <> NEW.id
        AND s.status IN ('active', 'trial')
    ) INTO v_has_active_access;

    IF NOT v_has_active_access THEN
      UPDATE public.profiles
      SET investor_mode = false,
          updated_at = now()
      WHERE user_id = NEW.user_id
        AND investor_mode = true;
    END IF;

    PERFORM private.insert_interaction_notification(
      NEW.user_id,
      v_actor,
      'Investor access updated',
      CASE
        WHEN v_has_active_access THEN 'One investor subscription changed, but your investor access remains active.'
        WHEN NEW.status = 'cancelled' THEN 'Your investor subscription was cancelled and investor mode has been turned off.'
        ELSE 'Your investor subscription expired and investor mode has been turned off.'
      END,
      'subscription',
      '/dashboard/billing'
    );
  ELSIF NEW.status IN ('active', 'trial') AND OLD.status NOT IN ('active', 'trial') THEN
    PERFORM private.insert_interaction_notification(
      NEW.user_id,
      v_actor,
      'Investor access active',
      'Your investor access is active.',
      'subscription',
      '/investor-dashboard'
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_investor_subscription_status_notify AFTER UPDATE OF status ON investor_subscriptions FOR EACH ROW EXECUTE FUNCTION private.notify_investor_subscription_status_change();
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_investor_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  IF NEW.status NOT IN ('active', 'trial') THEN
    RETURN NEW;
  END IF;

  v_role := CASE NEW.tier
    WHEN 'institutional' THEN 'institutional'::public.user_role
    WHEN 'developer' THEN 'developer'::public.user_role
    ELSE 'investor'::public.user_role
  END;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role';
  END IF;

  UPDATE public.profiles
  SET
    role = v_role,
    participant_type = v_role::text,
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = NEW.user_id
    AND (
      role IS DISTINCT FROM v_role
      OR participant_type IS DISTINCT FROM v_role::text
      OR role_switch_in_progress_at IS NOT NULL
    );

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role_trg'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'profiles_guard_admin_and_role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role_trg'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
    END IF;
    RAISE;
END;
$function$
;
CREATE TRIGGER trg_sync_profile_role_from_investor_subscription AFTER INSERT OR UPDATE OF tier, status ON investor_subscriptions FOR EACH ROW EXECUTE FUNCTION sync_profile_role_from_investor_subscription();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_investor_subscriptions_updated_at BEFORE UPDATE ON investor_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.set_lead_origin_context_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.origin_context_key := COALESCE(
      'listing:' || NEW.listing_id::text,
      'professional:' || NEW.professional_id::text,
      'project:' || NEW.project_id::text,
      'general'
    );
  ELSE
    NEW.origin_context_key := OLD.origin_context_key;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER leads_preserve_origin_context_key BEFORE UPDATE OF origin_context_key ON leads FOR EACH ROW EXECUTE FUNCTION private.set_lead_origin_context_key();
CREATE OR REPLACE FUNCTION private.set_lead_origin_context_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.origin_context_key := COALESCE(
      'listing:' || NEW.listing_id::text,
      'professional:' || NEW.professional_id::text,
      'project:' || NEW.project_id::text,
      'general'
    );
  ELSE
    NEW.origin_context_key := OLD.origin_context_key;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER leads_set_origin_context_key BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION private.set_lead_origin_context_key();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.guard_listing_promotion_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'active'
     AND EXISTS (
       SELECT 1
       FROM public.listings AS listing
       WHERE listing.id = NEW.listing_id
         AND listing.listing_type::text = 'open_house'
     ) THEN
    RAISE EXCEPTION 'open_house_promotion_not_supported' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_listing_promotion_eligibility BEFORE INSERT OR UPDATE OF listing_id, status ON listing_promotion_allocations FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_eligibility();
CREATE OR REPLACE FUNCTION private.sync_listing_promotion_projection_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM private.sync_listing_promotion_projection(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.listing_id ELSE NEW.listing_id END
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE TRIGGER trg_sync_listing_promotion_projection AFTER INSERT OR DELETE OR UPDATE ON listing_promotion_allocations FOR EACH ROW EXECUTE FUNCTION private.sync_listing_promotion_projection_trigger();
CREATE OR REPLACE FUNCTION private.touch_listing_promotion_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_touch_listing_promotion_allocation BEFORE UPDATE ON listing_promotion_allocations FOR EACH ROW EXECUTE FUNCTION private.touch_listing_promotion_allocation();
CREATE OR REPLACE FUNCTION public.guard_open_house_offer_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_owner_id UUID;
  v_open_house_date TIMESTAMPTZ;
  v_offer_deadline TIMESTAMPTZ;
  v_allow_sealed_bids BOOLEAN := TRUE;
  v_require_proof_of_funds BOOLEAN := FALSE;
  v_registration_status public.oh_registration_status;
  v_pof_verified_status TEXT;
  v_existing_accepted UUID;
  v_unrevealed_count INTEGER;
  v_accept_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_accept_rpc', TRUE), '');
  v_reopen_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_reopen_rpc', TRUE), '');
BEGIN
  SELECT
    l.owner_id,
    l.open_house_date,
    COALESCE(s.offer_deadline, NULL),
    COALESCE(s.allow_sealed_bids, TRUE),
    COALESCE(s.require_proof_of_funds, FALSE)
  INTO v_owner_id, v_open_house_date, v_offer_deadline, v_allow_sealed_bids, v_require_proof_of_funds
  FROM public.listings l
  LEFT JOIN public.open_house_settings s ON s.listing_id = l.id
  WHERE l.id = NEW.listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'open_house_listing_not_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.bidder_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'bidder_must_match_authenticated_user';
    END IF;

    IF COALESCE(NEW.status, 'submitted') <> 'submitted' THEN
      RAISE EXCEPTION 'new_offers_must_start_submitted';
    END IF;
  ELSE
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.bidder_id IS DISTINCT FROM OLD.bidder_id THEN
      RAISE EXCEPTION 'offer_identity_fields_are_immutable';
    END IF;

    IF v_actor = OLD.bidder_id THEN
      IF NEW.status = 'submitted' AND OLD.status = 'submitted' THEN
        NEW.revealed_at := NULL;
        NEW.decided_by := NULL;
        NEW.decided_at := NULL;
      ELSIF NEW.status IS DISTINCT FROM 'withdrawn' OR OLD.status NOT IN ('submitted', 'revealed') THEN
        RAISE EXCEPTION 'bidder_can_only_withdraw_active_offer';
      END IF;
    ELSIF v_actor = v_owner_id THEN
      IF NEW.status = 'revealed' AND OLD.status <> 'submitted' THEN
        IF v_reopen_rpc_context IS DISTINCT FROM NEW.listing_id::TEXT
           OR OLD.status NOT IN ('accepted', 'rejected') THEN
          RAISE EXCEPTION 'only_submitted_offers_can_be_revealed';
        END IF;
      END IF;
      IF NEW.status = 'accepted' AND OLD.status <> 'revealed' THEN
        RAISE EXCEPTION 'only_revealed_offers_can_be_accepted';
      END IF;
      IF NEW.status = 'accepted' AND v_accept_rpc_context IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'accepted_offers_must_use_accept_rpc';
      END IF;
      IF NEW.status = 'rejected' AND OLD.status NOT IN ('submitted', 'revealed') THEN
        RAISE EXCEPTION 'only_active_offers_can_be_rejected';
      END IF;
      IF NEW.status = 'withdrawn' THEN
        RAISE EXCEPTION 'owner_cannot_withdraw_bidder_offer';
      END IF;
    ELSE
      RAISE EXCEPTION 'not_authorized_for_offer';
    END IF;
  END IF;

  IF NEW.status = 'submitted' THEN
    SELECT r.status, r.pof_verified_status
    INTO v_registration_status, v_pof_verified_status
    FROM public.open_house_registrations r
    WHERE r.listing_id = NEW.listing_id
      AND r.requester_id = NEW.bidder_id;

    IF v_registration_status IS DISTINCT FROM 'attended' THEN
      RAISE EXCEPTION 'only_attendees_can_submit_offers';
    END IF;

    IF v_require_proof_of_funds AND v_pof_verified_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'proof_of_funds_must_be_verified';
    END IF;

    IF NOT v_allow_sealed_bids THEN
      RAISE EXCEPTION 'sealed_bids_disabled_for_open_house';
    END IF;

    IF v_open_house_date IS NULL OR v_open_house_date > now() THEN
      RAISE EXCEPTION 'offers_unlock_after_open_house';
    END IF;

    IF v_offer_deadline IS NOT NULL AND v_offer_deadline < now() THEN
      RAISE EXCEPTION 'sealed_bid_deadline_passed';
    END IF;
  END IF;

  IF NEW.status IN ('revealed', 'accepted') THEN
    IF COALESCE(v_offer_deadline, v_open_house_date) IS NOT NULL
       AND COALESCE(v_offer_deadline, v_open_house_date) > now() THEN
      RAISE EXCEPTION 'bids_cannot_be_revealed_before_deadline';
    END IF;
  END IF;

  IF NEW.status = 'accepted' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.listing_id::text));

    SELECT id INTO v_existing_accepted
    FROM public.open_house_offers
    WHERE listing_id = NEW.listing_id
      AND status = 'accepted'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF v_existing_accepted IS NOT NULL THEN
      RAISE EXCEPTION 'active_offer_already_accepted';
    END IF;

    SELECT count(*) INTO v_unrevealed_count
    FROM public.open_house_offers
    WHERE listing_id = NEW.listing_id
      AND id <> NEW.id
      AND status = 'submitted';

    IF v_unrevealed_count > 0 THEN
      RAISE EXCEPTION 'reveal_all_bids_before_accepting_winner';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_open_house_offer_mutation BEFORE INSERT OR UPDATE ON open_house_offers FOR EACH ROW EXECUTE FUNCTION guard_open_house_offer_mutation();
CREATE OR REPLACE FUNCTION private.notify_open_house_offer_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id UUID := COALESCE(NEW.decided_by, (SELECT auth.uid()));
  v_listing_title TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('revealed', 'accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT l.title INTO v_listing_title
  FROM public.listings l
  WHERE l.id = NEW.listing_id
  LIMIT 1;

  v_title := CASE NEW.status
    WHEN 'revealed' THEN 'Open house bid revealed'
    WHEN 'accepted' THEN 'Open house bid accepted'
    ELSE 'Open house bid not selected'
  END;

  v_body := CASE NEW.status
    WHEN 'revealed' THEN concat_ws(' ', 'Your sealed bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'has been opened.')
    WHEN 'accepted' THEN concat_ws(' ', 'Your bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'was accepted.')
    ELSE concat_ws(' ', 'Your bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'was not selected.')
  END;

  PERFORM private.insert_interaction_notification(
    NEW.bidder_id,
    v_actor_id,
    v_title,
    v_body,
    'open_house_offer',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_open_house_offer_notify AFTER UPDATE OF status ON open_house_offers FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION private.notify_open_house_offer_status_change();
CREATE OR REPLACE FUNCTION public.set_open_house_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER open_house_registrations_updated_at BEFORE UPDATE ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION set_open_house_updated_at();
CREATE OR REPLACE FUNCTION public.check_open_house_rsvp_monthly_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'open_house_rsvp_requester_mismatch'
      USING HINT = 'Open-house RSVPs must be created for the authenticated user';
  END IF;

  v_limit := public.get_open_house_rsvp_monthly_limit(NEW.requester_id);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('open_house_rsvp:' || NEW.requester_id::TEXT || ':' || to_char(v_month_start, 'YYYY-MM'), 0)
  );

  SELECT COUNT(*)::INTEGER
    INTO v_count
  FROM public.open_house_registrations r
  WHERE r.requester_id = NEW.requester_id
    AND r.created_at >= v_month_start
    AND r.status NOT IN ('cancelled', 'rejected');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'open_house_rsvp_limit_reached'
      USING HINT = 'Upgrade to Pro for unlimited open-house RSVPs';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_check_open_house_rsvp_monthly_limit BEFORE INSERT ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION check_open_house_rsvp_monthly_limit();
CREATE OR REPLACE FUNCTION public.enforce_open_house_registration_submission_requirements()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NULLIF(BTRIM(COALESCE(NEW.contact_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_name_required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(NEW.contact_email, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_email_required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(NEW.contact_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_phone_required';
    END IF;

    IF NEW.contact_permission_at IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_permission_required';
    END IF;

    IF NEW.id_verification_consent_at IS NULL THEN
      RAISE EXCEPTION 'open_house_id_verification_consent_required';
    END IF;

    IF NEW.privacy_acknowledged_at IS NULL THEN
      RAISE EXCEPTION 'open_house_privacy_acknowledgement_required';
    END IF;
  END IF;

  IF NEW.contact_email IS NOT NULL THEN
    NEW.contact_email := LOWER(BTRIM(NEW.contact_email));
  END IF;

  IF NEW.contact_name IS NOT NULL THEN
    NEW.contact_name := BTRIM(NEW.contact_name);
  END IF;

  IF NEW.contact_phone IS NOT NULL THEN
    NEW.contact_phone := BTRIM(NEW.contact_phone);
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_enforce_open_house_registration_submission_requirements BEFORE INSERT OR UPDATE ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION enforce_open_house_registration_submission_requirements();
CREATE OR REPLACE FUNCTION public.guard_open_house_registration_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registration_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_registration_rpc', TRUE), '');
BEGIN
  IF v_registration_rpc_context IS DISTINCT FROM NEW.requester_id::TEXT THEN
    RAISE EXCEPTION 'use_create_open_house_registration_rpc'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_guard_open_house_registration_insert BEFORE INSERT ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION guard_open_house_registration_insert();
CREATE OR REPLACE FUNCTION public.guard_open_house_registration_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.owner_id
    INTO v_owner_id
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  IF v_uid = OLD.requester_id AND v_uid IS DISTINCT FROM v_owner_id THEN
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
      OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
      OR NEW.timeslot_index IS DISTINCT FROM OLD.timeslot_index
      OR NEW.id_verified_at IS DISTINCT FROM OLD.id_verified_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.attended_at IS DISTINCT FROM OLD.attended_at
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      OR NEW.pof_verified_status IS DISTINCT FROM OLD.pof_verified_status
      OR NEW.pof_rejection_reason IS DISTINCT FROM OLD.pof_rejection_reason
    THEN
      RAISE EXCEPTION 'host_controlled_open_house_fields';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'requester_can_only_cancel_registration';
    END IF;

    IF NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
      OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
    THEN
      NEW.pof_verified_status := 'unreviewed';
      NEW.pof_rejection_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid = v_owner_id THEN
    IF NEW.status = 'attended' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'only_approved_registrations_can_be_attended';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not_authorized_for_open_house_registration';
END;
$function$
;
CREATE TRIGGER trg_guard_open_house_registration_update BEFORE UPDATE ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION guard_open_house_registration_update();
CREATE OR REPLACE FUNCTION public.notify_oh_registration_status_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_oh_registration_notify AFTER UPDATE OF status ON open_house_registrations FOR EACH ROW EXECUTE FUNCTION notify_oh_registration_status_change();
CREATE OR REPLACE FUNCTION private.notify_open_house_pof_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := COALESCE(NEW.approved_by, (SELECT auth.uid()));
  v_listing_title TEXT;
BEGIN
  IF NEW.pof_verified_status IS NOT DISTINCT FROM OLD.pof_verified_status THEN
    RETURN NEW;
  END IF;

  IF NEW.pof_verified_status IS NULL OR NEW.pof_verified_status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_actor,
    CASE
      WHEN NEW.pof_verified_status = 'verified' THEN 'Proof of funds verified'
      ELSE 'Proof of funds rejected'
    END,
    CASE
      WHEN NEW.pof_verified_status = 'verified'
        THEN concat_ws(' ', 'Your proof of funds for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was verified.')
      ELSE concat_ws(' ', 'Your proof of funds for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was rejected.', NULLIF(NEW.rejection_reason, ''))
    END,
    'pof_review',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_open_house_pof_notify AFTER UPDATE OF pof_verified_status ON open_house_registrations FOR EACH ROW WHEN (old.pof_verified_status IS DISTINCT FROM new.pof_verified_status) EXECUTE FUNCTION private.notify_open_house_pof_status_change();
CREATE OR REPLACE FUNCTION private.notify_open_house_registration_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id UUID := COALESCE(NEW.approved_by, (SELECT auth.uid()));
  v_listing_title TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT l.title INTO v_listing_title
  FROM public.listings l
  WHERE l.id = NEW.listing_id
  LIMIT 1;

  v_title := CASE NEW.status
    WHEN 'approved' THEN 'Open house registration approved'
    ELSE 'Open house registration rejected'
  END;

  v_body := CASE NEW.status
    WHEN 'approved' THEN concat_ws(' ', 'Your registration for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was approved.')
    ELSE concat_ws(
      ' ',
      'Your registration for',
      COALESCE(NULLIF(v_listing_title, ''), 'an open house'),
      'was rejected.',
      NULLIF(NEW.rejection_reason, '')
    )
  END;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_actor_id,
    v_title,
    v_body,
    'open_house',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_open_house_registration_in_app_notify AFTER UPDATE OF status ON open_house_registrations FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION private.notify_open_house_registration_status_change();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE TRIGGER update_pricing_configs_updated_at BEFORE UPDATE ON pricing_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION private.guard_professional_managed_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified IS DISTINCT FROM FALSE
       OR NEW.verified_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
       OR NEW.notes IS NOT NULL
       OR COALESCE(NEW.subscription_tier, 'free') <> 'free' THEN
      RAISE EXCEPTION 'professional_managed_fields_forbidden'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'professional_managed_fields_forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER professionals_guard_managed_fields BEFORE INSERT OR UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION private.guard_professional_managed_fields();
CREATE OR REPLACE FUNCTION public.professionals_guard_subscription_tier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_platform_admin(auth.uid()) THEN
      NEW.subscription_tier := OLD.subscription_tier;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER professionals_guard_subscription_tier BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION professionals_guard_subscription_tier();
CREATE OR REPLACE FUNCTION private.notify_professional_verification_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.verified IS TRUE AND OLD.verified IS DISTINCT FROM TRUE THEN
    v_title := 'Professional profile verified';
    v_body := 'Your professional profile has been verified and the verified badge is now visible.';
  ELSIF NEW.rejection_reason IS NOT NULL
        AND NEW.verified IS FALSE
        AND NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    v_title := 'Professional verification rejected';
    v_body := concat_ws(' ', 'Your professional verification was rejected.', NULLIF(NEW.rejection_reason, ''));
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    NEW.user_id,
    v_actor,
    v_title,
    v_body,
    'professional_verification',
    '/dashboard/profile'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_professional_verification_notify AFTER UPDATE OF verified, rejection_reason ON professionals FOR EACH ROW EXECUTE FUNCTION private.notify_professional_verification_change();
CREATE OR REPLACE FUNCTION private.notify_viewing_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_listing_title text;
BEGIN
  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.owner_id,
    NEW.requester_id,
    'New viewing request',
    concat_ws(' ', 'A buyer requested a', replace(NEW.viewing_type::text, '_', '-'), 'viewing for', COALESCE(NULLIF(v_listing_title, ''), 'your listing')),
    'viewing',
    '/dashboard?tab=viewings'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER interaction_notify_viewing_created AFTER INSERT ON viewings FOR EACH ROW EXECUTE FUNCTION private.notify_viewing_created();
CREATE OR REPLACE FUNCTION private.notify_viewing_status_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_listing_title text;
  v_actor_id uuid := auth.uid();
  v_recipient_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_recipient_id := CASE
    WHEN v_actor_id = NEW.requester_id THEN NEW.owner_id
    ELSE NEW.requester_id
  END;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    v_recipient_id,
    v_actor_id,
    'Viewing status updated',
    concat_ws(' ', 'Your viewing for', COALESCE(NULLIF(v_listing_title, ''), 'a listing'), 'is now', NEW.status::text),
    'viewing',
    '/dashboard?tab=viewings'
  );

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER interaction_notify_viewing_status_changed AFTER UPDATE OF status ON viewings FOR EACH ROW EXECUTE FUNCTION private.notify_viewing_status_changed();
CREATE OR REPLACE FUNCTION public.check_viewing_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit_requester INT;
  v_limit_owner INT;
  v_count_requester INT;
  v_count_owner INT;
  v_month_start TIMESTAMPTZ;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', now())::timestamptz;

  -- Check requester (buyer) limit
  v_limit_requester := public.get_viewing_limit(NEW.requester_id, true);
  IF v_limit_requester < 999 THEN
    SELECT COUNT(*) INTO v_count_requester FROM public.viewings
    WHERE requester_id = NEW.requester_id AND created_at >= v_month_start;
    IF v_count_requester >= v_limit_requester THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Upgrade to Pro for more viewings per month';
    END IF;
  END IF;

  -- Check owner (agent) limit - viewings on their listings
  v_limit_owner := public.get_viewing_limit(NEW.owner_id, false);
  IF v_limit_owner < 999 THEN
    SELECT COUNT(*) INTO v_count_owner FROM public.viewings
    WHERE owner_id = NEW.owner_id AND created_at >= v_month_start;
    IF v_count_owner >= v_limit_owner THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Listing owner has reached viewing limit. Upgrade to Pro for more.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_check_viewing_limit BEFORE INSERT ON viewings FOR EACH ROW EXECUTE FUNCTION check_viewing_limit();
CREATE OR REPLACE FUNCTION public.guard_viewing_status_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'viewing identity cannot be changed'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor = OLD.owner_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
         OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
       ) THEN
      RAISE EXCEPTION 'invalid listing-owner viewing status transition'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF v_actor = OLD.requester_id THEN
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.viewing_type IS DISTINCT FROM OLD.viewing_type
       OR NEW.video_link IS DISTINCT FROM OLD.video_link
       OR NEW.note IS DISTINCT FROM OLD.note THEN
      RAISE EXCEPTION 'only the listing owner can manage viewing host details'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         OLD.status IN ('pending', 'confirmed')
         AND NEW.status = 'cancelled'
       ) THEN
      RAISE EXCEPTION 'requesters may only cancel an active viewing request'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'only viewing participants may update a viewing'
    USING ERRCODE = '42501';
END;
$function$
;
CREATE TRIGGER trg_guard_viewing_status_transitions BEFORE UPDATE ON viewings FOR EACH ROW EXECUTE FUNCTION guard_viewing_status_transitions();
CREATE OR REPLACE FUNCTION private.capture_viewing_owner_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
BEGIN
  BEGIN
    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = NEW.requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = NEW.requester_id
     LIMIT 1;

    SELECT l.title
      INTO v_listing_title
      FROM public.listings l
     WHERE l.id = NEW.listing_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Viewing request'
    );

    PERFORM private.upsert_owner_lead(
      NEW.owner_id,
      'viewing',
      NEW.listing_id,
      NULL,
      NULL,
      v_name,
      v_requester_email,
      v_phone,
      concat_ws(
        ' ',
        'Viewing request for',
        COALESCE(NULLIF(v_listing_title, ''), 'listing'),
        concat('(', replace(NEW.viewing_type::text, '_', '-'), ')')
      ),
      'new',
      NULL,
      NEW.scheduled_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create viewing lead for viewing %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER viewings_create_owner_lead AFTER INSERT ON viewings FOR EACH ROW EXECUTE FUNCTION private.capture_viewing_owner_lead();
CREATE OR REPLACE FUNCTION public.sync_firesale_investor_feed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.firesale_requests_investor_feed WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.published_to_investors IS TRUE THEN
    INSERT INTO public.firesale_requests_investor_feed (
      id,
      created_at,
      address,
      city,
      property_type,
      sqm,
      bedrooms,
      condition,
      ai_estimate,
      asking_price,
      status
    )
    VALUES (
      NEW.id,
      NEW.created_at,
      NEW.address,
      NEW.city,
      NEW.property_type,
      NEW.sqm,
      NEW.bedrooms,
      NEW.condition,
      NEW.ai_estimate,
      NEW.asking_price,
      NEW.status
    )
    ON CONFLICT (id) DO UPDATE SET
      created_at = EXCLUDED.created_at,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      property_type = EXCLUDED.property_type,
      sqm = EXCLUDED.sqm,
      bedrooms = EXCLUDED.bedrooms,
      condition = EXCLUDED.condition,
      ai_estimate = EXCLUDED.ai_estimate,
      asking_price = EXCLUDED.asking_price,
      status = EXCLUDED.status;
  ELSE
    DELETE FROM public.firesale_requests_investor_feed WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_sync_firesale_investor_feed AFTER INSERT OR DELETE OR UPDATE OF published_to_investors, address, city, property_type, sqm, bedrooms, condition, ai_estimate, asking_price, status ON firesale_requests FOR EACH ROW EXECUTE FUNCTION sync_firesale_investor_feed();
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'managed_net_stub_called'; END $$;
SET check_function_bodies=on;

-- Captured application trigger-function ACLs (managed provisioning/network internals excluded).
REVOKE ALL ON FUNCTION public.touch_stripe_billing_state_updated_at() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.touch_stripe_billing_state_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_stripe_billing_state_updated_at() TO service_role;
REVOKE ALL ON FUNCTION private.guard_billing_subscription_state_order() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.reconcile_plan_promotion_subscription() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.notify_favorite_price_drop() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.handle_listing_terminal_status() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enforce_listing_project_owner() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.preserve_deleted_listing_promotion_audit() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.check_listing_limit() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_listing_limit() TO service_role;
REVOKE ALL ON FUNCTION private.notify_featured_listing_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_deleted_account_write() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.guard_deleted_account_write() TO service_role;
REVOKE ALL ON FUNCTION private.guard_listing_promotion_projection() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_tenant_resource_owner_update() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.guard_tenant_resource_owner_update() TO service_role;
REVOKE ALL ON FUNCTION private.guard_open_house_listing_type_transition() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_organization_governance_fields() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.guard_organization_governance_fields() TO service_role;
REVOKE ALL ON FUNCTION private.create_org_owner_membership() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
REVOKE ALL ON FUNCTION public.profiles_guard_account_moderation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.profiles_guard_account_moderation() TO service_role;
REVOKE ALL ON FUNCTION public.profiles_guard_admin_and_role() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.profiles_guard_admin_and_role() TO service_role;
REVOKE ALL ON FUNCTION private.preserve_deleted_promotion_owner_audit() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_sensitive_profile_columns() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_sensitive_profile_columns() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_sensitive_profile_columns() TO anon;
GRANT EXECUTE ON FUNCTION public.guard_sensitive_profile_columns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_sensitive_profile_columns() TO service_role;
REVOKE ALL ON FUNCTION public.sync_profiles_public() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sync_profiles_public() TO service_role;
REVOKE ALL ON FUNCTION private.sync_project_lead_to_owner_lead() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enforce_project_listing_owner() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.unlink_project_listings_before_delete() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.capture_consultation_owner_lead() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.enforce_professional_pro_consultation_request() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enforce_professional_pro_consultation_request() TO service_role;
REVOKE ALL ON FUNCTION private.notify_consultation_created() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.notify_consultation_status_changed() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.validate_consultation_request_availability() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.validate_consultation_request_availability() TO service_role;
REVOKE ALL ON FUNCTION private.capture_conversation_owner_lead() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.check_conversation_contact_monthly_limit() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_conversation_contact_monthly_limit() TO service_role;
REVOKE ALL ON FUNCTION public.audit_firesale_interest_mutation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.audit_firesale_interest_mutation() TO service_role;
REVOKE ALL ON FUNCTION public.guard_firesale_interest_mutation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_firesale_interest_mutation() TO service_role;
REVOKE ALL ON FUNCTION private.notify_investor_subscription_status_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sync_profile_role_from_investor_subscription() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_role_from_investor_subscription() TO service_role;
REVOKE ALL ON FUNCTION private.set_lead_origin_context_key() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_listing_promotion_eligibility() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.sync_listing_promotion_projection_trigger() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.touch_listing_promotion_allocation() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_open_house_offer_mutation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_open_house_offer_mutation() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_open_house_offer_mutation() TO service_role;
REVOKE ALL ON FUNCTION private.notify_open_house_offer_status_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_open_house_updated_at() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_open_house_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_open_house_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_open_house_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_open_house_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.check_open_house_rsvp_monthly_limit() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_open_house_rsvp_monthly_limit() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_open_house_registration_submission_requirements() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enforce_open_house_registration_submission_requirements() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_open_house_registration_submission_requirements() TO service_role;
REVOKE ALL ON FUNCTION public.guard_open_house_registration_insert() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_open_house_registration_insert() TO service_role;
REVOKE ALL ON FUNCTION public.guard_open_house_registration_update() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_open_house_registration_update() TO service_role;
REVOKE ALL ON FUNCTION private.notify_open_house_pof_status_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.notify_open_house_registration_status_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_professional_managed_fields() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.guard_professional_managed_fields() TO service_role;
REVOKE ALL ON FUNCTION public.professionals_guard_subscription_tier() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.professionals_guard_subscription_tier() TO service_role;
REVOKE ALL ON FUNCTION private.notify_professional_verification_change() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.notify_viewing_created() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.notify_viewing_status_changed() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.check_viewing_limit() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.check_viewing_limit() TO service_role;
REVOKE ALL ON FUNCTION public.guard_viewing_status_transitions() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guard_viewing_status_transitions() TO service_role;
REVOKE ALL ON FUNCTION private.capture_viewing_owner_lead() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sync_firesale_investor_feed() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sync_firesale_investor_feed() TO service_role;
-- Managed schema USAGE simulation for local API roles; no provider internals.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE POLICY "storage_objects_authenticated_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((((bucket_id = 'property-images'::text) AND private.has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) OR ((bucket_id = 'firesale-proof-docs'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = 'open-house-docs'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'message-attachments'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'firesale-photos'::text) AND ((EXISTS ( SELECT 1
   FROM firesale_requests request
  WHERE (((request.id)::text = (storage.foldername(objects.name))[1]) AND (request.user_id = ( SELECT auth.uid() AS uid))))) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = 'project-media'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))));
CREATE POLICY "storage_objects_authenticated_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((bucket_id = 'property-images'::text) AND private.has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) OR ((bucket_id = 'firesale-photos'::text) AND (EXISTS ( SELECT 1
   FROM firesale_requests request
  WHERE (((request.id)::text = (storage.foldername(objects.name))[1]) AND (request.user_id = ( SELECT auth.uid() AS uid)))))) OR ((bucket_id = 'message-attachments'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM conversations conversation
  WHERE (((conversation.id)::text = (storage.foldername(objects.name))[2]) AND ((conversation.participant_a = ( SELECT auth.uid() AS uid)) OR (conversation.participant_b = ( SELECT auth.uid() AS uid))))))) OR ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'firesale-proof-docs'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((storage.foldername(name))[2] = 'firesale'::text)) OR ((bucket_id = 'open-house-docs'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'project-media'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))));
CREATE POLICY "storage_objects_authenticated_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((((bucket_id = 'firesale-proof-docs'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = 'message-attachments'::text) AND (EXISTS ( SELECT 1
   FROM conversations conversation
  WHERE (((conversation.id)::text = (storage.foldername(objects.name))[2]) AND ((conversation.participant_a = ( SELECT auth.uid() AS uid)) OR (conversation.participant_b = ( SELECT auth.uid() AS uid))))))) OR ((bucket_id = 'open-house-docs'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM (open_house_registrations registration
     JOIN listings listing ON (((listing.id = registration.listing_id) AND (listing.owner_id = ( SELECT auth.uid() AS uid)))))
  WHERE (((storage.foldername(objects.name))[1] = (registration.requester_id)::text) AND ((storage.foldername(objects.name))[2] = (registration.listing_id)::text)))) OR private.has_platform_admin(( SELECT auth.uid() AS uid))))));
CREATE POLICY "storage_objects_authenticated_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING ((((bucket_id = 'property-images'::text) AND private.has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) OR ((bucket_id = 'firesale-proof-docs'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((storage.foldername(name))[2] = 'firesale'::text)) OR ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))) WITH CHECK ((((bucket_id = 'property-images'::text) AND private.has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)) OR ((bucket_id = 'firesale-proof-docs'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND ((storage.foldername(name))[2] = 'firesale'::text)) OR ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))));
-- NULL function ACL means PostgreSQL default PUBLIC EXECUTE, not no access.
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO PUBLIC;
