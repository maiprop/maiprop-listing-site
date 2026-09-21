export function auctionRecoveryWorkflowViolations({parsed,text,driver,control,pages,database}) {
  const failures=[];
  const fail=message=>failures.push(`auction recovery: ${message}`);
  if(Object.keys(parsed?.on??{}).join()!=="workflow_dispatch" || parsed.concurrency?.group!=="maiprop-production-release" || parsed.concurrency.cancel_in_progress===true || parsed.concurrency["cancel-in-progress"]!==false) fail("requires manual production serialization");
  const job=parsed?.jobs?.recover;
  if(job?.concurrency?.group!=="maiprop-staging-release" || job.concurrency["cancel-in-progress"]!==false)fail("requires the shared staging lock");
  if(Object.keys(parsed?.jobs??{}).join()!=="recover" || job?.environment!=="production" || job?.env?.RELEASE_SINGLE_ADMIN_BREAK_GLASS!=="true" || !job?.env?.RELEASE_STANDARD_CONFIRMATION || job?.["timeout-minutes"]>45) fail("requires one bounded production authorization context");
  for(const marker of ["github.ref == 'refs/heads/main'","github.run_attempt == 1","github.actor == github.triggering_actor","vars.PRODUCTION_RELEASE_ENABLED == 'true'","vars.STAGING_RELEASE_ENABLED == 'true'"]) if(!job?.if?.includes(marker)) fail(`missing ${marker}`);
  for(const forbidden of ["continue-on-error","functions deploy","migration repair","SUPABASE_SERVICE_ROLE_KEY","prepare-isolated-security-fixtures","deploy-production-release.yml"]) if(text.includes(forbidden)) fail(`forbidden scope ${forbidden}`);
  const steps=job?.steps??[];
  const names=steps.map(s=>s.name);
  const ordered=["Verify exact source and current authorization","Build bounded auction source","Upload immutable auction artifact","Sign immutable auction artifact","Restore staging auction database only","Resolve isolated staging credentials","Create temporary auction fixtures","Deploy and exercise staging auctions","Remove only this run's staging fixtures","Upload staging proof","Sign staging proof","Restore production auction database only","Deploy and verify production auctions"];
  let index=-1;for(const name of ordered){const found=names.indexOf(name);if(found<=index)fail(`missing or misordered ${name}`);index=found;}
  for(const kind of ["staging","production"]){
    const step=steps.find(s=>s.name===`Restore ${kind} auction database only`);
    if(step?.env?.TARGET_KIND!==kind || step?.env?.TARGET_PROJECT_REF!==(kind==="staging"?"xsiehskfgeoqyazcgauv":"qvvicunqcrwpioqnvzxf") || step.run!=="bash scripts/auction-recovery-target.sh database") fail(`invalid ${kind} database dispatch`);
  }
  for(const marker of ["auction-recovery-control.mjs authorize","auction-recovery-control.mjs verify","auction-recovery-release.mjs staging-proof","validate-dry-run","auction-recovery-db.sh recheck","auction-recovery-db.sh after","trap rollback ERR"]) if(!driver.includes(marker))fail(`driver lacks ${marker}`);
  for(const marker of ["validateAuctionRecoveryControl","production-break-glass-validation.mjs","runs.total_count !== 1","verifyReleaseArtifactBinding","same-run"]) if(!control.includes(marker))fail(`control lacks ${marker}`);
  for(const marker of ["allAutomaticDeploymentsDisabled","Previous Pages deployment","previous.deployment_id","--commit-dirty=false","SUPABASE_SERVICE_ROLE_KEY"])if(!pages.includes(marker))fail(`Pages guard lacks ${marker}`);
  for(const marker of ["assert-staging-mutation-target","history-check","schema-before.txt","capabilities-sql"])if(!database.includes(marker))fail(`database guard lacks ${marker}`);
  return failures;
}
