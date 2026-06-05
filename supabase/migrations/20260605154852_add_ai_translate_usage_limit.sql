-- Add ai-translate to the shared per-user AI quota system when the quota table
-- already exists. Fresh database replays reach this migration before
-- 20260623160000 creates public.ai_usage_limits, so the table-creation
-- migration also contains this seed as the canonical fresh-replay path.

DO $$
DECLARE
  v_free integer;
  v_pro integer;
BEGIN
  IF to_regclass('public.ai_usage_limits') IS NULL THEN
    RAISE NOTICE 'public.ai_usage_limits is not available yet; ai-translate quota seed is deferred';
    RETURN;
  END IF;

  EXECUTE $seed$
    INSERT INTO public.ai_usage_limits (
      bucket,
      free_monthly,
      pro_monthly,
      description,
      is_pro_only
    )
    VALUES (
      'ai-translate',
      500,
      5000,
      'AI-assisted UI translation requests',
      false
    )
    ON CONFLICT (bucket) DO UPDATE
    SET
      free_monthly = GREATEST(public.ai_usage_limits.free_monthly, EXCLUDED.free_monthly),
      pro_monthly = GREATEST(public.ai_usage_limits.pro_monthly, EXCLUDED.pro_monthly),
      description = EXCLUDED.description,
      is_pro_only = false,
      updated_at = now()
  $seed$;

  EXECUTE $check$
    SELECT free_monthly, pro_monthly
    FROM public.ai_usage_limits
    WHERE bucket = $1
  $check$
  INTO v_free, v_pro
  USING 'ai-translate';

  IF v_free IS NULL OR v_free < 500 OR v_pro < 5000 THEN
    RAISE EXCEPTION 'ai-translate usage limit seed failed';
  END IF;
END $$;
