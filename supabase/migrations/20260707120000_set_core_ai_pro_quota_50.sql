-- Lower Pro monthly caps for core property AI surfaces.
-- Free signed-in users remain at 5/month; Pro users now get 50/month.

UPDATE public.ai_usage_limits
SET
  pro_monthly = 50,
  updated_at = now()
WHERE bucket IN (
  'property-valuation',
  'neighbourhood-report',
  'property-pois'
);

DO $$
DECLARE
  v_wrong_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_wrong_count
  FROM public.ai_usage_limits
  WHERE bucket IN (
    'property-valuation',
    'neighbourhood-report',
    'property-pois'
  )
    AND (free_monthly <> 5 OR pro_monthly <> 50 OR is_pro_only IS DISTINCT FROM false);

  IF v_wrong_count <> 0 THEN
    RAISE EXCEPTION 'Core AI quota update failed for % row(s)', v_wrong_count;
  END IF;
END $$;
