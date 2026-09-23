-- Explicit preflight-drift setup. Pass -v drift_case=null_select|null_insert|extra_all.
-- This support fixture is intentionally outside ordinary *_test.sql discovery.
\set ON_ERROR_STOP on
\if :{?drift_case}
\else
  \echo 'drift_case is required'
  \quit 2
\endif

SELECT set_config('task18.drift_case', :'drift_case', false);

DO $setup$
DECLARE
  v_case text := current_setting('task18.drift_case');
BEGIN
  CASE v_case
    WHEN 'null_select' THEN
      DROP POLICY new_building_leads_select ON public.new_building_leads;
      CREATE POLICY new_building_leads_select
        ON public.new_building_leads
        AS PERMISSIVE
        FOR SELECT
        TO authenticated;
    WHEN 'null_insert' THEN
      DROP POLICY new_building_leads_insert ON public.new_building_leads;
      CREATE POLICY new_building_leads_insert
        ON public.new_building_leads
        AS PERMISSIVE
        FOR INSERT
        TO authenticated;
    WHEN 'extra_all' THEN
      CREATE POLICY task18_unexpected_all
        ON public.new_building_leads
        AS PERMISSIVE
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
    ELSE
      RAISE EXCEPTION 'unsupported_task18_drift_case: %', v_case;
  END CASE;
END
$setup$;
