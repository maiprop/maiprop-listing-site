BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap; SELECT plan(5);
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND status='accepted'),1,'one winner after competing accepts');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND status='rejected'),1,'one rejected rival, no partial mutation');
 SELECT is((SELECT status::text FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001'),'paused','listing paused consistently');
 SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND decided_by='d1131001-0000-4000-8000-000000000001' AND decided_at IS NOT NULL),2,'host decisions complete');
 SELECT is((SELECT count(*)::int FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' AND type='open_house_offer' AND title IN ('Open house bid accepted','Open house bid not selected')),2,'one transition notification per decision');
 SELECT * FROM finish(); ROLLBACK;