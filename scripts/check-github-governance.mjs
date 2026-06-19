import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
];

const requiredStatusChecks = [
  "Build / Lint / Test",
  "Release Safety Inventory",
  "Validate Supabase migrations",
  "E2E Tests",
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

export function checkGithubGovernance(root = process.cwd()) {
  const checks = [
    checkCodeownersCoverage(root),
    checkBranchProtectionEvidence(root),
    checkGithubActionsPolicy(root),
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
