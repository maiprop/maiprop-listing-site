import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const readJson = (root, relativePath) => {
  const text = readText(root, relativePath);
  if (text === null) return null;
  return JSON.parse(text);
};

const normalize = (text) => text.replace(/\r\n/g, "\n");

const readWorkflow = (root, relativePath) => {
  const text = readText(root, relativePath);
  if (text === null) return { text: null, workflow: null };
  try {
    return { text, workflow: yaml.load(text) };
  } catch {
    return { text, workflow: null };
  }
};

const workflowJobs = (workflow) => {
  return workflow && typeof workflow === "object" && workflow.jobs && typeof workflow.jobs === "object"
    ? Object.entries(workflow.jobs)
    : [];
};

const findWorkflowStep = (workflow, predicate) => {
  for (const [jobName, job] of workflowJobs(workflow)) {
    if (!job || typeof job !== "object" || !Array.isArray(job.steps)) continue;
    for (const step of job.steps) {
      if (step && typeof step === "object" && predicate(step)) return { jobName, job, step };
    }
  }
  return null;
};

const effectiveJobPermissions = (workflow, job) => {
  if (job?.permissions && typeof job.permissions === "object") return job.permissions;
  if (workflow?.permissions && typeof workflow.permissions === "object") return workflow.permissions;
  return {};
};

const hasCodeownersPattern = (codeowners, pattern) => {
  return normalize(codeowners)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((line) => line.split(/\s+/)[0] === pattern);
};

const requiredCodeownersPatterns = [
  "*",
  "/.github/workflows/",
  "/.github/CODEOWNERS",
  "/supabase/migrations/",
  "/supabase/functions/_shared/",
  "/src/integrations/supabase/",
  "/src/contexts/AuthContext.tsx",
  "/functions/_middleware.ts",
  "/public/_headers",
  "/scripts/",
];

const requiredBranchDocMarkers = [
  "Require pull request reviews",
  "Require review from Code Owners",
  "Dismiss stale pull request approvals",
  "Require conversation resolution",
  "Do not allow bypassing the above settings",
  "Allow force pushes |",
  "Allow deletions |",
  "Build / Lint / Test",
  "Validate Supabase migrations",
  "E2E Security (Live-safe)",
  "Lighthouse CI",
];

const requiredStatusChecks = [
  "Build / Lint / Test",
  "Release Safety Inventory",
  "Validate Supabase migrations",
  "E2E Tests",
  "E2E Security (Live-safe)",
  "Lighthouse CI",
];

const workflowFiles = (root) => {
  const workflowDir = join(root, ".github", "workflows");
  if (!existsSync(workflowDir)) return [];

  return readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `.github/workflows/${name}`);
};

