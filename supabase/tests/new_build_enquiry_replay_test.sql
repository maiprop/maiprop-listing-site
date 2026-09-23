BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(24);

SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)'::regprocedure),
  false,
  'submission RPC remains security invoker'
);
SELECT ok(has_function_privilege('authenticated', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'authenticated can execute submit RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'anon cannot execute submit RPC');
SELECT ok(NOT has_function_privilege('service_role', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'service role cannot execute browser submit RPC');
SELECT ok(has_function_privilege('authenticated', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'authenticated may evaluate exact-owner predicate');
SELECT ok(has_function_privilege('anon', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'anon may evaluate a stored PUBLIC policy predicate');
SELECT ok(NOT has_function_privilege('service_role', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'service role receives no Task18 helper grant');
SELECT ok(NOT has_table_privilege('authenticated', 'public.listings', 'SELECT'), 'raw listing SELECT remains denied');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd IN ('UPDATE','DELETE')), 0, 'no client UPDATE or DELETE policy is introduced');

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('e1810000-0000-4000-8000-000000000001'),
  ('e1810000-0000-4000-8000-000000000002'),
  ('e1810000-0000-4000-8000-000000000003');
INSERT INTO public.profiles (user_id, role) VALUES
  ('e1810000-0000-4000-8000-000000000001', 'developer'),
  ('e1810000-0000-4000-8000-000000000002', 'buyer'),
  ('e1810000-0000-4000-8000-000000000003', 'buyer');
INSERT INTO public.projects (id, owner_id, name, status) VALUES
  ('e1820000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 project', 'active');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id)
VALUES ('e1830000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 private listing', 'Athens', 420000, 84, 'apartment', 'new_build', 'paused', 'e1820000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role = origin;

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001',' Buyer@Example.com ',' Buyer One ',' 555-1 ',' Send plans ')$$,
  'buyer can submit through the invoker RPC'
);
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  'canonical-equivalent replay returns the stored submission'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Different plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key with changed payload is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000002','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One',NULL,'Send plans')$$,
  '42501', 'enquiry_actor_mismatch', 'expected actor cannot impersonate another buyer'
);
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'first submit and replay persist one raw enquiry');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id='e1830000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one canonical CRM lead');
SELECT is((SELECT count(*)::integer FROM public.project_leads WHERE project_id='e1820000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one project lead');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1810000-0000-4000-8000-000000000001' AND type='new_interest'), 1, 'replay emits one owner notification');
SELECT is((SELECT email FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 'buyer@example.com', 'server stores canonical email');

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'actual listing owner reads the buyer enquiry on a paused listing');
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  '42501', 'enquiry_actor_mismatch', 'listing owner cannot replay as the buyer'
);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 0, 'outsider cannot read the buyer submission');
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','other@example.com','Other Buyer',NULL,'Own enquiry')$$,
  'another actor may independently use the same UUID key'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 2, 'actor plus key, not key alone, is unique');

SELECT throws_ok(
  $$UPDATE public.new_building_leads SET notes='mutated' WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'$$,
  'PT409', 'enquiry_submission_immutable', 'privileged update cannot change a keyed accepted payload'
);

SELECT * FROM finish();
ROLLBACK;
