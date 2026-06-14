import { existsSync, readFileSync } from "node:fs";
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

export function checkGithubGovernance(root = process.cwd()) {
  const checks = [
    checkCodeownersCoverage(root),
    checkBranchProtectionEvidence(root),
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
