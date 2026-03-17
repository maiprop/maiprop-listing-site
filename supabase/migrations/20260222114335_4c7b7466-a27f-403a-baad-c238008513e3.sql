-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;

CREATE POLICY "Anyone can insert leads"
ON public.leads
FOR INSERT
TO public
WITH CHECK (true);