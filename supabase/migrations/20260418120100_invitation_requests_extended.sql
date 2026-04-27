-- =============================================================================
-- Extend invitation_requests with professional investor profile fields
-- =============================================================================

ALTER TABLE public.invitation_requests
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS investment_focus text,
  ADD COLUMN IF NOT EXISTS deal_size_range text,
  ADD COLUMN IF NOT EXISTS geographic_focus text,
  ADD COLUMN IF NOT EXISTS investment_vehicle text,
  ADD COLUMN IF NOT EXISTS years_experience text,
  ADD COLUMN IF NOT EXISTS aum_range text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false;

COMMENT ON COLUMN public.invitation_requests.phone IS 'Contact phone number';
COMMENT ON COLUMN public.invitation_requests.job_title IS 'Job title or role at company/fund';
COMMENT ON COLUMN public.invitation_requests.company_website IS 'Company or fund website URL';
COMMENT ON COLUMN public.invitation_requests.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN public.invitation_requests.investment_focus IS 'Primary investment focus: residential, commercial, land, mixed, distressed';
COMMENT ON COLUMN public.invitation_requests.deal_size_range IS 'Typical deal size range in EUR';
COMMENT ON COLUMN public.invitation_requests.geographic_focus IS 'Geographic focus or target markets';
COMMENT ON COLUMN public.invitation_requests.investment_vehicle IS 'Investment vehicle: personal, family_office, fund, institutional';
COMMENT ON COLUMN public.invitation_requests.years_experience IS 'Years of real estate investment experience';
COMMENT ON COLUMN public.invitation_requests.aum_range IS 'AUM range (optional, for qualification)';
COMMENT ON COLUMN public.invitation_requests.source IS 'How they heard about the platform';
COMMENT ON COLUMN public.invitation_requests.terms_accepted IS 'User accepted terms and data use';
