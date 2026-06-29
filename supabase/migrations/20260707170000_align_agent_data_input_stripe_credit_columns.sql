-- Keep the two historical agent data-input credit models aligned.
--
-- Older code marked invoice-item discounts with discount_applied* columns.
-- Newer code applies Stripe customer balance credits and records stripe_credit*.
-- The dashboard and Edge Functions now bridge both shapes while preferring the
-- Stripe balance transaction fields for new credits.

ALTER TABLE public.agent_data_inputs
  ADD COLUMN IF NOT EXISTS discount_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discount_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discount_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS applied_to_invoice_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_credit_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_credit_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_credit_currency TEXT;

UPDATE public.agent_data_inputs
   SET applied_to_invoice_at = discount_applied_at
 WHERE applied_to_invoice_at IS NULL
   AND discount_applied_at IS NOT NULL;

UPDATE public.agent_data_inputs
   SET discount_applied_at = applied_to_invoice_at
 WHERE discount_applied_at IS NULL
   AND applied_to_invoice_at IS NOT NULL;

UPDATE public.agent_data_inputs
   SET discount_invoice_id = stripe_credit_id
 WHERE discount_invoice_id IS NULL
   AND stripe_credit_id IS NOT NULL;

UPDATE public.agent_data_inputs
   SET discount_applied = TRUE
 WHERE discount_applied = FALSE
   AND (
     discount_applied_at IS NOT NULL
     OR discount_invoice_id IS NOT NULL
     OR applied_to_invoice_at IS NOT NULL
     OR stripe_credit_id IS NOT NULL
   );

CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_user_credit_applied
  ON public.agent_data_inputs (user_id, applied_to_invoice_at DESC)
  WHERE applied_to_invoice_at IS NOT NULL OR discount_applied = TRUE;

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
      COUNT(*) FILTER (
        WHERE status = 'verified'
          AND COALESCE(discount_applied, FALSE) = FALSE
          AND applied_to_invoice_at IS NULL
          AND stripe_credit_id IS NULL
      )::INT AS pending_discount_count,
      COALESCE(SUM(discount_pct) FILTER (
        WHERE status = 'verified'
          AND COALESCE(discount_applied, FALSE) = FALSE
          AND applied_to_invoice_at IS NULL
          AND stripe_credit_id IS NULL
      ), 0)::NUMERIC AS pending_discount_pct
    FROM public.agent_data_inputs
    WHERE user_id = p_user_id
  ),
  ban AS (
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
       AND COALESCE(discount_applied, FALSE) = FALSE
       AND applied_to_invoice_at IS NULL
       AND stripe_credit_id IS NULL
     ORDER BY created_at ASC
     LIMIT v_max_per_month
     FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.agent_data_inputs t
       SET discount_applied      = TRUE,
           discount_applied_at   = now(),
           discount_invoice_id   = p_invoice_id,
           applied_to_invoice_at = now()
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

REVOKE ALL ON FUNCTION public.get_agent_data_input_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_data_input_status(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) TO service_role;
