import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizePagesGitAutoDeploy } from "./capture-cloudflare-admin-posture.mjs";
import { AUCTION_LIVE_BASE } from "./prepare-auction-only-source.mjs";
import { verifyAuctionArtifact } from "./auction-recovery-release.mjs";
import { validateLiveReleaseMarker } from "./release-marker-contract.mjs";
import { getSiteLockCookieHeader } from "./check-production-deploy-site-lock.mjs";
import { stableJson } from "./release-artifact-binding.mjs";

const configurationHash = config => createHash("sha256").update(stableJson(config ?? null)).digest("hex");

export const auctionTargets = Object.freeze({
  staging: { ref: "xsiehskfgeoqyazcgauv", origin: "https://maiprop-listing-site-staging.pages.dev" },
  production: { ref: "qvvicunqcrwpioqnvzxf", origin: "https://portal.maiprop.co" },
});
export function assertAuctionDeployDirectory(directory, checkout) {
  const selected=resolve(directory), repository=resolve(checkout);
  const fromCheckout=relative(repository,selected);
  if(!fromCheckout || (!fromCheckout.startsWith(`..${sep}`) && fromCheckout!==".." && !/^[A-Z]:/i.test(fromCheckout))) throw Error("Auction upload must be outside the checkout");
  for(let ancestor=selected;;ancestor=dirname(ancestor)) {
    for(const name of ["wrangler.toml","wrangler.json","wrangler.jsonc"]) if(existsSync(join(ancestor,name))) throw Error("Auction upload must not discover a Wrangler configuration file");
    if(dirname(ancestor)===ancestor) break;
  }
  return selected;
}
export function validateAuctionPagesIdentity(project, { kind, projectName, projectId }) {
  const target = auctionTargets[kind];
  if (!target || !projectId || project?.id !== projectId || project.name !== projectName) throw Error("Auction Pages target mismatch");
  if (!project.canonical_deployment?.id) throw Error("Previous Pages deployment is unavailable");
  return target;
}
export function validateAuctionPagesProject(project, expected) {
  const target = validateAuctionPagesIdentity(project, expected);
  if (project.production_branch !== "main" || !normalizePagesGitAutoDeploy(project).allAutomaticDeploymentsDisabled) throw Error("Auction Pages automatic deployment lock mismatch");
  const bindings = project.deployment_configs?.production?.env_vars ?? {};
  const val = name => bindings[name]?.value;
  const configured = val("SUPABASE_URL") || val("VITE_SUPABASE_URL");
  if (configured?.replace(/\/$/, "") !== `https://${target.ref}.supabase.co`) throw Error("Auction Pages Supabase target mismatch");
  for (const name of ["SUPABASE_URL","VITE_SUPABASE_URL"]) if (val(name) && val(name).replace(/\/$/, "") !== configured.replace(/\/$/, "")) throw Error("Auction Pages conflicting Supabase URLs");
  if (expected.kind === "production" && bindings.SUPABASE_SERVICE_ROLE_KEY) throw Error("Production Pages must not contain a service-role binding");
  return target;
}
export async function rollbackAuctionPagesDeployment(project, previous, expected, releaseSha, cloudflare, verifyMarker) {
  validateAuctionPagesIdentity(project, expected);
  if (previous.project_id !== project.id || !previous.deployment_id || !previous.marker?.release_sha) throw Error("Auction rollback receipt target mismatch");
  if (project.canonical_deployment.id !== previous.deployment_id) {
    if (project.canonical_deployment.deployment_trigger?.metadata?.commit_hash !== releaseSha) throw Error("Refusing rollback of another release's deployment");
    await cloudflare(`/deployments/${previous.deployment_id}/rollback`, { method: "POST" });
    await verifyMarker(previous.marker.release_sha);
    project = await cloudflare();
    validateAuctionPagesIdentity(project, expected);
    if (project.canonical_deployment.id !== previous.deployment_id) throw Error("Previous auction deployment was not restored");
  }
  return { restored_deployment_id: previous.deployment_id, release_sha: previous.marker.release_sha, runtime_configuration_unchanged: configurationHash(project.deployment_configs?.production) === previous.config_sha256 };
}
export async function auctionHttp(url, options = {}) {
  if(Object.values(auctionTargets).some(t=>new URL(url).origin===t.origin) && process.env.SITE_LOCK_PASSWORD) options={...options,headers:{...options.headers,Cookie:await getSiteLockCookieHeader(process.env.SITE_LOCK_PASSWORD)}};
  if (Object.values(auctionTargets).some(t=>new URL(url).origin===t.origin) && process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) options={...options,headers:{...options.headers,"CF-Access-Client-Id":process.env.CF_ACCESS_CLIENT_ID,"CF-Access-Client-Secret":process.env.CF_ACCESS_CLIENT_SECRET}};
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error(`Auction HTTP ${response.status} at ${new URL(url).pathname}`);
  return response;
}
async function main() {
  const e = process.env;
  const [command] = process.argv.slice(2);
  const kind = e.TARGET_KIND;
  const target = auctionTargets[kind];
  if (!target || e.TARGET_PROJECT_REF !== target.ref) throw Error("Invalid auction Pages environment");
  const api = `https://api.cloudflare.com/client/v4/accounts/${e.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${e.AUCTION_PAGES_PROJECT}`;
  const cloudflare = async (suffix = "", options = {}) => {
    const response = await auctionHttp(api + suffix, { ...options, headers: { Authorization: `Bearer ${e.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" } });
    const value = await response.json();
    if (value.success !== true) throw Error("Cloudflare auction request failed");
    return value.result;
  };
  const readJson = path => JSON.parse(readFileSync(path,"utf8"));
  const evidence = `auction-evidence/${kind}`;
  const project = await cloudflare();
  const expected = { kind, projectId: e.AUCTION_PAGES_PROJECT_ID, projectName: e.AUCTION_PAGES_PROJECT };
  // Runtime drift must not prevent restoring this release's prior deployment.
  if (command !== "rollback") validateAuctionPagesProject(project, expected);
  if (command === "preflight") {
    const response = await auctionHttp(`${target.origin}/deploy-version.json`, { headers: { "Cache-Control": "no-cache" } });
    const marker = validateLiveReleaseMarker(await response.json());
    if (kind === "production" && marker.release_sha !== AUCTION_LIVE_BASE) throw Error("Live baseline changed; scoped website must be reviewed again");
    const config = project.deployment_configs.production;
    writeFileSync(`${evidence}/pages-before.json`,JSON.stringify({ deployment_id: project.canonical_deployment.id, marker, config_sha256: configurationHash(config), project_id: project.id },null,2)+"\n");
    return;
  }
  const previous = readJson(`${evidence}/pages-before.json`);
  if (command === "deploy") {
    verifyAuctionArtifact(e.AUCTION_ARTIFACT,e.RELEASE_SHA,e.GITHUB_RUN_ID);
    if (project.canonical_deployment.id !== previous.deployment_id || configurationHash(project.deployment_configs.production) !== previous.config_sha256) throw Error("Pages state changed after auction preflight");
    // Follow the existing production release's config-free Direct Upload boundary.
    // A discovered checkout wrangler.toml would replace dashboard runtime bindings.
    const isolated=assertAuctionDeployDirectory(join(e.RUNNER_TEMP,`auction-pages-${kind}`),process.cwd());
    if(existsSync(isolated)) throw Error("Auction upload workspace already exists");
    mkdirSync(isolated);
    cpSync(resolve(e.AUCTION_ARTIFACT),isolated,{recursive:true});
    verifyAuctionArtifact(isolated,e.RELEASE_SHA,e.GITHUB_RUN_ID);
    assertAuctionDeployDirectory(isolated,process.cwd());
    execFileSync(resolve("node_modules/.bin/wrangler"), ["pages","deploy",join(isolated,"dist"),"--project-name",e.AUCTION_PAGES_PROJECT,"--branch","main","--commit-hash",e.RELEASE_SHA,"--commit-dirty=false"], { cwd:isolated,stdio:"inherit", env:e });
    let deployed = await cloudflare();
    for(let n=0;n<10 && deployed.canonical_deployment?.id===previous.deployment_id;n++) {
      await new Promise(r=>setTimeout(r,1000));deployed=await cloudflare();
    }
    validateAuctionPagesProject(deployed,{kind,projectId:e.AUCTION_PAGES_PROJECT_ID,projectName:e.AUCTION_PAGES_PROJECT});
    if(configurationHash(deployed.deployment_configs.production)!==previous.config_sha256) throw Error("Pages runtime configuration changed during auction upload");
    if (deployed.canonical_deployment.id === previous.deployment_id || deployed.canonical_deployment.deployment_trigger?.metadata?.commit_hash !== e.RELEASE_SHA) throw Error("New auction deployment identity is invalid");
    writeFileSync(`${evidence}/pages-deployed.json`,JSON.stringify({ deployment_id:deployed.canonical_deployment.id,release_sha:e.RELEASE_SHA })+"\n");
  } else if (command === "rollback") {
    // A failed upload may have changed the live deployment even before writing our receipt.
    const receipt = await rollbackAuctionPagesDeployment(project, previous, expected, e.RELEASE_SHA, cloudflare, sha => execFileSync(process.execPath,["scripts/verify-live-release-marker.mjs",target.origin,"--expected-sha",sha],{stdio:"inherit"}));
    writeFileSync(`${evidence}/rollback.json`,JSON.stringify(receipt)+"\n");
    if (!receipt.runtime_configuration_unchanged) throw Error("Previous deployment restored, but Pages runtime configuration drift requires operator attention");
  } else if (command === "staging-keys") {
    if(kind!=="staging") throw Error("Staging key resolution is staging-only");
    const keys = await (await auctionHttp(`https://api.supabase.com/v1/projects/${target.ref}/api-keys?reveal=true`, {headers:{Authorization:`Bearer ${e.SUPABASE_ACCESS_TOKEN}`}})).json();
    const anon = keys.find(k=>k.name==="anon")?.api_key;
    const service = keys.find(k=>k.name==="service_role")?.api_key;
    if(!anon || !service) throw Error("Staging keys unavailable");
    for (const [name,value] of [["AUCTION_STAGING_ANON_KEY",anon],["AUCTION_STAGING_SERVICE_KEY",service]]) {
      if (/[\r\n]/.test(value)) throw Error("Invalid staging key format");
      console.log(`::add-mask::${value}`);
      appendFileSync(e.GITHUB_ENV,`${name}=${value}\n`);
    }
  } else throw Error("Unknown auction Pages operation");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
