
-- Create storage bucket for property images
INSERT INTO storage.buckets (id, name, public) VALUES ('property-images', 'property-images', true);

-- Allow anyone to view property images (public bucket)
CREATE POLICY "Property images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

-- Allow anyone to upload property images (admin has no auth)
CREATE POLICY "Anyone can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'property-images');

-- Allow anyone to update property images
CREATE POLICY "Anyone can update property images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'property-images');

-- Allow anyone to delete property images
CREATE POLICY "Anyone can delete property images"
ON storage.objects FOR DELETE
USING (bucket_id = 'property-images');
