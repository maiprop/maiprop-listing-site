import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { normalizePagesGitAutoDeploy } from "./capture-cloudflare-admin-posture.mjs";

const COMPATIBILITY_DATE = "2026-05-19";
const PRODUCTION_ORIGIN_HOST = "portal.maiprop.co";
const ISOLATED_BINDINGS = [
  "SUPABASE_URL",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_APP_URL",
  "VITE_PUBLIC_API_ORIGIN",
];
const SECRET_BINDINGS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_TURN_KEY_ID",
  "CLOUDFLARE_TURN_API_TOKEN",
];
const PRODUCTION_SECRET_BINDINGS = [
  "CLOUDFLARE_TURN_KEY_ID",
  "CLOUDFLARE_TURN_API_TOKEN",
];
const OPTIONAL_SECRET_BINDINGS = ["SITE_LOCK_PASSWORD"];
export const STRIPE_PRICE_BINDINGS = [
  "VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY",
  "VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL",
  "VITE_STRIPE_PRICE_AGENT_MONTHLY",
  "VITE_STRIPE_PRICE_AGENT_ANNUAL",
  "VITE_STRIPE_PRICE_DEVELOPER_MONTHLY",
  "VITE_STRIPE_PRICE_DEVELOPER_ANNUAL",
  "VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY",
  "VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL",
];
export const STRIPE_RUNTIME_BINDINGS = [
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_RUNTIME_MODE",
  "VITE_BILLING_MODE",
  ...STRIPE_PRICE_BINDINGS,
];
function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function apiProject(envelope, expectedName, expectedId) {
  assertOk(
    envelope?.success === true &&
      envelope?.result &&
      typeof envelope.result === "object" &&
      typeof expectedId === "string" &&
      expectedId.trim().length > 0 &&
      envelope.result.id === expectedId &&
      envelope.result.name === expectedName,
    `Cloudflare Pages API did not return immutable project ${expectedName} (${expectedId}).`,
  );
  return envelope.result;
}

function redactedProjectPosture(role, project) {
  const posture = normalizePagesGitAutoDeploy(project);
  return {
    role,
    project_id: project.id,
    project_name: project.name,
    source_connected: posture.sourceConnected,
    production_deployments_enabled:
      posture.productionDeploymentsEnabled,
    preview_deployment_setting: posture.previewDeploymentSetting,
    all_automatic_deployments_disabled:
      posture.allAutomaticDeploymentsDisabled,
    status: posture.status,
  };
}

export function buildCloudflarePagesGitAutoDeployPostStateEvidence({
  stagingApi,
  productionApi,
  stagingProjectName,
  productionProjectName,
  stagingProjectId,
  productionProjectId,
}) {
  assertOk(
    stagingProjectName &&
      productionProjectName &&
      stagingProjectName !== productionProjectName,
    "Dedicated staging and production Pages project names must be different.",
  );
  const projects = [
    redactedProjectPosture(
      "staging",
      apiProject(stagingApi, stagingProjectName, stagingProjectId),
    ),
    redactedProjectPosture(
      "production",
      apiProject(productionApi, productionProjectName, productionProjectId),
    ),
  ];
  return {
    schema_version: 1,
    evidence_type: "maiprop-pages-git-auto-deploy-post-state",
    status: projects.every(
      (project) => project.all_automatic_deployments_disabled,
    )
      ? "locked"
      : "not-locked",
    projects,
  };
}

function productionBindings(project, projectRole = "Production") {
  const bindings = project?.deployment_configs?.production?.env_vars;
  assertOk(
    bindings && typeof bindings === "object" && !Array.isArray(bindings),
    `${projectRole} Pages runtime bindings are missing or invalid.`,
  );
  return bindings;
}

