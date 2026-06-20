import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const ignoredDirs = new Set(["node_modules", "dist", "coverage", ".git", ".next", "public"]);

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const readJson = (root, relativePath, failures) => {
  const text = readText(root, relativePath);
  if (text === null) {
    failures.push(`${relativePath} is missing`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const includesAll = (text, required) => required.filter((needle) => !text.includes(needle));

const walkFiles = (root, relativeDir, matcher, files = []) => {
  const absoluteDir = join(root, relativeDir);
  if (!existsSync(absoluteDir)) return files;
  for (const entry of readdirSync(absoluteDir)) {
    if (ignoredDirs.has(entry)) continue;
    const relativePath = `${relativeDir}/${entry}`.replace(/\\/g, "/");
    const absolutePath = join(root, relativePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      walkFiles(root, relativePath, matcher, files);
    } else if (matcher(relativePath)) {
      files.push({ relativePath, absolutePath, stat });
    }
  }
  return files;
};

export function checkModuleSizeBudget(root = process.cwd()) {
  const failures = [];
  const budget = readJson(root, "docs/governance/module-size-budget.json", failures);
  if (!budget) return result(failures);

  const defaultMaxBytes = Number(budget.defaultMaxBytes);
  if (!Number.isFinite(defaultMaxBytes) || defaultMaxBytes < 20_000) {
    failures.push("module-size-budget defaultMaxBytes must be at least 20000");
    return result(failures);
  }

  const generated = new Set((budget.generatedExemptions ?? []).map((entry) => entry.path));
  const legacy = new Map((budget.legacyExceptions ?? []).map((entry) => [entry.path, entry]));
  const owners = new Set(["app-web", "shared-ui", "domain", "data-access"]);

  for (const { relativePath, stat } of walkFiles(
    root,
    "src",
    (path) => /\.(?:ts|tsx)$/.test(path) && !/\/test\/|\.test\.|\.spec\./.test(path),
  )) {
    if (generated.has(relativePath)) continue;
    if (stat.size <= defaultMaxBytes) continue;

    const exception = legacy.get(relativePath);
    if (!exception) {
      failures.push(`${relativePath} is ${stat.size} bytes and needs a module-size-budget exception or refactor`);
      continue;
    }
    if (Number(exception.allowedMaxBytes) < stat.size) {
      failures.push(`${relativePath} is ${stat.size} bytes and exceeds allowedMaxBytes ${exception.allowedMaxBytes}`);
    }
    if (!owners.has(exception.owner)) {
      failures.push(`${relativePath} module-size-budget owner must map to a repository boundary`);
    }
    for (const key of ["targetPackage", "refactorStrategy", "reviewBy"]) {
      if (typeof exception[key] !== "string" || exception[key].trim().length === 0) {
        failures.push(`${relativePath} module-size-budget exception must include ${key}`);
      }
    }
  }

  for (const entry of budget.legacyExceptions ?? []) {
    if (!existsSync(join(root, entry.path))) {
      failures.push(`module-size-budget legacy exception points to missing file: ${entry.path}`);
    }
  }

  return result(failures);
}

const mutationPattern = /\.from\(\s*["'`]([^"'`]+)["'`]\s*\)[\s\S]{0,500}?\.(insert|update|upsert|delete)\s*\(/g;

const scanBrowserMutations = (root) => {
  const mutations = [];
  for (const { relativePath } of walkFiles(
    root,
    "src",
    (path) => /\.(?:ts|tsx)$/.test(path) && !/\/test\/|\.test\.|\.spec\./.test(path),
  )) {
    const text = readText(root, relativePath) ?? "";
    for (const match of text.matchAll(mutationPattern)) {
      mutations.push({
        file: relativePath,
        table: match[1],
        operation: match[2],
      });
    }
  }
  return mutations;
};

export function checkSensitiveMutationBoundaries(root = process.cwd()) {
  const failures = [];
  const inventory = readJson(root, "docs/governance/sensitive-mutation-boundaries.json", failures);
  if (!inventory) return result(failures);

  const blocked = new Set(inventory.blockedDirectTables ?? []);
  const allowedEntries = inventory.allowedBrowserMutations ?? [];
  const allowed = new Set();
  for (const entry of allowedEntries) {
    if (entry.boundary !== "rls-scoped-browser") {
      failures.push(`${entry.file} ${entry.table} boundary must be rls-scoped-browser for direct browser mutations`);
    }
    if (typeof entry.rationale !== "string" || entry.rationale.length < 20) {
      failures.push(`${entry.file} ${entry.table} needs a concrete mutation-boundary rationale`);
    }
    for (const operation of entry.operations ?? []) {
      allowed.add(`${entry.file}::${entry.table}::${operation}`);
    }
  }

  for (const mutation of scanBrowserMutations(root)) {
    if (blocked.has(mutation.table)) {
      failures.push(`${mutation.file} directly mutates blocked table ${mutation.table}`);
    }
    const key = `${mutation.file}::${mutation.table}::${mutation.operation}`;
    if (!allowed.has(key)) {
      failures.push(`${mutation.file} ${mutation.operation}s ${mutation.table} without sensitive-mutation-boundary inventory`);
    }
  }

  return result(failures);
}

export function checkLiveGithubAdminEvidence(root = process.cwd()) {
  const failures = [];
  const text = readText(root, "docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md");
  if (text === null) return result(["docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md is missing"]);

  for (const marker of includesAll(text, [
    "allowed_actions: selected",
    "sha_pinning_required: true",
    "patterns_allowed",
    "Branch protection API result: blocked",
    "Upgrade to GitHub Pro or make this repository public",
    "Environment approvals: pending repository admin",
    "Push protection: pending repository admin",
  ])) {
    failures.push(`LIVE_GITHUB_ADMIN_SETTINGS.md must mention ${marker}`);
  }

  return result(failures);
}

export function checkLoadProofEvidence(root = process.cwd()) {
  const failures = [];
  const text = readText(root, "docs/performance/LOAD_TEST_PROOF.md");
  if (text === null) return result(["docs/performance/LOAD_TEST_PROOF.md is missing"]);

  for (const marker of includesAll(text, [
    "ECAS_LOAD_PROFILE=baseline_100",
    "ECAS_LOAD_PROFILE=growth_10x",
    "LOAD_TEST_APPROVED_PRODUCTION=true",
    "load-test-summary.json",
    "approved time window",
  ])) {
    failures.push(`LOAD_TEST_PROOF.md must mention ${marker}`);
  }

  return result(failures);
}

export function checkEcasHardeningContracts(root = process.cwd()) {
  const checks = [
    checkModuleSizeBudget(root),
    checkSensitiveMutationBoundaries(root),
    checkLiveGithubAdminEvidence(root),
    checkLoadProofEvidence(root),
  ];
  return result(checks.flatMap((check) => check.failures));
}

const main = () => {
  const check = checkEcasHardeningContracts(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("ECAS hardening contracts OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-ecas-hardening-contracts.mjs")
) {
  main();
}
