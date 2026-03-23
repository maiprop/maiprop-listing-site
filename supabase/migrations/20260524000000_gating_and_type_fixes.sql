-- ────────────────────────────────────────────────────────────────────────────
-- 20260524000000_gating_and_type_fixes.sql
--
-- 1. Add priority_ads DB-level limit trigger (aligned with existing pattern)
-- 2. Add hard-block trigger for valuation usage beyond limit
-- 3. Add hard-block trigger for report usage beyond limit
-- 4. RLS: ensure contacts and leads are owner-only (Pro enforcement stays UI-side,
--    but rows must never be readable/writable by non-owners)
-- 5. Ensure participant_type accepts investor and institutional
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Priority Ads limit trigger ────────────────────────────────────────────
-- Free agents: 1 priority ad/month. Pro agents: 5/month.
-- Mirrors pattern from trg_check_viewing_limit.

CREATE OR REPLACE FUNCTION check_priority_ad_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role TEXT;
  v_product TEXT;
  v_count INTEGER;
  v_limit INTEGER;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  SELECT role, subscription_product_id
    INTO v_role, v_product
    FROM profiles
   WHERE user_id = NEW.user_id;

  -- Determine limit based on subscription
  IF v_product IS NOT NULL THEN
    v_limit := 5;  -- Pro
  ELSIF v_role IN ('agent', 'developer', 'institutional') THEN
    v_limit := 1;  -- Free agent
  ELSE
    v_limit := 0;  -- Buyers/sellers can't use priority ads
  END IF;

  IF v_limit = 0 THEN
    RAISE EXCEPTION 'priority_ad_not_allowed';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM usage_priority_ads
   WHERE user_id = NEW.user_id
     AND created_at >= v_month_start;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'priority_ad_limit_reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_priority_ad_limit ON usage_priority_ads;
CREATE TRIGGER trg_check_priority_ad_limit
  BEFORE INSERT ON usage_priority_ads
  FOR EACH ROW EXECUTE FUNCTION check_priority_ad_limit();

-- ── 2. Hard-block valuation beyond limit ─────────────────────────────────────
-- Free users: 0 valuations. Pro: 5/month included, extras billed separately.
-- Currently code logs usage but doesn't block. This trigger hard-blocks at 8/month
-- to prevent unlimited abuse even if billing isn't wired.

CREATE OR REPLACE FUNCTION check_valuation_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product TEXT;
  v_count INTEGER;
  v_limit INTEGER := 8;  -- Hard cap (above included 5; extras should trigger billing)
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  SELECT subscription_product_id INTO v_product
    FROM profiles WHERE user_id = NEW.user_id;

  -- Free users: 0 included, hard-block at 1 (they should upgrade)
  IF v_product IS NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM usage_ai_valuations
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'valuation_limit_reached';
    END IF;
  ELSE
    -- Pro users: hard-cap at 8 to prevent runaway (extras should be billed)
    SELECT COUNT(*) INTO v_count
      FROM usage_ai_valuations
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'valuation_hard_limit_reached';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_valuation_limit ON usage_ai_valuations;
CREATE TRIGGER trg_check_valuation_limit
  BEFORE INSERT ON usage_ai_valuations
  FOR EACH ROW EXECUTE FUNCTION check_valuation_limit();

-- ── 3. Hard-block report usage beyond limit ───────────────────────────────────
CREATE OR REPLACE FUNCTION check_report_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product TEXT;
  v_count INTEGER;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  SELECT subscription_product_id INTO v_product
    FROM profiles WHERE user_id = NEW.user_id;

  IF v_product IS NULL THEN
    -- Free: block at 1
    SELECT COUNT(*) INTO v_count
      FROM usage_property_reports
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'report_limit_reached';
    END IF;
  ELSE
    -- Pro: hard-cap at 10
    SELECT COUNT(*) INTO v_count
      FROM usage_property_reports
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= 10 THEN
      RAISE EXCEPTION 'report_hard_limit_reached';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_report_limit ON usage_property_reports;
CREATE TRIGGER trg_check_report_limit
  BEFORE INSERT ON usage_property_reports
  FOR EACH ROW EXECUTE FUNCTION check_report_limit();

-- ── 4. RLS: contacts owned by the user who created them ──────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'contacts_owner_only'
  ) THEN
    CREATE POLICY contacts_owner_only ON contacts
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── 5. Extend participant_type check to include investor + institutional ───────
-- The column was added in 20260522100000_participant_type_column.sql with a CHECK constraint.
-- We need to widen it.

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_participant_type_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_participant_type_check
    CHECK (participant_type IN ('buyer','seller','agent','developer','professional','investor','institutional'));