function validateBindingSchema({
  bindings,
  projectRole,
  requiredPlainText,
  requiredSecrets,
  optionalPlainText = [],
  optionalSecrets = [],
  valueMismatchMessage = `${projectRole} Pages bindings do not match the expected runtime.`,
}) {
  const expectedTypes = new Map([
    ...Object.keys(requiredPlainText).map((name) => [name, "plain_text"]),
    ...requiredSecrets.map((name) => [name, "secret_text"]),
    ...optionalPlainText.map((name) => [name, "plain_text"]),
    ...optionalSecrets.map((name) => [name, "secret_text"]),
  ]);
  for (const name of Object.keys(bindings)) {
    assertOk(
      expectedTypes.has(name),
      `Unexpected ${projectRole.toLowerCase()} Pages binding ${name}.`,
    );
  }
  for (const [name, expectedType] of expectedTypes) {
    const binding = bindings[name];
    const required = Object.hasOwn(requiredPlainText, name) ||
      requiredSecrets.includes(name);
    if (!required && binding === undefined) continue;
    assertOk(
      binding && typeof binding === "object" && !Array.isArray(binding),
      `${projectRole} Pages binding ${name} is missing or malformed.`,
    );
    if (expectedType === "plain_text") {
      assertOk(
        binding.type === "plain_text" && typeof binding.value === "string",
        `${projectRole} Pages binding ${name} must be plain_text with a string value.`,
      );
    } else {
      assertOk(
        binding.type === "secret_text" &&
          (
            binding.value === undefined ||
            binding.value === null ||
            typeof binding.value === "string"
          ),
        `${projectRole} Pages binding ${name} must be secret_text.`,
      );
    }
  }
  for (const [name, expectedValue] of Object.entries(requiredPlainText)) {
    assertOk(
      bindings[name].value === expectedValue,
      valueMismatchMessage,
    );
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function runtimeConfiguration(project) {
  const production = project?.deployment_configs?.production;
  assertOk(
    production && typeof production === "object" && !Array.isArray(production),
    "Production Pages runtime configuration is missing or invalid.",
  );
  const envVars = productionBindings(project);
  return {
    compatibility_date: production.compatibility_date ?? null,
    env_vars: envVars,
  };
}

export function buildCloudflarePagesProductionRuntimeSnapshotEvidence({
  productionApi,
  productionProjectName,
  productionProjectId,
}) {
  const production = apiProject(
    productionApi,
    productionProjectName,
    productionProjectId,
  );
  const runtime = runtimeConfiguration(production);
  const bindings = Object.entries(runtime.env_vars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, binding]) => ({
      name,
      type: binding === null ? "absent" : String(binding?.type ?? "invalid"),
    }));
  const metadata = {
    production_branch: production.production_branch ?? null,
    compatibility_date: runtime.compatibility_date,
    bindings,
  };
  return {
    schema_version: 2,
    evidence_type: "maiprop-pages-production-runtime-snapshot",
    status: "captured",
    project_id: production.id,
    project_name: production.name,
    production_branch: metadata.production_branch,
    compatibility_date: runtime.compatibility_date,
    binding_count: bindings.length,
    bindings,
    metadata_sha256: createHash("sha256")
      .update(canonicalJson(metadata))
      .digest("hex"),
    values_redacted: true,
    secret_values_recoverable: false,
    runtime_strategy: "preprovisioned-verified-runtime",
    secret_verification: "binding-name-and-type-only",
  };
}

export function getCloudflarePagesProductionBindings(
  envelope,
  expectedName,
  expectedId,
) {
  return productionBindings(apiProject(envelope, expectedName, expectedId));
}

function optionalPlainTextBinding(bindings, name, projectRole) {
  const binding = bindings?.[name];
  if (binding === undefined || binding === null) return undefined;
  assertOk(
    binding?.type === "plain_text",
    `${projectRole} Stripe runtime binding ${name} must be plain_text or absent.`,
  );
  const value =
    typeof binding.value === "string" ? binding.value.trim() : "";
  return value || undefined;
}

