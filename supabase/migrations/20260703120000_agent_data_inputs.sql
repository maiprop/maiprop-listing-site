-- =============================================================================
-- 20260703120000_agent_data_inputs.sql
-- =============================================================================
-- Agent "Data Input" loyalty programme.
--
-- Agents can submit details of closings they completed off-platform. Each
-- VERIFIED submission grants a 0.5% discount on the agent's next subscription
-- invoice. Submissions are capped at 20 per calendar month. Submissions that
-- are reviewed as fabricated/hallucinated cause the agent to be permanently
-- banned from the feature.
--
-- DB layer is the source of truth: the submit RPC enforces the monthly cap
-- and the lifetime ban. The Stripe credit is applied by an admin-only edge
-- function only AFTER an admin has reviewed and verified the submission.
--
-- Tables:
--   * agent_data_inputs       — one row per submission, lifecycle pending → verified|rejected
--   * agent_data_input_bans   — one row per banned agent (user_id PK = lifetime ban)
--
-- RPCs:
--   * submit_agent_data_input(...)            — agent-callable
--   * agent_data_input_quota(p_user_id)       — agent-callable (returns used/limit/remaining/banned)
--   * admin_review_agent_data_input(...)      — admin-only review action
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. agent_data_inputs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_data_inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  closed_at DATE NOT NULL,
  property_address TEXT NOT NULL,
  property_city TEXT NOT NULL,
  property_postal_code TEXT,
  property_type TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'rent')),
  closing_price NUMERIC(14, 2) NOT NULL CHECK (closing_price >= 0),
  kaek TEXT,
  buyer_name TEXT,
  seller_name TEXT,
  notes TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Stripe credit application (filled by apply-data-input-credit edge function).
  -- discount_pct is fixed at 0.5 today but stored per-row so future tier tweaks
  -- don't retroactively change historical credit amounts.
  discount_pct NUMERIC(5, 3) NOT NULL DEFAULT 0.5,
  applied_to_invoice_at TIMESTAMPTZ,
  stripe_credit_id TEXT,
  stripe_credit_amount_cents INTEGER,
  stripe_credit_currency TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_data_inputs IS
  'Agent-submitted closing records. Each verified row grants 0.5% off next '
  'Stripe invoice (max 20/month). See migration 20260703120000.';

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_user_month
  ON public.agent_data_inputs (user_id, (date_trunc('month', created_at AT TIME ZONE 'UTC')));

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_status
  ON public.agent_data_inputs (status, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.agent_data_inputs ENABLE ROW LEVEL SECURITY;

-- updated_at trigger -----------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_agent_data_inputs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_data_inputs_updated_at ON public.agent_data_inputs;
CREATE TRIGGER agent_data_inputs_updated_at
  BEFORE UPDATE ON public.agent_data_inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_agent_data_inputs_updated_at();

-- RLS policies -----------------------------------------------------
DROP POLICY IF EXISTS "agent_data_inputs_select_own" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_select_own"
  ON public.agent_data_inputs FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );

-- INSERTs go through the submit_agent_data_input RPC (security definer).
-- Direct client INSERTs are intentionally blocked so the monthly cap and
-- ban check cannot be bypassed.
DROP POLICY IF EXISTS "agent_data_inputs_insert_blocked" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_insert_blocked"
  ON public.agent_data_inputs FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Updates go through admin_review_agent_data_input RPC (security definer).
-- Direct client UPDATEs are blocked.
DROP POLICY IF EXISTS "agent_data_inputs_update_blocked" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_update_blocked"
  ON public.agent_data_inputs FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "agent_data_inputs_delete_blocked" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_delete_blocked"
  ON public.agent_data_inputs FOR DELETE
  TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. agent_data_input_bans
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_data_input_bans (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL
);

COMMENT ON TABLE public.agent_data_input_bans IS
  'Lifetime ban from the agent data-input loyalty programme. Presence of a row '
  'permanently disables submissions for that user_id. See migration 20260703120000.';

ALTER TABLE public.agent_data_input_bans ENABLE ROW LEVEL SECURITY;

-- Agents can see their own ban (so the UI can show the banned state).
DROP POLICY IF EXISTS "agent_data_input_bans_select_own_or_admin" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_select_own_or_admin"
  ON public.agent_data_input_bans FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );

