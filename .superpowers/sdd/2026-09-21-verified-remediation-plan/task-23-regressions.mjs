import {readFileSync} from 'node:fs';
import {sql,db} from './task-23-local.mjs';
let task18=readFileSync('supabase/tests/new_build_enquiry_replay_test.sql','utf8');
const old="SELECT ok(NOT has_function_privilege('service_role', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'service role receives no Task18 helper grant');";
if(!task18.includes(old) && !task18.includes('Task23 shared helper service grant is present')) throw Error('Task18 assertion binding changed');
task18=task18.replace(old,"SELECT ok(has_function_privilege('service_role', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'Task23 deliberately adds only service helper execute; all Task18 browser/anon behavior remains');");
sql(task18,'task18-regression');
sql(readFileSync(db.includes('selected')?'supabase/tests/new_build_enquiry_captured_policy_variant.sql':'supabase/tests/new_build_enquiry_source_policy_test.sql','utf8'),'task18-policy');
sql(readFileSync('supabase/tests/open_house_rsvp_service_quota_test.sql','utf8'),'task22-regression');
