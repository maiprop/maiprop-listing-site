import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

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

const requiredFiles = [
  {
    path: "src/lib/mutationSchemas.ts",
    markers: [
      "from \"zod\"",
      "parseMutationInput",
      "savedSearchCreateSchema",
      "contactSubmissionInputSchema",
      "favoriteToggleSchema",
      "leadCreateSchema",
      "contactCreateSchema",
      "listingWriteSchema",
      "pricingConfigRowsSchema",
      "aiSearchBodySchema",
      "adminFiresaleActionBodySchema",
      "agentDataInputActionBodySchema",
      "submitFiresaleInterestBodySchema",
    ],
  },
  {
    path: "src/hooks/useSavedSearches.ts",
    markers: [
      "parseMutationInput",
      "savedSearchCreateSchema",
      "savedSearchIdSchema",
      "savedSearchAlertToggleSchema",
    ],
  },
  {
    path: "src/hooks/useContactSubmissions.ts",
    markers: [
      "parseMutationInput",
      "contactSubmissionInputSchema",
    ],
  },
  {
    path: "supabase/functions/_shared/schema.ts",
    markers: [
      "npm:zod",
      "parseJsonBody",
      "SchemaValidationError",
    ],
  },
  {
    path: "supabase/functions/open-house-registration/index.ts",
    markers: [
      "parseJsonBody",
      "registrationRequestSchema",
      "z.object",
    ],
  },
  {
    path: "supabase/functions/admin-pricing-config/index.ts",
    markers: [
      "parseJsonBody",
      "adminPricingActionSchema",
      "pricing_configs",
      "Platform admin only",
    ],
  },
  {
    path: "supabase/functions/create-stripe-price/index.ts",
    markers: [
      "parseJsonBody",
      "createStripePriceBodySchema",
      "SchemaValidationError",
      "pricing_configs",
    ],
  },
  {
    path: "supabase/functions/sync-stripe-pricing/index.ts",
    markers: [
      "parseJsonBody",
      "syncStripePricingBodySchema",
      "SchemaValidationError",
      "pricing_configs",
    ],
  },
  {
    path: "src/pages/AdminPricing.tsx",
    markers: [
      "parseMutationInput",
      "pricingConfigRowsSchema",
      "admin-pricing-config",
      "invokeAdminPricingConfig",
    ],
  },
];

const MUTATION_RE = /\.from\([^)]*\)[\s\S]{0,250}\.(?:insert|update|upsert|delete)\s*\(/m;
const REACT_QUERY_MUTATION_RE = /\buseMutation(?:\s*<|\s*\()/m;
const ignoredDirs = new Set(["node_modules", "dist", "coverage", ".git", ".next", "public"]);

const walkSourceFiles = (root, relativeDir) => {
  const absoluteDir = join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const files = [];
  for (const entry of readdirSync(absoluteDir)) {
    if (ignoredDirs.has(entry)) continue;
    const relativePath = `${relativeDir}/${entry}`.replace(/\\/g, "/");
    const absolutePath = join(root, relativePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(root, relativePath));
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry)) continue;
    if (/\/test\//.test(relativePath) || /\.test\./.test(entry) || /\.spec\./.test(entry)) continue;
    files.push(relativePath);
  }
  return files;
};

const checkBrowserMutationFiles = (root, failures) => {
  for (const relativePath of walkSourceFiles(root, "src")) {
    const text = readText(root, relativePath);
    if (!text) continue;
    if (MUTATION_RE.test(text) && !text.includes("parseMutationInput")) {
      failures.push(`${relativePath} has a direct Supabase table mutation without schema parsing`);
    }
    if (REACT_QUERY_MUTATION_RE.test(text) && !text.includes("parseMutationInput")) {
      failures.push(`${relativePath} has a React Query mutation without schema parsing`);
    }
  }
};

const walkEdgeFunctionIndexes = (root) => {
  const relativeDir = "supabase/functions";
  const absoluteDir = join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const files = [];
  for (const entry of readdirSync(absoluteDir)) {
    if (entry.startsWith("_")) continue;
    const relativePath = `${relativeDir}/${entry}/index.ts`;
    const absolutePath = join(root, relativePath);
    if (existsSync(absolutePath)) files.push({ function: entry, relativePath });
  }
  return files.sort((a, b) => a.function.localeCompare(b.function));
};

const scanRawEdgeRequestBodies = (root) => {
  const rawBodies = [];
  for (const file of walkEdgeFunctionIndexes(root)) {
    const text = readText(root, file.relativePath) ?? "";
    const hasRawJsonBody = /\breq\.json\s*\(/.test(text) || /JSON\.parse\(\s*rawBody\s*\)/.test(text);
    if (!hasRawJsonBody || text.includes("parseJsonBody(")) continue;
    rawBodies.push(file);
  }
  return rawBodies;
};

const checkEdgeFunctionRawBodyInventory = (root, failures) => {
  const inventory = readJson(root, "docs/governance/edge-function-request-boundaries.json", failures);
  if (!inventory) return;

  const validStyles = new Set([
    "typed-manual-guards",
    "ai-payload-normalized",
    "webhook-signature-verified",
    "admin-only-guarded",
    "provider-contract-guarded",
  ]);
  const validOwners = new Set(["app-web", "shared-ui", "domain", "data-access"]);
  const rawBodies = scanRawEdgeRequestBodies(root);
  const used = new Set(rawBodies.map((entry) => entry.function));
  const reviewed = new Map();

  for (const entry of inventory.reviewedRawJsonBodies ?? []) {
    if (typeof entry.function !== "string" || entry.function.trim().length === 0) {
      failures.push("edge-function-request-boundaries entries must include function");
      continue;
    }
    reviewed.set(entry.function, entry);
  }

  for (const rawBody of rawBodies) {
    if (!reviewed.has(rawBody.function)) {
      failures.push(`${rawBody.relativePath} reads a raw request body without edge-function request-boundary evidence`);
    }
  }

  for (const [functionName, entry] of reviewed) {
    if (!used.has(functionName)) {
      failures.push(`edge-function request-boundary evidence points to unused raw request body: ${functionName}`);
    }
    if (!validStyles.has(entry.validationStyle)) {
      failures.push(`${functionName} edge-function request-boundary evidence has unsupported validationStyle`);
    }
    if (!validOwners.has(entry.owner)) {
      failures.push(`${functionName} edge-function request-boundary owner must map to a repository boundary`);
    }
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 30) {
      failures.push(`${functionName} edge-function request-boundary evidence needs a concrete rationale`);
    }
    if (typeof entry.reviewBy !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewBy)) {
      failures.push(`${functionName} edge-function request-boundary evidence must include reviewBy as YYYY-MM-DD`);
    }
  }
};

export function checkMutationValidationContract(root = process.cwd()) {
  const failures = [];

  for (const file of requiredFiles) {
    const text = readText(root, file.path);
    if (text === null) {
      failures.push(`${file.path} is missing`);
      continue;
    }
    for (const marker of file.markers) {
      if (!text.includes(marker)) failures.push(`${file.path} must mention ${marker}`);
    }
  }

  checkBrowserMutationFiles(root, failures);
  checkEdgeFunctionRawBodyInventory(root, failures);

  return result(failures);
}

const main = () => {
  const check = checkMutationValidationContract(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Mutation validation contract OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-mutation-validation-contract.mjs")
) {
  main();
}
