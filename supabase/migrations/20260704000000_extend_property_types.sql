-- =============================================================================
-- 20260704000000_extend_property_types.sql
-- Extend the property_type enum to cover all real-estate typologies.
-- =============================================================================

ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'studio';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'maisonette';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'hotel';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'mixed_use';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'parking';
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'storage';
