-- =============================================================================
-- Analytics, Contacts CRM, Messages improvements
-- =============================================================================

-- ── 1. Listing view events (for trends) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_view_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.listing_view_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can see listing view events"
  ON public.listing_view_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND owner_id = auth.uid())
  );

CREATE POLICY "Anyone can insert listing view"
  ON public.listing_view_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_listing_view_events_listing ON public.listing_view_events(listing_id);
CREATE INDEX idx_listing_view_events_viewed_at ON public.listing_view_events(viewed_at);


-- ── 2. Contacts: deal stage, pipeline, follow-up, tasks ──────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS deal_stage TEXT NOT NULL DEFAULT 'new' CHECK (deal_stage IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_deal_stage ON public.contacts(deal_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up_at ON public.contacts(follow_up_at);

CREATE TABLE IF NOT EXISTS public.contact_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact tasks"
  ON public.contact_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_contact_tasks_contact ON public.contact_tasks(contact_id);
CREATE INDEX idx_contact_tasks_user ON public.contact_tasks(user_id);
CREATE INDEX idx_contact_tasks_due ON public.contact_tasks(due_at);

CREATE TRIGGER update_contact_tasks_updated_at
  BEFORE UPDATE ON public.contact_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── 3. Message attachments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view message attachments"
  ON public.message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

CREATE POLICY "Participants can insert message attachments"
  ON public.message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
      AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

CREATE INDEX idx_message_attachments_message ON public.message_attachments(message_id);

-- Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload message attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Message attachments are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'message-attachments');


-- ── 4. Saved searches: last alert tracking ───────────────────────────────────
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_alert_listing_ids UUID[] DEFAULT '{}';
