-- Drop the overly permissive public INSERT policy
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;

-- Re-create as anon-role only (chatbot works unauthenticated) with input length guards
-- to prevent abuse while keeping the lead capture flow intact
CREATE POLICY "Public can submit leads"
  ON public.leads
  FOR INSERT
  TO anon
  WITH CHECK (
    char_length(full_name) BETWEEN 2 AND 200
    AND char_length(email) BETWEEN 5 AND 254
    AND char_length(phone) BETWEEN 5 AND 30
    AND investment_budget >= 0
  );

-- Also allow authenticated non-admin users to submit leads (e.g. logged-in visitors)
CREATE POLICY "Authenticated users can submit leads"
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT has_role(auth.uid(), 'admin'::app_role)
    AND char_length(full_name) BETWEEN 2 AND 200
    AND char_length(email) BETWEEN 5 AND 254
    AND char_length(phone) BETWEEN 5 AND 30
    AND investment_budget >= 0
  );