export function validateStagingStripeBindings(
  stagingBindings = {},
  productionEnv = {},
) {
  const publishableKey = optionalPlainTextBinding(
    stagingBindings,
    "VITE_STRIPE_PUBLISHABLE_KEY",
    "Staging",
  );
  assertOk(
    publishableKey === undefined ||
      (publishableKey.startsWith("pk_test_") &&
        publishableKey.length > "pk_test_".length),
    "Staging Stripe publishable key must use pk_test_* or be absent.",
  );
  const productionPublishableKey = optionalPlainTextBinding(
    productionEnv,
    "VITE_STRIPE_PUBLISHABLE_KEY",
    "Production",
  );
  assertOk(
    publishableKey === undefined ||
      productionPublishableKey === undefined ||
      publishableKey !== productionPublishableKey,
    "Staging Stripe publishable key must not reuse the production Pages value.",
  );

  const runtimeMode = optionalPlainTextBinding(
    stagingBindings,
    "VITE_STRIPE_RUNTIME_MODE",
    "Staging",
  );
  const billingMode = optionalPlainTextBinding(
    stagingBindings,
    "VITE_BILLING_MODE",
    "Staging",
  );
  assertOk(
    runtimeMode === undefined || runtimeMode === "test",
    "Staging Stripe runtime mode must be test or absent.",
  );
  assertOk(
    billingMode === undefined || billingMode === "test",
    "Staging Stripe billing mode must be test or absent.",
  );

  const productionPriceIds = new Set(
    STRIPE_PRICE_BINDINGS.map((name) =>
      optionalPlainTextBinding(productionEnv, name, "Production"),
    ).filter(Boolean),
  );
  let priceBindingCount = 0;
  for (const name of STRIPE_PRICE_BINDINGS) {
    const value = optionalPlainTextBinding(
      stagingBindings,
      name,
      "Staging",
    );
    if (value === undefined) continue;
    assertOk(
      value.startsWith("price_"),
      `Staging Stripe price binding ${name} must use a price_* ID or be absent.`,
    );
    assertOk(
      !productionPriceIds.has(value),
      `Staging Stripe price binding ${name} reuses a production Stripe price ID.`,
    );
    priceBindingCount += 1;
  }

  return {
    status: "test-or-disabled",
    publishable_key: publishableKey ? "test" : "absent",
    runtime_mode: runtimeMode ? "test" : "absent",
    billing_mode: billingMode ? "test" : "absent",
    price_binding_count: priceBindingCount,
    production_price_reuse: false,
  };
}

export function validateProductionStripeBindings(
  bindings = {},
  expectedBindings = {},
) {
  const expected = {};
  for (const name of STRIPE_RUNTIME_BINDINGS) {
    const value = typeof expectedBindings?.[name] === "string"
      ? expectedBindings[name].trim()
      : "";
    assertOk(
      value.length > 0,
      `Exact protected production Stripe binding ${name} is required.`,
    );
    expected[name] = value;
  }
  assertOk(
    expected.VITE_STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_") &&
      expected.VITE_STRIPE_PUBLISHABLE_KEY.length > "pk_live_".length,
    "Exact protected production Stripe publishable key must use pk_live_*.",
  );
  assertOk(
    expected.VITE_STRIPE_RUNTIME_MODE === "live" &&
      expected.VITE_BILLING_MODE === "live",
    "Exact protected production Stripe runtime and billing modes must be live.",
  );
  const expectedPriceIds = STRIPE_PRICE_BINDINGS.map((name) => expected[name]);
  assertOk(
    expectedPriceIds.every(
      (value) => value.startsWith("price_") && value.length > "price_".length,
    ),
    "Exact protected production Stripe price IDs must use price_* values.",
  );
  assertOk(
    new Set(expectedPriceIds).size === STRIPE_PRICE_BINDINGS.length,
    "Exact protected production Stripe price IDs must be unique.",
  );
  const publishableKey = optionalPlainTextBinding(
    bindings,
    "VITE_STRIPE_PUBLISHABLE_KEY",
    "Production",
  );
  assertOk(
    publishableKey?.startsWith("pk_live_") &&
      publishableKey.length > "pk_live_".length &&
      publishableKey === expected.VITE_STRIPE_PUBLISHABLE_KEY,
    "Production Stripe publishable key does not match the exact protected production Stripe identity.",
  );
  const runtimeMode = optionalPlainTextBinding(
    bindings,
    "VITE_STRIPE_RUNTIME_MODE",
    "Production",
  );
  const billingMode = optionalPlainTextBinding(
    bindings,
    "VITE_BILLING_MODE",
    "Production",
  );
  assertOk(
    runtimeMode === expected.VITE_STRIPE_RUNTIME_MODE,
    "Production Stripe runtime mode does not match the exact protected production Stripe identity.",
  );
  assertOk(
    billingMode === expected.VITE_BILLING_MODE,
    "Production Stripe billing mode does not match the exact protected production Stripe identity.",
  );
  const actualPriceIds = [];
  for (const name of STRIPE_PRICE_BINDINGS) {
    const value = optionalPlainTextBinding(bindings, name, "Production");
    assertOk(
      value?.startsWith("price_") && value.length > "price_".length,
      `Production Stripe price binding ${name} must use a price_* ID and is required.`,
    );
    assertOk(
      value === expected[name],
      `Production Stripe price binding ${name} does not match the exact protected production Stripe identity.`,
    );
    actualPriceIds.push(value);
  }
  assertOk(
    new Set(actualPriceIds).size === STRIPE_PRICE_BINDINGS.length,
    "Production Stripe price bindings must be unique.",
  );
  return {
    status: "live",
    publishable_key: "live",
    runtime_mode: "live",
    billing_mode: "live",
    price_binding_count: actualPriceIds.length,
  };
}

