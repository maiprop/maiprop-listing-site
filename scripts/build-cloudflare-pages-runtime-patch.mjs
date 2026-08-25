import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const COMPATIBILITY_DATE = "2026-05-19";

const BASE_PLAIN_TEXT_BINDINGS = [
  "SUPABASE_URL",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_APP_URL",
  "VITE_PUBLIC_API_ORIGIN",
  "VITE_APP_ENVIRONMENT",
  "MAIPROP_TURN_TTL_SECONDS",
];

const STRIPE_BINDINGS = [
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_RUNTIME_MODE",
  "VITE_BILLING_MODE",
  "VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY",
  "VITE_STRIPE_PRICE_PARTICIPANT_ANNUAL",
  "VITE_STRIPE_PRICE_AGENT_MONTHLY",
  "VITE_STRIPE_PRICE_AGENT_ANNUAL",
  "VITE_STRIPE_PRICE_DEVELOPER_MONTHLY",
  "VITE_STRIPE_PRICE_DEVELOPER_ANNUAL",
  "VITE_STRIPE_PRICE_PROFESSIONAL_MONTHLY",
  "VITE_STRIPE_PRICE_PROFESSIONAL_ANNUAL",
];

const REQUIRED_SECRETS = {
  staging: [
    "SUPABASE_SERVICE_ROLE_KEY",
    "CLOUDFLARE_TURN_KEY_ID",
    "CLOUDFLARE_TURN_API_TOKEN",
  ],
  production: ["CLOUDFLARE_TURN_KEY_ID", "CLOUDFLARE_TURN_API_TOKEN"],
};

