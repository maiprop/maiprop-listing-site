DO $$ BEGIN IF current_database()<>'maiprop_t25_followup_20260927' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'Named local disposable target required'; END IF; END $$;BEGIN; SET LOCAL session_replication_role=replica;
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

COMMIT;