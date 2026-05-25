-- =============================================================================
-- 20260703000000_agent_data_inputs.sql
-- =============================================================================
-- Agent "Data Input" feature.
--
-- Agents can submit closings (sale/lease deals they've completed) and earn a
-- 0.5% discount on their next subscription invoice for each verified entry,
-- capped at 20 entries per calendar month (= maximum 10% off next invoice).
--
-- All entries are reviewed by the platform. If an entry is flagged as a
-- hallucination/false claim, the agent is added to `agent_data_input_bans`
-- and permanently loses access to this discount feature (lifetime).
--
-- Schema overview:
--   * agent_data_inputs       — closings submitted by agents
--   * agent_data_input_bans   — lifetime bans
--   * RPCs                    — get_agent_data_input_status,
--                               get_agent_monthly_input_count,
--                               apply_verified_data_input_discount,
--                               admin_review_agent_data_input
--
-- Enforcement sits at three layers (defence in depth):
--   1. RLS — only the owning agent can SELECT/INSERT their own rows.
--   2. BEFORE INSERT trigger — rejects when banned, when not an agent, or
--                              when the monthly cap is already reached.
--   3. UPDATE trigger — only service_role / admin can flip status, ban flag,
--                       or discount-applied columns.
-- =============================================================================

-- 1. Tables -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_data_inputs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_address      TEXT NOT NULL CHECK (length(property_address) BETWEEN 5 AND 300),
  city                  TEXT,
  postal_code           TEXT,
  kaek                  TEXT,
  property_type         TEXT NOT NULL CHECK (property_type IN ('apartment','house','commercial','land','other')),
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('sale','rental')),
  agent_side            TEXT NOT NULL CHECK (agent_side IN ('buyer','seller','both')),
  sale_price            NUMERIC(14,2) NOT NULL CHECK (sale_price > 0 AND sale_price < 1000000000),
  closing_date          DATE NOT NULL CHECK (closing_date <= CURRENT_DATE AND closing_date >= CURRENT_DATE - INTERVAL '5 years'),
  buyer_name            TEXT,
  seller_name           TEXT,
  notes                 TEXT,

  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','flagged')),
  rejection_reason      TEXT,
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Discount accounting. `discount_applied` flips to true the first time this
  -- entry is credited toward a Stripe invoice (via apply_verified_data_input_discount).
  discount_pct          NUMERIC(5,3) NOT NULL DEFAULT 0.5,
  discount_applied      BOOLEAN NOT NULL DEFAULT FALSE,
  discount_applied_at   TIMESTAMPTZ,
  discount_invoice_id   TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_data_inputs IS
  'Closings submitted by agents in exchange for a 0.5%-per-entry discount on their next subscription invoice. Capped at 20 inputs per calendar month. All entries are admin-reviewed; hallucinated entries trigger a lifetime ban via agent_data_input_bans.';

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_user_month
  ON public.agent_data_inputs (
    user_id,
    (date_trunc('month', created_at AT TIME ZONE 'UTC'))
  );

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_user_status
  ON public.agent_data_inputs (user_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_pending_review
  ON public.agent_data_inputs (created_at DESC)
  WHERE status = 'pending';


CREATE TABLE IF NOT EXISTS public.agent_data_input_bans (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason     TEXT
);

COMMENT ON TABLE public.agent_data_input_bans IS
  'Lifetime bans from the agent Data Input discount feature. A row here means the user can no longer submit data inputs (the agent_data_inputs BEFORE INSERT trigger blocks them).';


-- 2. Constants helper ---------------------------------------------------------
-- Centralises the magic numbers so the cap and discount-per-input can be
-- tuned in one place if business rules change.

CREATE OR REPLACE FUNCTION public.agent_data_input_max_per_month()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT 20
$$;

CREATE OR REPLACE FUNCTION public.agent_data_input_discount_pct_per_input()
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT 0.5::NUMERIC
$$;


-- 3. Trigger: only service_role / admin can flip status / discount / ban -----

CREATE OR REPLACE FUNCTION public.agent_data_inputs_guard_admin_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  -- Always refresh updated_at on every row update regardless of caller role.
  NEW.updated_at := now();

  -- service_role bypasses auth.uid() (returns null); allow it through
  -- without enforcing admin-column guards (service_role is trusted).
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_platform_admin(v_uid);

  IF NOT v_is_admin THEN
    -- Reset any user attempt to mutate moderation/discount columns.
    NEW.status              := OLD.status;
    NEW.rejection_reason    := OLD.rejection_reason;
    NEW.reviewed_at         := OLD.reviewed_at;
    NEW.reviewed_by         := OLD.reviewed_by;
    NEW.discount_pct        := OLD.discount_pct;
    NEW.discount_applied    := OLD.discount_applied;
    NEW.discount_applied_at := OLD.discount_applied_at;
    NEW.discount_invoice_id := OLD.discount_invoice_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_data_inputs_guard ON public.agent_data_inputs;
CREATE TRIGGER trg_agent_data_inputs_guard
  BEFORE UPDATE ON public.agent_data_inputs
  FOR EACH ROW EXECUTE FUNCTION public.agent_data_inputs_guard_admin_columns();


-- 4. Trigger: enforce monthly cap, role, and ban on insert -------------------

CREATE OR REPLACE FUNCTION public.agent_data_inputs_check_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role         public.user_role;
  v_count        INT;
  v_limit        INT := public.agent_data_input_max_per_month();
  v_is_banned    BOOLEAN;
BEGIN
  -- Only an agent (or admin) may submit data inputs.
  v_role := public.authoritative_role(NEW.user_id);
  IF v_role IS DISTINCT FROM 'agent'::public.user_role
     AND v_role IS DISTINCT FROM 'admin'::public.user_role THEN
    RAISE EXCEPTION 'agent_role_required'
      USING HINT = 'Only agents can submit closings for the Data Input discount.';
  END IF;

  -- Lifetime ban check.
  SELECT EXISTS (
    SELECT 1 FROM public.agent_data_input_bans WHERE user_id = NEW.user_id
  ) INTO v_is_banned;
  IF v_is_banned THEN
    RAISE EXCEPTION 'agent_data_input_lifetime_banned'
      USING HINT = 'This account has lost access to the Data Input feature due to a previous false submission.';
  END IF;

  -- Monthly cap (calendar month, UTC).
  SELECT COUNT(*) INTO v_count
    FROM public.agent_data_inputs
   WHERE user_id = NEW.user_id
     AND date_trunc('month', created_at AT TIME ZONE 'UTC')
       = date_trunc('month', now()         AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'agent_data_input_monthly_limit_reached'
      USING HINT = format('You have already submitted %s data inputs this month (max %s).', v_count, v_limit);
  END IF;

  -- Force user_id ownership (defence in depth — RLS WITH CHECK enforces this too).
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'agent_data_input_owner_mismatch';
  END IF;

  -- Ensure status starts as 'pending' regardless of what the client sent.
  NEW.status := 'pending';
  NEW.discount_applied := FALSE;
  NEW.discount_applied_at := NULL;
  NEW.discount_invoice_id := NULL;
  NEW.discount_pct := public.agent_data_input_discount_pct_per_input();
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_data_inputs_check_insert ON public.agent_data_inputs;
CREATE TRIGGER trg_agent_data_inputs_check_insert
  BEFORE INSERT ON public.agent_data_inputs
  FOR EACH ROW EXECUTE FUNCTION public.agent_data_inputs_check_insert();


-- 5. RLS ---------------------------------------------------------------------

ALTER TABLE public.agent_data_inputs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_data_input_bans   ENABLE ROW LEVEL SECURITY;

-- agent_data_inputs: SELECT own + admins-see-all.
DROP POLICY IF EXISTS "agent_data_inputs_select_own" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_select_own" ON public.agent_data_inputs
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );

-- agent_data_inputs: INSERT only for self.
DROP POLICY IF EXISTS "agent_data_inputs_insert_own" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_insert_own" ON public.agent_data_inputs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- agent_data_inputs: UPDATE only by admin (the trigger above also strips user
-- attempts to mutate moderation/discount columns; this policy is defence in
-- depth so non-admin users can't UPDATE at all).
DROP POLICY IF EXISTS "agent_data_inputs_update_admin" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_update_admin" ON public.agent_data_inputs
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND public.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND public.has_platform_admin((SELECT auth.uid()))
  );

