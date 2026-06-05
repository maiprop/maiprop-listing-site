-- =============================================================================
-- 20260623160000_ai_usage_tracking.sql
-- =============================================================================
-- Per-user monthly cost ceilings for AI endpoints that don't already have
-- dedicated usage tables.
--
-- Existing coverage (migration 20260517120000_plan_limits_usage_tables.sql):
--   - usage_ai_valuations    → property-valuation
--   - usage_property_reports → reports endpoints (Pro)
--   - usage_priority_ads     → priority-ad spend
--
-- Added by this migration:
--   - usage_ai_calls table (one row per AI call, with bucket label)
--   - ai_usage_limits table (admin-tunable per-bucket caps)
--   - check_ai_quota() / record_ai_call() RPCs
--   - BEFORE INSERT trigger for defence-in-depth
--
-- Buckets covered (excludes ai-translate which is verify_jwt=false):
--   ai-search, property-chat, neighbourhood-report, smart-filters,
--   listing-ai-assist, property-pois, ai-service-match, pro-ai-tools.
--
-- Race-conditions: a strict cap is enforced by the BEFORE INSERT trigger,
-- so concurrent calls cannot exceed the limit by more than 1 in
-- pathological cases (and even then the trigger raises). The
-- check_ai_quota() RPC is for pre-flight UX so the edge fn can return a
-- nice 429 with details before burning OpenAI credits.
-- =============================================================================

-- 1. Per-bucket configurable limits ------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  bucket          TEXT PRIMARY KEY,
  free_monthly    INTEGER NOT NULL DEFAULT 0,
  pro_monthly     INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  is_pro_only     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (so the client can show "X of Y used").
CREATE POLICY "ai_usage_limits_select" ON public.ai_usage_limits
  FOR SELECT TO authenticated USING (true);
-- Only platform admin can mutate.
CREATE POLICY "ai_usage_limits_admin_write" ON public.ai_usage_limits
  FOR ALL TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

-- Sensible defaults. Tune later via the admin panel if cost data warrants.
INSERT INTO public.ai_usage_limits (bucket, free_monthly, pro_monthly, description, is_pro_only) VALUES
  ('ai-search',             10,  200, 'Natural-language search query parsing',                FALSE),
  ('property-chat',          5,  100, 'Per-property AI Q&A',                                  FALSE),
  ('neighbourhood-report',   2,   30, 'Neighbourhood deep-dive report',                       FALSE),
  ('smart-filters',         30,  600, 'Smart filter suggestions',                             FALSE),
  ('listing-ai-assist',     10,  100, 'AI-assisted listing description / price estimate',     FALSE),
  ('property-pois',          5,   50, 'AI-generated points of interest near a property',      FALSE),
  ('ai-service-match',       5,   50, 'AI matchmaker for finding professionals',              FALSE),
  ('pro-ai-tools',           0,  100, 'Pro-tier AI tools (CMA, valuation prompts, etc.)',     TRUE),
  ('ai-translate',         500, 5000, 'AI-assisted UI translation requests',                  FALSE)
ON CONFLICT (bucket) DO NOTHING;


-- 2. Usage log ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_ai_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_ai_calls_user_bucket_month
  ON public.usage_ai_calls (
    user_id,
    bucket,
    (date_trunc('month', created_at AT TIME ZONE 'UTC'))
  );

ALTER TABLE public.usage_ai_calls ENABLE ROW LEVEL SECURITY;

-- Users see their own usage; admins see all.
CREATE POLICY "usage_ai_calls_select_own" ON public.usage_ai_calls
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR public.has_platform_admin((SELECT auth.uid()))
  );

-- INSERT only via SECURITY DEFINER record_ai_call() — block direct inserts.
-- (No INSERT policy => INSERT requires service_role or DEFINER context.)


