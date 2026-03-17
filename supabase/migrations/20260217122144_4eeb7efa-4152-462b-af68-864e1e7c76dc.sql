
-- Remove permissive policies
DROP POLICY IF EXISTS "Anyone can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete property images" ON storage.objects;

-- Add admin-only policies
CREATE POLICY "Admins can upload property images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'property-images' AND
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update property images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'property-images' AND
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete property images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'property-images' AND
    public.has_role(auth.uid(), 'admin')
  );
