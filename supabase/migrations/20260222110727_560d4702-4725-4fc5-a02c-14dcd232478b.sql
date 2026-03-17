
-- Add database-level constraints for lead validation
ALTER TABLE public.leads ADD CONSTRAINT leads_email_format 
  CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

ALTER TABLE public.leads ADD CONSTRAINT leads_budget_minimum 
  CHECK (investment_budget >= 250000);

ALTER TABLE public.leads ADD CONSTRAINT leads_phone_format 
  CHECK (phone ~* '^\+?[0-9\s\-()]{7,20}$');

ALTER TABLE public.leads ADD CONSTRAINT leads_full_name_length 
  CHECK (char_length(full_name) >= 2 AND char_length(full_name) <= 100);

ALTER TABLE public.leads ADD CONSTRAINT leads_nationality_length 
  CHECK (char_length(nationality) >= 2 AND char_length(nationality) <= 100);

ALTER TABLE public.leads ADD CONSTRAINT leads_email_length 
  CHECK (char_length(email) <= 255);

ALTER TABLE public.leads ADD CONSTRAINT leads_preferred_location_length 
  CHECK (char_length(preferred_location) <= 200);