const extractWorkflowUses = (text) => {
  const uses = [];
  const regex = /^\s*(?:-\s*)?uses:\s*([^#\s]+)/gm;
  let match;

  while ((match = regex.exec(text)) !== null) {
    uses.push(match[1].trim().replace(/^['"]|['"]$/g, ""));
  }

  return uses;
};

const parseRemoteAction = (usesValue) => {
  if (usesValue.startsWith("./")) return null;
  if (usesValue.startsWith("docker://")) return null;

  const atIndex = usesValue.lastIndexOf("@");
  if (atIndex === -1) return { action: usesValue, ref: "" };

  return {
    action: usesValue.slice(0, atIndex),
    ref: usesValue.slice(atIndex + 1),
  };
};

const isPinnedSha = (ref) => /^[a-f0-9]{40}$/i.test(ref);

export function checkCodeownersCoverage(root = process.cwd()) {
  const failures = [];
  const codeowners = readText(root, ".github/CODEOWNERS");
  if (codeowners === null) return result([".github/CODEOWNERS is missing"]);

  for (const pattern of requiredCodeownersPatterns) {
    if (!hasCodeownersPattern(codeowners, pattern)) {
      failures.push(`.github/CODEOWNERS must cover ${pattern}`);
    }
  }

  return result(failures);
}

export function checkBranchProtectionEvidence(root = process.cwd()) {
  const failures = [];
  const expected = readJson(root, "docs/governance/main-branch-protection.expected.json");
  const branchDoc = readText(root, "docs/BRANCH_PROTECTION.md");

  if (!expected) failures.push("docs/governance/main-branch-protection.expected.json is missing or invalid");
  if (branchDoc === null) failures.push("docs/BRANCH_PROTECTION.md is missing");
  if (!expected || branchDoc === null) return result(failures);

  if (expected.branch !== "main") failures.push("main branch protection artifact must target branch=main");
  if (!Array.isArray(expected.requiredStatusChecks)) {
    failures.push("requiredStatusChecks must be an array");
  } else {
    for (const check of requiredStatusChecks) {
      if (!expected.requiredStatusChecks.includes(check)) {
        failures.push(`requiredStatusChecks must include ${check}`);
      }
    }
  }
  if (expected.requiredApprovingReviewCount < 1) {
    failures.push("requiredApprovingReviewCount must be at least 1");
  }
  for (const key of [
    "requireCodeOwnerReviews",
    "dismissStaleReviews",
    "requireConversationResolution",
    "doNotAllowBypass",
  ]) {
    if (expected[key] !== true) failures.push(`${key} must be true`);
  }
  for (const key of ["allowForcePushes", "allowDeletions"]) {
    if (expected[key] !== false) failures.push(`${key} must be false`);
  }

  for (const marker of requiredBranchDocMarkers) {
    if (!branchDoc.includes(marker)) {
      failures.push(`docs/BRANCH_PROTECTION.md must mention ${marker}`);
    }
  }
  if (/Require pull request reviews\*\*\s*\|\s*[^\n]*disabled/i.test(branchDoc)) {
    failures.push("docs/BRANCH_PROTECTION.md must not document disabled required PR reviews");
  }

  return result(failures);
}

export function checkGithubActionsPolicy(root = process.cwd()) {
  const failures = [];
  const expected = readJson(root, "docs/governance/github-actions-policy.expected.json");

  if (!expected) {
    return result(["docs/governance/github-actions-policy.expected.json is missing or invalid"]);
  }

  if (expected.requirePinnedActions !== true) {
    failures.push("github-actions-policy.expected.json must require pinned workflow actions");
  }
  if (!Array.isArray(expected.allowedActionRepositories) || expected.allowedActionRepositories.length === 0) {
    failures.push("github-actions-policy.expected.json must define allowedActionRepositories");
  }
  if (expected.recommendedLiveRepositoryPolicy?.allowed_actions !== "selected") {
    failures.push("recommended live GitHub Actions policy must use allowed_actions=selected");
  }
  if (expected.recommendedLiveRepositoryPolicy?.sha_pinning_required !== true) {
    failures.push("recommended live GitHub Actions policy must require SHA pinning");
  }

  const allowed = new Set(expected.allowedActionRepositories ?? []);
  for (const file of workflowFiles(root)) {
    const text = readText(root, file) ?? "";
    for (const usesValue of extractWorkflowUses(text)) {
      const remote = parseRemoteAction(usesValue);
      if (remote === null) continue;

      if (!allowed.has(remote.action)) {
        failures.push(`${file} uses unapproved action repository: ${remote.action}`);
      }
      if (expected.requirePinnedActions === true && !isPinnedSha(remote.ref)) {
        failures.push(`${file} action ${usesValue} must be pinned by commit SHA`);
      }
    }
  }

  return result(failures);
}

export function checkReleasePrCiDispatch(root = process.cwd()) {
  const { text: releaseWorkflow, workflow } = readWorkflow(root, ".github/workflows/release.yml");
  if (releaseWorkflow === null) return result([".github/workflows/release.yml is missing"]);
  if (!workflow || typeof workflow !== "object") return result([".github/workflows/release.yml must be valid YAML"]);
  const { text: ciText, workflow: ciWorkflow } = readWorkflow(root, ".github/workflows/ci.yml");
  if (ciText === null) return result([".github/workflows/ci.yml is missing"]);
  if (!ciWorkflow || typeof ciWorkflow !== "object") return result([".github/workflows/ci.yml must be valid YAML"]);

  const failures = [];
  const dispatch = findWorkflowStep(
    workflow,
    (step) => typeof step.run === "string" && /^\s*gh workflow run ci\.yml\b/m.test(step.run),
  );
  if (!dispatch) {
    return result(["release workflow must use workflow_dispatch to run ci.yml for the Release Please branch"]);
  }

  const permissions = effectiveJobPermissions(workflow, dispatch.job);
  if (permissions.actions !== "write") {
    failures.push("release workflow must grant actions: write for workflow_dispatch");
  }
  if (permissions.statuses !== "write") {
    failures.push("release workflow must grant statuses: write for the release PR commit status");
  }
  if (permissions.contents !== "read") {
    failures.push("release CI verification job must use contents: read");
  }

  const releaseAction = findWorkflowStep(
    workflow,
    (step) => typeof step.uses === "string" && step.uses.startsWith("googleapis/release-please-action@"),
  );
  if (releaseAction) {
    const releasePermissions = effectiveJobPermissions(workflow, releaseAction.job);
    if (releasePermissions.actions === "write" || releasePermissions.statuses === "write") {
      failures.push("Release Please action job must not receive actions/statuses write permissions");
    }
  }

  const timeoutMinutes = Number(dispatch.job["timeout-minutes"]);
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 10) {
    failures.push("release CI dispatch job must have a bounded 1-10 minute timeout");
  }

  const run = dispatch.step.run;
  if (dispatch.step.env?.GH_REPO !== "${{ github.repository }}") {
    failures.push("release workflow must provide explicit GitHub repository context to gh commands");
  }
  const dispatchIndex = run.indexOf("gh workflow run ci.yml");
  const existingRunIndex = run.indexOf("existing_run=$(gh run list");
  if (!run.includes("release_sha=$(gh api") || !run.includes("--jq '.commit.sha'")) {
    failures.push("release workflow must resolve the current Release Please branch SHA");
  }
  if (!run.includes("--ref \"$RELEASE_BRANCH\"")) {
    failures.push("release workflow must dispatch CI against the Release Please branch ref");
  }
  if (existingRunIndex === -1 || existingRunIndex > dispatchIndex) {
    failures.push("release workflow must inspect an existing exact-head CI run before dispatching another one");
  }
  if (!run.includes("--event workflow_dispatch") || !/\.headSha\s*==\s*\\?"\$release_sha\\?"/.test(run)) {
    failures.push("release workflow must match workflow_dispatch runs to the exact release SHA");
  }
  if (/\bgh run watch\b/.test(run)) {
    failures.push("release workflow must not consume a runner while waiting synchronously for exact-head CI");
  }
  if (
    !run.includes('context="release-please/ci"') ||
    (!run.includes("state=pending") && !run.includes("post_status pending"))
  ) {
    failures.push("release workflow must publish a pending release PR commit status before dispatch");
  }

  const releaseStatus = ciWorkflow.jobs?.["release-status"];
  if (!releaseStatus || typeof releaseStatus !== "object") {
    failures.push("CI must publish the final release status asynchronously");
    return result(failures);
  }

  const releaseStatusCondition = typeof releaseStatus.if === "string" ? releaseStatus.if : "";
  if (
    !releaseStatusCondition.includes("always()") ||
    !releaseStatusCondition.includes("workflow_dispatch") ||
    !releaseStatusCondition.includes("refs/heads/release-please--")
  ) {
    failures.push("final release status job must run after all exact-head release CI outcomes");
  }

  const requiredNeeds = [
    "quality",
    "release-safety",
    "e2e",
    "migrations-validate",
    "lighthouse",
  ];
  const needs = Array.isArray(releaseStatus.needs)
    ? releaseStatus.needs
    : typeof releaseStatus.needs === "string"
      ? [releaseStatus.needs]
      : [];
  for (const required of requiredNeeds) {
    if (!needs.includes(required)) failures.push(`final release status job must depend on ${required}`);
  }

  const finalPermissions = effectiveJobPermissions(ciWorkflow, releaseStatus);
  if (finalPermissions.statuses !== "write" || finalPermissions.contents !== "read") {
    failures.push("final release status job must use contents: read and statuses: write");
  }

  const finalStatusStep = (releaseStatus.steps ?? []).find(
    (step) =>
      typeof step?.run === "string" &&
      step.run.includes("statuses/${GITHUB_SHA}") &&
      step.run.includes('context="release-please/ci"'),
  );
  if (!finalStatusStep) {
    failures.push("CI must publish the final release status for the exact release SHA");
  } else if (!finalStatusStep.run.includes("state=success") || !finalStatusStep.run.includes("state=failure")) {
    failures.push("final release status job must publish both success and failure outcomes");
  }

  return result(failures);
}

export function checkReleasePrLighthouseDispatch(root = process.cwd()) {
  const { text, workflow } = readWorkflow(root, ".github/workflows/ci.yml");
  if (text === null) return result([".github/workflows/ci.yml is missing"]);
  if (!workflow || typeof workflow !== "object") return result([".github/workflows/ci.yml must be valid YAML"]);

  const lighthouse = workflow.jobs?.lighthouse;
  if (!lighthouse || typeof lighthouse !== "object") return result(["CI must define a Lighthouse job"]);

  const failures = [];
  const condition = typeof lighthouse.if === "string" ? lighthouse.if : "";
  const failClosed = /^\$\{\{\s*false\s*\}\}$/.test(condition.trim());
  const hasReleasePleaseDispatch =
    condition.includes("github.event_name == 'workflow_dispatch'") &&
    condition.includes("startsWith(github.ref, 'refs/heads/release-please--')");
  if (!failClosed && !hasReleasePleaseDispatch) {
    failures.push("Lighthouse must run for workflow-dispatched Release Please branches");
  }
  const needs = Array.isArray(lighthouse.needs) ? lighthouse.needs : [lighthouse.needs].filter(Boolean);
  if (!needs.includes("quality") || !needs.includes("release-safety")) {
    failures.push("Release Please Lighthouse must depend on quality and release-safety gates");
  }
  return result(failures);
}

export function checkGithubGovernance(root = process.cwd()) {
  const checks = [
    checkCodeownersCoverage(root),
    checkBranchProtectionEvidence(root),
    checkGithubActionsPolicy(root),
    checkReleasePrCiDispatch(root),
    checkReleasePrLighthouseDispatch(root),
  ];
  return result(checks.flatMap((check) => check.failures));
}

const main = () => {
  const check = checkGithubGovernance(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("GitHub governance evidence OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-github-governance.mjs")
) {
  main();
}
