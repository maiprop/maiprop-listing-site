import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
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
