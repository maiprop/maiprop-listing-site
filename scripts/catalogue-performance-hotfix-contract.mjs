import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

const APPROVED_MIGRATIONS = [
  {
    version: "20260728120000",
    path: "supabase/migrations/20260728120000_canonicalize_os_auction_identity.sql",
    sha256: "15b9b8be9adb121effbed80449300f834ed638c06c0b54bd0af0d2611760a41a",
  },
  {
    version: "20260728123058",
    path: "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
    sha256: "3faf0f0f40ba318ce071de48828bf514d3d9b4e5f2dde403f3b0e77d3816e369",
  },
  {
    version: "20260729120405",
    path: "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
    sha256: "f20d21b6c1368d0406e607a308ddd68ff1deaaf98a7d2a73927d857ddf7d85aa",
  },
];

const FIXED_LIVE_PAGES_SHA = "db53d1b9adae41edae93fbeb3e612b42dd8fec0b";
const FIXED_TARGETS = {
  staging_project_ref: "xsiehskfgeoqyazcgauv",
  production_project_ref: "qvvicunqcrwpioqnvzxf",
};
const FIXED_LATENCY_CEILINGS_MS = {
  cold_12_card_p95: 1800,
  warm_12_card_p95: 1000,
};
const SHA256 = /^[a-fA-F0-9]{64}$/;
const PROJECT_REF = /^[a-z0-9]{20}$/;

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const object = plainObject(value, label);
  for (const key of Object.keys(object)) {
    if (!expected.includes(key)) {
      throw new Error(`${label} contains unknown manifest field: ${key}.`);
    }
  }
  for (const key of expected) {
    if (!(key in object)) {
      throw new Error(`${label} is missing required field: ${key}.`);
    }
  }
  return object;
}

function canonicalMigrationPath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Migration path must be a non-empty string.");
  }
  if (isAbsolute(value)) {
    throw new Error("Migration path must stay inside supabase/migrations/.");
  }
  const canonical = normalize(value.replaceAll("\\", "/")).replaceAll("\\", "/");
  if (!canonical.startsWith("supabase/migrations/") || canonical.startsWith("../")) {
    throw new Error("Migration path must stay inside supabase/migrations/.");
  }
  if (!canonical.endsWith(".sql")) {
    throw new Error("Migration path must be an SQL migration.");
  }
  return canonical;
}

function exactValue(value, expected, label) {
  if (value !== expected) {
    throw new Error(`${label} does not match the approved hotfix contract.`);
  }
  return value;
}

function safeMigrationContents(contents) {
  if (/\b(?:stripe[_-]?(?:secret|webhook|api)[\w-]*|sk_(?:live|test)_[\w-]+)\b/i.test(contents)) {
    throw new Error("Migration contains a Stripe secret token.");
  }
  if (/\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?|alter\s+table|drop\s+table|create\s+table)\s+(?:[\w\"']+\.)*[\"']?(?:billing|subscription|payment)[\w$]*/i.test(contents)) {
    throw new Error("Migration contains a billing, subscription, or payment table mutation.");
  }
}

export function validateCataloguePerformanceHotfix(root, manifest) {
  const input = exactKeys(manifest, [
    "version",
    "live_pages_sha",
    "targets",
    "latency_ceilings_ms",
    "migrations",
  ], "Manifest");
  exactValue(input.version, 1, "Manifest version");
  exactValue(input.live_pages_sha, FIXED_LIVE_PAGES_SHA, "Live Pages SHA");

  const targets = exactKeys(input.targets, ["staging_project_ref", "production_project_ref"], "Manifest targets");
  for (const [key, expected] of Object.entries(FIXED_TARGETS)) {
    if (!PROJECT_REF.test(targets[key])) {
      throw new Error(`${key} must be a 20-character Supabase project ref.`);
    }
    exactValue(targets[key], expected, key);
  }

  const latency = exactKeys(input.latency_ceilings_ms, ["cold_12_card_p95", "warm_12_card_p95"], "Manifest latency ceilings");
  for (const [key, expected] of Object.entries(FIXED_LATENCY_CEILINGS_MS)) {
    exactValue(latency[key], expected, key);
  }

  if (!Array.isArray(input.migrations) || input.migrations.length !== APPROVED_MIGRATIONS.length) {
    throw new Error("Manifest must contain exactly three approved migrations.");
  }

  const migrationDirectory = resolve(root, "supabase/migrations");
  const seen = new Set();
  const migrations = input.migrations.map((entry, index) => {
    const migration = exactKeys(entry, ["path", "sha256"], `Migration ${index + 1}`);
    const path = canonicalMigrationPath(migration.path);
    if (seen.has(path)) {
      throw new Error(`Duplicate migration path: ${path}.`);
    }
    seen.add(path);

    const approved = APPROVED_MIGRATIONS[index];
    if (path !== approved.path) {
      throw new Error(`Migration path is not an approved migration path: ${path}.`);
    }
    if (typeof migration.sha256 !== "string" || !SHA256.test(migration.sha256)) {
      throw new Error(`Migration ${path} must provide a valid SHA-256 digest.`);
    }
    const sha256 = migration.sha256.toLowerCase();
    if (sha256 !== approved.sha256) {
      throw new Error(`Migration digest mismatch for ${path}.`);
    }

    const file = resolve(root, path);
    const fileRelativeToMigrationDirectory = relative(migrationDirectory, file);
    if (fileRelativeToMigrationDirectory.startsWith("..") || isAbsolute(fileRelativeToMigrationDirectory)) {
      throw new Error(`Migration path must stay inside supabase/migrations/: ${path}.`);
    }
    const contents = readFileSync(file);
    safeMigrationContents(contents.toString("utf8"));
    const actualSha256 = createHash("sha256").update(contents).digest("hex");
    if (actualSha256 !== sha256) {
      throw new Error(`Migration digest mismatch for ${path}.`);
    }

    return { ...approved, path, sha256 };
  });

  return {
    version: input.version,
    livePagesSha: input.live_pages_sha,
    targets: {
      stagingProjectRef: targets.staging_project_ref,
      productionProjectRef: targets.production_project_ref,
    },
    latencyCeilingsMs: {
      cold12CardP95: latency.cold_12_card_p95,
      warm12CardP95: latency.warm_12_card_p95,
    },
    migrations,
  };
}

function verifyCli() {
  const root = resolve(process.cwd());
  const manifest = JSON.parse(readFileSync(resolve(root, "scripts/catalogue-performance-hotfix-manifest.json"), "utf8"));
  return { ok: true, hotfix: validateCataloguePerformanceHotfix(root, manifest) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? process.argv[1])) {
  const [command, format] = process.argv.slice(2);
  if (command !== "verify" || format !== "--json") {
    throw new Error("Usage: node scripts/catalogue-performance-hotfix-contract.mjs verify --json");
  }
  process.stdout.write(`${JSON.stringify(verifyCli())}\n`);
}
