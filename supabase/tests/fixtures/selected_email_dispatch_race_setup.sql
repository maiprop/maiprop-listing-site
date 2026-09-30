\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('120b2ace-0000-4000-8000-000000000001','selected-race-alert@example.test');
INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
  created_at,status,followup_step)
VALUES ('120b2ace-0000-4000-8000-000000000002','Selected Race','+306900002002',
  'selected-race-lead@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
VALUES ('120b2ace-0000-4000-8000-000000000003','120b2ace-0000-4000-8000-000000000001',
  'Selected race','{"area":"Athens"}'::jsonb,true,NULL);
INSERT INTO public.scheduled_http_dispatches(dispatch_id,integration,origin,transport_state,
  application_state,execution_token,started_at)
VALUES
 ('120b2ace-0000-4000-8000-000000000004','scheduled_followups','cron','enqueued',
  'running','120b2ace-0000-4000-8000-000000000005',now()),
 ('120b2ace-0000-4000-8000-000000000006','saved_search_alerts','cron','enqueued',
  'running','120b2ace-0000-4000-8000-000000000007',now());
COMMIT;
