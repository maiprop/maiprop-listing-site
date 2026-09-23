\set ON_ERROR_STOP on
DO $fixture$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(
    a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '<null>'),
    ',' ORDER BY a.attnum
  ) INTO v_columns
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='public.new_building_leads'::regclass AND a.attnum>0 AND NOT a.attisdropped;

  IF md5(v_columns) <> 'e1464523ba5ae208b80b5127994643bf' THEN
    RAISE EXCEPTION 'captured_upgrade_raw_columns_drift: %', v_columns;
  END IF;

  IF (SELECT array_agg(conname ORDER BY conname) FROM pg_constraint WHERE conrelid='public.new_building_leads'::regclass)
     IS DISTINCT FROM ARRAY['new_building_leads_new_building_id_fkey','new_building_leads_pkey','new_building_leads_user_id_fkey']::name[] THEN
    RAISE EXCEPTION 'captured_upgrade_raw_constraints_drift';
  END IF;
  IF (SELECT array_agg(indexrelid::regclass::text ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid='public.new_building_leads'::regclass)
     IS DISTINCT FROM ARRAY['new_building_leads_building_idx','new_building_leads_pkey','new_building_leads_user_idx']::text[] THEN
    RAISE EXCEPTION 'captured_upgrade_raw_indexes_drift';
  END IF;
  IF md5(pg_get_functiondef('private.create_new_build_project_leads()'::regprocedure)) <> '55c21aa1fb29891a96f6645a0fa467c5'
     OR md5(pg_get_functiondef('private.notify_new_build_interest_created()'::regprocedure)) <> '80fc78a65276167ddeb37f91ab630ac9' THEN
    RAISE EXCEPTION 'captured_upgrade_raw_trigger_body_drift';
  END IF;
  IF md5(pg_get_functiondef('private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamp with time zone)'::regprocedure)) <> '668ec39a33c903c75fa398a5e429462c'
     OR md5(pg_get_functiondef('private.insert_interaction_notification(uuid,uuid,text,text,text,text)'::regprocedure)) <> '3c36f5596a586efc974e7a90180ca6a1'
     OR md5(pg_get_functiondef('private.sync_project_lead_to_owner_lead()'::regprocedure)) <> '50cb297c75f1fba7db7cf928632046e1' THEN
    RAISE EXCEPTION 'captured_upgrade_downstream_helper_body_drift';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.new_building_leads'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'captured_upgrade_raw_trigger_set_drift';
  END IF;
END
$fixture$;

DROP POLICY new_building_leads_insert ON public.new_building_leads;
DROP POLICY new_building_leads_select ON public.new_building_leads;
CREATE POLICY user_insert_own_new_building_lead
  ON public.new_building_leads FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY user_or_owner_select_new_building_lead
  ON public.new_building_leads FOR SELECT TO PUBLIC
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.listings AS l
      WHERE l.id = new_building_leads.new_building_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.new_building_leads FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON public.new_building_leads TO postgres, anon, authenticated, service_role;

DO $verify$
BEGIN
  IF (SELECT array_agg(policyname ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads')
     IS DISTINCT FROM ARRAY['user_insert_own_new_building_lead','user_or_owner_select_new_building_lead']::name[] THEN
    RAISE EXCEPTION 'captured_upgrade_policy_fixture_failed';
  END IF;
  IF (SELECT roles FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND policyname='user_or_owner_select_new_building_lead')
     IS DISTINCT FROM ARRAY['public']::name[] THEN
    RAISE EXCEPTION 'captured_upgrade_policy_role_fixture_failed';
  END IF;
  IF has_schema_privilege('anon','private','USAGE') THEN
    RAISE EXCEPTION 'captured_upgrade_must_not_grant_anon_private_usage';
  END IF;
END
$verify$;
