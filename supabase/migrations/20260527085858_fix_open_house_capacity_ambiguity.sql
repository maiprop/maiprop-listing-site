-- Pulled from live Supabase migration history for drift reconciliation.
-- Version: 20260527085858
-- Name: fix_open_house_capacity_ambiguity

-- Fix Supabase DB lint ambiguity in get_open_house_capacity.
-- The RETURNS TABLE column "listing_id" is visible to PL/pgSQL, so unqualified
-- references to open_house_settings.listing_id can be interpreted as either the
-- output column or the table column.

CREATE OR REPLACE FUNCTION public.get_open_house_capacity(p_listing_id UUID)
RETURNS TABLE (
  listing_id UUID,
  active_total INTEGER,
  max_total_visitors INTEGER,
  slot_counts JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_listing RECORD;
  v_settings public.open_house_settings%ROWTYPE;
  v_slot_count INTEGER := 0;
BEGIN
  SELECT l.id, l.owner_id, l.status, l.listing_type
    INTO v_listing
  FROM public.listings AS l
  WHERE l.id = p_listing_id;

  IF NOT FOUND OR v_listing.listing_type IS DISTINCT FROM 'open_house' THEN
    RETURN;
  END IF;

  IF v_listing.status IS DISTINCT FROM 'active'::public.listing_status
     AND v_listing.owner_id IS DISTINCT FROM v_actor THEN
    RETURN;
  END IF;

  SELECT ohs.*
    INTO v_settings
  FROM public.open_house_settings AS ohs
  WHERE ohs.listing_id = p_listing_id;

  v_slot_count := jsonb_array_length(COALESCE(v_settings.timeslots, '[]'::jsonb));

  RETURN QUERY
  WITH active_regs AS (
    SELECT r.timeslot_index, COUNT(*)::INTEGER AS active_count
    FROM public.open_house_registrations AS r
    WHERE r.listing_id = p_listing_id
      AND r.status NOT IN ('cancelled', 'rejected')
    GROUP BY r.timeslot_index
  ),
  totals AS (
    SELECT COALESCE(SUM(ar.active_count), 0)::INTEGER AS active_total
    FROM active_regs AS ar
  ),
  slots AS (
    SELECT
      (idx - 1)::INTEGER AS slot_index,
      COALESCE(ar.active_count, 0)::INTEGER AS active_count,
      COALESCE(
        NULLIF(v_settings.timeslots -> (idx - 1) ->> 'max_visitors', '')::INTEGER,
        v_settings.max_visitors_per_slot
      ) AS max_visitors
    FROM generate_series(1, v_slot_count) AS idx
    LEFT JOIN active_regs AS ar ON ar.timeslot_index = idx - 1
  )
  SELECT
    p_listing_id,
    totals.active_total,
    v_settings.max_total_visitors,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'slot_index', slots.slot_index,
            'active_count', slots.active_count,
            'max_visitors', slots.max_visitors,
            'full', slots.max_visitors IS NOT NULL AND slots.active_count >= slots.max_visitors
          )
          ORDER BY slots.slot_index
        )
        FROM slots
      ),
      '[]'::jsonb
    )
  FROM totals;
END;
$$;

REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_open_house_capacity(UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_open_house_capacity(UUID) IS
  'Returns aggregate open-house capacity counts without exposing visitor registration rows through RLS.';
