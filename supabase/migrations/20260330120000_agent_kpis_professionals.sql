-- Ensure real_estate_agent and other categories exist in professional_category enum
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'real_estate_agent';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'insurance_broker';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'utility_certification_provider';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'esg_sustainability_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'relocation_immigration_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'facility_manager';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'short_term_rental_operator';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'hotel_hospitality_operator';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'marketing_agency';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'crm_listing_data_provider';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'concrete_contractor';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'steel_structure_contractor';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'carpenter';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'tile_installer';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'painter';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'building_permit_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'urban_planning_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'legalization_specialist';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'energy_certificate_inspector';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'building_regulation_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'fire_protection_consultant';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'drywall_installer';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'waterproofing_specialist';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'insulation_contractor';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'roofing_contractor';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'window_aluminum_installer';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'elevator_installer';
ALTER TYPE public.professional_category ADD VALUE IF NOT EXISTS 'smart_home_installer';

-- Add optional agent KPIs to professionals (for real_estate_agent category)
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS average_deal_size text,
  ADD COLUMN IF NOT EXISTS average_portfolio_asset_size text;

COMMENT ON COLUMN professionals.average_deal_size IS 'e.g. €250K, €1.2M - average transaction size';
COMMENT ON COLUMN professionals.average_portfolio_asset_size IS 'e.g. €500K - average portfolio/asset size under management';
