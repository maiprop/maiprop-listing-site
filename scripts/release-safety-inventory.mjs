import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { checkSlsaReadiness } from "./check-slsa-readiness.mjs";
import {
  cloudflareHttpMutationViolation as cloudflarePolicyViolation,
  findCloudflareHttpMutations as findPolicyCloudflareHttpMutations,
} from "./cloudflare-http-mutation-policy.mjs";
export {
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
  isAuthorizedCloudflareHttpMutationWorkflow,
} from "./cloudflare-http-mutation-policy.mjs";

const root = process.cwd();
const checkMode = process.argv.includes("--check");
const liveFunctionsMode =
  process.argv.includes("--live-functions") ||
  process.env.RELEASE_SAFETY_LIVE_FUNCTIONS === "true";
const requireLiveSourceEvidence = process.argv.includes(
  "--require-live-source-evidence",
);
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const supabaseWorkdirArgIndex = process.argv.indexOf("--supabase-workdir");
const supabaseWorkdir = resolve(
  root,
  supabaseWorkdirArgIndex >= 0
    ? process.argv[supabaseWorkdirArgIndex + 1] ?? ""
    : ".",
);

const functionDir = join(supabaseWorkdir, "supabase", "functions");
const configPath = join(supabaseWorkdir, "supabase", "config.toml");
const workflowDir = join(root, ".github", "workflows");
const envDocs = [
  ".env.example",
  ".env.staging.example",
  "docs/ENV_SETUP.md",
  "docs/PRODUCTION_RELEASE_RUNBOOK.md",
  "docs/SECRETS_ROTATION.md",
  "docs/OS_INTEGRATION.md",
];

const ignoredFunctionDirs = new Set(["_shared", "node_modules"]);
const productionReleaseWorkflow =
  ".github/workflows/deploy-production-release.yml";
const legacyProductionReconstructionSha =
  "db53d1b9adae41edae93fbeb3e612b42dd8fec0b";
const documentedEnvAllowlist = new Set([
  "CI",
  "DEV",
  "GITHUB_ACTOR",
  "GITHUB_ENV",
  "GITHUB_EVENT_NAME",
  "GITHUB_REPOSITORY",
  "GITHUB_RUN_ATTEMPT",
  "GITHUB_RUN_ID",
  "GITHUB_STEP_SUMMARY",
  "GITHUB_TRIGGERING_ACTOR",
  "GITHUB_WORKFLOW_REF",
  "GITHUB_WORKFLOW_SHA",
  "MODE",
  "NODE_ENV",
  "PROD",
  "PRODUCTION_APP_URL",
  "PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
  "PRODUCTION_SUPABASE_URL",
  "SSR",
]);

const productionAuthorizationInputNames = [
  "authorization_mode",
  "authorization_sha256",
  "authorization_artifact_id",
  "authorization_artifact_digest",
  "authorization_run_id",
  "authorization_run_attempt",
  "consumption_artifact_id",
  "consumption_artifact_digest",
  "consumption_binding_artifact_id",
  "consumption_payload_sha256",
];

export function productionAuthorizationInputContractViolations(
  inputs,
  { directRecoveryCompatible = false } = {},
) {
  const violations = [];
  const authorizationNames = Object.keys(inputs ?? {})
    .filter((name) => /^(?:authorization|consumption)_/.test(name))
    .sort();
  if (
    authorizationNames.join("\n") !==
    [...productionAuthorizationInputNames].sort().join("\n")
  ) {
    violations.push("authorization and consumption input names must be exact");
  }
  for (const name of productionAuthorizationInputNames) {
    const input = inputs?.[name];
    if (!input || input.type !== "string") {
      violations.push(`${name} must be a string input`);
      continue;
    }
    if (directRecoveryCompatible) {
      const expectedDefault = name === "authorization_mode" ? "standard" : "";
      if (input.required !== false || input.default !== expectedDefault) {
        violations.push(
          `${name} must preserve its unchanged direct-recovery default`,
        );
      }
    } else if (
      input.required !== true ||
      Object.hasOwn(input, "default")
    ) {
      violations.push(`${name} must be required without a default`);
    }
  }
  return violations;
}

