BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES
  ('e18f0000-0000-4000-8000-000000000001','developer@example.com'),
  ('e18f0000-0000-4000-8000-000000000002','conversation@example.com');
INSERT INTO public.profiles(user_id,role) VALUES ('e18f0000-0000-4000-8000-000000000001','developer'),('e18f0000-0000-4000-8000-000000000002','buyer');
INSERT INTO public.projects(id,owner_id,name,status) VALUES ('e18f1000-0000-4000-8000-000000000001','e18f0000-0000-4000-8000-000000000001','Task18 conversation project','active');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,project_id)
VALUES ('e18f2000-0000-4000-8000-000000000001','e18f0000-0000-4000-8000-000000000001','Task18 conversation listing','Athens',450000,90,'apartment','new_build','active','e18f1000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"e18f0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.conversations(id,listing_id,participant_a,participant_b)
VALUES ('e18f3000-0000-4000-8000-000000000001','e18f2000-0000-4000-8000-000000000001','e18f0000-0000-4000-8000-000000000002','e18f0000-0000-4000-8000-000000000001');
SELECT * FROM public.submit_new_build_enquiry('e18f4000-0000-4000-8000-000000000001','e18f0000-0000-4000-8000-000000000002','e18f2000-0000-4000-8000-000000000001','conversation@example.com','Conversation Buyer',NULL,'Send plans');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.conversations WHERE id='e18f3000-0000-4000-8000-000000000001'),1,'conversation exists before the enquiry receipt');
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e18f4000-0000-4000-8000-000000000001'),1,'conversation-first path persists one raw enquiry');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id='e18f2000-0000-4000-8000-000000000001'),1,'conversation and enquiry reuse one canonical CRM lead');
SELECT is((SELECT count(*)::integer FROM public.project_leads WHERE project_id='e18f1000-0000-4000-8000-000000000001'),1,'conversation-first path creates one project lead');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e18f0000-0000-4000-8000-000000000001' AND type='new_interest'),1,'conversation-first path emits one enquiry notification');
SELECT is((SELECT count(*)::integer FROM public.messages WHERE conversation_id='e18f3000-0000-4000-8000-000000000001'),0,'opening a conversation does not invent a message');
SELECT * FROM finish();
ROLLBACK;
