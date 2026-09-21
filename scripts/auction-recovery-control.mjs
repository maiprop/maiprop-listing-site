import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { validateAuctionRecoveryControl } from "./auction-recovery-release.mjs";
import { createReleaseArtifactBinding, verifyReleaseArtifactBinding } from "./release-artifact-binding.mjs";

const env = process.env;
const gh = path => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const [command, root, bindingPath, artifactId, artifactName, artifactDigest] = process.argv.slice(2);
const context = () => ({
  repository: env.GITHUB_REPOSITORY, releaseSha: env.RELEASE_SHA, sourceTree: git("rev-parse", "HEAD^{tree}"),
  workflowPath: ".github/workflows/deploy-auction-recovery.yml", workflowRef: env.GITHUB_WORKFLOW_REF,
  workflowSha: env.GITHUB_WORKFLOW_SHA, event: env.GITHUB_EVENT_NAME,
  runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
  actor: env.GITHUB_ACTOR, triggeringActor: env.GITHUB_TRIGGERING_ACTOR,
});
if (command === "authorize") {
  if (env.GITHUB_REPOSITORY !== "maiprop/maiprop-listing-site" || !/^[1-9][0-9]*$/.test(env.AUCTION_CI_RUN_ID ?? "")) throw Error("Invalid auction control repository or CI run");
  const currentMain = gh(`repos/${env.GITHUB_REPOSITORY}/commits/main`).sha;
  const checkout = git("rev-parse", "HEAD");
  const ci = gh(`repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.AUCTION_CI_RUN_ID}`);
  validateAuctionRecoveryControl({ sha: env.RELEASE_SHA, currentMain, checkout, workflowSha: env.GITHUB_WORKFLOW_SHA, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, attempt: env.GITHUB_RUN_ATTEMPT, actor: env.GITHUB_ACTOR, triggeringActor: env.GITHUB_TRIGGERING_ACTOR, ci });
  if (ci.repository?.full_name !== env.GITHUB_REPOSITORY || ci.head_repository?.full_name !== env.GITHUB_REPOSITORY || !git("log", "-1", "--format=%B").includes("[Auction-Only]")) throw Error("Auction recovery CI or routing identity mismatch");
  const runs = gh(`repos/${env.GITHUB_REPOSITORY}/actions/workflows/deploy-auction-recovery.yml/runs?head_sha=${env.RELEASE_SHA}&event=workflow_dispatch&per_page=100`);
  if (runs.total_count !== 1 || runs.workflow_runs?.length !== 1 || String(runs.workflow_runs[0].id) !== env.GITHUB_RUN_ID) throw Error("Auction recovery control SHA has already been consumed by another dispatch");
  execFileSync(process.execPath, ["scripts/production-break-glass-validation.mjs", "validate-workflow", "--out", `${env.RUNNER_TEMP}/auction-authorization.json`], { stdio: "inherit", env: { ...env, RELEASE_CHECKOUT_SHA: checkout, RELEASE_CURRENT_MAIN_SHA: currentMain } });
} else if (command === "sign") {
  const binding = createReleaseArtifactBinding({ ...context(), payloadRoot: root, artifactId, artifactName, artifactDigest, keyId: env.RELEASE_EVIDENCE_SIGNING_KEY_ID, signingKey: env.RELEASE_EVIDENCE_SIGNING_KEY });
  writeFileSync(bindingPath, JSON.stringify(binding,null,2)+"\n");
} else if (command === "verify") {
  const binding = JSON.parse(readFileSync(bindingPath,"utf8"));
  const current = context();
  verifyReleaseArtifactBinding({ binding, payloadRoot: root,
    artifactMetadata: gh(`repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${binding.artifact.id}`),
    producerRun: gh(`repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`),
    signingKey: env.RELEASE_EVIDENCE_SIGNING_KEY, expectedKeyId: env.RELEASE_EVIDENCE_SIGNING_KEY_ID, expected: current,
    verificationMode: "same-run", trustedCurrentRun: current });
} else throw Error("Unknown auction control command");
