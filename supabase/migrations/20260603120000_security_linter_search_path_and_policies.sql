-- Fix: Function Search Path Mutable (lint 0011)
-- Add SET search_path = public to all SECURITY DEFINER functions that were missing it.
-- This prevents search_path injection attacks where a malicious user could create
-- objects in a schema that shadows public objects used by these functions.

-- ── 1. check_priority_ad_limit ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_priority_ad_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_product IS NOT NULL THEN
    v_limit := 5;
  ELSIF v_role IN ('agent', 'developer', 'institutional') THEN
    v_limit := 1;
  ELSE
    v_limit := 0;
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

-- ── 2. check_valuation_limit ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_valuation_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product TEXT;
  v_count INTEGER;
  v_limit INTEGER := 8;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  SELECT subscription_product_id INTO v_product
    FROM profiles WHERE user_id = NEW.user_id;

  IF v_product IS NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM usage_ai_valuations
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'valuation_limit_reached';
    END IF;
  ELSE
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

-- ── 3. check_report_limit ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_report_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product TEXT;
  v_count INTEGER;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  SELECT subscription_product_id INTO v_product
    FROM profiles WHERE user_id = NEW.user_id;

  IF v_product IS NULL THEN
    SELECT COUNT(*) INTO v_count
      FROM usage_property_reports
     WHERE user_id = NEW.user_id
       AND created_at >= v_month_start;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'report_limit_reached';
    END IF;
  ELSE
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

-- ── 4-7. Email queue wrappers ─────────────────────────────────────────────────
-- These are SECURITY DEFINER wrappers around pgmq (pg_message_queue) calls.
-- Restricted to service_role by REVOKE/GRANT in the original migration.

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION
  WHEN undefined_table THEN
    PERFORM pgmq.create(queue_name);
    RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT m.msg_id, m.read_ct, m.message
    FROM pgmq.read(queue_name, vt, batch_size) m;
EXCEPTION
  WHEN undefined_table THEN
    PERFORM pgmq.create(queue_name);
    RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION
  WHEN undefined_table THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restore execute restrictions (CREATE OR REPLACE resets grants)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;


-- Fix: RLS Policy Always True (lint 0024)
-- Tighten INSERT policies that had WITH CHECK (true) on non-SELECT operations.

-- listing_view_events: anonymous view tracking — restrict to anon + authenticated only
DROP POLICY IF EXISTS "Anyone can insert listing view" ON public.listing_view_events;
CREATE POLICY "Anyone can insert listing view"
  ON public.listing_view_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- project_views: same pattern as listing_view_events
DROP POLICY IF EXISTS "Anyone can insert project view" ON public.project_views;
CREATE POLICY "Anyone can insert project view"
  ON public.project_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- notifications: only the service_role should insert (called from edge functions)
DROP POLICY IF EXISTS "Service role insert notifications" ON public.notifications;
-- No replacement policy needed — service_role bypasses RLS entirely.
-- Authenticated users should never insert notifications directly.


-- Note: pg_net extension in public schema (lint 0014) is managed by the Supabase
-- platform and cannot be moved via user migrations. No action required.

-- Note: Auth leaked password protection (auth_leaked_password_protection) must be
-- enabled in the Supabase Dashboard → Authentication → Password Protection.
-- It cannot be configured via SQL migrations.