export function buildCloudflarePagesStagingPostureEvidence({
  stagingApi,
  productionApi,
  stagingProjectName,
  productionProjectName,
  stagingProjectId,
  productionProjectId,
  stagingAppUrl,
  stagingSupabaseProjectId,
  stagingSupabaseUrl,
  stagingSupabasePublishableKey,
}) {
  assertOk(
    stagingProjectName &&
      productionProjectName &&
      stagingProjectName !== productionProjectName,
    "Dedicated staging and production Pages project names must be different.",
  );
  const staging = apiProject(stagingApi, stagingProjectName, stagingProjectId);
  const production = apiProject(
    productionApi,
    productionProjectName,
    productionProjectId,
  );
  const stagingPosture = redactedProjectPosture("staging", staging);
  const productionPosture = redactedProjectPosture(
    "production",
    production,
  );
  assertOk(
    stagingPosture.all_automatic_deployments_disabled === true &&
      productionPosture.all_automatic_deployments_disabled === true,
    "Both staging and production Pages projects must have Git automatic deployments disabled.",
  );

  const stagingProductionConfig = staging?.deployment_configs?.production;
  assertOk(
    stagingProductionConfig &&
      typeof stagingProductionConfig === "object" &&
      !Array.isArray(stagingProductionConfig),
    "Staging Pages runtime configuration is missing or invalid.",
  );
  const stagingBindings = productionBindings(staging, "Staging");
  const expectedPlainText = {
    SUPABASE_URL: stagingSupabaseUrl,
    SUPABASE_PROJECT_ID: stagingSupabaseProjectId,
    SUPABASE_PUBLISHABLE_KEY: stagingSupabasePublishableKey,
    VITE_SUPABASE_URL: stagingSupabaseUrl,
    VITE_SUPABASE_PROJECT_ID: stagingSupabaseProjectId,
    VITE_SUPABASE_PUBLISHABLE_KEY: stagingSupabasePublishableKey,
    VITE_APP_URL: stagingAppUrl,
    VITE_PUBLIC_API_ORIGIN: stagingAppUrl,
    VITE_APP_ENVIRONMENT: "staging",
    MAIPROP_TURN_TTL_SECONDS: "21600",
  };
  assertOk(
    staging.production_branch === "main" &&
      stagingProductionConfig.compatibility_date === COMPATIBILITY_DATE,
    "Staging Pages runtime branch or compatibility date is invalid.",
  );
  validateBindingSchema({
    bindings: stagingBindings,
    projectRole: "Staging",
    requiredPlainText: expectedPlainText,
    requiredSecrets: SECRET_BINDINGS,
    optionalPlainText: STRIPE_RUNTIME_BINDINGS,
    optionalSecrets: OPTIONAL_SECRET_BINDINGS,
    valueMismatchMessage:
      "Staging Pages bindings must not contain production-valued catalogue or origin variables.",
  });

  const productionEnv = productionBindings(production, "Production");
  const stripeRuntime = validateStagingStripeBindings(
    stagingBindings,
    productionEnv,
  );
  const sharesProductionValue = ISOLATED_BINDINGS.some((name) => {
    const stagingValue = stagingBindings[name]?.value;
    const productionValue = productionEnv[name]?.value;
    return (
      typeof stagingValue === "string" &&
      typeof productionValue === "string" &&
      stagingValue === productionValue
    );
  });
  const containsProductionOrigin = Object.values(stagingBindings).some(
    (binding) =>
      binding?.type === "plain_text" &&
      typeof binding.value === "string" &&
      binding.value.toLowerCase().includes(PRODUCTION_ORIGIN_HOST),
  );
  assertOk(
    !sharesProductionValue &&
      !containsProductionOrigin,
    "Staging Pages bindings must not contain production-valued catalogue or origin variables.",
  );

  return {
    schema_version: 2,
    evidence_type: "maiprop-pages-git-auto-deploy-posture",
    status: "passed",
    compatibility_date: COMPATIBILITY_DATE,
    staging_bindings: "allowlisted-isolated-schema-and-plaintext-values",
    secret_bindings: "allowlisted-name-and-type",
    authenticated_live_functional_proof_required: true,
    stripe_runtime: stripeRuntime,
    projects: [stagingPosture, productionPosture],
  };
}