-- All writes go through admin_review_agent_data_input RPC.
DROP POLICY IF EXISTS "agent_data_input_bans_insert_blocked" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_insert_blocked"
  ON public.agent_data_input_bans FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "agent_data_input_bans_update_blocked" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_update_blocked"
  ON public.agent_data_input_bans FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "agent_data_input_bans_delete_blocked" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_delete_blocked"
  ON public.agent_data_input_bans FOR DELETE
  TO authenticated
  USING (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: agent_data_input_quota
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the caller's current monthly usage, the configured cap, remaining
-- submissions, and whether the caller is permanently banned.
CREATE OR REPLACE FUNCTION public.agent_data_input_quota(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  used INTEGER,
  monthly_limit INTEGER,
  remaining INTEGER,
  is_banned BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_target UUID := COALESCE(p_user_id, v_caller);
  v_limit INTEGER := 20;
  v_used INTEGER := 0;
  v_banned BOOLEAN := false;
BEGIN
  -- Only allow self-lookup unless caller is a platform admin.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_target <> v_caller AND NOT public.has_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'Not authorised to inspect another user''s quota'
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)
    INTO v_used
    FROM public.agent_data_inputs
   WHERE user_id = v_target
     AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC');

  SELECT EXISTS (
    SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_target
  ) INTO v_banned;

  used := v_used;
  monthly_limit := v_limit;
  remaining := GREATEST(v_limit - v_used, 0);
  is_banned := v_banned;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_data_input_quota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_data_input_quota(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: submit_agent_data_input
-- ─────────────────────────────────────────────────────────────────────────────
-- Validates: caller is authenticated, has agent role, is NOT banned, and has
-- not exceeded the monthly cap of 20. Inserts and returns the new row id.
CREATE OR REPLACE FUNCTION public.submit_agent_data_input(
  p_closed_at DATE,
  p_property_address TEXT,
  p_property_city TEXT,
  p_transaction_type TEXT,
  p_closing_price NUMERIC,
  p_property_postal_code TEXT DEFAULT NULL,
  p_property_type TEXT DEFAULT NULL,
  p_kaek TEXT DEFAULT NULL,
  p_buyer_name TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_used INTEGER;
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Role check: only agents (and admins, for testing) can submit.
  SELECT role::TEXT INTO v_role FROM public.profiles WHERE user_id = v_user LIMIT 1;
  IF v_role IS DISTINCT FROM 'agent' AND NOT public.has_platform_admin(v_user) THEN
    RAISE EXCEPTION 'Only agents can submit data inputs' USING ERRCODE = '42501';
  END IF;

  -- Lifetime ban check.
  IF EXISTS (SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Data input submissions are permanently disabled for this account'
      USING ERRCODE = '42501';
  END IF;

  -- Monthly cap (20).
  SELECT COUNT(*) INTO v_used
    FROM public.agent_data_inputs
   WHERE user_id = v_user
     AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_used >= 20 THEN
    RAISE EXCEPTION 'Monthly data input limit (20) reached'
      USING ERRCODE = '23514';
  END IF;

  -- Basic input validation (defence-in-depth on top of CHECK constraints).
  IF p_transaction_type NOT IN ('sale', 'rent') THEN
    RAISE EXCEPTION 'transaction_type must be sale or rent' USING ERRCODE = '22023';
  END IF;
  IF p_closing_price IS NULL OR p_closing_price < 0 THEN
    RAISE EXCEPTION 'closing_price must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_closed_at IS NULL OR p_closed_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'closed_at must be a past or present date' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_property_address, '')) = 0 THEN
    RAISE EXCEPTION 'property_address is required' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_property_city, '')) = 0 THEN
    RAISE EXCEPTION 'property_city is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.agent_data_inputs (
    user_id, closed_at,
    property_address, property_city, property_postal_code, property_type,
    transaction_type, closing_price,
    kaek, buyer_name, seller_name, notes
  ) VALUES (
    v_user, p_closed_at,
    p_property_address, p_property_city, p_property_postal_code, p_property_type,
    p_transaction_type, p_closing_price,
    p_kaek, p_buyer_name, p_seller_name, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: admin_review_agent_data_input
-- ─────────────────────────────────────────────────────────────────────────────
-- Admin-only. Marks a submission verified or rejected; optionally also bans
-- the agent for life ("ban_for_lifetime" action) if the submission is judged
-- to be fabricated.
--
-- p_action: 'verify' | 'reject' | 'reject_and_ban'
CREATE OR REPLACE FUNCTION public.admin_review_agent_data_input(
  p_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.agent_data_inputs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_decision TEXT;
  v_ban BOOLEAN := FALSE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'Only platform admins can review data inputs' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('verify', 'reject', 'reject_and_ban') THEN
    RAISE EXCEPTION 'p_action must be verify, reject, or reject_and_ban'
      USING ERRCODE = '22023';
  END IF;

  IF p_action = 'verify' THEN
    v_decision := 'verified';
  ELSIF p_action = 'reject' THEN
    v_decision := 'rejected';
  ELSE
    v_decision := 'rejected';
    v_ban := TRUE;
  END IF;

  RETURN public.admin_review_agent_data_input(p_id, v_decision, p_reason, v_ban, v_caller);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
