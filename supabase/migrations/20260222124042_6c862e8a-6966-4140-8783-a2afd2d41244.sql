-- Fix: The "Anyone can insert leads" policy must be PERMISSIVE (not RESTRICTIVE)
-- Drop and recreate as explicitly PERMISSIVE
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;

CREATE POLICY "Anyone can insert leads"
ON public.leads
AS PERMISSIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (true);