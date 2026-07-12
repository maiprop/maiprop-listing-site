import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkBranchProtectionEvidence, checkGithubGovernance } from "./check-github-governance.mjs";

const DEFAULT_OUT = "artifacts/compliance/live-evidence/github-admin-posture.json";

export const validateGithubEnv = (env = process.env) => {
  const missing = [];
  if (!env.GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!env.GITHUB_REPOSITORY) missing.push("GITHUB_REPOSITORY");
  return missing;
};

const githubRequest = async ({ env, fetchImpl, path }) => {
  const apiBase = env.GITHUB_API_URL || "https://api.github.com";
  const response = await fetchImpl(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json();
  return { response, body };
};

const normalizeBranchProtection = (body) => ({
  requiredApprovingReviewCount: body?.required_pull_request_reviews?.required_approving_review_count ?? 0,
  requiredPullRequestReviews: Boolean(body?.required_pull_request_reviews),
  requireCodeOwnerReviews: body?.required_pull_request_reviews?.require_code_owner_reviews === true,
  requiredStatusChecks: Array.isArray(body?.required_status_checks?.contexts)
    ? body.required_status_checks.contexts.length > 0
    : Boolean(body?.required_status_checks),
  requiredStatusCheckContexts: body?.required_status_checks?.contexts ?? [],
  allowsForcePushes: body?.allow_force_pushes?.enabled === true,
  allowsDeletions: body?.allow_deletions?.enabled === true,
  enforceAdmins: body?.enforce_admins?.enabled === true,
  hasRestrictions: Boolean(body?.restrictions),
});

const normalizeActionsPermissions = (body) => ({
  enabledRepositories: body?.enabled_repositories ?? null,
  allowedActions: body?.allowed_actions ?? null,
});

const normalizeProductionEnvironment = (body) => ({
  configured: Boolean(body && Object.keys(body).length > 0),
  hasRequiredReviewers: Array.isArray(body?.protection_rules)
    ? body.protection_rules.some((rule) => rule?.type === "required_reviewers")
    : false,
});

const summarizeCheck = (id, description, check) => ({
  id,
  description,
  status: check.ok ? "passed" : "failed",
  failures: check.failures,
});

const planLimitedBranchProtection = (response, body) =>
  response.status === 403 &&
  /upgrade to github pro|make this repository public|plan/i.test(String(body?.message ?? ""));

export async function buildGithubAdminPostureEvidence({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  root = process.cwd(),
} = {}) {
  const queriedAt = now().toISOString();
  const missingEnv = validateGithubEnv(env);
  const branch = env.GITHUB_BRANCH || "main";
  if (missingEnv.length > 0) {
    return {
      provider: "github",
      status: "unconfigured",
      queriedAt,
      missingEnv,
      branch,
    };
  }

  const repoPath = `/repos/${env.GITHUB_REPOSITORY}`;
  const blockers = [];
  const branchProtectionResult = await githubRequest({
    env,
    fetchImpl,
    path: `${repoPath}/branches/${branch}/protection`,
  });

  if (!branchProtectionResult.response.ok) {
    if (planLimitedBranchProtection(branchProtectionResult.response, branchProtectionResult.body)) {
      return {
        provider: "github",
        status: "plan_limited",
        queriedAt,
        branch,
        branchProtection: {
          status: "plan_limited",
          httpStatus: branchProtectionResult.response.status,
          message: String(branchProtectionResult.body?.message ?? "GitHub branch protection is unavailable"),
        },
        compensatingControls: [
          summarizeCheck(
            "source-controlled-branch-policy",
            "Expected main-branch policy is versioned and checked against the repository documentation.",
            checkBranchProtectionEvidence(root),
          ),
          summarizeCheck(
            "required-ci-governance-gate",
            "Repository governance contracts and SHA-pinned workflow policy pass in CI.",
            checkGithubGovernance(root),
          ),
        ],
      };
    }
    blockers.push(
      `GitHub branch protection endpoint returned ${branchProtectionResult.response.status}: ${
        branchProtectionResult.body?.message ?? "unavailable"
      }`,
    );
  }

  const actionsResult = await githubRequest({
    env,
    fetchImpl,
    path: `${repoPath}/actions/permissions`,
  });

  const environmentsResult = await githubRequest({
    env,
    fetchImpl,
    path: `${repoPath}/environments`,
  });

  const productionEnvironmentResult = await githubRequest({
    env,
    fetchImpl,
    path: `${repoPath}/environments/production`,
  });

  if (blockers.length > 0) {
    return {
      provider: "github",
      status: "blocked",
      queriedAt,
      branch,
      blockers,
    };
  }

  return {
    provider: "github",
    status: "captured",
    queriedAt,
    branch,
    branchProtection: normalizeBranchProtection(branchProtectionResult.body),
    actionsPermissions: actionsResult.response.ok ? normalizeActionsPermissions(actionsResult.body) : null,
    environments: environmentsResult.response.ok
      ? (environmentsResult.body?.environments ?? []).map((environment) => environment.name).filter(Boolean)
      : [],
    productionEnvironment: productionEnvironmentResult.response.ok
      ? normalizeProductionEnvironment(productionEnvironmentResult.body)
      : { configured: false, hasRequiredReviewers: false },
  };
}

const parseArgs = (argv) => {
  const args = { out: DEFAULT_OUT, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") args.strict = true;
    if (arg === "--out") args.out = argv[index + 1] ?? args.out;
  }
  return args;
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await buildGithubAdminPostureEvidence();
  writeJson(resolve(process.cwd(), args.out), evidence);

  if (args.strict && evidence.status !== "captured") {
    process.stderr.write(`GitHub admin posture is ${evidence.status}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`GitHub admin posture ${evidence.status}: ${args.out}\n`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("capture-github-admin-posture.mjs")
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
