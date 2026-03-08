
-- ============================================
-- Add all missing Spitogatos-parity fields
-- ============================================

-- RESIDENTIAL / GENERAL fields
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS wc_count integer,
  ADD COLUMN IF NOT EXISTS kitchens integer,
  ADD COLUMN IF NOT EXISTS living_rooms integer,
  ADD COLUMN IF NOT EXISTS levels integer,
  ADD COLUMN IF NOT EXISTS heating_system text,
  ADD COLUMN IF NOT EXISTS construction_status text,

  -- Internal features
  ADD COLUMN IF NOT EXISTS has_ac boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_solar_water boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_fireplace boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_underfloor_heating boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_furnished boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_alarm boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_cctv boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_secure_door boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_internal_staircase boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_double_glazing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_window_screens boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_night_power boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_attic boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_satellite boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_painted boolean DEFAULT false,

  -- External features
  ADD COLUMN IF NOT EXISTS has_balcony boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_view boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_facade boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_awning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_disability_access boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_corner boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_penthouse boolean DEFAULT false,

  -- Construction characteristics
  ADD COLUMN IF NOT EXISTS is_neoclassical boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_preserved boolean DEFAULT false,

  -- Suitability flags
  ADD COLUMN IF NOT EXISTS suitable_student boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suitable_holiday boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suitable_investment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suitable_commercial_use boolean DEFAULT false,

  -- RENTAL-specific fields
  ADD COLUMN IF NOT EXISTS deposit_months integer,
  ADD COLUMN IF NOT EXISTS monthly_expenses numeric,
  ADD COLUMN IF NOT EXISTS agent_fee_included boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pets_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_term_rental boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_from date,
  ADD COLUMN IF NOT EXISTS min_rental_months integer,

  -- LAND-specific fields
  ADD COLUMN IF NOT EXISTS is_buildable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS within_city_plan boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS within_settlement boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS coverage_ratio numeric,
  ADD COLUMN IF NOT EXISTS building_allowance numeric,
  ADD COLUMN IF NOT EXISTS facade_length numeric,
  ADD COLUMN IF NOT EXISTS plot_depth numeric,
  ADD COLUMN IF NOT EXISTS slope text,
  ADD COLUMN IF NOT EXISTS zone_type text,
  ADD COLUMN IF NOT EXISTS road_type text,
  ADD COLUMN IF NOT EXISTS has_water_supply boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_electricity_supply boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS land_use text,
  ADD COLUMN IF NOT EXISTS distance_from_sea integer,
  ADD COLUMN IF NOT EXISTS distance_from_city integer,
  ADD COLUMN IF NOT EXISTS has_land_concession boolean DEFAULT false,

  -- COMMERCIAL-specific fields
  ADD COLUMN IF NOT EXISTS plot_surface numeric,
  ADD COLUMN IF NOT EXISTS commercial_subtype text,
  ADD COLUMN IF NOT EXISTS floor_height numeric,
  ADD COLUMN IF NOT EXISTS has_three_phase_power boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_loading_dock boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_structured_cabling boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_equipped boolean DEFAULT false;

COMMENT ON COLUMN public.listings.heating_system IS 'Values: autonomous, central, floor, none, other';
COMMENT ON COLUMN public.listings.construction_status IS 'Values: new, under_construction, renovated, needs_renovation, unfinished, preserved, neoclassical';
COMMENT ON COLUMN public.listings.slope IS 'Values: flat, slight, steep';
COMMENT ON COLUMN public.listings.zone_type IS 'Values: residential, agricultural, tourist, industrial, commercial, mixed';
COMMENT ON COLUMN public.listings.road_type IS 'Values: asphalt, paved, dirt';
COMMENT ON COLUMN public.listings.commercial_subtype IS 'Values: shop, office, warehouse, hotel, restaurant, showroom, clinic, industrial, other';
