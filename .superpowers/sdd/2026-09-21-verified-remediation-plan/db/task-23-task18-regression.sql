BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(45);

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
SELECT ok(has_function_privilege('service_role', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'Task23 deliberately adds only service helper execute; all Task18 browser/anon behavior remains');
SELECT ok(NOT has_table_privilege('authenticated', 'public.listings', 'SELECT'), 'raw listing SELECT remains denied');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd IN ('UPDATE','DELETE')), 0, 'no client UPDATE or DELETE policy is introduced');

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000099','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','anon@example.com','Anonymous',NULL,'Denied')$$,
  '42501', NULL, 'anonymous role is actually denied RPC execution'
);
RESET ROLE;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('e1810000-0000-4000-8000-000000000001'),
  ('e1810000-0000-4000-8000-000000000002'),
  ('e1810000-0000-4000-8000-000000000003'),
  ('e1810000-0000-4000-8000-000000000004');
INSERT INTO public.profiles (user_id, role) VALUES
  ('e1810000-0000-4000-8000-000000000001', 'developer'),
  ('e1810000-0000-4000-8000-000000000002', 'buyer'),
  ('e1810000-0000-4000-8000-000000000003', 'buyer'),
  ('e1810000-0000-4000-8000-000000000004', 'developer');
INSERT INTO public.projects (id, owner_id, name, status) VALUES
  ('e1820000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 project', 'active');
INSERT INTO public.organizations (id, name, slug, created_by)
VALUES ('e1820000-0000-4000-8000-000000000002', 'Task18 organization', 'task18-organization', 'e1810000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
VALUES ('e1820000-0000-4000-8000-000000000002', 'e1810000-0000-4000-8000-000000000003', 'admin', 'active');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id)
VALUES ('e1830000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 private listing', 'Athens', 420000, 84, 'apartment', 'new_build', 'paused', 'e1820000-0000-4000-8000-000000000001');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id, organization_id, is_off_market) VALUES
  ('e1830000-0000-4000-8000-000000000002', 'e1810000-0000-4000-8000-000000000001', 'Task18 off-market listing', 'Athens', 421000, 84, 'apartment', 'new_build', 'sold', NULL, NULL, true),
  ('e1830000-0000-4000-8000-000000000003', 'e1810000-0000-4000-8000-000000000001', 'Task18 type-changed listing', 'Athens', 422000, 84, 'apartment', 'sale', 'active', NULL, NULL, false),
  ('e1830000-0000-4000-8000-000000000004', 'e1810000-0000-4000-8000-000000000001', 'Task18 org listing', 'Athens', 423000, 84, 'apartment', 'new_build', 'paused', NULL, 'e1820000-0000-4000-8000-000000000002', false);
SET LOCAL session_replication_role = origin;
SELECT is((SELECT is_off_market FROM public.listings WHERE id='e1830000-0000-4000-8000-000000000002'), true, 'off-market owner fixture sets the explicit privacy flag');

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000001'), false, 'NULL current actor never owns a listing');
RESET ROLE;

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
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'authenticated buyer can read the saved enquiry before the missing-subject control');
RESET ROLE;

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'), 0, 'authenticated role with a missing subject cannot read the saved buyer enquiry');
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'first submit and replay persist one raw enquiry');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id='e1830000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one canonical CRM lead');
SELECT is((SELECT count(*)::integer FROM public.project_leads WHERE project_id='e1820000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one project lead');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1810000-0000-4000-8000-000000000001' AND type='new_interest'), 1, 'replay emits one owner notification');
SELECT is((SELECT email FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 'buyer@example.com', 'server stores canonical email');

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user, 'authenticated', 'receipt and independent conflicts execute as the authenticated buyer');
SELECT results_eq(
  $$SELECT id, new_building_id, created_at FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  $$SELECT id, new_building_id, created_at FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'$$,
  'replay returns the exact stored receipt identity'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','changed@example.com','Buyer One','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed email'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Changed Name','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed name'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-2','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed phone'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000002','buyer@example.com','Buyer One','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed listing'
);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'actual listing owner reads the buyer enquiry on a paused listing');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000001'), true, 'exact owner predicate accepts a paused listing');
SELECT is(private.current_user_owns_listing(NULL), false, 'exact owner predicate rejects a NULL listing id');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000099'), false, 'exact owner predicate rejects an absent listing id');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000002'), true, 'exact owner predicate ignores sold status and the explicit off-market flag');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000003'), true, 'exact owner predicate ignores listing type');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000004'), true, 'exact owner predicate accepts the actual owner of an organization listing');
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  '42501', 'enquiry_actor_mismatch', 'listing owner cannot replay as the buyer'
);
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000004','e1810000-0000-4000-8000-000000000001','e1830000-0000-4000-8000-000000000001','owner@example.com','Listing Owner',NULL,'Owner self enquiry')$$,
  'listing owner may submit an enquiry as their own actor'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000001' AND submission_key='e1840000-0000-4000-8000-000000000004'), 1, 'owner-as-self receives one durable raw identity');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1810000-0000-4000-8000-000000000001' AND type='new_interest'), 1, 'existing self-notification suppression emits no owner-to-self notification');

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 0, 'outsider cannot read the buyer submission');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000004'), false, 'organization authority without owner equality does not satisfy exact ownership');
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
