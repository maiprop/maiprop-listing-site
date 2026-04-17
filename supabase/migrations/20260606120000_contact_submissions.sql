-- Contact form submissions and document share requests.
-- Public-insert, admin-read (via service_role).

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type        TEXT        NOT NULL DEFAULT 'contact'
                          CHECK (type IN ('contact', 'document_share')),
  name        TEXT,
  email       TEXT        NOT NULL,
  company     TEXT,
  message     TEXT,
  -- document_share fields
  document_type  TEXT,
  listing_title  TEXT,
  share_to_email TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous) can insert
CREATE POLICY "Anyone can submit contact form"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

-- Only service_role can read
CREATE POLICY "Service role can read submissions"
  ON public.contact_submissions FOR SELECT
  USING (auth.role() = 'service_role');
