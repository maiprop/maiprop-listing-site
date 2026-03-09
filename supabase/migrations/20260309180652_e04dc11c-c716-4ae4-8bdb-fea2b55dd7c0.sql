
-- Make condition nullable since we're removing it from the form
ALTER TABLE public.firesale_requests ALTER COLUMN condition DROP NOT NULL;
ALTER TABLE public.firesale_requests ALTER COLUMN condition SET DEFAULT NULL;

-- Create storage bucket for firesale photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('firesale-photos', 'firesale-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for firesale-photos bucket
CREATE POLICY "Anyone can upload firesale photos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'firesale-photos');

CREATE POLICY "Firesale photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'firesale-photos');

CREATE POLICY "Users can delete their own firesale photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'firesale-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
