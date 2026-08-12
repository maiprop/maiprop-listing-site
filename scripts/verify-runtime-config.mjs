#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  getCloudflareAccessHeaders,
  getSiteLockCookieHeader,
  getSiteLockPassword,
  mergeHeaders,
} from "./check-production-deploy-site-lock.mjs";
import { fetchReleaseResource } from "./release-http.mjs";
import {
  getCloudflarePagesProductionBindings,
  STRIPE_RUNTIME_BINDINGS,
  validateProductionStripeBindings,
  validateStagingStripeBindings,
} from "./validate-cloudflare-pages-staging-posture.mjs";

const ASSIGNMENT_PREFIX = "window.__MAIPROP_RUNTIME_CONFIG__=";

export function parseRuntimeConfigScript(source) {
  const text = String(source ?? "").trim();
  if (!text.startsWith(ASSIGNMENT_PREFIX) || !text.endsWith(";")) {
    throw new Error("Runtime configuration assignment is missing.");
  }
  const payload = text.slice(ASSIGNMENT_PREFIX.length, -1);
  let config;
  try {
    config = JSON.parse(payload);
  } catch {
    throw new Error("Runtime configuration assignment is not valid JSON.");
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Runtime configuration payload must be an object.");
  }
  return config;
}

function requireExpected(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function runtimeStripeBindings(config) {
  const bindings = {};
  for (const name of STRIPE_RUNTIME_BINDINGS) {
    const value =
      typeof config?.[name] === "string" ? config[name].trim() : "";
    if (value) {
      bindings[name] = { type: "plain_text", value };
    }
  }
  return bindings;
}

function optionalApiPlainTextValue(bindings, name) {
  const binding = bindings?.[name];
  if (binding === undefined || binding === null) return undefined;
  if (binding.type !== "plain_text") {
    throw new Error(
      `API-attested Pages binding ${name} must be plain_text or absent.`,
    );
  }
  const value =
    typeof binding.value === "string" ? binding.value.trim() : "";
  return value || undefined;
}

function validateRuntimeStripeConfig(
  config,
  {
    stagingBindings,
    productionBindings,
  } = {},
) {
  const runtimeBindings = runtimeStripeBindings(config);
  let apiBindingMatch = false;
  if (stagingBindings !== undefined || productionBindings !== undefined) {
    if (!stagingBindings || !productionBindings) {
      throw new Error(
        "Both staging and production Pages bindings are required for API-attested runtime verification.",
      );
    }
    validateStagingStripeBindings(stagingBindings, productionBindings);
    for (const name of STRIPE_RUNTIME_BINDINGS) {
      const expectedValue = optionalApiPlainTextValue(
        stagingBindings,
        name,
      );
      const runtimeValue = runtimeBindings[name]?.value;
      if (runtimeValue !== expectedValue) {
        throw new Error(
          `${name} does not match the API-attested Pages binding.`,
        );
      }
    }
    apiBindingMatch = true;
  }
  return {
    ...validateStagingStripeBindings(
      runtimeBindings,
      productionBindings ?? {},
    ),
    api_binding_match: apiBindingMatch,
  };
}

function validateCoreRuntimeConfig(config, expected, environmentLabel) {
  const checks = {
    VITE_SUPABASE_URL: requireExpected(expected.supabaseUrl, "Supabase URL"),
    VITE_SUPABASE_PROJECT_ID: requireExpected(
      expected.supabaseProjectId,
      "Supabase project ID",
    ),
    VITE_SUPABASE_PUBLISHABLE_KEY: requireExpected(
      expected.supabasePublishableKey,
      "Supabase publishable key",
    ),
    VITE_APP_URL: requireExpected(expected.appUrl, "App URL"),
    VITE_PUBLIC_API_ORIGIN: requireExpected(expected.appUrl, "App URL"),
  };
  for (const [key, value] of Object.entries(checks)) {
    if (config[key] !== value) {
      throw new Error(`${key} does not match the ${environmentLabel} runtime.`);
    }
  }
  return {
    supabase_url: checks.VITE_SUPABASE_URL,
    supabase_project_id: checks.VITE_SUPABASE_PROJECT_ID,
    supabase_publishable_key_sha256: createHash("sha256")
      .update(checks.VITE_SUPABASE_PUBLISHABLE_KEY)
      .digest("hex"),
    app_url: checks.VITE_APP_URL,
    public_api_origin: checks.VITE_PUBLIC_API_ORIGIN,
  };
}

export function validateRuntimeConfig(config, expected, stripeContext) {
  return {
    ...validateCoreRuntimeConfig(config, expected, "isolated staging"),
    stripe_runtime: validateRuntimeStripeConfig(config, stripeContext),
  };
}

export function validateProductionRuntimeConfig(
  config,
  expected,
  productionBindings,
  expectedProductionStripeBindings,
) {
  if (!productionBindings) {
    throw new Error(
      "API-attested production Pages bindings are required.",
    );
  }
  validateProductionStripeBindings(
    productionBindings,
    expectedProductionStripeBindings,
  );
  const runtimeBindings = runtimeStripeBindings(config);
  for (const name of STRIPE_RUNTIME_BINDINGS) {
    const expectedValue = optionalApiPlainTextValue(
      productionBindings,
      name,
    );
    if (runtimeBindings[name]?.value !== expectedValue) {
      throw new Error(
        `${name} does not match the API-attested production Pages binding.`,
      );
    }
  }
  return {
    ...validateCoreRuntimeConfig(config, expected, "production"),
    stripe_runtime: {
      ...validateProductionStripeBindings(
        runtimeBindings,
        expectedProductionStripeBindings,
      ),
      api_binding_match: true,
    },
  };
}

async function fetchRuntimeConfig(baseUrl) {
  const password = getSiteLockPassword();
  const siteLockHeaders = password
    ? { Cookie: await getSiteLockCookieHeader(password) }
    : {};
  const response = await fetchReleaseResource(
    new URL("/runtime-config.js", baseUrl),
    {
      signal: AbortSignal.timeout(30_000),
      headers: mergeHeaders(
        { Accept: "application/javascript", "Cache-Control": "no-cache" },
        getCloudflareAccessHeaders(),
        siteLockHeaders,
      ),
    },
  );
  const source = await response.text();
  if (!response.ok) {
    throw new Error(
      `${baseUrl} runtime config returned HTTP ${response.status}: ${source.slice(0, 200)}`,
    );
  }
  return parseRuntimeConfigScript(source);
}

async function main() {
  const argv = process.argv.slice(2);
  const [
    baseUrl,
    supabaseUrl,
    supabaseProjectId,
    supabasePublishableKey,
    appUrl,
  ] = argv;
  const option = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const stagingProjectFile = option("--staging-project-file");
  const productionProjectFile = option("--production-project-file");
  const environment = option("--environment") ?? "staging";
  if (
    !baseUrl ||
    !supabaseUrl ||
    !supabaseProjectId ||
    !supabasePublishableKey ||
    !appUrl ||
    !stagingProjectFile ||
    !productionProjectFile
  ) {
    throw new Error(
      "Usage: verify-runtime-config.mjs <base-url> <supabase-url> <supabase-project-id> <supabase-publishable-key> <app-url> --staging-project-file <path> --production-project-file <path> [--environment staging|production]",
    );
  }
  const stagingProjectName = requireExpected(
    process.env.STAGING_PROJECT,
    "STAGING_PROJECT",
  );
  const productionProjectName = requireExpected(
    process.env.PRODUCTION_PROJECT,
    "PRODUCTION_PROJECT",
  );
  const stagingProjectId = requireExpected(
    process.env.CLOUDFLARE_STAGING_PAGES_PROJECT_ID,
    "CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
  );
  const productionProjectId = requireExpected(
    process.env.CLOUDFLARE_PAGES_PROJECT_ID,
    "CLOUDFLARE_PAGES_PROJECT_ID",
  );
  const stagingApi = JSON.parse(
    readFileSync(stagingProjectFile, "utf8"),
  );
  const productionApi = JSON.parse(
    readFileSync(productionProjectFile, "utf8"),
  );
  const config = await fetchRuntimeConfig(baseUrl);
  const expected = {
    supabaseUrl,
    supabaseProjectId,
    supabasePublishableKey,
    appUrl,
  };
  const stagingBindings = getCloudflarePagesProductionBindings(
    stagingApi,
    stagingProjectName,
    stagingProjectId,
  );
  const productionBindings = getCloudflarePagesProductionBindings(
    productionApi,
    productionProjectName,
    productionProjectId,
  );
  const evidence = environment === "production"
    ? validateProductionRuntimeConfig(
        config,
        expected,
        productionBindings,
        Object.fromEntries(
          STRIPE_RUNTIME_BINDINGS.map((name) => [
            name,
            requireExpected(process.env[name], name),
          ]),
        ),
      )
    : validateRuntimeConfig(config, expected, {
        stagingBindings,
        productionBindings,
      });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
