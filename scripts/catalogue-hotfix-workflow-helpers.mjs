import { readFileSync, writeFileSync } from "node:fs";

const PRODUCTION_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_REF = "xsiehskfgeoqyazcgauv";
const VERSION = /^\d{14}$/;

function fail(message) {
  throw new Error(message);
}

function validateKey(key, ref) {
  if (/(service_role|service|secret|sb_secret|sk_)/i.test(key)) {
    fail("A service or secret key is not permitted for catalogue verification.");
  }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  const parts = key.split(".");
  if (parts.length !== 3) fail("A publishable or anonymous key is required.");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    fail("Anonymous key payload is not parseable.");
  }
  if (payload.role !== "anon" || (payload.ref !== undefined && payload.ref !== ref)) {
    fail("Anonymous key role/ref is not approved for this project.");
  }
}

export function validateTarget({ kind, ref, apiUrl, databaseUrl, key }) {
  if (!ref || !apiUrl || !databaseUrl || !key) fail("Target credentials are incomplete.");
  if ((kind === "staging" && ref !== STAGING_REF) ||
      (kind === "production" && ref !== PRODUCTION_REF)) {
    fail("Target kind does not match the manifest-bound project ref.");
  }
  const api = new URL(apiUrl);
  if (api.protocol !== "https:" || api.hostname !== `${ref}.supabase.co` || api.port ||
      api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
    fail("API URL is not the exact HTTPS project origin.");
  }
  const db = new URL(databaseUrl);
  const username = decodeURIComponent(db.username);
  const direct = db.hostname === `db.${ref}.supabase.co` && username === "postgres" && db.port === "5432";
  const pooler = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(db.hostname) &&
    username === `postgres.${ref}` && ["5432", "6543"].includes(db.port);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== "/postgres" ||
      !db.password || !(direct || pooler) || db.searchParams.getAll("sslmode").length !== 1 ||
      db.searchParams.get("sslmode") !== "require") {
    fail("Database URL is not an exact TLS-required Supabase target.");
  }
  validateKey(key, ref);
}

export function validateDryRun({ contract, remoteHistory, output }) {
  if (!output.trim() || !/(?:migration|push|pending|\d{14})/i.test(output)) {
    fail("Dry-run output is empty or unrecognized.");
  }
  const remote = new Set(remoteHistory.trim().split(/\s+/).filter(Boolean));
  const expected_pending_versions = contract.hotfix.migrations
    .map((migration) => migration.version)
    .filter((version) => !remote.has(version))
    .sort();
  const pending_versions = [...new Set([...output.matchAll(/\b(\d{14})\b/g)].map((match) => match[1]))].sort();
  if (pending_versions.some((version) => !VERSION.test(version)) ||
      JSON.stringify(pending_versions) !== JSON.stringify(expected_pending_versions)) {
    fail("Dry-run pending versions differ from approved versions missing remotely.");
  }
  return { expected_pending_versions, pending_versions };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "validate-target") {
    validateTarget({ kind: process.env.TARGET_KIND, ref: process.env.TARGET_PROJECT_REF, apiUrl: process.env.TARGET_API_URL, databaseUrl: process.env.TARGET_DB_URL, key: process.env.TARGET_ANON_KEY });
    return;
  }
  if (command === "validate-dry-run") {
    const [contractPath, historyPath, outputPath, evidencePath] = args;
    const result = validateDryRun({ contract: JSON.parse(readFileSync(contractPath, "utf8")), remoteHistory: readFileSync(historyPath, "utf8"), output: readFileSync(outputPath, "utf8") });
    writeFileSync(evidencePath, JSON.stringify({ target_kind: process.env.TARGET_KIND, ...result }, null, 2) + "\n");
    return;
  }
  fail("Usage: validate-target | validate-dry-run <contract> <history> <output> <evidence>");
}

if (process.argv[1]?.endsWith("catalogue-hotfix-workflow-helpers.mjs")) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
