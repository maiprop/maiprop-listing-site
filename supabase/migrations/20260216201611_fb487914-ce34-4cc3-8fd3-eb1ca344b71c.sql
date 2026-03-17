
-- Create properties table
CREATE TABLE public.properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  images TEXT[] NOT NULL DEFAULT '{}',
  before_image TEXT NOT NULL DEFAULT '',
  after_image TEXT NOT NULL DEFAULT '',
  price INTEGER,
  size INTEGER,
  bedrooms INTEGER,
  floor_plan TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  poi TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT '' CHECK (status IN ('available', 'sold', 'under-construction', '')),
  project_type TEXT NOT NULL DEFAULT 'new' CHECK (project_type IN ('new', 'delivered')),
  yield TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  construction_year TEXT NOT NULL DEFAULT '',
  date_added TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Public read access (properties are shown to all visitors)
CREATE POLICY "Properties are publicly readable"
  ON public.properties
  FOR SELECT
  USING (true);

-- For now, allow all inserts/updates/deletes (admin functionality)
-- In future, restrict to authenticated admin users
CREATE POLICY "Allow all inserts"
  ON public.properties
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all updates"
  ON public.properties
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow all deletes"
  ON public.properties
  FOR DELETE
  USING (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
