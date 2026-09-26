import {fixture,actor,sql} from './task-23-local.mjs';
const l="'d1131002-0000-4000-8000-000000000001'";
let q=fixture+`CREATE EXTENSION IF NOT EXISTS pgtap; SELECT no_plan();
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id) VALUES ('d1131001-0000-4000-8000-000000000005');
INSERT INTO public.profiles(user_id,role) VALUES ('d1131001-0000-4000-8000-000000000005','buyer');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('d1131003-0000-4000-8000-000000000001','Task23 organization','task23-organization','d1131001-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES ('d1131003-0000-4000-8000-000000000001','d1131001-0000-4000-8000-000000000005','admin','active');
UPDATE public.listings SET organization_id='d1131003-0000-4000-8000-000000000001' WHERE id=${l};
SET LOCAL session_replication_role=origin;
`+actor(5)+`SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY[${l}::uuid])),0,'organization administrator gains no unrelated public context');
SELECT is((SELECT count(*)::int FROM public.open_house_registrations),0,'organization administrator gains no child rows');
`+actor(1)+`SELECT ok(private.current_user_owns_listing(${l}),'actual organization listing owner remains owner');
RESET ROLE; UPDATE public.listings SET listing_type='sale',open_house_transaction_type=NULL WHERE id=${l};
`+actor(2)+`SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY[${l}::uuid])),1,'historical type-changed active participant summary retained');
SELECT is((SELECT open_house_settings FROM public.get_open_house_listing_context(ARRAY[${l}::uuid])),'[]'::jsonb,'type-changed participant does not get hidden settings');
RESET ROLE; UPDATE public.listings SET is_off_market=true WHERE id=${l};
`+actor(2)+`SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY[${l}::uuid])),0,'off-market participant context absent');
SELECT is((SELECT count(*)::int FROM public.open_house_registrations),1,'off-market participant own registration retained');
`+actor(1)+`SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY[${l}::uuid])),1,'type-changed off-market owner keeps context');
SELECT ok(private.current_user_owns_listing(${l}),'shared helper retains type-changed off-market owner semantics');
SELECT ok(NOT private.current_user_owns_listing(NULL),'NULL listing is not owned');
SELECT ok(NOT private.current_user_owns_listing('00000000-0000-0000-0000-000000000000'),'absent listing is not owned');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true); SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM public.open_house_settings),0,'anon settings hide off-market row through stored private helper policy');
RESET ROLE; UPDATE public.listings SET listing_type='open_house',open_house_transaction_type='sale',is_off_market=false WHERE id=${l};
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true); SET LOCAL ROLE service_role;
`;
const params=['NULL',"'Name'","'a@example.test'","'+3000'",'NULL','NULL','true','true','true'];
for(const [index,missing,message] of [[1,"''",'name'],[2,"''",'email'],[3,"''",'phone'],[6,'false','permission'],[7,'false','id_verification_consent'],[8,'false','privacy_acknowledgement']]){
 const a=[...params];a[index]=missing;
 const error=message==='permission'?'open_house_contact_permission_required':message.startsWith('id_')||message.startsWith('privacy_')?'open_house_'+message+'_required':'open_house_contact_'+message+'_required';
 q+=`SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005',${l},${a.join(',')})$q$,'23514','${error}','required ${message} preserved');\n`;
}
q+=`SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005',${l},${params.join(',')})$q$,'23514','open_house_registration_closed','past event closes RSVP');
RESET ROLE; SELECT is((SELECT count(*)::int FROM public.open_house_registrations),2,'all rejected statements preserve original registration count');
SELECT * FROM finish(); ROLLBACK;`;
sql(q,'context-matrix');

