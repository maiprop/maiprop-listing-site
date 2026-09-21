BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('ea100000-0000-4000-8000-000000000001'),
  ('ea100000-0000-4000-8000-000000000002');

INSERT INTO public.projects (id, owner_id, name, status)
VALUES (
  'ea200000-0000-4000-8000-000000000001',
  'ea100000-0000-4000-8000-000000000001',
  'Enquiry trigger project',
  'active'
);

INSERT INTO public.listings (
  id,
  owner_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status,
  project_id
)
VALUES (
  'ea300000-0000-4000-8000-000000000001',
  'ea100000-0000-4000-8000-000000000001',
  'Enquiry trigger listing',
  'Athens',
  420000,
  84,
  'apartment',
  'new_build',
  'active',
  'ea200000-0000-4000-8000-000000000001'
);

SET LOCAL session_replication_role = origin;

INSERT INTO public.new_building_leads (
  id,
  new_building_id,
  user_id,
  email,
  full_name,
  phone,
  investment_budget,
  notes,
  utm_source
)
VALUES (
  'ea400000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000001',
  'ea100000-0000-4000-8000-000000000002',
  'buyer@example.com',
  'Buyer One',
  '555-1',
  0,
  'Send plans',
  'newbuild_detail_register'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.leads
    WHERE owner_id = 'ea100000-0000-4000-8000-000000000001'
      AND listing_id = 'ea300000-0000-4000-8000-000000000001'
      AND project_id = 'ea200000-0000-4000-8000-000000000001'
      AND source = 'project_inquiry'
      AND email = 'buyer@example.com'
  ),
  1,
  'a new-build enquiry creates the canonical owner CRM lead'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.project_leads
    WHERE project_id = 'ea200000-0000-4000-8000-000000000001'
      AND source = 'project_inquiry'
      AND metadata->>'new_building_lead_id' = 'ea400000-0000-4000-8000-000000000001'
  ),
  1,
  'a new-build enquiry creates the project lead record'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.notifications
    WHERE user_id = 'ea100000-0000-4000-8000-000000000001'
      AND type = 'new_interest'
      AND title = 'New interest registered'
      AND link = '/dashboard?tab=leads'
  ),
  1,
  'a new-build enquiry creates the owner notification'
);

SELECT is(
  (
    SELECT body
    FROM public.notifications
    WHERE user_id = 'ea100000-0000-4000-8000-000000000001'
      AND type = 'new_interest'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  'Buyer One registered interest in Enquiry trigger listing',
  'the owner notification identifies the buyer and listing'
);

SELECT * FROM finish();
ROLLBACK;