export function cataloguePerformanceHotfixWorkflowViolations({
  text,
  parsed,
  supportText = "",
  probeScriptText = "",
  markerScriptText = "",
}) {
  const violations = [];
  const inputs = parsed?.on?.workflow_dispatch?.inputs ?? {};
  const expectedInputs = [
    "confirm",
    "incident_id",
    "reason",
    "release_sha",
    "single_admin_break_glass",
  ];
  if (
    Object.keys(inputs).sort().join("\n") !== expectedInputs.join("\n") ||
    inputs.release_sha?.required !== true ||
    inputs.release_sha?.type !== "string" ||
    inputs.confirm?.required !== true ||
    inputs.confirm?.type !== "string" ||
    inputs.single_admin_break_glass?.required !== true ||
    inputs.single_admin_break_glass?.default !== false ||
    inputs.single_admin_break_glass?.type !== "boolean"
  ) {
    violations.push("catalogue hotfix dispatch inputs must stay exact");
  }

  const jobs = parsed?.jobs ?? {};
  const stagingNeeds = Array.isArray(jobs.staging?.needs)
    ? jobs.staging.needs
    : [jobs.staging?.needs].filter(Boolean);
  const productionNeeds = Array.isArray(jobs.production?.needs)
    ? jobs.production.needs
    : [jobs.production?.needs].filter(Boolean);
  if (
    !jobs.validate ||
    stagingNeeds.join("\n") !== "validate" ||
    productionNeeds.join("\n") !== ["validate", "staging"].join("\n") ||
    jobs.staging?.environment !== "staging" ||
    jobs.production?.environment !== "production"
  ) {
    violations.push("catalogue hotfix must validate, then stage, then promote to production");
  }

  const stagingEnv = jobs.staging?.env ?? {};
  const productionEnv = jobs.production?.env ?? {};
  const stagingSteps = jobs.staging?.steps ?? [];
  const resolverIndex = stagingSteps.findIndex(
    (step) => step?.name === "Resolve current staging public API key",
  );
  const identityIndex = stagingSteps.findIndex(
    (step) => step?.name === "Revalidate staging identity immediately before mutation",
  );
  const productionSteps = jobs.production?.steps ?? [];
  const productionIdentityIndex = productionSteps.findIndex(
    (step) => step?.name === "Revalidate production control and authorization immediately before mutation",
  );
  const stagingMarker = stagingSteps.find(
    (step) => step?.name === "Capture manifest-bound frontend marker for staging evidence",
  );
  const productionMarker = productionSteps.find(
    (step) => step?.name === "Capture fixed live frontend marker",
  );
  const resolver = stagingSteps[resolverIndex];
  const tokenSteps = Object.values(jobs).flatMap((job) =>
    (job?.steps ?? []).filter((step) => Object.hasOwn(step?.env ?? {}, "SUPABASE_ACCESS_TOKEN"))
  );
  const resolverMarkers = [
    "response_file=\"$(mktemp \"$RUNNER_TEMP/",
    "candidates_file=\"$(mktemp \"$RUNNER_TEMP/",
    "chmod 600 \"$response_file\" \"$candidates_file\"",
    "trap 'rm -f -- \"$response_file\" \"$candidates_file\"' EXIT",
    "--request GET",
    "--connect-timeout 10",
    "--max-time 30",
    "--retry 3",
    "--retry-all-errors",
    "--retry-max-time 90",
    "-o \"$response_file\"",
    "Authorization: Bearer $SUPABASE_ACCESS_TOKEN",
    "https://api.supabase.com/v1/projects/$TARGET_PROJECT_REF/api-keys?reveal=true",
    "write-staging-public-key-candidates \"$response_file\" \"$candidates_file\"",
    "bash scripts/catalogue-hotfix-staging-key-probe.sh \"$candidates_file\"",
  ];
  const probeScriptMarkers = [
    "${TARGET_PROJECT_REF:-}\" != xsiehskfgeoqyazcgauv",
    "probe_url=\"https://${TARGET_PROJECT_REF}.supabase.co/auth/v1/settings\"",
    "probe_max_attempts=3",
    "while [ \"$attempts\" -lt \"$probe_max_attempts\" ]",
    "000|408|429|5??)",
    "--connect-timeout 10",
    "--max-time 30",
    "-o /dev/null",
    "-w '%{http_code}'",
    "-H \"Accept: application/json\"",
    "-H \"apikey: $candidate\"",
    "[ \"$publishable_status\" = \"401\" ] && [ -n \"$legacy_anon_key\" ]",
    "select-live-staging-public-key-env",
    "\"$publishable_status\" \"$publishable_attempts\"",
    "\"$legacy_anon_status\" \"$legacy_anon_attempts\"",
  ];
  const resolverText = String(resolver?.run ?? "");
  const identityTexts = [
    String(stagingSteps[identityIndex]?.run ?? ""),
    String(productionSteps[productionIdentityIndex]?.run ?? ""),
  ];
  const readinessMarkers = [
    "readiness_status=\"000\"",
    "--connect-timeout 10",
    "--max-time 30",
    "-o /dev/null",
    "-w '%{http_code}'",
    "${TARGET_API_URL%/}/auth/v1/settings",
    "Accept: application/json",
    "apikey: $TARGET_ANON_KEY",
    "validate-api-readiness \"$readiness_status\"",
  ];
  const support = String(supportText);
  const probeScript = String(probeScriptText);
  const markerScript = String(markerScriptText);
  const staticValidatorStart = support.indexOf("export function buildCatalogueHotfixStaticMarkerEvidence");
  const staticValidatorEnd = support.indexOf("\nfunction validateKey", staticValidatorStart);
  const staticValidator = staticValidatorStart >= 0 && staticValidatorEnd > staticValidatorStart
    ? support.slice(staticValidatorStart, staticValidatorEnd)
    : "";
  const maskIndex = support.indexOf("process.stdout.write(`::add-mask::${key}");
  const candidatesWriteIndex = support.indexOf("writeFileSync(candidatesPath");
  const diagnosticStartIndex = support.indexOf("const selectedTier = key === candidates.publishable");
  const diagnosticIndex = support.indexOf("publishable_present:", diagnosticStartIndex);
  const selectionFailureIndex = support.indexOf("if (selectionError) throw selectionError", diagnosticStartIndex);
  const selectedAppendIndex = support.indexOf("appendFileSync(envPath, `TARGET_ANON_KEY=${key}");
  const diagnosticMarkers = [
    "schema_version: 1",
    "publishable_present:",
    "legacy_anon_present:",
    "publishable_status:",
    "publishable_attempts:",
    "legacy_anon_status:",
    "legacy_anon_attempts:",
    "selected_tier:",
  ];
  if (
    Object.hasOwn(stagingEnv, "TARGET_ANON_KEY") ||
    Object.hasOwn(stagingEnv, "SUPABASE_ACCESS_TOKEN") ||
    productionEnv.TARGET_ANON_KEY !== "${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}" ||
    Object.hasOwn(productionEnv, "SUPABASE_ACCESS_TOKEN") ||
    String(text ?? "").includes("STAGING_SUPABASE_PUBLISHABLE_KEY") ||
    resolverIndex < 0 || resolverIndex >= identityIndex ||
    Object.keys(resolver?.env ?? {}).join("\n") !== "SUPABASE_ACCESS_TOKEN" ||
    resolver?.env?.SUPABASE_ACCESS_TOKEN !== "${{ secrets.SUPABASE_ACCESS_TOKEN }}" ||
    tokenSteps.length !== 1 || tokenSteps[0] !== resolver ||
    resolverMarkers.some((marker) => !resolverText.includes(marker)) ||
    resolverText.includes("TARGET_API_URL") ||
    /-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/.test(resolverText) ||
    probeScriptMarkers.some((marker) => !probeScript.includes(marker)) ||
    /TARGET_API_URL|\/rest\/v1\/|openapi|Authorization:|-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/i.test(probeScript) ||
    productionIdentityIndex < 0 ||
    identityTexts.some((identityText) =>
      readinessMarkers.some((marker) => !identityText.includes(marker)) ||
      /\/rest\/v1\/|openapi|-D |--dump-header|response_body/i.test(identityText)
    ) ||
    !support.includes("parseStagingPublicApiKeyCandidates") ||
    !support.includes("selectLiveStagingPublicApiKey") ||
    diagnosticMarkers.some((marker) => !support.includes(marker)) ||
    maskIndex < 0 || candidatesWriteIndex < 0 || selectedAppendIndex < 0 ||
    diagnosticIndex < 0 || selectionFailureIndex < 0 ||
    maskIndex >= candidatesWriteIndex || candidatesWriteIndex >= diagnosticIndex ||
    diagnosticIndex >= selectionFailureIndex || selectionFailureIndex >= selectedAppendIndex
  ) {
    violations.push("catalogue hotfix staging public key resolution is not isolated and fail closed");
  }

  const markerScriptMarkers = [
    "marker_url=\"https://portal.maiprop.co/deploy-version.json\"",
    "body_file=\"$(mktemp \"$RUNNER_TEMP/catalogue-hotfix-static-marker.",
    "chmod 600 \"$body_file\"",
    "trap 'rm -f -- \"$body_file\"' EXIT",
    "--connect-timeout 10",
    "--max-time 30",
    "--retry 2",
    "--retry-max-time 90",
    "--max-redirs 0",
    "-o \"$body_file\"",
    "-w '%{http_code}'",
    "-H \"Accept: application/json\"",
    "-H \"Cache-Control: no-cache\"",
    "write-static-marker-evidence",
  ];
  const markerSteps = [
    [stagingMarker, "evidence/staging-frontend-marker.json"],
    [productionMarker, "evidence/production-frontend-marker.json"],
  ];
  const staticValidatorMarkers = [
    '"sha"',
    '"run_id"',
    '"run_attempt"',
    '"created_at"',
    "typeof marker.sha !== \"string\"",
    "typeof marker.run_id !== \"string\"",
    "typeof marker.run_attempt !== \"string\"",
    "Date.parse(marker.created_at)",
    "toISOString()",
    "marker.sha !== expectedSha",
    "return { release_sha: expectedSha }",
  ];
  if (
    markerSteps.some(([step, evidencePath]) => {
      const run = String(step?.run ?? "");
      return !run.includes(`bash scripts/catalogue-hotfix-static-marker.sh \"$fixed_sha\" ${evidencePath}`) ||
        /release:verify-live-marker|\/api\/release/.test(run);
    }) ||
    markerScriptMarkers.some((marker) => !markerScript.includes(marker)) ||
    /TARGET_API_URL|\/api\/release|--location|-L\b|-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/.test(markerScript) ||
    staticValidatorMarkers.some((marker) => !staticValidator.includes(marker)) ||
    /schema_version|source_tree|source_run_id|source_run_attempt|payload_sha256/.test(staticValidator) ||
    !support.includes("write-static-marker-evidence")
  ) {
    violations.push("catalogue hotfix static deploy marker proof is not private and fail closed");
  }

  const required = [
    "catalogue-performance-hotfix-contract.mjs verify --json",
    "RELEASE_AUTHORIZATION_ACTION: production-deploy",
    "RELEASE_STANDARD_CONFIRMATION: DEPLOY_CATALOGUE_PERFORMANCE_HOTFIX",
    "production-break-glass-validation.mjs validate-workflow",
    "PRODUCTION_RELEASE_DEPLOYERS",
    "RUNNER_TEMP",
    "remote-numeric-history",
    "placeholder",
    "db push --include-all --dry-run --db-url \"$TARGET_DB_URL\"",
    "db push --include-all --yes --db-url \"$TARGET_DB_URL\"",
    "catalogue-hotfix-workflow-helpers.mjs validate-dry-run",
    "validate-target",
    "cd \"$work\"",
    "public_catalogue_snapshot_test.sql",
    "--expected-plan 90",
    "status=eq.active",
    "is_off_market=eq.false",
    "publish-public-catalogue",
    "seq 1 30",
    "catalogue-hotfix-behavioral-probe.mjs recorded",
    "catalogue-hotfix-behavioral-probe.mjs postapply evidence/database-contract.json",
    "catalogue-hotfix-workflow-helpers.mjs cron-proof",
    "catalogue-hotfix-workflow-helpers.mjs inspect-public-body",
    "body_shape_valid",
    "catalogue-hotfix-static-marker.sh",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  ];
  for (const marker of required) {
    if (!String(text ?? "").includes(marker)) {
      violations.push(`catalogue hotfix is missing ${marker}`);
    }
  }
  for (const marker of [
    "location_search_text",
    "project:project_detail",
    "listing_images:listing_images_detail",
    "SET LOCAL ROLE anon",
    "minute_boundaries: 2",
    "new_run_minutes",
    "get_public_catalogue_auctions",
    "get_public_catalogue_homepage",
    "homepage_retain_until_contract",
    "idx_public_catalogue_versions_auction_listing_publication",
    "private_catalogue_rls_enabled",
    "private_catalogue_rls_forced",
    "private_catalogue_no_direct_privileges",
  ]) {
    if (!String(supportText).includes(marker)) {
      violations.push(`catalogue hotfix support is missing ${marker}`);
    }
  }

  if (
    /stripe|functions\s+deploy|edge\s+deploy|pages\s+deploy|cloudflare|migration\s+repair/i.test(text) ||
    /supabase\s+db\s+push\s*(?:\n|$)/i.test(text) ||
    /supabase\s+db\s+push\s+--workdir\s+supabase/i.test(text) ||
    /echo[^\n]*(?:DB_URL|RELEASE_REASON|reason)/i.test(text)
  ) {
    violations.push("catalogue hotfix contains a forbidden provider, migration, or secret surface");
  }
  return violations;
}