const OPTIONAL_SECRETS = new Set(["SITE_LOCK_PASSWORD"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredPlainTextNames(target) {
  return target === "production"
    ? [...BASE_PLAIN_TEXT_BINDINGS, ...STRIPE_BINDINGS]
    : [...BASE_PLAIN_TEXT_BINDINGS];
}

function currentBindings(currentProject) {
  const bindings =
    currentProject?.result?.deployment_configs?.production?.env_vars;
  assert(
    bindings && typeof bindings === "object" && !Array.isArray(bindings),
    "Current Cloudflare Pages production bindings are missing or invalid.",
  );
  return bindings;
}

function validatePlainTextValues(target, values) {
  const names = requiredPlainTextNames(target);
  assert(
    values && typeof values === "object" && !Array.isArray(values),
    "Plain-text runtime values are missing or invalid.",
  );
  for (const name of names) {
    assert(
      typeof values[name] === "string" && values[name].trim().length > 0,
      `Required ${target} plain-text binding ${name} is missing.`,
    );
  }
  for (const name of Object.keys(values)) {
    assert(
      names.includes(name),
      `Unexpected ${target} plain-text binding ${name}.`,
    );
  }
  assert(
    values.VITE_APP_ENVIRONMENT === target,
    `VITE_APP_ENVIRONMENT must equal ${target}.`,
  );
  assert(
    values.MAIPROP_TURN_TTL_SECONDS === "21600",
    "MAIPROP_TURN_TTL_SECONDS must equal 21600.",
  );
  if (target === "production") {
    assert(
      values.VITE_STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_"),
      "Production Stripe publishable key must use pk_live_*.",
    );
    assert(
      values.VITE_STRIPE_RUNTIME_MODE === "live",
      "VITE_STRIPE_RUNTIME_MODE must equal live.",
    );
    assert(
      values.VITE_BILLING_MODE === "live",
      "VITE_BILLING_MODE must equal live.",
    );
    const prices = STRIPE_BINDINGS.filter((name) => name.includes("PRICE_"))
      .map((name) => values[name]);
    assert(
      prices.every((value) => value.startsWith("price_")),
      "Production Stripe price bindings must use price_* IDs.",
    );
    assert(
      new Set(prices).size === prices.length,
      "Production Stripe price bindings must be unique.",
    );
  }
  return names;
}

export function buildPagesRuntimePatch({
  target,
  currentProject,
  plainTextValues,
  secretValues = {},
}) {
  assert(
    target === "staging" || target === "production",
    "Target must be staging or production.",
  );
  const bindings = currentBindings(currentProject);
  const plainTextNames = validatePlainTextValues(target, plainTextValues);
  const requiredSecrets = REQUIRED_SECRETS[target];

  for (const [name, value] of Object.entries(secretValues)) {
    assert(
      requiredSecrets.includes(name),
      `Unexpected ${target} replacement secret ${name}.`,
    );
    assert(
      typeof value === "string" && value.length > 0,
      `Replacement secret ${name} is empty.`,
    );
  }

  const envVars = Object.fromEntries(
    plainTextNames.map((name) => [
      name,
      { type: "plain_text", value: plainTextValues[name] },
    ]),
  );
  const setSecrets = [];
  const preservedSecrets = [];

  for (const name of requiredSecrets) {
    const replacement = secretValues[name];
    if (replacement) {
      envVars[name] = { type: "secret_text", value: replacement };
      setSecrets.push(name);
      continue;
    }
    assert(
      bindings[name]?.type === "secret_text",
      `Required ${target} secret binding ${name} is not provisioned.`,
    );
    preservedSecrets.push(name);
  }

  const deletedBindings = [];
  for (const [name, binding] of Object.entries(bindings)) {
    if (plainTextNames.includes(name) || requiredSecrets.includes(name)) {
      continue;
    }
    if (OPTIONAL_SECRETS.has(name)) {
      assert(
        binding?.type === "secret_text",
        `Optional secret binding ${name} has the wrong type.`,
      );
      preservedSecrets.push(name);
      continue;
    }
    assert(
      binding?.type !== "secret_text",
      `Refusing to delete unexpected secret binding ${name}.`,
    );
    envVars[name] = null;
    deletedBindings.push(name);
  }

  return {
    patch: {
      deployment_configs: {
        production: {
          compatibility_date: COMPATIBILITY_DATE,
          env_vars: envVars,
        },
      },
    },
    evidence: {
      schema_version: 1,
      evidence_type: "cloudflare-pages-runtime-patch-plan",
      target,
      compatibility_date: COMPATIBILITY_DATE,
      plain_text_bindings: [...plainTextNames].sort(),
      secret_text_bindings: [...setSecrets].sort(),
      preserved_secret_bindings: [...new Set(preservedSecrets)].sort(),
      deleted_bindings: deletedBindings.sort(),
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) continue;
    args[name.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function requiredArg(value, name) {
  assert(typeof value === "string" && value.length > 0, `${name} is required.`);
  return value;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const target = requiredArg(args.target, "--target");
  const currentProjectPath = requiredArg(args.current, "--current");
  const outputPath = requiredArg(args.out, "--out");
  const evidencePath = requiredArg(args.evidence, "--evidence");
  const plainTextValues = JSON.parse(
    requiredArg(
      process.env.PAGES_RUNTIME_PLAIN_TEXT_JSON,
      "PAGES_RUNTIME_PLAIN_TEXT_JSON",
    ),
  );
  const secretValues = Object.fromEntries(
    [
      [
        "SUPABASE_SERVICE_ROLE_KEY",
        process.env.PAGES_RUNTIME_SUPABASE_SERVICE_ROLE_KEY,
      ],
      ["CLOUDFLARE_TURN_KEY_ID", process.env.PAGES_RUNTIME_TURN_KEY_ID],
      [
        "CLOUDFLARE_TURN_API_TOKEN",
        process.env.PAGES_RUNTIME_TURN_API_TOKEN,
      ],
    ].filter(([, value]) => typeof value === "string" && value.length > 0),
  );
  const result = buildPagesRuntimePatch({
    target,
    currentProject: JSON.parse(readFileSync(currentProjectPath, "utf8")),
    plainTextValues,
    secretValues,
  });
  writeFileSync(outputPath, `${JSON.stringify(result.patch)}\n`, {
    mode: 0o600,
  });
  writeFileSync(evidencePath, `${JSON.stringify(result.evidence, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
