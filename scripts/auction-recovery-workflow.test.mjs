import { describe,it,expect } from "vitest";
import { readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { auctionRecoveryWorkflowViolations } from "./auction-recovery-workflow-contract.mjs";
import { auctionFixtureSql,validateAuctionFixtureState } from "./auction-recovery-fixtures.mjs";
import { validateAuctionPagesProject,assertAuctionDeployDirectory,rollbackAuctionPagesDeployment } from "./auction-recovery-pages.mjs";
import { validateAuctionStagingProof } from "./auction-recovery-release.mjs";

const read=path=>readFileSync(path,"utf8");
const text=read(".github/workflows/deploy-auction-recovery.yml");
const workflow=()=>yaml.load(text);
const contract=()=>({text,parsed:workflow(),driver:read("scripts/auction-recovery-target.sh"),control:read("scripts/auction-recovery-control.mjs"),pages:read("scripts/auction-recovery-pages.mjs"),database:read("scripts/auction-recovery-db.sh")});
describe("auction-only release execution",()=>{
  it("prevents checkout Wrangler settings from replacing dashboard runtime bindings",()=>{
    const root=mkdtempSync(join(tmpdir(),"auction-upload-boundary-"));
    const checkout=join(root,"checkout"),upload=join(root,"upload");mkdirSync(checkout);mkdirSync(upload);
    try {
      expect(assertAuctionDeployDirectory(upload,checkout)).toBe(upload);
      expect(()=>assertAuctionDeployDirectory(join(checkout,"artifact"),checkout)).toThrow(/outside/);
      writeFileSync(join(root,"wrangler.toml"),'name="unrelated"');
      expect(()=>assertAuctionDeployDirectory(upload,checkout)).toThrow(/configuration/);
    } finally {rmSync(root,{recursive:true});}
  });
  it("keeps release stages ordered and rejects a widened or unverified workflow",()=>{
    expect(auctionRecoveryWorkflowViolations(contract())).toEqual([]);
    for(const mutate of [c=>{c.parsed.on.push={};},c=>{c.parsed.jobs.recover.env.RELEASE_SINGLE_ADMIN_BREAK_GLASS="false";},c=>{c.driver=c.driver.replace("auction-recovery-db.sh recheck","");},c=>{c.parsed.jobs.recover.steps.reverse();},c=>{c.text+="\nrun: supabase functions deploy";}]){const c=contract();mutate(c);expect(auctionRecoveryWorkflowViolations(c).length).toBeGreaterThan(0);}
  });
  it("supplies the actual central authorization validator's required environment",()=>{
    const sha="a".repeat(40), incident="AUCTION-TEST-123";
    const env={...process.env,...workflow().jobs.recover.env,RELEASE_SHA:sha,RELEASE_CURRENT_MAIN_SHA:sha,RELEASE_CHECKOUT_SHA:sha,GITHUB_REPOSITORY:"maiprop/maiprop-listing-site",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_ACTOR:"krenios",GITHUB_TRIGGERING_ACTOR:"krenios",GITHUB_RUN_ID:"123456",GITHUB_RUN_ATTEMPT:"1",GITHUB_WORKFLOW_SHA:sha,PRODUCTION_RELEASE_DEPLOYERS:"krenios",PRODUCTION_BREAK_GLASS_ACTOR:"krenios",PRODUCTION_BREAK_GLASS_RELEASE_SHA:sha,PRODUCTION_BREAK_GLASS_INCIDENT_ID:incident,PRODUCTION_BREAK_GLASS_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),RELEASE_INCIDENT_ID:incident,RELEASE_REASON:"Local authorization contract verification only.",RELEASE_CONFIRM:`DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incident}`};
    const root=mkdtempSync(join(tmpdir(),"auction-authorization-contract-"));
    try {
      const args=["scripts/production-break-glass-validation.mjs","validate-workflow","--out",join(root,"authorization.json")];
      const result=spawnSync(process.execPath,args,{env,encoding:"utf8",windowsHide:true});expect(result.status,result.stderr).toBe(0);
      const expired=spawnSync(process.execPath,args,{env:{...env,PRODUCTION_BREAK_GLASS_EXPIRES_AT:"2020-01-01T00:00:00Z"},encoding:"utf8",windowsHide:true});expect(expired.status).not.toBe(0);
    } finally {rmSync(root,{recursive:true});}
  });
  it("parses every release shell body before it can spend a deployment",()=>{
    const source=[...workflow().jobs.recover.steps.filter(s=>s.run).map(s=>s.run),read("scripts/auction-recovery-db.sh"),read("scripts/auction-recovery-target.sh")];
    for(const input of source){const r=spawnSync(process.platform==="win32"?"wsl.exe":"bash",process.platform==="win32"?["--exec","bash","-n"]:["-n"],{input,encoding:"utf8",windowsHide:true});expect(r.status,r.stderr).toBe(0);}
  });
  it("routes only explicitly marked candidates away from full staging",()=>{
    const condition=yaml.load(read(".github/workflows/stage-release.yml")).jobs["validate-source"].if;
    expect(condition).toContain("!contains(github.event.workflow_run.head_commit.message, '[Auction-Only]')");
    expect(condition).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(condition).toContain("github.workflow_sha == github.event.workflow_run.head_sha");
  });
  it("rejects wrong runtime projects, automatic deployment and production service keys",()=>{
    const p={id:"project-id",name:"portal",production_branch:"main",source:null,canonical_deployment:{id:"previous"},deployment_configs:{production:{env_vars:{VITE_SUPABASE_URL:{value:"https://qvvicunqcrwpioqnvzxf.supabase.co"}}}}};
    const expected={kind:"production",projectId:p.id,projectName:p.name};expect(validateAuctionPagesProject(p,expected).ref).toBe("qvvicunqcrwpioqnvzxf");
    for(const mutate of [x=>x.id="other",x=>x.source={config:{production_deployments_enabled:true}},x=>x.deployment_configs.production.env_vars.SUPABASE_SERVICE_ROLE_KEY={value:"forbidden"},x=>x.deployment_configs.production.env_vars.VITE_SUPABASE_URL.value="https://xsiehskfgeoqyazcgauv.supabase.co"]){const x=structuredClone(p);mutate(x);expect(()=>validateAuctionPagesProject(x,expected)).toThrow();}
  });
  it("restores its prior deployment despite runtime drift, but never rolls back another release",async()=>{
    const sha="a".repeat(40),p={id:"project-id",name:"portal",canonical_deployment:{id:"new",deployment_trigger:{metadata:{commit_hash:sha}}},deployment_configs:{production:{env_vars:{SUPABASE_URL:{value:"https://wrong.invalid"},SUPABASE_SERVICE_ROLE_KEY:{value:"forbidden"}}}}};
    const expected={kind:"production",projectId:p.id,projectName:p.name},previous={project_id:p.id,deployment_id:"previous",marker:{release_sha:"b".repeat(40)},config_sha256:"original"},calls=[];
    const api=async(path,options)=>{calls.push({path,options});return {...p,canonical_deployment:{id:"previous"}};};
    const receipt=await rollbackAuctionPagesDeployment(p,previous,expected,sha,api,async marker=>calls.push({marker}));
    expect(calls[0]).toEqual({path:"/deployments/previous/rollback",options:{method:"POST"}});
    expect(calls[1].marker).toBe(previous.marker.release_sha);
    expect(receipt).toMatchObject({restored_deployment_id:"previous",runtime_configuration_unchanged:false});
    calls.length=0;
    await expect(rollbackAuctionPagesDeployment(p,previous,expected,"c".repeat(40),api,async()=>{})).rejects.toThrow(/another release/);
    await expect(rollbackAuctionPagesDeployment(p,{...previous,project_id:"other"},expected,sha,api,async()=>{})).rejects.toThrow(/target mismatch/);
    expect(calls).toEqual([]);
  });
  it("limits fixture deletion to unique run-owned identifiers and forbids adoption",()=>{
    const s={run_id:"123",tag:"auction-recovery:123",listings:Array.from({length:650},()=>randomUUID()),users:[]};
    expect(validateAuctionFixtureState(s,"123")).toBe(s);
    expect(auctionFixtureSql(s,"cleanup")).toContain("AND tags @> ARRAY['auction-recovery:123']");
    expect(()=>validateAuctionFixtureState({...s,tag:"auction-recovery:999"},"123")).toThrow();
    expect(()=>validateAuctionFixtureState({...s,listings:Array(650).fill(s.listings[0])},"123")).toThrow();
    expect(()=>auctionFixtureSql(s,"seed")).toThrow();
  });
  it("requires actual staging behavior and completed cleanup before production",()=>{
    const root=mkdtempSync(join(tmpdir(),"auction-proof-contract-")),sha="a".repeat(40),runId="123";
    const smoke={release_sha:sha,run_id:runId,scope:"auctions",anonymous_total:60,free_limit:60,paid_limit:600,pagination:true,city_filter:true,uuid_and_provider_details:true,authenticated_actions:true};
    const put=(name,v)=>writeFileSync(join(root,name),JSON.stringify(v));
    try{put("smoke.json",smoke);put("database.json",{capabilities:true,unrelated_schema_unchanged:true,history_preserved:true});put("fixture-cleanup.json",{run_id:runId,listings_removed:650,accounts_removed:2});expect(validateAuctionStagingProof(root,sha,runId)).toBe(true);put("smoke.json",{...smoke,authenticated_actions:false});expect(()=>validateAuctionStagingProof(root,sha,runId)).toThrow();}finally{rmSync(root,{recursive:true});}
  });
});
