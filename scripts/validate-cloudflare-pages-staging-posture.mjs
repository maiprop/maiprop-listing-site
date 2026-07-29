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

function apiProject(envelope, expectedName) {
  assertOk(
    envelope?.success === true &&
      envelope?.result &&
      typeof envelope.result === "object" &&
      envelope.result.id &&
      envelope.result.name === expectedName,
    `Cloudflare Pages API did not return project ${expectedName}.`,
  );
  return envelope.result;
}

function redactedProjectPosture(role, project) {
  const posture = normalizePagesGitAutoDeploy(project);
  return {
    role,
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

function productionBindings(project) {
  return project?.deployment_configs?.production?.env_vars ?? {};
}

export function getCloudflarePagesProductionBindings(
  envelope,
  expectedName,
) {
  return productionBindings(apiProject(envelope, expectedName));
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

export function buildCloudflarePagesStagingPostureEvidence({
  stagingApi,
  productionApi,
  stagingProjectName,
  productionProjectName,
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
  const staging = apiProject(stagingApi, stagingProjectName);
  const production = apiProject(productionApi, productionProjectName);
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

  const stagingProductionConfig =
    staging?.deployment_configs?.production ?? {};
  const stagingBindings = productionBindings(staging);
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
  const exactBindingsValid =
    staging.production_branch === "main" &&
    stagingProductionConfig.compatibility_date === COMPATIBILITY_DATE &&
    Object.entries(expectedPlainText).every(
      ([name, value]) =>
        stagingBindings[name]?.type === "plain_text" &&
        stagingBindings[name]?.value === value,
    ) &&
    SECRET_BINDINGS.every(
      (name) => stagingBindings[name]?.type === "secret_text",
    );

  const productionEnv = productionBindings(production);
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
    exactBindingsValid &&
      !sharesProductionValue &&
      !containsProductionOrigin,
    "Staging Pages bindings must not contain production-valued catalogue or origin variables.",
  );

  return {
    schema_version: 2,
    evidence_type: "maiprop-pages-git-auto-deploy-posture",
    status: "passed",
    compatibility_date: COMPATIBILITY_DATE,
    staging_bindings: "isolated",
    stripe_runtime: stripeRuntime,
    projects: [stagingPosture, productionPosture],
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
  const stagingProjectFile = required(
    args["staging-project-file"],
    "--staging-project-file",
  );
  const productionProjectFile = required(
    args["production-project-file"],
    "--production-project-file",
  );
  const outputPath = resolve(required(args.out, "--out"));
  const evidence = buildCloudflarePagesStagingPostureEvidence({
    stagingApi: JSON.parse(readFileSync(stagingProjectFile, "utf8")),
    productionApi: JSON.parse(
      readFileSync(productionProjectFile, "utf8"),
    ),
    stagingProjectName: required(
      process.env.STAGING_PROJECT,
      "STAGING_PROJECT",
    ),
    productionProjectName: required(
      process.env.PRODUCTION_PROJECT,
      "PRODUCTION_PROJECT",
    ),
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
