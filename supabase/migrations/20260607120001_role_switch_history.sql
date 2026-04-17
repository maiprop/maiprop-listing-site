-- Role switch history
-- Tracks every time a user changes their participant type.
-- Used for billing audit trail, support, and analytics.

CREATE TABLE IF NOT EXISTS public.role_switch_history (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_type        TEXT        NOT NULL CHECK (from_type IN ('buyer','seller','agent','developer','professional','investor','institutional')),
  to_type          TEXT,       -- NULL means switch was initiated but onboarding not yet completed
  from_plan_key    TEXT,       -- e.g. 'pro', 'agent_basic'
  to_plan_key      TEXT,
  switch_kind      TEXT        CHECK (switch_kind IN ('same-tier','upgrade','downgrade','proonly')),
  had_active_sub   BOOLEAN     NOT NULL DEFAULT false,
  sub_cancelled    BOOLEAN     NOT NULL DEFAULT false,
  switched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.role_switch_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own history
CREATE POLICY "Users can read own role switch history"
  ON public.role_switch_history FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT is blocked for all JWT roles.
-- The log-role-switch edge function uses the service role key (bypasses RLS) to write rows.
-- This prevents clients from writing arbitrary audit records directly.
CREATE POLICY "Block direct client inserts"
  ON public.role_switch_history FOR INSERT
  WITH CHECK (false);

-- Admins can read all
CREATE POLICY "Admins can read all role switch history"
  ON public.role_switch_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND is_platform_admin = true
    )
  );

-- Index for user lookup and admin reporting
CREATE INDEX IF NOT EXISTS idx_role_switch_history_user_id
  ON public.role_switch_history(user_id, switched_at DESC);