function read(path) {
  return readFileSync(path, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelativePath(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function normalizedSupabaseSourcePath(path) {
  return relative(supabaseWorkdir, path).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git"
      )
        continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function sourceGroup(files) {
  const records = [...new Set(files)]
    .filter((file) => existsSync(file))
    .sort((a, b) =>
      normalizedSupabaseSourcePath(a).localeCompare(
        normalizedSupabaseSourcePath(b),
      ),
    )
    .map((file) => ({
      path: normalizedSupabaseSourcePath(file),
      sha256: sha256(readFileSync(file)),
    }));
  return {
    source_sha256: sha256(JSON.stringify(records)),
    files: records,
  };
}

function buildEdgeSourceManifest(configured, sourceFunctions) {
  const runtimeFiles = [
    ...walk(join(functionDir, "_shared")),
    join(functionDir, "deno.json"),
    join(functionDir, "deno.lock"),
  ];
  const shared = sourceGroup(runtimeFiles);
  const configSha256 = sha256(read(configPath));
  const functions = sourceFunctions.map((name) => {
    const local = sourceGroup(walk(join(functionDir, name)));
    const verifyJwt = configured.get(name)?.verify_jwt ?? null;
    return {
      name,
      verify_jwt: verifyJwt,
      source_sha256: local.source_sha256,
      effective_source_sha256: sha256(
        JSON.stringify({
          function_source_sha256: local.source_sha256,
          shared_source_sha256: shared.source_sha256,
          config_sha256: configSha256,
          verify_jwt: verifyJwt,
        }),
      ),
      files: local.files,
    };
  });
  const manifest = {
    schema_version: 1,
    algorithm: "sha256",
    release_sha: process.env.RELEASE_SAFETY_RELEASE_SHA || "",
    config_sha256: configSha256,
    shared,
    functions,
  };
  return {
    ...manifest,
    manifest_sha256: sha256(JSON.stringify(manifest)),
  };
}

function parseFunctionConfig(toml) {
  const functions = new Map();
  let current = null;
  for (const line of toml.split(/\r?\n/)) {
    const section = line.match(/^\s*\[functions\.([A-Za-z0-9_-]+)\]\s*$/);
    if (section) {
      current = section[1];
      functions.set(current, { verify_jwt: null });
      continue;
    }
    if (!current) continue;
    const verify = line.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/);
    if (verify) functions.get(current).verify_jwt = verify[1] === "true";
  }
  return functions;
}

function parseProjectRefFromConfig(toml) {
  const match = toml.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);
  return match?.[1] ?? "";
}

function scanEnvNames() {
  const files = walk(root).filter((file) => {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    if (!/^(src|supabase\/functions|functions|scripts|e2e)\//.test(rel))
      return false;
    if (rel.startsWith("coverage/") || rel.startsWith("playwright-report/"))
      return false;
    if (
      /(?:^|\/)(?:__tests__|test|tests)\//.test(rel) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)
    )
      return false;
    if (
      rel.endsWith(".lock") ||
      rel.endsWith(".png") ||
      rel.endsWith(".jpg") ||
      rel.endsWith(".jpeg")
    )
      return false;
    return (
      [
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        ".md",
        ".example",
        ".yml",
        ".yaml",
      ].includes(extname(file)) ||
      rel.endsWith(".env.example") ||
      rel.endsWith(".env.staging.example")
    );
  });

  const used = new Set();
  const envReadPatterns = [
    /Deno\.env\.get\(["'`]([A-Z][A-Z0-9_]+)["'`]\)/g,
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  ];
  for (const file of files) {
    const text = read(file);
    for (const pattern of envReadPatterns) {
      for (const match of text.matchAll(pattern)) used.add(match[1]);
    }
  }

  const documented = new Set();
  for (const doc of envDocs) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const text = read(full);
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g))
      documented.add(match[1]);
  }

  return {
    used: [...used].sort(),
    documented: [...documented].sort(),
    undocumented: [...used].filter((name) => !documented.has(name)).sort(),
    undocumented_enforced: [...used]
      .filter(
        (name) => !documented.has(name) && !documentedEnvAllowlist.has(name),
      )
      .sort(),
  };
}

export function productionDatabaseCredentialScopeViolations({
  release,
  calledWorkflows,
}) {
  const violations = [];
  for (const jobName of [
    "deploy-production-database",
    "deploy-production-edge",
  ]) {
    const secrets = release?.jobs?.[jobName]?.secrets ?? {};
    if (Object.hasOwn(secrets, "SUPABASE_PRODUCTION_DB_URL")) {
      violations.push(
        `${productionReleaseWorkflow} ${jobName} must not forward the production database environment secret`,
      );
    }
  }

  for (const { text, parsed } of calledWorkflows) {
    const callSecrets = parsed?.on?.workflow_call?.secrets ?? {};
    if (Object.hasOwn(callSecrets, "SUPABASE_PRODUCTION_DB_URL")) {
      violations.push(
        "Production database deployment workflows must not declare the environment-scoped database URL in workflow_call.secrets",
      );
    }
    if (!text.includes("secrets.SUPABASE_PRODUCTION_DB_URL")) {
      violations.push(
        "Production database deployment workflows must consume the environment-scoped database URL directly",
      );
    }
  }

  return violations;
}

export function stageReleaseBuildPolicyViolation(stageRelease) {
  if (/build:homepage-initial/.test(stageRelease)) {
    return ".github/workflows/stage-release.yml must deploy the source CI artifact without rebuilding it";
  }

  const buildMatches = [
    ...stageRelease.matchAll(/npm run build(?=\s|$)/gm),
  ];
  if (buildMatches.length === 0) return null;

  const legacyStartMarker =
    'elif [ "$previous_sha" = "$LEGACY_PRODUCTION_SHA" ]; then';
  const legacyEndMarker =
    'else\n              echo "::error::No durable release or uniquely bound unexpired attempt-1 CI artifact exists';
  const normalized = stageRelease.replace(/\r\n/g, "\n");
  const legacyStart = normalized.indexOf(legacyStartMarker);
  const legacyEnd = normalized.indexOf(legacyEndMarker, legacyStart);
  const buildIndex = normalized.indexOf("npm run build", legacyStart);
  const legacyShaDeclarations = [
    ...normalized.matchAll(/LEGACY_PRODUCTION_SHA:\s*([0-9a-f]{40})/g),
  ];
  const requiredMarkers = [
    'if [ "$STAGING_APP_URL" != "https://maiprop-listing-site-staging.pages.dev" ]; then',
    'selected_source_kind="legacy-reconstructed-for-staging-compatibility"',
    'purpose: "staging-n-minus-one-compatibility-only"',
    "original_production_bytes: false",
  ];
  const isPinnedLegacyStagingReconstruction =
    buildMatches.length === 1 &&
    legacyStart >= 0 &&
    legacyEnd > legacyStart &&
    buildIndex > legacyStart &&
    buildIndex < legacyEnd &&
    legacyShaDeclarations.length === 2 &&
    legacyShaDeclarations.every(
      (match) => match[1] === legacyProductionReconstructionSha,
    ) &&
    requiredMarkers.every((marker) => normalized.includes(marker));

  return isPinnedLegacyStagingReconstruction
    ? null
    : ".github/workflows/stage-release.yml must deploy the source CI artifact without rebuilding it";
}

export function scanWorkflows() {
  const files = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(workflowDir, name));

  const violations = [];
  const providerHttpMutations = [];
  const secrets = new Set();
  const workflowText = {};
  const workflowYaml = {};
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    const text = read(file);
    workflowText[rel] = text;
    try {
      workflowYaml[rel] = yaml.load(text);
    } catch (error) {
      violations.push(
        `${rel} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (const match of text.matchAll(/secrets\.([A-Z0-9_]+)/g))
      secrets.add(match[1]);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        /\blatest\b/.test(line) &&
        !/^\s*runs-on:\s+ubuntu-latest\s*$/.test(line)
      ) {
        violations.push(`${rel}:${index + 1} uses 'latest'`);
      }
      if (line.includes("--no-verify-jwt")) {
        violations.push(`${rel}:${index + 1} uses --no-verify-jwt`);
      }
      if (/gitleaks-action/.test(line)) {
        const nextLines = lines.slice(index + 1, index + 8).join("\n");
        if (/continue-on-error:\s*true/.test(nextLines)) {
          violations.push(
            `${rel}:${index + 1} makes secret scanning advisory with continue-on-error`,
          );
        }
      }
      if (/printf\s+['"]SITE_LOCK_PASSWORD\s*=/.test(line)) {
        violations.push(
          `${rel}:${index + 1} writes SITE_LOCK_PASSWORD into plaintext Wrangler vars`,
        );
      }
    });
  }

  const authorizedMutationWorkflows = new Set([
    ".github/workflows/deploy-catalogue-performance-hotfix.yml",
    ".github/workflows/deploy-edge-functions.yml",
    ".github/workflows/deploy-supabase-production-db.yml",
    ".github/workflows/bootstrap-cloudflare-staging-pages.yml",
    ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
    ".github/workflows/reusable-cloudflare-production-deploy.yml",
    ".github/workflows/stage-release.yml",
    ".github/workflows/reusable-supabase-staging.yml",
  ]);
  const forbiddenMutationWiring =
    /\bI_KNOW_THIS_IS_PROD\b|\bSUPABASE_SERVICE_ROLE_KEY\b|\bSUPABASE_STAGING_DB_URL\b|\bstaging-load-dataset\.mjs\b|\bsupabase\s+(?:db\s+push|functions\s+deploy|migration\s+repair)\b|\bpages\s+deploy\b/;
  for (const [workflowPath, text] of Object.entries(workflowText)) {
    const cloudflareMethods = findPolicyCloudflareHttpMutations(text);
    for (const method of cloudflareMethods) {
      providerHttpMutations.push({
        provider: "cloudflare",
        workflow: workflowPath,
        method,
      });
    }
    const cloudflareViolation = cloudflarePolicyViolation({
      workflowPath,
      text,
    });
    if (cloudflareViolation) violations.push(cloudflareViolation);
    if (authorizedMutationWorkflows.has(workflowPath)) continue;
    if (forbiddenMutationWiring.test(text)) {
      violations.push(
        `${workflowPath} contains release mutation wiring outside the exact-SHA staging workflows`,
      );
    }
  }

  const catalogueHotfixWorkflow =
    ".github/workflows/deploy-catalogue-performance-hotfix.yml";
  const catalogueHotfixText = workflowText[catalogueHotfixWorkflow] ?? "";
  if (!catalogueHotfixText) {
    violations.push(`${catalogueHotfixWorkflow} is missing`);
  } else {
    for (const violation of cataloguePerformanceHotfixWorkflowViolations({
      text: catalogueHotfixText,
      parsed: workflowYaml[catalogueHotfixWorkflow],
      supportText: [
        read(join(root, "scripts/catalogue-hotfix-behavioral-probe.mjs")),
        read(join(root, "scripts/catalogue-hotfix-workflow-helpers.mjs")),
      ].join("\n"),
      probeScriptText: read(join(root, "scripts/catalogue-hotfix-staging-key-probe.sh")),
      markerScriptText: read(join(root, "scripts/catalogue-hotfix-static-marker.sh")),
    })) {
      violations.push(`${catalogueHotfixWorkflow} ${violation}`);
    }
  }

  const liveOperationalPath =
    ".github/workflows/live-operational-smoke.yml";
  const liveOperational = workflowText[liveOperationalPath] ?? "";
  const forbiddenLiveOperationalWiring =
    /\bsecrets\.|\b(?:VITE_)?SUPABASE_|\bE2E_|\/auth\/|ai-quota-status|\b(?:POST|PUT|PATCH|DELETE)\b|npm\s+(?:run|exec)|\bnpx\b|playwright|actions\/checkout/i;
  if (!liveOperational) {
    violations.push(`${liveOperationalPath} is missing`);
  } else {
    if (forbiddenLiveOperationalWiring.test(liveOperational)) {
      violations.push(
        `${liveOperationalPath} must remain unauthenticated, read-only, and independent of repository scripts`,
      );
    }

    const methods = [
      ...liveOperational.matchAll(/method:\s*"([A-Z]+)"/g),
    ].map((match) => match[1]);
    if (
      !methods.includes("GET") ||
      !methods.includes("HEAD") ||
      methods.some((method) => !["GET", "HEAD"].includes(method))
    ) {
      violations.push(
        `${liveOperationalPath} may use only explicit GET and HEAD probes`,
      );
    }
  }

  const ci = workflowText[".github/workflows/ci.yml"] ?? "";
  const ciSecretReferences = [...ci.matchAll(/secrets\.([A-Z0-9_]+)/g)]
    .map((match) => match[1]);
  if (
    ciSecretReferences.some(
      (name) => name !== "RELEASE_EVIDENCE_SIGNING_KEY",
    ) ||
    /\bsupabase\s+(?:db\s+push|functions\s+deploy)\b/.test(ci) ||
    /\bpages\s+deploy\b/.test(ci) ||
    /uses:\s*\.\/\.github\/workflows\/reusable-(?:supabase-staging|cloudflare-production-deploy)\.yml/.test(
      ci,
    )
  ) {
    violations.push(
      ".github/workflows/ci.yml may use only RELEASE_EVIDENCE_SIGNING_KEY and must remain mutation-free",
    );
  }

  const release = workflowText[productionReleaseWorkflow] ?? "";
  if (!release) {
    violations.push(`${productionReleaseWorkflow} is missing`);
  } else {
    const requiredReleaseMarkers = [
      ["workflow_dispatch:", "manual workflow_dispatch trigger"],
      [
        "group: maiprop-production-release",
        "global production concurrency lease",
      ],
      ["cancel-in-progress: false", "non-cancelling production lease"],
      [
        "inputs.confirm == 'DEPLOY_PRODUCTION_RELEASE'",
        "typed production confirmation",
      ],
      ["release_sha:", "explicit release SHA input"],
      [
        "github-release-evidence",
        "final exact-SHA CI readiness validation",
      ],
      [
        "PRODUCTION_RELEASE_ENABLED",
        "explicit production release feature gate",
      ],
      [
        "github-release-approval",
        "independent production approval selection",
      ],
      [
        "production-mutation-lease.json",
        "run-scoped production mutation lease",
      ],
      [
        "archive-production-source",
        "durable production source archive gate",
      ],
      [".immutable == true", "immutable GitHub release postcondition"],
      [
        "production-source-release.mjs",
        "signed durable production source binding",
      ],
    ];
    for (const [marker, label] of requiredReleaseMarkers) {
      if (!release.includes(marker)) {
        violations.push(`${productionReleaseWorkflow} is missing ${label}`);
      }
    }

    const parsedRelease = workflowYaml[productionReleaseWorkflow];
    const releaseJobs = parsedRelease?.jobs ?? {};
    const validateJob = releaseJobs.validate;
    const cloudflarePreflightJob =
      releaseJobs["cloudflare-production-preflight"];
    const archiveSourceJob = releaseJobs["archive-production-source"];
    const databaseJob = releaseJobs["deploy-production-database"];
    const renewEdgeLeaseJob = releaseJobs["renew-edge-mutation-lease"];
    const edgeJob = releaseJobs["deploy-production-edge"];
    const renewCloudflareLeaseJob =
      releaseJobs["renew-cloudflare-mutation-lease"];
    const cloudflareJob = releaseJobs["deploy-production-cloudflare"];
    const aggregateJob = releaseJobs["attest-production-release"];
    if (
      validateJob?.environment !== undefined ||
      !validateJob?.outputs?.artifact_sha256 ||
      !validateJob?.outputs?.manifest_sha256 ||
      !validateJob?.outputs?.approval_nonce ||
      !validateJob?.outputs?.mutation_lease_artifact
    ) {
      violations.push(
        `${productionReleaseWorkflow} validation must emit the exact approved release and lease tuple`,
      );
    }
    const databaseNeeds = Array.isArray(databaseJob?.needs)
      ? databaseJob.needs
      : [databaseJob?.needs].filter(Boolean);
    const archiveNeeds = Array.isArray(archiveSourceJob?.needs)
      ? archiveSourceJob.needs
      : [archiveSourceJob?.needs].filter(Boolean);
    if (
      !archiveNeeds.includes("validate") ||
      !archiveNeeds.includes("cloudflare-production-preflight") ||
      archiveSourceJob?.environment !== undefined ||
      archiveSourceJob?.permissions?.actions !== "read" ||
      archiveSourceJob?.permissions?.contents !== "write" ||
      Object.keys(archiveSourceJob?.permissions ?? {}).sort().join("\n") !==
        ["actions", "contents"].sort().join("\n")
    ) {
      violations.push(
        `${productionReleaseWorkflow} must archive signed immutable source before production mutation`,
      );
    }
    if (
      cloudflarePreflightJob?.needs !== "validate" ||
      cloudflarePreflightJob?.environment !== undefined ||
      !databaseNeeds.includes("validate") ||
      !databaseNeeds.includes("cloudflare-production-preflight") ||
      !databaseNeeds.includes("archive-production-source") ||
      databaseJob?.uses !==
        "./.github/workflows/deploy-supabase-production-db.yml" ||
      databaseJob?.with?.release_sha !== "${{ inputs.release_sha }}" ||
      databaseJob?.with?.mutation_lease_artifact !==
        "${{ needs.validate.outputs.mutation_lease_artifact }}"
    ) {
      violations.push(
        `${productionReleaseWorkflow} database deploy must require the exact validated tuple`,
      );
    }
    const renewNeeds = Array.isArray(renewEdgeLeaseJob?.needs)
      ? renewEdgeLeaseJob.needs
      : [renewEdgeLeaseJob?.needs].filter(Boolean);
    if (
      !renewNeeds.includes("validate") ||
      !renewNeeds.includes("deploy-production-database") ||
      renewEdgeLeaseJob?.environment !== undefined ||
      !renewEdgeLeaseJob?.outputs?.mutation_lease_artifact
    ) {
      violations.push(
        `${productionReleaseWorkflow} must renew the Edge lease only after database promotion`,
      );
    }
    const edgeNeeds = Array.isArray(edgeJob?.needs)
      ? edgeJob.needs
      : [edgeJob?.needs].filter(Boolean);
    if (
      edgeJob?.uses !== "./.github/workflows/deploy-edge-functions.yml" ||
      !edgeNeeds.includes("validate") ||
      !edgeNeeds.includes("deploy-production-database") ||
      !edgeNeeds.includes("renew-edge-mutation-lease") ||
      edgeJob?.with?.mutation_lease_artifact !==
        "${{ needs.renew-edge-mutation-lease.outputs.mutation_lease_artifact }}" ||
      edgeJob?.with?.database_attestation_artifact !==
        "${{ needs.deploy-production-database.outputs.database_attestation_artifact }}" ||
      edgeJob?.with?.database_attestation_sha256 !==
        "${{ needs.deploy-production-database.outputs.database_attestation_sha256 }}"
    ) {
      violations.push(
        `${productionReleaseWorkflow} Edge deploy must consume the database attestation and renewed lease`,
      );
    }
    const renewCloudflareNeeds = Array.isArray(renewCloudflareLeaseJob?.needs)
      ? renewCloudflareLeaseJob.needs
      : [renewCloudflareLeaseJob?.needs].filter(Boolean);
    const cloudflareNeeds = Array.isArray(cloudflareJob?.needs)
      ? cloudflareJob.needs
      : [cloudflareJob?.needs].filter(Boolean);
    const aggregateNeeds = Array.isArray(aggregateJob?.needs)
      ? aggregateJob.needs
      : [aggregateJob?.needs].filter(Boolean);
    if (
      !renewCloudflareNeeds.includes("validate") ||
      !renewCloudflareNeeds.includes("deploy-production-database") ||
      !renewCloudflareNeeds.includes("deploy-production-edge") ||
      renewCloudflareLeaseJob?.environment !== undefined ||
      !renewCloudflareLeaseJob?.outputs?.mutation_lease_artifact ||
      cloudflareJob?.uses !==
        "./.github/workflows/reusable-cloudflare-production-deploy.yml" ||
      !cloudflareNeeds.includes("renew-cloudflare-mutation-lease") ||
      cloudflareJob?.with?.backend_run_id !== "${{ github.run_id }}" ||
      cloudflareJob?.with?.backend_run_attempt !==
        "${{ github.run_attempt }}" ||
      cloudflareJob?.with?.backend_approval_run_id !==
        "${{ needs.validate.outputs.approval_run_id }}" ||
      cloudflareJob?.with?.backend_approval_run_attempt !==
        "${{ needs.validate.outputs.approval_run_attempt }}" ||
      !aggregateNeeds.includes("deploy-production-cloudflare") ||
      aggregateJob?.environment !== undefined ||
      aggregateJob?.permissions?.actions !== "read" ||
      aggregateJob?.permissions?.contents !== "read" ||
      Object.keys(aggregateJob?.permissions ?? {}).sort().join("\n") !==
        ["actions", "contents"].join("\n") ||
      !release.includes("production-release-attestation.json") ||
      !release.includes("scripts/create-release-artifact-binding.mjs") ||
      !release.includes("scripts/verify-release-artifact-binding.mjs") ||
      release.includes("secrets: inherit")
    ) {
      violations.push(
        `${productionReleaseWorkflow} must serialize database, Edge, Cloudflare, and signed aggregate evidence with fresh leases and explicit secrets`,
      );
    }
  }

  for (const failure of checkSlsaReadiness(root).failures) {
    violations.push(`GitHub Free release binding: ${failure}`);
  }

  const releaseSafetyWorkflow =
    workflowText[".github/workflows/reusable-release-safety.yml"] ?? "";
  if (/\bsecrets\./.test(releaseSafetyWorkflow)) {
    violations.push(
      ".github/workflows/reusable-release-safety.yml must remain secretless",
    );
  }

  const stageRelease =
    workflowText[".github/workflows/stage-release.yml"] ?? "";
  for (const marker of [
    "workflow_run:",
    'workflows: ["CI"]',
    "node scripts/wait-for-staging-release-gates.mjs",
    "github-staging-lease",
    "uses: ./.github/workflows/reusable-supabase-staging.yml",
    "production-release-candidate-binding-${{ github.event.workflow_run.head_sha }}",
    "CLOUDFLARE_STAGING_PAGES_PROJECT",
    "--commit-dirty=false",
    "pages-deployment-id",
    "release:verify-live-marker",
    "name: Release candidate attested",
    "release-candidate-attestation-",
    "provenance-verification.json",
    "source-provenance-verification-",
    "manifest_sha256",
    "/domains",
    "project_domains",
  ]) {
    if (!stageRelease.includes(marker)) {
      violations.push(
        `.github/workflows/stage-release.yml is missing ${marker}`,
      );
    }
  }
  const stageBuildViolation = stageReleaseBuildPolicyViolation(stageRelease);
  if (stageBuildViolation) violations.push(stageBuildViolation);

  const supabaseStaging =
    workflowText[".github/workflows/reusable-supabase-staging.yml"] ?? "";
  for (const marker of [
    "public_catalogue_postgrest_contract.mjs",
    "supabase-staging-db-attestation.json",
    'artifact_name="supabase-staging-edge-attestation-${RELEASE_SHA}-${GITHUB_RUN_ATTEMPT}"',
    "production-release-candidate-binding-",
    "node scripts/verify-release-artifact-binding.mjs",
    "RELEASE_EVIDENCE_SIGNING_KEY",
  ]) {
    if (!supabaseStaging.includes(marker)) {
      violations.push(
        `.github/workflows/reusable-supabase-staging.yml is missing ${marker}`,
      );
    }
  }

  const direct =
    workflowText[".github/workflows/direct-cloudflare-production-deploy.yml"] ??
    "";
  const directParsed =
    workflowYaml[".github/workflows/direct-cloudflare-production-deploy.yml"];
  const directJobs = directParsed?.jobs ?? {};
  for (const marker of [
    "release_sha:",
    "required: true",
    "RECOVER_CLOUDFLARE_PRODUCTION",
    "github-recovery",
    "PRODUCTION_RELEASE_ENABLED",
    "backend_run_id",
    "backend_run_attempt",
    "backend_approval_run_id",
    "backend_approval_run_attempt",
    "production-mutation-lease",
    "production-recovery-attestation.json",
    "scripts/create-release-artifact-binding.mjs",
    "scripts/verify-release-artifact-binding.mjs",
  ]) {
    if (!direct.includes(marker)) {
      violations.push(
        `.github/workflows/direct-cloudflare-production-deploy.yml is missing ${marker}`,
      );
    }
  }
  if (
    Object.keys(directJobs).join("\n") !==
      [
        "validate",
        "deploy-production-cloudflare",
        "attest-production-recovery",
      ].join("\n") ||
    directJobs.validate?.environment !== undefined ||
    directJobs["deploy-production-cloudflare"]?.uses !==
      "./.github/workflows/reusable-cloudflare-production-deploy.yml" ||
    directJobs["attest-production-recovery"]?.permissions?.actions !==
      "read" ||
    directJobs["attest-production-recovery"]?.permissions?.contents !==
      "read" ||
    Object.keys(
      directJobs["attest-production-recovery"]?.permissions ?? {},
    ).sort().join("\n") !== ["actions", "contents"].join("\n") ||
    direct.includes("secrets: inherit") ||
    /npm run build|vite build/.test(direct)
  ) {
    violations.push(
      ".github/workflows/direct-cloudflare-production-deploy.yml must recover only through the protected exact-artifact Cloudflare boundary and sign terminal evidence",
    );
  }

  const cloudflareProductionWorkflow =
    ".github/workflows/reusable-cloudflare-production-deploy.yml";
  {
    const text = workflowText[cloudflareProductionWorkflow] ?? "";
    const parsed = workflowYaml[cloudflareProductionWorkflow];
    const triggerNames = Object.keys(parsed?.on ?? {});
    const workflowCall = parsed?.on?.workflow_call;
    const deploy = parsed?.jobs?.deploy;
    if (
      triggerNames.length !== 1 ||
      triggerNames[0] !== "workflow_call" ||
      !deploy ||
      deploy.environment !== undefined
    ) {
      violations.push(
        `${cloudflareProductionWorkflow} must remain workflow-call-only with repository-scoped exact-release controls`,
      );
    }

    const requiredInputs = [
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "production_run_id",
      "production_run_attempt",
      "backend_run_id",
      "backend_run_attempt",
      "backend_approval_run_id",
      "backend_approval_run_attempt",
      "stripe_readiness_run_id",
      "stripe_readiness_run_attempt",
      "stripe_readiness_sha256",
      "stripe_readiness_artifact_id",
      "stripe_readiness_artifact_digest",
      "artifact_sha256",
      "manifest_sha256",
      "approval_nonce",
      "allowed_approvers",
      "allowed_deployers",
      "deploy_actor",
      "release_evidence_signing_key_id",
      "mutation_lease_artifact",
      "production_project_id",
      "staging_project_id",
      "database_attestation_artifact",
      "database_attestation_sha256",
      "database_binding_artifact",
      "edge_attestation_artifact",
      "edge_attestation_sha256",
      "edge_binding_artifact",
    ];
    const inputs = workflowCall?.inputs ?? {};
    const exactInputs = [
      ...requiredInputs,
      ...productionAuthorizationInputNames,
    ];
    if (
      requiredInputs.some((name) => inputs[name]?.required !== true) ||
      productionAuthorizationInputContractViolations(inputs, {
        directRecoveryCompatible: true,
      }).length > 0 ||
      Object.keys(inputs).sort().join("\n") !== exactInputs.sort().join("\n")
    ) {
      violations.push(
        `${cloudflareProductionWorkflow} must require only the exact release tuple, digests, lease, and upstream attestation inputs`,
      );
    }

    for (const workflowPath of [
      ".github/workflows/deploy-supabase-production-db.yml",
      ".github/workflows/deploy-edge-functions.yml",
    ]) {
      const reusableInputs =
        workflowYaml[workflowPath]?.on?.workflow_call?.inputs ?? {};
      if (productionAuthorizationInputContractViolations(reusableInputs).length > 0) {
        violations.push(
          `${workflowPath} must require the exact authorization and consumption tuple inputs`,
        );
      }
    }

    const requiredSecrets = [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_PAGES_READ_TOKEN",
      "CLOUDFLARE_PAGES_EDIT_TOKEN",
      "CLOUDFLARE_STAGING_ACCOUNT_ID",
      "CLOUDFLARE_STAGING_PAGES_READ_TOKEN",
      "VITE_SUPABASE_PROJECT_ID",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "CLOUDFLARE_TURN_KEY_ID",
      "CLOUDFLARE_TURN_API_TOKEN",
      "RELEASE_EVIDENCE_SIGNING_KEY",
    ];
    const optionalSecrets = [
      "CF_ACCESS_CLIENT_ID",
      "CF_ACCESS_CLIENT_SECRET",
    ];
    const callSecrets = workflowCall?.secrets ?? {};
    const exactSecrets = [...requiredSecrets, ...optionalSecrets].sort();
    if (
      requiredSecrets.some((name) => callSecrets[name]?.required !== true) ||
      optionalSecrets.some((name) => callSecrets[name]?.required !== false) ||
      Object.keys(callSecrets).sort().join("\n") !== exactSecrets.join("\n")
    ) {
      violations.push(
        `${cloudflareProductionWorkflow} must expose only explicit least-privilege production secrets`,
      );
    }

    const permissions = parsed?.permissions ?? {};
    if (
      permissions.actions !== "read" ||
      permissions.contents !== "read" ||
      Object.keys(permissions).sort().join("\n") !==
        ["actions", "contents"].join("\n")
    ) {
      violations.push(
        `${cloudflareProductionWorkflow} must grant only actions, attestations, and contents read access`,
      );
    }

    const requiredMarkers = [
      'PRODUCTION_PROJECT: "maiprop-listing-site"',
      'STAGING_PROJECT: "maiprop-listing-site-staging"',
      'PRODUCTION_APP_URL: "https://portal.maiprop.co"',
      'PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"',
      'WRANGLER_VERSION: "4.86.0"',
      "persist-credentials: false",
      "production-release-candidate-${{ inputs.release_sha }}",
      ".github/workflows/ci.yml",
      ".github/workflows/stage-release.yml",
      ".github/workflows/approve-production-release.yml",
      "database_binding_artifact",
      "edge_binding_artifact",
      ".github/workflows/verify-stripe-live-readiness.yml",
      "scripts/verify-release-artifact-binding.mjs",
      "production-upstream-attestations",
      "--mode git-lock",
      "canonical_deployment",
      "cloudflare-production-rollback-target.json",
      "Verify pre-provisioned production Pages runtime bindings",
      "preprovisioned-verified-runtime",
      "runtime_mutation_attempted: false",
      "runtime_restore_required: false",
      "Rollback target must differ from the candidate release SHA",
      "Production canonical changed after rollback capture; candidate deploy refused",
      "Rollback refused because production canonical is neither the captured rollback target nor the exact candidate deployed by this run",
      "--mode production",
      "$RUNNER_TEMP/maiprop-cloudflare-production-",
      "npx --no-install wrangler pages deploy dist",
      "--project-name=maiprop-listing-site",
      "--branch=main",
      '--commit-hash="$RELEASE_SHA"',
      "--commit-dirty=false",
      "release:verify-live-marker",
      "release:verify-runtime-config",
      "check:production-deploy",
      "auctionConsistency",
      "listingsCursor",
      "openHousesCursor",
      "publicationPinning",
      "/rollback",
      "Create minimized rollback evidence",
      "steps.rollback.outcome != 'skipped'",
      "rollback_outcome",
      "cloudflare-production-evidence.json",
      "cloudflare-production-rollback-evidence.json",
      "Any successful rollback is evidence of recovery, not release success",
    ];
    for (const marker of requiredMarkers) {
      if (!text.includes(marker)) {
        violations.push(
          `${cloudflareProductionWorkflow} is missing immutable production promotion control ${marker}`,
        );
      }
    }

    const forbiddenMarkers = [
      "secrets: inherit",
      "npm run build",
      "vite build",
      "cloudflare/wrangler-action",
      "SITE_LOCK_PASSWORD",
      "SUPABASE_SERVICE_ROLE_KEY",
      "--request PATCH",
      "deployment-only-forward-runtime",
    ];
    for (const marker of forbiddenMarkers) {
      if (text.includes(marker)) {
        violations.push(
          `${cloudflareProductionWorkflow} contains forbidden production promotion wiring ${marker}`,
        );
      }
    }
    if ((text.match(/\bpages deploy dist\b/g) ?? []).length !== 1) {
      violations.push(
        `${cloudflareProductionWorkflow} must contain exactly one immutable Pages deploy command`,
      );
    }

    const mutationSteps = [
      ["Deploy exact immutable production artifact", "pages deploy dist"],
      ["Roll back failed production candidate", "/rollback"],
    ];
    const steps = Array.isArray(deploy?.steps) ? deploy.steps : [];
    for (const [stepName, mutation] of mutationSteps) {
      const step = steps.find((candidate) => candidate?.name === stepName);
      const run = String(step?.run ?? "");
      const providerMutation = run.indexOf(mutation);
      const projectLock = run.lastIndexOf(
        "validate-cloudflare-pages-staging-posture.mjs",
        providerMutation,
      );
      const currentMain = run.lastIndexOf(
        "github-staging-lease",
        providerMutation,
      );
      const lease = run.lastIndexOf("mutation-lease", providerMutation);
      if (
        !step ||
        projectLock < 0 ||
        currentMain <= projectLock ||
        lease <= currentMain ||
        providerMutation <= lease
      ) {
        violations.push(
          `${cloudflareProductionWorkflow} must revalidate current main and the mutation lease in the same shell immediately before ${stepName}`,
        );
      }
    }
    const expectedHttpMutations = new Map([
      ["Roll back failed production candidate", ["POST"]],
    ]);
    for (const step of steps) {
      const actual = findPolicyCloudflareHttpMutations(
        String(step?.run ?? ""),
      );
      const expected = expectedHttpMutations.get(step?.name) ?? [];
      if (actual.join("\n") !== expected.join("\n")) {
        violations.push(
          `${cloudflareProductionWorkflow} has unexpected Cloudflare HTTP mutation wiring in ${step?.name ?? "an unnamed step"}`,
        );
      }
    }
  }

  for (const workflowPath of [
    ".github/workflows/deploy-supabase-production-db.yml",
    ".github/workflows/deploy-edge-functions.yml",
  ]) {
    const text = workflowText[workflowPath] ?? "";
    const parsed = workflowYaml[workflowPath];
    const triggerNames = Object.keys(parsed?.on ?? {});
    const deploy = parsed?.jobs?.deploy;
    if (
      triggerNames.length !== 1 ||
      triggerNames[0] !== "workflow_call" ||
      !deploy ||
      deploy.environment !== "production"
    ) {
      violations.push(
        `${workflowPath} must remain workflow-call-only with the production-scoped database credential and exact-release controls`,
      );
    }
    if (
      !text.includes('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"') ||
      !text.includes("persist-credentials: false") ||
      !text.includes("npm ci --ignore-scripts") ||
      !text.includes("--workdir release-candidate") ||
      !text.includes("mutation-lease") ||
      text.includes("SUPABASE_SERVICE_ROLE_KEY") ||
      text.includes("secrets: inherit")
    ) {
      violations.push(
        `${workflowPath} is missing exact-artifact production promotion controls`,
      );
    }
    const mutationLines = text.split(/\r?\n/).filter((line) =>
      /\bsupabase\b.*\b(?:migration repair|db push|functions deploy)\b/.test(
        line,
      ));
    if (
      mutationLines.some((line) =>
        !line.includes("--workdir release-candidate"))
    ) {
      violations.push(
        `${workflowPath} contains a Supabase mutation outside the verified artifact workdir`,
      );
    }
  }

  violations.push(
    ...productionDatabaseCredentialScopeViolations({
      release: workflowYaml[productionReleaseWorkflow],
      calledWorkflows: [
        ".github/workflows/deploy-supabase-production-db.yml",
        ".github/workflows/deploy-edge-functions.yml",
      ].map((workflowPath) => ({
        text: workflowText[workflowPath] ?? "",
        parsed: workflowYaml[workflowPath],
      })),
    }),
  );

  const documented = new Set();
  for (const doc of envDocs) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const text = read(full);
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g))
      documented.add(match[1]);
  }
  const undocumentedSecrets = [...secrets]
    .filter((name) => !documented.has(name))
    .sort();
  for (const secret of undocumentedSecrets) {
    violations.push(`Workflow secret is undocumented: ${secret}`);
  }

  return {
    violations,
    provider_http_mutations: providerHttpMutations,
    secrets: [...secrets].sort(),
    undocumented_secrets: undocumentedSecrets,
  };
}

function packageVersion(packageName) {
  const packagePath = join(root, "node_modules", packageName, "package.json");
  if (!existsSync(packagePath)) return "unknown";
  try {
    return JSON.parse(read(packagePath)).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function supabaseCliInvocation(args) {
  const supabaseShim = join(
    root,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
  if (existsSync(supabaseShim)) {
    return { command: process.execPath, args: [supabaseShim, ...args] };
  }

  const localBin = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  if (existsSync(localBin)) {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          [quoteCmdArg(localBin), ...args.map(quoteCmdArg)].join(" "),
        ],
      };
    }
    return { command: localBin, args };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        ["npx", "supabase", ...args].map(quoteCmdArg).join(" "),
      ],
    };
  }
  return { command: "npx", args: ["supabase", ...args] };
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function collectLiveFunctionInventory(sourceManifest) {
  if (!liveFunctionsMode) {
    return {
      checked: false,
      reason:
        "disabled; pass --live-functions or RELEASE_SAFETY_LIVE_FUNCTIONS=true",
    };
  }

  const configToml = existsSync(configPath) ? read(configPath) : "";
  const projectRef =
    process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
    process.env.SUPABASE_PROJECT_REF ||
    process.env.VITE_SUPABASE_PROJECT_ID ||
    parseProjectRefFromConfig(configToml) ||
    "";
  if (!projectRef) {
    return {
      checked: true,
      error:
        "Missing RELEASE_SAFETY_SUPABASE_PROJECT_REF, SUPABASE_PROJECT_REF, VITE_SUPABASE_PROJECT_ID, and supabase/config.toml project_id",
      deployed: [],
      live_missing_repo: [],
      repo_missing_live: [],
    };
  }

  try {
    const { command, args } = supabaseCliInvocation([
      "functions",
      "list",
      "--project-ref",
      projectRef,
      "--output-format",
      "json",
    ]);
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const deployed = parseSupabaseFunctionsList(output);
    const sourceByName = new Map(
      sourceManifest.functions.map((item) => [item.name, item]),
    );
    const linkedDeployments = deployed.map((item) => ({
      ...item,
      expected_source_sha256:
        sourceByName.get(item.name)?.effective_source_sha256 ?? null,
    }));
    const deployedNames = deployed.map((item) => item.name);
    const sourceNames = sourceManifest.functions.map((item) => item.name);
    return {
      checked: true,
      project_ref: projectRef,
      release_sha: process.env.RELEASE_SAFETY_RELEASE_SHA || "",
      source_manifest_sha256: sourceManifest.manifest_sha256,
      deployed: linkedDeployments,
      live_missing_repo: deployedNames
        .filter((name) => !sourceNames.includes(name))
        .sort(),
      repo_missing_live: sourceNames
        .filter((name) => !deployedNames.includes(name))
        .sort(),
    };
  } catch (error) {
    return {
      checked: true,
      project_ref: projectRef,
      error: error.stderr?.toString() || error.message,
      deployed: [],
      live_missing_repo: [],
      repo_missing_live: [],
    };
  }
}

function parseSupabaseFunctionsList(output) {
  try {
    const parsed = JSON.parse(output);
    const records = Array.isArray(parsed) ? parsed : parsed.functions;
    if (Array.isArray(records)) {
      return records
        .map((record) => ({
          name: String(record.slug || record.name || ""),
          version: record.version ?? null,
          status: record.status ?? null,
          verify_jwt: record.verify_jwt ?? null,
          updated_at: record.updated_at ?? null,
          ezbr_sha256: record.ezbr_sha256 ?? null,
        }))
        .filter((record) => /^[A-Za-z0-9_-]+$/.test(record.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // Older CLIs can only emit a text table; retain a names-only fallback.
  }

  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^ID\s+/.test(trimmed) || /^[|\-\s]+$/.test(trimmed))
      continue;
    const pipeCells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (
      pipeCells.length >= 2 &&
      /^[A-Za-z0-9_-]+$/.test(pipeCells[1]) &&
      !/^-+$/.test(pipeCells[1])
    ) {
      names.add(pipeCells[1]);
      continue;
    }
    const columns = trimmed
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (
      columns.length >= 2 &&
      /^[A-Za-z0-9_-]+$/.test(columns[1]) &&
      !/^-+$/.test(columns[1])
    ) {
      names.add(columns[1]);
    }
  }
  return [...names].sort().map((name) => ({
    name,
    version: null,
    status: null,
    verify_jwt: null,
    updated_at: null,
    ezbr_sha256: null,
  }));
}

function collectInventory() {
  const configured = parseFunctionConfig(read(configPath));
  const sourceFunctions = readdirSync(functionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !ignoredFunctionDirs.has(name))
    .filter((name) => existsSync(join(functionDir, name, "index.ts")))
    .sort();
  const edgeSourceManifest = buildEdgeSourceManifest(
    configured,
    sourceFunctions,
  );
  const sourceByName = new Map(
    edgeSourceManifest.functions.map((item) => [item.name, item]),
  );

  const configuredFunctions = [...configured.keys()].sort();
  const missingConfig = sourceFunctions.filter((name) => !configured.has(name));
  const missingSource = configuredFunctions.filter(
    (name) => !sourceFunctions.includes(name),
  );
  const functions = configuredFunctions.map((name) => ({
    name,
    verify_jwt: configured.get(name).verify_jwt,
    has_source: sourceFunctions.includes(name),
    source_sha256: sourceByName.get(name)?.effective_source_sha256 ?? null,
  }));

  return {
    generated_at: new Date().toISOString(),
    toolchain: {
      node: ">=20.19.0 <21",
      npm: ">=10.8.0 <11",
      deno: "2.7.12",
      supabase_cli: packageVersion("supabase"),
    },
    functions,
    edge_source_manifest: edgeSourceManifest,
    function_inventory_gaps: {
      source_without_config: missingConfig,
      config_without_source: missingSource,
    },
    live_function_inventory: collectLiveFunctionInventory(edgeSourceManifest),
    env: scanEnvNames(),
    workflow: scanWorkflows(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const inventory = collectInventory();
  if (outPath) {
    writeFileSync(
      join(root, outPath),
      `${JSON.stringify(inventory, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(inventory, null, 2));

  if (checkMode) {
  const failures = [
    ...inventory.function_inventory_gaps.source_without_config.map(
      (name) => `Function source without config: ${name}`,
    ),
    ...inventory.function_inventory_gaps.config_without_source.map(
      (name) => `Function config without source: ${name}`,
    ),
    ...inventory.env.undocumented_enforced.map(
      (name) => `Env var is used but undocumented: ${name}`,
    ),
    ...inventory.workflow.violations,
  ];
  if (inventory.live_function_inventory.checked) {
    if (inventory.live_function_inventory.error) {
      failures.push(
        `Live Supabase function inventory failed: ${inventory.live_function_inventory.error}`,
      );
    }
    for (const name of inventory.live_function_inventory.live_missing_repo ??
      []) {
      failures.push(`Live Supabase function absent from repo: ${name}`);
    }
    for (const name of inventory.live_function_inventory.repo_missing_live ??
      []) {
      failures.push(`Repo function absent from live Supabase project: ${name}`);
    }
  }
  if (requireLiveSourceEvidence) {
    if (!/^[0-9a-f]{40}$/i.test(inventory.edge_source_manifest.release_sha)) {
      failures.push(
        "Exact Edge source evidence requires RELEASE_SAFETY_RELEASE_SHA as a full 40-character SHA",
      );
    }
    if (!inventory.live_function_inventory.checked) {
      failures.push("Exact Edge source evidence requires --live-functions");
    } else {
      if (
        inventory.live_function_inventory.source_manifest_sha256 !==
        inventory.edge_source_manifest.manifest_sha256
      ) {
        failures.push(
          "Live Edge inventory is not linked to the exact source manifest",
        );
      }
      for (const deployed of inventory.live_function_inventory.deployed ?? []) {
        if (!/^[0-9a-f]{64}$/i.test(String(deployed.ezbr_sha256 ?? ""))) {
          failures.push(
            `Live Edge function lacks a bundle hash: ${deployed.name}`,
          );
        }
        if (
          !/^[0-9a-f]{64}$/i.test(
            String(deployed.expected_source_sha256 ?? ""),
          )
        ) {
          failures.push(
            `Live Edge function lacks the expected source hash: ${deployed.name}`,
          );
        }
        if (deployed.version == null || !deployed.updated_at) {
          failures.push(
            `Live Edge function lacks version/update evidence: ${deployed.name}`,
          );
        }
      }
    }
  }

    if (failures.length) {
      console.error("\n[release-safety] FAIL");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.error("\n[release-safety] OK");
  }
}
