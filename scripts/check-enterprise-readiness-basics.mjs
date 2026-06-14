import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDisasterRecoveryReadiness } from "./check-dr-readiness.mjs";
import { checkGithubGovernance } from "./check-github-governance.mjs";
import { checkLoadTestContract } from "./check-load-test-contract.mjs";
import { checkMutationValidationContract } from "./check-mutation-validation-contract.mjs";
import { checkOpenApiCoverage } from "./check-openapi-coverage.mjs";
import { checkRepositoryArchitecture } from "./check-repository-architecture.mjs";

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

const readSqlDirectoryText = (root, relativeDir, failures) => {
  const path = join(root, relativeDir);
  if (!existsSync(path)) {
    failures.push(`${relativeDir} is missing`);
    return null;
  }

  const files = readdirSync(path).filter((file) => file.endsWith(".sql")).sort();
  if (files.length === 0) {
    failures.push(`${relativeDir} has no SQL migrations`);
    return null;
  }

  return files.map((file) => readFileSync(join(path, file), "utf8")).join("\n");
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
  if (pkg.scripts?.["runtime:doctor"] !== "node scripts/project-runtime.mjs --doctor") {
    failures.push("package.json scripts.runtime:doctor must run the project runtime launcher");
  }
  if (pkg.scripts?.["check:runtime:local"] !== "node scripts/project-runtime.mjs -- npm run check:runtime") {
    failures.push("package.json scripts.check:runtime:local must run check:runtime through the project runtime launcher");
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

  const runtimeLauncher = requireText(root, "scripts/project-runtime.mjs", failures);
  if (runtimeLauncher) {
    for (const marker of ["MAIPROP_NODE20_HOME", "npm-cli.js", "Project runtime launcher OK"]) {
      if (!runtimeLauncher.includes(marker)) {
        failures.push(`scripts/project-runtime.mjs must mention ${marker}`);
      }
    }
  }

  const prePush = requireText(root, ".husky/pre-push", failures);
  if (prePush) {
    for (const marker of [
      "project-runtime.mjs -- npm run check:runtime",
      "project-runtime.mjs -- npm run check:secrets",
      "project-runtime.mjs -- npm run typecheck",
      "project-runtime.mjs -- npm test",
    ]) {
      if (!prePush.includes(marker)) {
        failures.push(`.husky/pre-push must run ${marker}`);
      }
    }
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

export function checkObservabilityWiring(root = process.cwd()) {
  const failures = [];
  const requiredMarkers = [
    [
      "src/main.tsx",
      [
        "VITE_SENTRY_DSN",
        "Sentry.init",
        "__sentryClient",
        "installWebVitalsMonitoring",
      ],
    ],
    [
      "src/lib/webVitals.ts",
      [
        "VITE_WEB_VITALS_SAMPLE_RATE",
        "__maipropWebVitalsInstalled",
        "addBreadcrumb",
        "captureMessage",
        "web-vitals-route",
      ],
    ],
    [
      "supabase/functions/_shared/logger.ts",
      [
        "SENTRY_DSN",
        "parseSentryDsn",
        "forwardToSentry",
        "X-Sentry-Auth",
      ],
    ],
    [
      "supabase/functions/healthz/index.ts",
      [
        "SENTRY_DSN",
        "checks.sentry",
      ],
    ],
  ];

  for (const [relativePath, markers] of requiredMarkers) {
    const text = requireText(root, relativePath, failures);
    if (!text) continue;
    for (const marker of includesAll(text, markers)) {
      failures.push(`${relativePath} must mention ${marker}`);
    }
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

export function checkEnterpriseTenantContract(root = process.cwd()) {
  const failures = [];
  const migrations = readSqlDirectoryText(root, "supabase/migrations", failures);
  const tenancyDoc = requireText(root, "docs/governance/ENTERPRISE_TENANCY_AND_SSO.md", failures);
  const procurementDoc = requireText(root, "docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md", failures);

  if (migrations) {
    for (const marker of includesAll(migrations, [
      "CREATE TABLE IF NOT EXISTS public.organizations",
      "CREATE TABLE IF NOT EXISTS public.organization_memberships",
      "CREATE TABLE IF NOT EXISTS public.organization_domains",
      "CREATE TABLE IF NOT EXISTS public.organization_sso_providers",
      "CREATE TABLE IF NOT EXISTS public.procurement_evidence",
      "ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.organization_sso_providers ENABLE ROW LEVEL SECURITY",
      "ALTER TABLE public.procurement_evidence ENABLE ROW LEVEL SECURITY",
      "REVOKE ALL ON TABLE public.organizations FROM anon",
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.organizations TO authenticated",
      "supabase_provider_id",
      "CREATE OR REPLACE FUNCTION private.is_org_member",
      "CREATE OR REPLACE FUNCTION private.has_org_role",
      "CREATE POLICY organizations_select_members",
      "CREATE POLICY organization_memberships_manage",
      "CREATE POLICY organization_sso_providers_manage",
      "CREATE POLICY procurement_evidence_manage",
    ])) {
      failures.push(`supabase/migrations must include enterprise tenant contract marker: ${marker}`);
    }
  }

  if (tenancyDoc) {
    for (const marker of includesAll(tenancyDoc, [
      "organization_memberships",
      "organization_sso_providers",
      "Supabase SSO/SAML",
      "supabase sso",
      "signInWithSSO",
      "SAML metadata is not stored in application tables",
      "database membership remains the authorization source of truth",
    ])) {
      failures.push(`docs/governance/ENTERPRISE_TENANCY_AND_SSO.md must mention ${marker}`);
    }
  }

  if (procurementDoc) {
    for (const marker of includesAll(procurementDoc, [
      "procurement_evidence",
      "Security questionnaire",
      "Data Processing Agreement",
      "Subprocessor list",
      "Backup restore drill",
      "SAML/SSO configuration",
      "SOC 2 / ISO evidence is external and not claimed by this repository",
    ])) {
      failures.push(`docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md must mention ${marker}`);
    }
  }

  return result(failures);
}

export function checkEnterpriseReadinessBasics(root = process.cwd()) {
  const checks = [
    checkRuntimeAlignment(root),
    checkPublicFunctionInventory(root),
    checkObservabilityContract(root),
    checkObservabilityWiring(root),
    checkGovernanceDocs(root),
    checkGithubGovernance(root),
    checkDisasterRecoveryReadiness(root),
    checkOpenApiCoverage(root),
    checkLoadTestContract(root),
    checkMutationValidationContract(root),
    checkEnterpriseTenantContract(root),
    checkRepositoryArchitecture(root),
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
