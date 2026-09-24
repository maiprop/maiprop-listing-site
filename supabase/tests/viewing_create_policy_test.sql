\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(24);

-- Synthetic identities and listings are the only setup performed with
-- replication triggers disabled. The viewing actions below use normal roles.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id, email) VALUES
  ('d6250001-0000-4000-8000-000000000001', 'task25-owner@example.test'),
  ('d6250001-0000-4000-8000-000000000002', 'task25-requester@example.test'),
  ('d6250001-0000-4000-8000-000000000003', 'task25-outsider@example.test'),
  ('d6250001-0000-4000-8000-000000000004', 'task25-member@example.test'),
  ('d6250001-0000-4000-8000-000000000005', 'task25-admin@example.test');
INSERT INTO public.profiles(user_id, role, display_name, force_pro_access, is_platform_admin, account_status) VALUES
  ('d6250001-0000-4000-8000-000000000001', 'seller', 'Task25 Owner', false, false, 'active'),
  ('d6250001-0000-4000-8000-000000000002', 'buyer', 'Task25 Requester', false, false, 'active'),
  ('d6250001-0000-4000-8000-000000000003', 'buyer', 'Task25 Outsider', false, false, 'active'),
  ('d6250001-0000-4000-8000-000000000004', 'buyer', 'Task25 Member', false, false, 'active'),
  ('d6250001-0000-4000-8000-000000000005', 'admin', 'Task25 Admin', false, true, 'active');
INSERT INTO public.organizations(id, name, slug, created_by)
VALUES ('d6250004-0000-4000-8000-000000000001', 'Task25 Org', 'task25-org', 'd6250001-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships(id, organization_id, user_id, role, status)
VALUES ('d6250005-0000-4000-8000-000000000001', 'd6250004-0000-4000-8000-000000000001', 'd6250001-0000-4000-8000-000000000004', 'member', 'active');
INSERT INTO public.listings(id, owner_id, title, city, price, sqm, property_type, listing_type, status, is_off_market, open_house_date, open_house_transaction_type, organization_id)
VALUES
  ('d6250002-0000-4000-8000-000000000001', 'd6250001-0000-4000-8000-000000000001', 'Task25 active public', 'Athens', 200000, 80, 'apartment', 'sale', 'active', false, NULL, NULL, NULL),
  ('d6250002-0000-4000-8000-000000000002', 'd6250001-0000-4000-8000-000000000001', 'Task25 paused owner', 'Athens', 200000, 80, 'apartment', 'sale', 'paused', false, NULL, NULL, NULL),
  ('d6250002-0000-4000-8000-000000000003', 'd6250001-0000-4000-8000-000000000001', 'Task25 off market', 'Athens', 200000, 80, 'apartment', 'sale', 'active', true, NULL, NULL, NULL),
  ('d6250002-0000-4000-8000-000000000004', 'd6250001-0000-4000-8000-000000000001', 'Task25 org private', 'Athens', 200000, 80, 'apartment', 'sale', 'paused', false, NULL, NULL, 'd6250004-0000-4000-8000-000000000001'),
  ('d6250002-0000-4000-8000-000000000005', 'd6250001-0000-4000-8000-000000000001', 'Task25 admin path', 'Athens', 200000, 80, 'apartment', 'sale', 'active', false, NULL, NULL, NULL);
SET LOCAL session_replication_role = origin;

SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000002', true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT ok(has_function_privilege('authenticated', 'private.can_request_viewing_for_listing(uuid,uuid)', 'EXECUTE'), 'authenticated can execute the scoped viewing helper');
SELECT ok(NOT has_function_privilege('anon', 'private.can_request_viewing_for_listing(uuid,uuid)', 'EXECUTE'), 'anon cannot execute the scoped viewing helper');
SELECT ok(NOT has_function_privilege('service_role', 'private.can_request_viewing_for_listing(uuid,uuid)', 'EXECUTE'), 'service_role is not granted the browser helper');
SELECT is(private.can_request_viewing_for_listing(NULL, NULL), false, 'NULL inputs fail closed');
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000001', 'd6250001-0000-4000-8000-000000000001'), true, 'active public listing is eligible');
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000002', 'd6250001-0000-4000-8000-000000000001'), false, 'paused listing is denied to an unrelated requester');
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000003', 'd6250001-0000-4000-8000-000000000001'), false, 'off-market listing is denied to an unrelated requester');
SELECT ok(NOT has_column_privilege('authenticated', 'public.listings', 'id', 'SELECT'), 'authenticated still lacks raw listing id SELECT');
SELECT ok(NOT has_column_privilege('authenticated', 'public.listings', 'owner_id', 'SELECT'), 'authenticated still lacks raw listing owner SELECT');

-- Existing org listing:view visibility remains available through the exact
-- policy predicate, while ownership remains the only actor override.
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000004', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000004","role":"authenticated"}', true);
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000004', 'd6250001-0000-4000-8000-000000000001'), true, 'active org member retains listing:view eligibility');
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000003', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000004', 'd6250001-0000-4000-8000-000000000001'), false, 'unrelated actor cannot use org listing:view');
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT is(private.can_request_viewing_for_listing('d6250002-0000-4000-8000-000000000002', 'd6250001-0000-4000-8000-000000000001'), true, 'listing owner retains the existing owner visibility override');