-- agent_data_inputs: DELETE only by admin.
DROP POLICY IF EXISTS "agent_data_inputs_delete_admin" ON public.agent_data_inputs;
CREATE POLICY "agent_data_inputs_delete_admin" ON public.agent_data_inputs
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND public.has_platform_admin((SELECT auth.uid()))
  );

-- agent_data_input_bans: read-own + admin all; mutate admin only.
DROP POLICY IF EXISTS "agent_data_input_bans_select" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_select" ON public.agent_data_input_bans
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "agent_data_input_bans_admin_write" ON public.agent_data_input_bans;
CREATE POLICY "agent_data_input_bans_admin_write" ON public.agent_data_input_bans
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND public.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND public.has_platform_admin((SELECT auth.uid()))
  );


-- 6. RPCs --------------------------------------------------------------------

-- 6.a Monthly count helper.
CREATE OR REPLACE FUNCTION public.get_agent_monthly_input_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.agent_data_inputs
   WHERE user_id = p_user_id
     AND date_trunc('month', created_at AT TIME ZONE 'UTC')
       = date_trunc('month', now()        AT TIME ZONE 'UTC')
$$;

-- 6.b Status RPC — used by the dashboard to render the counters / warning.
CREATE OR REPLACE FUNCTION public.get_agent_data_input_status(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  monthly_count           INT,
  monthly_limit           INT,
  discount_pct_per_input  NUMERIC,
  pending_discount_pct    NUMERIC,
  pending_discount_count  INT,
  total_pending           INT,
  total_verified          INT,
  total_rejected          INT,
  lifetime_banned         BOOLEAN,
  ban_reason              TEXT,
  banned_at               TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- service_role calls (e.g. from edge functions) have auth.uid() = NULL; in
  -- that case the caller has already vetted authorization (they hold the
  -- service role key) and must explicitly pass p_user_id. For end-user calls
  -- through PostgREST, require either self-lookup or admin.
  IF v_caller IS NULL THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
  ELSIF v_caller IS DISTINCT FROM p_user_id
        AND NOT public.has_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE date_trunc('month', created_at AT TIME ZONE 'UTC')
            = date_trunc('month', now()        AT TIME ZONE 'UTC')
      )::INT AS monthly_count,
      COUNT(*) FILTER (WHERE status = 'pending')::INT  AS total_pending,
      COUNT(*) FILTER (WHERE status = 'verified')::INT AS total_verified,
      COUNT(*) FILTER (WHERE status = 'rejected' OR status = 'flagged')::INT AS total_rejected,
      COUNT(*) FILTER (WHERE status = 'verified' AND discount_applied = FALSE)::INT
        AS pending_discount_count,
      COALESCE(SUM(discount_pct) FILTER (WHERE status = 'verified' AND discount_applied = FALSE), 0)::NUMERIC
        AS pending_discount_pct
    FROM public.agent_data_inputs
    WHERE user_id = p_user_id
  ),
  ban AS (
    -- Alias columns away from this function's OUT-parameter names
    -- (`ban_reason`, `banned_at`) so the SELECT below isn't ambiguous.
    SELECT b.reason AS b_reason, b.banned_at AS b_banned_at
      FROM public.agent_data_input_bans b
     WHERE b.user_id = p_user_id LIMIT 1
  )
  SELECT
    c.monthly_count,
    public.agent_data_input_max_per_month(),
    public.agent_data_input_discount_pct_per_input(),
    LEAST(
      c.pending_discount_pct,
      public.agent_data_input_max_per_month() * public.agent_data_input_discount_pct_per_input()
    )::NUMERIC AS pending_discount_pct,
    c.pending_discount_count,
    c.total_pending,
    c.total_verified,
    c.total_rejected,
    EXISTS (SELECT 1 FROM ban) AS lifetime_banned,
    (SELECT b_reason    FROM ban),
    (SELECT b_banned_at FROM ban)
  FROM counts c;