export function buildCloudflarePagesProductionPostureEvidence({
  stagingApi,
  productionApi,
  stagingProjectName,
  productionProjectName,
  stagingProjectId,
  productionProjectId,
  productionAppUrl,
  productionSupabaseProjectId,
  productionSupabaseUrl,
  productionSupabasePublishableKey,
  expectedProductionStripeBindings,
}) {
  assertOk(
    stagingProjectName &&
      productionProjectName &&
      stagingProjectName !== productionProjectName,
    "Dedicated staging and production Pages project names must be different.",
  );
  const staging = apiProject(stagingApi, stagingProjectName, stagingProjectId);
  const production = apiProject(
    productionApi,
    productionProjectName,
    productionProjectId,
  );
  const projects = [
    redactedProjectPosture("staging", staging),
    redactedProjectPosture("production", production),
  ];
  assertOk(
    projects.every(
      (project) => project.all_automatic_deployments_disabled === true,
    ),
    "Both staging and production Pages projects must have Git automatic deployments disabled.",
  );

  const productionConfig = production?.deployment_configs?.production;
  assertOk(
    productionConfig &&
      typeof productionConfig === "object" &&
      !Array.isArray(productionConfig),
    "Production Pages runtime configuration is missing or invalid.",
  );
  const bindings = productionBindings(production, "Production");
  assertOk(
    bindings.SUPABASE_SERVICE_ROLE_KEY === undefined,
    "Production Pages must never receive a Supabase service role binding.",
  );
  const expectedPlainText = {
    SUPABASE_URL: productionSupabaseUrl,
    SUPABASE_PROJECT_ID: productionSupabaseProjectId,
    SUPABASE_PUBLISHABLE_KEY: productionSupabasePublishableKey,
    VITE_SUPABASE_URL: productionSupabaseUrl,
    VITE_SUPABASE_PROJECT_ID: productionSupabaseProjectId,
    VITE_SUPABASE_PUBLISHABLE_KEY: productionSupabasePublishableKey,
    VITE_APP_URL: productionAppUrl,
    VITE_PUBLIC_API_ORIGIN: productionAppUrl,
    VITE_APP_ENVIRONMENT: "production",
    MAIPROP_TURN_TTL_SECONDS: "21600",
  };
  assertOk(
    production.production_branch === "main" &&
      productionConfig.compatibility_date === COMPATIBILITY_DATE,
    "Production Pages bindings do not match the exact production runtime.",
  );
  validateBindingSchema({
    bindings,
    projectRole: "Production",
    requiredPlainText: expectedPlainText,
    requiredSecrets: PRODUCTION_SECRET_BINDINGS,
    optionalPlainText: STRIPE_RUNTIME_BINDINGS,
    optionalSecrets: OPTIONAL_SECRET_BINDINGS,
    valueMismatchMessage:
      "Production Pages bindings do not match the exact production runtime.",
  });

  return {
    schema_version: 1,
    evidence_type: "maiprop-pages-production-posture",
    status: "passed",
    compatibility_date: COMPATIBILITY_DATE,
    production_bindings: "allowlisted-schema-and-plaintext-values",
    secret_bindings: "allowlisted-name-and-type",
    authenticated_live_functional_proof_required: true,
    stripe_runtime: validateProductionStripeBindings(
      bindings,
      expectedProductionStripeBindings,
    ),
    projects,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    args[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function required(value, name) {
  assertOk(
    typeof value === "string" && value.trim().length > 0,
    `${name} is required.`,
  );
  return value.trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = required(args.mode, "--mode");
  assertOk(
    ["staging", "production", "git-lock", "runtime-snapshot"].includes(mode),
    `Unsupported Cloudflare Pages posture mode: ${mode}`,
  );
  const stagingProjectFile = required(
    args["staging-project-file"],
    "--staging-project-file",
  );
  const productionProjectFile = required(
    args["production-project-file"],
    "--production-project-file",
  );
  const outputPath = resolve(required(args.out, "--out"));
  const stagingApi = JSON.parse(readFileSync(stagingProjectFile, "utf8"));
  const productionApi = JSON.parse(
    readFileSync(productionProjectFile, "utf8"),
  );
  const stagingProjectName = required(
    process.env.STAGING_PROJECT,
    "STAGING_PROJECT",
  );
  const productionProjectName = required(
    process.env.PRODUCTION_PROJECT,
    "PRODUCTION_PROJECT",
  );
  const stagingProjectId = required(
    process.env.CLOUDFLARE_STAGING_PAGES_PROJECT_ID,
    "CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
  );
  const productionProjectId = required(
    process.env.CLOUDFLARE_PAGES_PROJECT_ID,
    "CLOUDFLARE_PAGES_PROJECT_ID",
  );
  if (args["post-state-out"]) {
    const postStatePath = resolve(args["post-state-out"]);
    const postState =
      buildCloudflarePagesGitAutoDeployPostStateEvidence({
        stagingApi,
        productionApi,
        stagingProjectName,
        productionProjectName,
        stagingProjectId,
        productionProjectId,
      });
    mkdirSync(dirname(postStatePath), { recursive: true });
    writeFileSync(postStatePath, `${JSON.stringify(postState, null, 2)}\n`);
  }
  let evidence;
  switch (mode) {
    case "git-lock":
      evidence = buildCloudflarePagesGitAutoDeployPostStateEvidence({
        stagingApi,
        productionApi,
        stagingProjectName,
        productionProjectName,
        stagingProjectId,
        productionProjectId,
      });
      assertOk(
        evidence.status === "locked",
        "Both staging and production Pages projects must have Git automatic deployments disabled.",
      );
      break;
    case "runtime-snapshot":
      evidence = buildCloudflarePagesProductionRuntimeSnapshotEvidence({
        productionApi,
        productionProjectName,
        productionProjectId,
      });
      break;
    case "production":
      evidence = buildCloudflarePagesProductionPostureEvidence({
        stagingApi,
        productionApi,
        stagingProjectName,
        productionProjectName,
        stagingProjectId,
        productionProjectId,
        productionAppUrl: required(
          process.env.PRODUCTION_APP_URL,
          "PRODUCTION_APP_URL",
        ),
        productionSupabaseProjectId: required(
          process.env.PRODUCTION_SUPABASE_PROJECT_ID,
          "PRODUCTION_SUPABASE_PROJECT_ID",
        ),
        productionSupabaseUrl: required(
          process.env.PRODUCTION_SUPABASE_URL,
          "PRODUCTION_SUPABASE_URL",
        ),
        productionSupabasePublishableKey: required(
          process.env.PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
          "PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
        ),
        expectedProductionStripeBindings: Object.fromEntries(
          STRIPE_RUNTIME_BINDINGS.map((name) => [
            name,
            required(process.env[name], name),
          ]),
        ),
      });
      break;
    case "staging":
      evidence = buildCloudflarePagesStagingPostureEvidence({
        stagingApi,
        productionApi,
        stagingProjectName,
        productionProjectName,
        stagingProjectId,
        productionProjectId,
        stagingAppUrl: required(
          process.env.STAGING_APP_URL,
          "STAGING_APP_URL",
        ),
        stagingSupabaseProjectId: required(
          process.env.STAGING_SUPABASE_PROJECT_ID,
          "STAGING_SUPABASE_PROJECT_ID",
        ),
        stagingSupabaseUrl: required(
          process.env.STAGING_SUPABASE_URL,
          "STAGING_SUPABASE_URL",
        ),
        stagingSupabasePublishableKey: required(
          process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,
          "STAGING_SUPABASE_PUBLISHABLE_KEY",
        ),
      });
      break;
    default:
      throw new Error(`Unsupported Cloudflare Pages posture mode: ${mode}`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("validate-cloudflare-pages-staging-posture.mjs")
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
