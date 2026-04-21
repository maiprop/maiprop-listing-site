-- =============================================================================
-- Fix schema gaps exposed by strict TypeScript type checking
--
-- 1. notifications: add missing `link` column used by frontend
-- 2. leads: rename old marketing table to marketing_leads,
--           create proper CRM leads table (was blocked by IF NOT EXISTS)
-- 3. deal_checklists: no change needed — title/status already exist in DB
-- =============================================================================


-- ── 1. notifications: add link column ────────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link TEXT;


-- ── 2. Rename old marketing leads → marketing_leads ──────────────────────────
--    The old table has: full_name, investment_budget, nationality, etc.
--    The new CRM leads table has: name, source, status, notes, follow_up_at
--    Idempotent: 20260425120000 may already have performed the rename.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.leads RENAME TO marketing_leads';
  END IF;
END $$;

-- Update any RLS policies that referenced old table name
-- (policies move with the table rename automatically in Postgres)


-- ── 3. Create proper CRM leads table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source         TEXT        NOT NULL DEFAULT 'manual'
                             CHECK (source IN (
                               'manual','listing_inquiry','consultation',
                               'callback','project_inquiry','viewing','message'
                             )),
  listing_id     UUID        REFERENCES public.listings(id) ON DELETE SET NULL,
  professional_id UUID       REFERENCES public.professionals(id) ON DELETE SET NULL,
  project_id     UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  name           TEXT        NOT NULL,
  email          TEXT,
  phone          TEXT,
  message        TEXT,
  status         TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN (
                               'new','contacted','qualified',
                               'proposal','negotiation','won','lost'
                             )),
  notes          TEXT,
  follow_up_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own leads" ON public.leads;
CREATE POLICY "Users select own leads"
  ON public.leads FOR SELECT
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users insert own leads" ON public.leads;
CREATE POLICY "Users insert own leads"
  ON public.leads FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own leads" ON public.leads;
CREATE POLICY "Users update own leads"
  ON public.leads FOR UPDATE
  USING  (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users delete own leads" ON public.leads;
CREATE POLICY "Users delete own leads"
  ON public.leads FOR DELETE
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admin select all leads" ON public.leads;
CREATE POLICY "Admin select all leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'::public.user_role
    )
  );

DROP INDEX IF EXISTS idx_leads_owner;
DROP INDEX IF EXISTS idx_leads_status;
DROP INDEX IF EXISTS idx_leads_source;
DROP INDEX IF EXISTS idx_leads_follow_up;
DROP INDEX IF EXISTS idx_leads_listing;
DROP INDEX IF EXISTS idx_leads_created;

CREATE INDEX idx_leads_owner      ON public.leads(owner_id);
CREATE INDEX idx_leads_status     ON public.leads(status);
CREATE INDEX idx_leads_source     ON public.leads(source);
CREATE INDEX idx_leads_follow_up  ON public.leads(follow_up_at);
CREATE INDEX idx_leads_listing    ON public.leads(listing_id);
CREATE INDEX idx_leads_created    ON public.leads(created_at DESC);

DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