END;
$$;

-- 6.c Apply discount RPC — flips discount_applied for verified-and-not-yet-applied
-- rows belonging to p_user_id, returning the percentage that should be applied
-- to the invoice. Capped at MAX_PER_MONTH × DISCOUNT_PER_INPUT (= 10% today).
-- Designed to be called by the stripe-webhook edge function (service_role) on
-- invoice.created for an upcoming subscription invoice. Idempotent per invoice
-- because once discount_applied = true the row is not eligible again.
CREATE OR REPLACE FUNCTION public.apply_verified_data_input_discount(
  p_user_id    UUID,
  p_invoice_id TEXT
)
RETURNS TABLE (applied_count INT, applied_pct NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_per_month INT     := public.agent_data_input_max_per_month();
  v_applied       INT;
  v_applied_pct   NUMERIC;
BEGIN
  IF p_user_id IS NULL OR p_invoice_id IS NULL OR length(p_invoice_id) = 0 THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  WITH eligible AS (
    SELECT id, discount_pct FROM public.agent_data_inputs
     WHERE user_id = p_user_id
       AND status = 'verified'
       AND discount_applied = FALSE
     ORDER BY created_at ASC
     LIMIT v_max_per_month
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.agent_data_inputs t
       SET discount_applied    = TRUE,
           discount_applied_at = now(),
           discount_invoice_id = p_invoice_id
      FROM eligible e
     WHERE t.id = e.id
     RETURNING e.discount_pct
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(discount_pct), 0)::NUMERIC
    INTO v_applied, v_applied_pct
    FROM upd;

  RETURN QUERY
  SELECT v_applied,
         LEAST(
           v_applied_pct,
           v_max_per_month * public.agent_data_input_discount_pct_per_input()
         )::NUMERIC;
END;
$$;

-- 6.d Admin review RPC — admin verifies/rejects an entry. If rejection reason
-- is "hallucination" or admin sets ban=true the user is added to the lifetime
-- ban table.
-- Drop the previous 4-arg signature (if any) so re-running this migration
-- against a DB where it already exists doesn't leave both overloads behind.
DROP FUNCTION IF EXISTS public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_review_agent_data_input(
  p_input_id     UUID,
  p_decision     TEXT,
  p_reason       TEXT DEFAULT NULL,
  p_lifetime_ban BOOLEAN DEFAULT FALSE,
  p_reviewer_id  UUID DEFAULT NULL
)
RETURNS public.agent_data_inputs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_reviewer UUID;
  v_row      public.agent_data_inputs%ROWTYPE;
BEGIN
  -- service_role / edge-function path: auth.uid() is NULL, but the caller
  -- holds the service role key so they have already verified authorization
  -- before calling. Trust them but require an explicit reviewer id so the
  -- audit trail (reviewed_by) is populated.
  IF v_uid IS NULL THEN
    IF p_reviewer_id IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
    v_reviewer := p_reviewer_id;
  ELSE
    IF NOT public.has_platform_admin(v_uid) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    v_reviewer := COALESCE(p_reviewer_id, v_uid);
  END IF;

  IF p_decision NOT IN ('verified','rejected','flagged','pending') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  UPDATE public.agent_data_inputs
     SET status           = p_decision,
         rejection_reason = CASE WHEN p_decision IN ('rejected','flagged') THEN p_reason ELSE NULL END,
         reviewed_at      = now(),
         reviewed_by      = v_reviewer
   WHERE id = p_input_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_lifetime_ban THEN
    INSERT INTO public.agent_data_input_bans (user_id, banned_by, reason)
    VALUES (v_row.user_id, v_reviewer, COALESCE(p_reason, 'False / hallucinated submission'))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;


-- 7. Grants ------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agent_data_input_status(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_monthly_input_count(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
-- apply_verified_data_input_discount is intentionally NOT granted to authenticated;
-- only service_role (used by the stripe-webhook edge function) may call it.
