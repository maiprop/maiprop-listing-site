import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

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

const propertyNameText = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
};

const isFunctionsInvokeCall = (expression) => {
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "invoke") return false;
  const owner = expression.expression;
  return ts.isPropertyAccessExpression(owner) && owner.name.text === "functions";
};

const hasBodyProperty = (node) => {
  if (!node || !ts.isObjectLiteralExpression(node)) return false;
  return node.properties.some((property) => {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      return propertyNameText(property.name) === "body";
    }
    return false;
  });
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

const scanFunctionBodyInvocations = (root) => {
  const invocations = [];
  for (const { relativePath } of walkFiles(
    root,
    "src",
    (path) => /\.(?:ts|tsx)$/.test(path) && !/\/test\/|\.test\.|\.spec\./.test(path),
  )) {
    const text = readText(root, relativePath) ?? "";
    const sourceFile = ts.createSourceFile(
      relativePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (ts.isCallExpression(node) && isFunctionsInvokeCall(node.expression) && hasBodyProperty(node.arguments[1])) {
        const functionArg = node.arguments[0];
        if (functionArg && ts.isStringLiteralLike(functionArg)) {
          invocations.push({ file: relativePath, function: functionArg.text, dynamic: false });
        } else if (functionArg && ts.isIdentifier(functionArg)) {
          invocations.push({ file: relativePath, symbol: functionArg.text, dynamic: true });
        } else {
          invocations.push({ file: relativePath, symbol: "<computed>", dynamic: true });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return invocations;
};

export function checkFunctionInvocationBoundaryEvidence(root = process.cwd()) {
  const failures = [];
  const inventory = readJson(root, "docs/governance/function-invocation-boundaries.json", failures);
  if (!inventory) return result(failures);

  const validBoundaries = new Set([
    "client-schema-first",
    "edge-schema-validated",
    "admin-diagnostic-only",
    "external-provider-contract",
  ]);
  const validOwners = new Set(["app-web", "shared-ui", "domain", "data-access"]);
  const reviewedFunctions = new Map();
  const reviewedDynamic = new Map();

  for (const entry of inventory.reviewedFunctionBodies ?? []) {
    if (typeof entry.function !== "string" || entry.function.trim().length === 0) {
      failures.push("function-invocation-boundaries reviewedFunctionBodies entries must include function");
      continue;
    }
    reviewedFunctions.set(entry.function, entry);
  }

  for (const entry of inventory.reviewedDynamicInvocations ?? []) {
    if (typeof entry.file !== "string" || typeof entry.symbol !== "string") {
      failures.push("function-invocation-boundaries reviewedDynamicInvocations entries must include file and symbol");
      continue;
    }
    reviewedDynamic.set(`${entry.file}::${entry.symbol}`, entry);
  }

  const invocations = scanFunctionBodyInvocations(root);
  const usedFunctions = new Set(invocations.filter((entry) => !entry.dynamic).map((entry) => entry.function));
  const usedDynamic = new Set(
    invocations.filter((entry) => entry.dynamic).map((entry) => `${entry.file}::${entry.symbol}`),
  );

  for (const invocation of invocations) {
    const entry = invocation.dynamic
      ? reviewedDynamic.get(`${invocation.file}::${invocation.symbol}`)
      : reviewedFunctions.get(invocation.function);
    const name = invocation.dynamic ? `${invocation.file} ${invocation.symbol}` : invocation.function;
    if (!entry) {
      failures.push(`${invocation.file} invokes ${name} with a request body without function-boundary evidence`);
    }
  }

  const validateEntry = (entry, label) => {
    if (!validBoundaries.has(entry.boundary)) {
      failures.push(`${label} function-boundary evidence has unsupported boundary ${entry.boundary}`);
    }
    if (!validOwners.has(entry.owner)) {
      failures.push(`${label} function-boundary evidence owner must map to a repository boundary`);
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 30) {
      failures.push(`${label} function-boundary evidence needs a concrete rationale`);
    }
    if (typeof entry.reviewBy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy)) {
      failures.push(`${label} function-boundary evidence must include reviewBy as YYYY-MM-DD`);
    }
  };

  for (const [functionName, entry] of reviewedFunctions) {
    validateEntry(entry, functionName);
    if (!usedFunctions.has(functionName)) {
      failures.push(`function-boundary evidence points to unused function body invocation: ${functionName}`);
    }
  }

  for (const [key, entry] of reviewedDynamic) {
    validateEntry(entry, key);
    if (!usedDynamic.has(key)) {
      failures.push(`function-boundary evidence points to unused dynamic invocation: ${key}`);
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
    "ECAS_LOAD_PROFILE=enterprise_soak",
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
    checkFunctionInvocationBoundaryEvidence(root),
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
