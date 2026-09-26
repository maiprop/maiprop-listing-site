import {spawnSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sql} from './task-23-local.mjs';
const dir='.superpowers/sdd/2026-09-21-verified-remediation-plan';
const files=['src/components/POFVerificationPanel.tsx','src/hooks/openHouseAssetControl/constants.ts','src/hooks/useOpenHouseAssetControl.ts','src/services/openHouseContextService.ts','src/test/POFVerificationPanel.test.tsx','src/test/openHouseBoundary.test.tsx','src/test/useOpenHouseAssetControl.test.tsx','src/test/useOpenHouseAssetControl.branchCoverage.test.tsx','supabase/migrations/20260926224929_repair_open_house_listing_boundary.sql','supabase/tests/open_house_listing_boundary_test.sql','supabase/tests/new_build_enquiry_replay_test.sql'];
const checks=[
 ['typecheck',['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.app.json']],
 ['eslint',['node_modules/eslint/bin/eslint.js',...files.filter(f=>f.endsWith('.ts')||f.endsWith('.tsx'))]],
 ['migration-idempotency',['scripts/check-migration-idempotency.mjs']],
];
const results=[];
for(const [name,args] of checks){const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:2e6});writeFileSync(`${dir}/task-23-${name}-final.log`,r.stdout+r.stderr);results.push({name,exit:r.status,outputBytes:r.stdout.length+r.stderr.length});}
const diff=spawnSync('git',['diff','--check'],{encoding:'utf8'});results.push({name:'git diff --check',exit:diff.status});writeFileSync(`${dir}/task-23-diff-check.log`,diff.stdout+diff.stderr);
writeFileSync(`${dir}/task-23-static-status.json`,JSON.stringify(results,null,2));console.log(results);
sql(readFileSync('supabase/tests/open_house_listing_boundary_test.sql','utf8')+'\n'+readFileSync('supabase/tests/new_build_enquiry_replay_test.sql','utf8'),'durable-one-backend');
writeFileSync(`${dir}/task-23-artifact-hashes.json`,JSON.stringify(files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),null,2));