-- The supported client payload remains direct INSERT ... RETURNING *.
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000002', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.viewings(listing_id,owner_id,viewing_type,scheduled_at,note,requester_id)
  VALUES ('d6250002-0000-4000-8000-000000000001','d6250001-0000-4000-8000-000000000001','in_person',now()+interval '7 days','Task25 request','d6250001-0000-4000-8000-000000000002') RETURNING *$$, 'authenticated requester can create the existing viewing shape');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.viewings WHERE listing_id = 'd6250002-0000-4000-8000-000000000001'), 1, 'one viewing row is persisted');
SELECT is((SELECT requester_id FROM public.viewings WHERE listing_id = 'd6250002-0000-4000-8000-000000000001'), 'd6250001-0000-4000-8000-000000000002'::uuid, 'created viewing keeps requester identity');
SELECT is((SELECT owner_id FROM public.viewings WHERE listing_id = 'd6250002-0000-4000-8000-000000000001'), 'd6250001-0000-4000-8000-000000000001'::uuid, 'created viewing keeps owner identity');
SELECT is((SELECT status FROM public.viewings WHERE listing_id = 'd6250002-0000-4000-8000-000000000001'), 'pending'::public.viewing_status, 'created viewing remains pending');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id = 'd6250002-0000-4000-8000-000000000001'), 1, 'normal viewing lead trigger still runs');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id = 'd6250001-0000-4000-8000-000000000001' AND type = 'viewing'), 1, 'normal owner notification trigger still runs');

-- Participant read is unchanged; a second free request still reaches the
-- existing entitlement trigger after the policy admits the active listing.
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000002', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.viewings WHERE requester_id = 'd6250001-0000-4000-8000-000000000002'), 1, 'requester can read the created viewing');
SELECT throws_ok($$INSERT INTO public.viewings(listing_id,owner_id,viewing_type,scheduled_at,note,requester_id)
  VALUES ('d6250002-0000-4000-8000-000000000005','d6250001-0000-4000-8000-000000000001','video',now()+interval '8 days','Task25 second','d6250001-0000-4000-8000-000000000002')$$, 'P0001', NULL, 'second free request preserves the existing viewing limit error');
SELECT throws_ok($$INSERT INTO public.viewings(listing_id,owner_id,viewing_type,scheduled_at,note,requester_id)
  VALUES ('d6250002-0000-4000-8000-000000000001','d6250001-0000-4000-8000-000000000001','video',now()+interval '9 days','Task25 spoof','d6250001-0000-4000-8000-000000000003')$$, '42501', NULL, 'requester spoof remains denied');
RESET ROLE;

-- Keep the existing platform-admin outer branch independent from the ordinary
-- requester helper; this does not grant admin access to the helper itself.
SELECT set_config('request.jwt.claim.sub', 'd6250001-0000-4000-8000-000000000005', true),
       set_config('request.jwt.claims', '{"sub":"d6250001-0000-4000-8000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.viewings(listing_id,owner_id,viewing_type,scheduled_at,note,requester_id)
  VALUES ('d6250002-0000-4000-8000-000000000005','d6250001-0000-4000-8000-000000000001','video',now()+interval '10 days','Task25 admin','d6250001-0000-4000-8000-000000000003')$$, 'platform-admin outer policy branch remains available');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.viewings WHERE listing_id = 'd6250002-0000-4000-8000-000000000005'), 1, 'platform-admin viewing row is persisted');

SELECT * FROM finish();
ROLLBACK;