-- 3. Limit lookup ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_limit(
  p_user_id UUID,
  p_bucket  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
  v_free        INTEGER;
  v_pro         INTEGER;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  -- Admins / institutional / developer / investor: effectively unlimited.
  IF v_role IN (
    'admin'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN 999999;
  END IF;

  SELECT free_monthly, pro_monthly INTO v_free, v_pro
    FROM public.ai_usage_limits
    WHERE bucket = p_bucket
    LIMIT 1;

  -- Unknown bucket: deny by default (forces explicit configuration).
  IF v_free IS NULL THEN RETURN 0; END IF;

  RETURN CASE WHEN v_is_pro THEN v_pro ELSE v_free END;
END;
$$;


-- 4. Pre-flight quota check (called by edge fn before doing AI work) --------

CREATE OR REPLACE FUNCTION public.check_ai_quota(p_bucket TEXT)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_limit  INTEGER;
  v_count  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'not_authenticated',
      'used',    0,
      'limit',   0
    );
  END IF;

  v_limit := public.get_ai_call_monthly_limit(v_uid, p_bucket);

  SELECT COUNT(*) INTO v_count FROM public.usage_ai_calls
    WHERE user_id = v_uid
      AND bucket  = p_bucket
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  RETURN jsonb_build_object(
    'allowed', (v_count < v_limit),
    'reason',  CASE
                 WHEN v_count >= v_limit AND v_limit = 0 THEN 'plan_does_not_include_feature'
                 WHEN v_count >= v_limit                 THEN 'monthly_limit_reached'
                 ELSE NULL
               END,
    'used',    v_count,
    'limit',   v_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_quota(TEXT) TO authenticated, service_role;


-- 5. Atomic insert + cap enforcement ----------------------------------------

CREATE OR REPLACE FUNCTION public.record_ai_call(p_bucket TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_limit  INTEGER;
  v_count  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_limit := public.get_ai_call_monthly_limit(v_uid, p_bucket);

  SELECT COUNT(*) INTO v_count FROM public.usage_ai_calls
    WHERE user_id = v_uid
      AND bucket  = p_bucket
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    -- Should be rare: edge fn should have called check_ai_quota first.
    -- Raising here protects against direct API misuse / race wins.
    RAISE EXCEPTION 'ai_call_monthly_limit_reached'
      USING HINT = 'Upgrade plan or wait until next calendar month';
  END IF;

  INSERT INTO public.usage_ai_calls (user_id, bucket)
    VALUES (v_uid, p_bucket);

  RETURN jsonb_build_object(
    'recorded', true,
    'used',     v_count + 1,
    'limit',    v_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ai_call(TEXT) TO authenticated, service_role;


-- 6. Defence-in-depth BEFORE INSERT trigger ----------------------------------
-- If anyone ever inserts directly into usage_ai_calls with the service
-- role (skipping record_ai_call), this trigger still enforces the cap.

CREATE OR REPLACE FUNCTION public.check_ai_call_monthly_limit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  v_limit := public.get_ai_call_monthly_limit(NEW.user_id, NEW.bucket);
  IF v_limit >= 999999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.usage_ai_calls
    WHERE user_id = NEW.user_id
      AND bucket  = NEW.bucket
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'ai_call_monthly_limit_reached'
      USING HINT = 'Bucket=' || NEW.bucket || ' user=' || NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_ai_call_monthly_limit ON public.usage_ai_calls;
CREATE TRIGGER trg_check_ai_call_monthly_limit
  BEFORE INSERT ON public.usage_ai_calls
  FOR EACH ROW EXECUTE FUNCTION public.check_ai_call_monthly_limit_trigger();


-- 7. Smoke test --------------------------------------------------------------

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 8 default rows for the 8 wired endpoints.
  SELECT COUNT(*) INTO v_count FROM public.ai_usage_limits;
  IF v_count < 8 THEN
    RAISE EXCEPTION 'ai_usage_limits seed failed: expected >= 8 rows, got %', v_count;
  END IF;
END $$;
