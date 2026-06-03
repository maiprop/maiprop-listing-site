-- Second low-risk advisor cleanup pass:
--   - split professional owner FOR ALL policies into explicit writes because
--     SELECT is covered by the public/owner/admin select policies,
--   - consolidate marketing_leads INSERT policies into one OR-equivalent
--     policy while preserving anonymous lead submission, authenticated
--     non-admin submission, and owner-owned inserts.

BEGIN;

DROP POLICY IF EXISTS "professional_services_owner" ON public.professional_services;
DROP POLICY IF EXISTS "professional_services_owner_insert" ON public.professional_services;
DROP POLICY IF EXISTS "professional_services_owner_update" ON public.professional_services;
DROP POLICY IF EXISTS "professional_services_owner_delete" ON public.professional_services;

CREATE POLICY "professional_services_owner_insert"
  ON public.professional_services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "professional_services_owner_update"
  ON public.professional_services
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "professional_services_owner_delete"
  ON public.professional_services
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "professional_availability_owner" ON public.professional_availability;
DROP POLICY IF EXISTS "professional_availability_owner_insert" ON public.professional_availability;
DROP POLICY IF EXISTS "professional_availability_owner_update" ON public.professional_availability;
DROP POLICY IF EXISTS "professional_availability_owner_delete" ON public.professional_availability;

CREATE POLICY "professional_availability_owner_insert"
  ON public.professional_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "professional_availability_owner_update"
  ON public.professional_availability
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "professional_availability_owner_delete"
  ON public.professional_availability
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can submit leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "Public can submit leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "leads_insert" ON public.marketing_leads;
DROP POLICY IF EXISTS "marketing_leads_insert" ON public.marketing_leads;

CREATE POLICY "marketing_leads_insert"
  ON public.marketing_leads
  FOR INSERT
  TO public
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR (
      char_length(full_name) >= 2
      AND char_length(full_name) <= 200
      AND char_length(email) >= 5
      AND char_length(email) <= 254
      AND char_length(phone) >= 5
      AND char_length(phone) <= 30
      AND investment_budget >= 0
      AND (
        (SELECT auth.uid()) IS NULL
        OR NOT private.has_role((SELECT auth.uid()), 'admin'::app_role)
      )
    )
  );

COMMIT;
