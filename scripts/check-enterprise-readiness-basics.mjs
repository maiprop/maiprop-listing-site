import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_NODE = "20.19.5";
const REQUIRED_NPM = "10.8.2";

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

const requireText = (root, relativePath, failures) => {
  const text = readText(root, relativePath);
  if (text === null) failures.push(`${relativePath} is missing`);
  return text;
};

const includesAll = (text, required) => {
  return required.filter((needle) => !text.includes(needle));
};

export function checkRuntimeAlignment(root = process.cwd()) {
  const failures = [];
  const pkg = readJson(root, "package.json");
  if (!pkg) return result(["package.json is missing or invalid"]);

  if (pkg.packageManager !== `npm@${REQUIRED_NPM}`) {
    failures.push(`package.json packageManager must be npm@${REQUIRED_NPM}`);
  }
  if (pkg.volta?.node !== REQUIRED_NODE) {
    failures.push(`package.json volta.node must be ${REQUIRED_NODE}`);
  }
  if (pkg.volta?.npm !== REQUIRED_NPM) {
    failures.push(`package.json volta.npm must be ${REQUIRED_NPM}`);
  }
  if (pkg.engines?.node !== ">=20.19.0 <21") {
    failures.push("package.json engines.node must be >=20.19.0 <21");
  }
  if (pkg.engines?.npm !== ">=10.8.0 <11") {
    failures.push("package.json engines.npm must be >=10.8.0 <11");
  }

  for (const file of [".node-version", ".nvmrc"]) {
    const version = requireText(root, file, failures)?.trim();
    if (version && version !== REQUIRED_NODE) {
      failures.push(`${file} must be ${REQUIRED_NODE}`);
    }
  }

  const npmrc = requireText(root, ".npmrc", failures);
  if (npmrc && !npmrc.includes("engine-strict=true")) {
    failures.push(".npmrc must enable engine-strict=true");
  }

  return result(failures);
}

export function publicFunctionsFromConfig(configText) {
  const publicFunctions = [];
  let current = null;

  for (const rawLine of configText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = line.match(/^\[functions\.([^\]]+)\]$/);
    if (section) {
      current = section[1].replace(/^"|"$/g, "");
      continue;
    }
    if (current && /^verify_jwt\s*=\s*false\b/.test(line)) {
      publicFunctions.push(current);
    }
  }

  return publicFunctions.sort();
}

export function checkPublicFunctionInventory(root = process.cwd()) {
  const failures = [];
  const config = requireText(root, "supabase/config.toml", failures);
  const inventory = readJson(root, "docs/public-edge-function-inventory.json");
  if (!inventory) failures.push("docs/public-edge-function-inventory.json is missing or invalid");
  if (!config || !inventory) return result(failures);

  const expected = publicFunctionsFromConfig(config);
  const actualEntries = Array.isArray(inventory.entries)
    ? inventory.entries.map((entry) => entry.name).sort()
    : [];

  if (inventory.public_function_count !== expected.length) {
    failures.push(
      `public-edge-function-inventory count is ${inventory.public_function_count}; expected ${expected.length}`,
    );
  }

  const missing = expected.filter((name) => !actualEntries.includes(name));
  const extra = actualEntries.filter((name) => !expected.includes(name));
  if (missing.length) failures.push(`public-edge-function-inventory missing: ${missing.join(", ")}`);
  if (extra.length) failures.push(`public-edge-function-inventory has extra entries: ${extra.join(", ")}`);

  return result(failures);
}

export function checkObservabilityContract(root = process.cwd()) {
  const failures = [];
  const text = requireText(root, "docs/OBSERVABILITY.md", failures);
  if (!text) return result(failures);

  const missing = includesAll(text, [
    "VITE_SENTRY_DSN",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
    "unknown",
    "Alerting",
  ]);
  for (const marker of missing) {
    failures.push(`docs/OBSERVABILITY.md must mention ${marker}`);
  }

  return result(failures);
}

export function checkGovernanceDocs(root = process.cwd()) {
  const failures = [];
  const prTemplate = requireText(root, ".github/PULL_REQUEST_TEMPLATE.md", failures);
  const security = requireText(root, "SECURITY.md", failures);

  if (prTemplate) {
    for (const marker of includesAll(prTemplate, [
      "## Verification",
      "npm run check:runtime",
      "npm run check:public-functions",
      "## Security / RLS Impact",
      "## Deployment / Rollback",
    ])) {
      failures.push(`.github/PULL_REQUEST_TEMPLATE.md must mention ${marker}`);
    }
  }

  if (security) {
    for (const marker of includesAll(security, [
      "## Supported Versions",
      "## Reporting a Vulnerability",
      "security@maiprop.co",
      "Do not publicly disclose",
      "response target",
    ])) {
      failures.push(`SECURITY.md must mention ${marker}`);
    }
  }

  return result(failures);
}

export function checkEnterpriseReadinessBasics(root = process.cwd()) {
  const checks = [
    checkRuntimeAlignment(root),
    checkPublicFunctionInventory(root),
    checkObservabilityContract(root),
    checkGovernanceDocs(root),
  ];
  return result(checks.flatMap((check) => check.failures));
}

const main = () => {
  const check = checkEnterpriseReadinessBasics(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Enterprise readiness basics OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-enterprise-readiness-basics.mjs")
) {
  main();
}
