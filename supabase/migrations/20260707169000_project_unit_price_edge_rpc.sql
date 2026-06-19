-- Move project-unit bulk price updates behind an authenticated Edge Function.
-- The browser calls project-unit-prices, which verifies the caller JWT and
-- passes the verified user id to this service-role-only RPC.

CREATE OR REPLACE FUNCTION public.bulk_update_project_unit_prices_for_user(
  _user_id UUID,
  p_project_id UUID,
  p_percentage NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = '42501';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_percentage IS NULL
     OR p_percentage::TEXT = 'NaN'
     OR p_percentage = 0
     OR p_percentage < -100
     OR p_percentage > 1000 THEN
    RAISE EXCEPTION 'percentage must be a finite non-zero value between -100 and 1000' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = _user_id
  ) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_units pu
  SET
    price = ROUND(pu.price * (1 + p_percentage / 100)),
    price_per_sqm = CASE
      WHEN pu.internal_sqm IS NULL OR pu.internal_sqm = 0 THEN NULL
      ELSE ROUND(pu.price * (1 + p_percentage / 100)) / pu.internal_sqm
    END,
    updated_at = now()
  WHERE pu.project_id = p_project_id
    AND pu.availability_status = 'available'
    AND pu.price IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_project_unit_prices_for_user(UUID, UUID, NUMERIC)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_project_unit_prices_for_user(UUID, UUID, NUMERIC)
TO service_role;

-- The legacy caller-context RPC can remain for live rollback compatibility on
-- databases that already have it, but it must no longer be browser-executable.
DO $$
BEGIN
  IF to_regprocedure('public.bulk_update_project_unit_prices(uuid,numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.bulk_update_project_unit_prices(UUID, NUMERIC)
    FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.bulk_update_project_unit_prices(UUID, NUMERIC)
    TO service_role;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.bulk_update_project_unit_prices_for_user(UUID, UUID, NUMERIC) IS
  'Service-role-only RPC used by project-unit-prices Edge Function after verifying the caller JWT.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'bulk_update_project_unit_prices_for_user(uuid,uuid,numeric) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)';
  END IF;

  IF to_regprocedure('public.bulk_update_project_unit_prices(uuid,numeric)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.bulk_update_project_unit_prices(uuid,numeric)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.bulk_update_project_unit_prices(uuid,numeric)', 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy bulk_update_project_unit_prices(uuid,numeric) must not be browser-callable';
    END IF;
  END IF;
END;
$$;
