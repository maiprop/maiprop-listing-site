CREATE TABLE public.sync_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('hub_to_os', 'os_to_hub')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('listing', 'report', 'lead', 'profile')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'skipped')),
  error_message TEXT,
  records_affected INTEGER DEFAULT 0,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync logs"
  ON public.sync_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agent'::user_role));

CREATE POLICY "Service role can insert sync logs"
  ON public.sync_log
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'agent'::user_role));

CREATE INDEX idx_sync_log_direction_created ON public.sync_log (direction, created_at DESC);
CREATE INDEX idx_sync_log_entity_type ON public.sync_log (entity_type, created_at DESC);
CREATE INDEX idx_sync_log_status ON public.sync_log (status, created_at DESC);