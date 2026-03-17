
-- Add poi_cache column to store pre-computed POI with distance estimates
ALTER TABLE public.properties
ADD COLUMN poi_cache jsonb DEFAULT NULL;

-- Example format: [{"name": "Airport", "distance": "25 min"}, {"name": "Sea", "distance": "5 min"}]
