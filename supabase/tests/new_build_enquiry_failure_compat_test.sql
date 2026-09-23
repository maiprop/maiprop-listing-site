BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(18);
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id) VALUES ('e18a0000-0000-4000-8000-000000000001'),('e18a0000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(user_id,role) VALUES ('e18a0000-0000-4000-8000-000000000001','developer'),('e18a0000-0000-4000-8000-000000000002','buyer');
INSERT INTO public.projects(id,owner_id,name,status) VALUES ('e18b0000-0000-4000-8000-000000000001','e18a0000-0000-4000-8000-000000000001','Task18 compatibility project','active');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,project_id)
VALUES ('e18c0000-0000-4000-8000-000000000001','e18a0000-0000-4000-8000-000000000001','Task18 compatibility listing','Athens',440000,88,'apartment','new_build','active','e18b0000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;

SELECT set_config('request.jwt.claims','{"sub":"e18a0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.new_building_leads(id,new_building_id,user_id,email,full_name,notes,utm_source) VALUES
 ('e18d0000-0000-4000-8000-000000000001','e18c0000-0000-4000-8000-000000000001','e18a0000-0000-4000-8000-000000000002','legacy@example.com','Legacy Buyer','Legacy details','newbuild_detail_register'),
 ('e18d0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','e18a0000-0000-4000-8000-000000000002','legacy@example.com','Legacy Buyer','Legacy details','newbuild_detail_register');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e18a0000-0000-4000-8000-000000000002' AND submission_key IS NULL),2,'old keyless inserts remain compatible');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id='e18c0000-0000-4000-8000-000000000001' AND source='project_inquiry'),1,'legacy duplicates retain canonical CRM dedup');
SELECT is((SELECT count(*)::integer FROM public.project_leads WHERE project_id='e18b0000-0000-4000-8000-000000000001' AND source='project_inquiry'),1,'legacy duplicates retain project-lead dedup');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e18a0000-0000-4000-8000-000000000001' AND type='new_interest'),2,'legacy duplicates retain two raw-trigger notifications');

SELECT set_config('request.jwt.claims','{"sub":"e18a0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000001','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','bad email','Buyer',NULL,'Details')$$,'22023','enquiry_submission_invalid','malformed email is a definite rejection');
SELECT throws_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000002','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000099','buyer@example.com','Buyer',NULL,'Details')$$,'23503',NULL,'missing listing remains a foreign-key failure');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000003','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','buyer@example.com','Buyer',NULL,'Details')$$,'42501','enquiry_actor_mismatch','authenticated role without a subject is rejected');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key IN ('e18e0000-0000-4000-8000-000000000001','e18e0000-0000-4000-8000-000000000002','e18e0000-0000-4000-8000-000000000003')),0,'definite failures consume no key');

CREATE FUNCTION pg_temp.task18_hard_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'task18_hard_failure'; END$$;
CREATE TRIGGER task18_00_hard_failure BEFORE INSERT ON public.new_building_leads FOR EACH ROW WHEN (NEW.notes='Hard failure') EXECUTE FUNCTION pg_temp.task18_hard_failure();
SELECT set_config('request.jwt.claims','{"sub":"e18a0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000004','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','buyer@example.com','Buyer',NULL,'Hard failure')$$,'P0001','task18_hard_failure','unhandled trigger error aborts the submission');
RESET ROLE;
DROP TRIGGER task18_00_hard_failure ON public.new_building_leads;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e18e0000-0000-4000-8000-000000000004'),0,'unhandled trigger failure leaves no raw row');
SELECT set_config('request.jwt.claims','{"sub":"e18a0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000004','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','buyer@example.com','Buyer',NULL,'Hard failure')$$,'same key succeeds once after the rolled-back trigger failure is removed');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e18e0000-0000-4000-8000-000000000004'),1,'retry after rollback persists one row');

CREATE FUNCTION pg_temp.task18_notification_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.body LIKE 'Warning Buyer%' THEN RAISE EXCEPTION 'task18_notification_failure'; END IF; RETURN NEW; END$$;
CREATE TRIGGER task18_00_notification_failure BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION pg_temp.task18_notification_failure();
SELECT set_config('request.jwt.claims','{"sub":"e18a0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000005','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','warning@example.com','Warning Buyer',NULL,'Warning boundary')$$,'caught notification failure preserves the raw enquiry');
SELECT lives_ok($$SELECT * FROM public.submit_new_build_enquiry('e18e0000-0000-4000-8000-000000000005','e18a0000-0000-4000-8000-000000000002','e18c0000-0000-4000-8000-000000000001','warning@example.com','Warning Buyer',NULL,'Warning boundary')$$,'same-key replay returns the raw row without retrying notification delivery');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e18e0000-0000-4000-8000-000000000005'),1,'warning boundary retains one raw row');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE body LIKE 'Warning Buyer%'),0,'same-key replay does not repair the caught notification failure');
DROP TRIGGER task18_00_notification_failure ON public.notifications;

SELECT throws_ok($$UPDATE public.new_building_leads SET submission_key='e18e0000-0000-4000-8000-000000000006' WHERE id='e18d0000-0000-4000-8000-000000000001'$$,'PT409','enquiry_submission_immutable','historical keyless row cannot adopt a submission key by update');
SELECT lives_ok($$UPDATE public.new_building_leads SET updated_at=updated_at WHERE id='e18d0000-0000-4000-8000-000000000001'$$,'legacy null-key row retains unrelated update behavior');
SELECT * FROM finish();
ROLLBACK;
