/**
 * Migration idempotency lint.
 *
 * Enforces that NEW migrations (created at or after BASELINE_TIMESTAMP) use
 * idempotent SQL patterns so that fresh-DB rebuilds, restores, and re-runs are
 * safe. Historical migrations are intentionally exempted — modifying them after
 * they were applied to production risks hash mismatches in
 * `supabase_migrations.schema_migrations` and offers low value (the existing
 * migrations-validate CI job already proves first-apply success on a fresh DB).
 *
 * Rules enforced on new migrations:
 *   - CREATE TABLE              -> must include IF NOT EXISTS
 *   - CREATE INDEX              -> must include IF NOT EXISTS
 *   - CREATE UNIQUE INDEX       -> must include IF NOT EXISTS
 *   - CREATE TRIGGER            -> must be preceded by DROP TRIGGER IF EXISTS
 *                                  (or use CREATE OR REPLACE TRIGGER on PG14+)
 *   - CREATE POLICY             -> must be preceded by DROP POLICY IF EXISTS
 *   - CREATE TYPE               -> must be wrapped in a DO block guarded by
 *                                  IF NOT EXISTS lookup against pg_type
 *   - CREATE FUNCTION/VIEW      -> must use OR REPLACE
 *
 * Usage:
 *   node scripts/check-migration-idempotency.mjs
 *
 * Exit codes:
 *   0 — all new migrations are idempotent
 *   1 — at least one violation found
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MIGRATIONS_DIR = "supabase/migrations";
const DEFAULT_FUTURE_GRACE_DAYS = 1;
const APPLIED_FUTURE_MIGRATIONS_FILE = "scripts/applied-future-migrations.json";

// Forward-only enforcement. Anything stamped at or after this timestamp must
// satisfy the rules below; older migrations are out of scope (already applied
// to production — modifying them would change file hashes).
//
// Bump this after a clean CI run if you want to lock in a new baseline.
export const BASELINE_TIMESTAMP = "20260628000000";

/** @typedef {{ file: string; line: number; rule: string; snippet: string }} Violation */

/**
 * Check a single migration file's contents and return any violations.
 * Exported for unit testing.
 *
 * @param {string} file Filename (basename, used in error messages).
 * @param {string} sql  Full migration SQL.
 * @returns {Violation[]}
 */
export function lintMigration(file, sql) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = sql.split(/\r?\n/);

  // Strip block comments and line comments (very simple — sufficient for
  // matching at the start of a statement). This is best-effort; SQL doesn't
  // have nested comments in our codebase.
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");

  /**
   * Helper: scan for matches of a regex over the original `lines` so we can
   * report meaningful line numbers, but only count it as a violation if the
   * match is also present in `stripped` (i.e. not inside a comment).
   */
  const findLine = (pattern) => {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) return i + 1;
    }
    return -1;
  };

  // ---- CREATE TABLE -------------------------------------------------------
  const createTableRe = /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/im;
  if (createTableRe.test(stripped)) {
    violations.push({
      file,
      line: findLine(createTableRe),
      rule: "CREATE TABLE without IF NOT EXISTS",
      snippet: "Use `CREATE TABLE IF NOT EXISTS <name>` so re-applies are no-ops.",
    });
  }

  // ---- CREATE INDEX (covers UNIQUE INDEX too) -----------------------------
  const createIndexRe = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/im;
  if (createIndexRe.test(stripped)) {
    violations.push({
      file,
      line: findLine(createIndexRe),
      rule: "CREATE INDEX without IF NOT EXISTS",
      snippet: "Use `CREATE [UNIQUE] INDEX IF NOT EXISTS <name> ON ...`.",
    });
  }

  // ---- CREATE TRIGGER -----------------------------------------------------
  // Allow either CREATE OR REPLACE TRIGGER (PG14+) or a preceding
  // DROP TRIGGER IF EXISTS for the same trigger name.
  const createTriggerRe = /^\s*CREATE\s+TRIGGER\s+(\w+)/gim;
  let triggerMatch;
  while ((triggerMatch = createTriggerRe.exec(stripped)) !== null) {
    const name = triggerMatch[1];
    const before = stripped.slice(0, triggerMatch.index);
    const isReplace = /CREATE\s+OR\s+REPLACE\s+TRIGGER\s+/i.test(
      stripped.slice(Math.max(0, triggerMatch.index - 40), triggerMatch.index + 40),
    );
    const dropRe = new RegExp(`DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+${name}\\b`, "i");
    if (!isReplace && !dropRe.test(before)) {
      violations.push({
        file,
        line: findLine(new RegExp(`^\\s*CREATE\\s+TRIGGER\\s+${name}\\b`, "im")),
        rule: `CREATE TRIGGER ${name} without preceding DROP TRIGGER IF EXISTS`,
        snippet: `Add \`DROP TRIGGER IF EXISTS ${name} ON <table>;\` before the CREATE.`,
      });
    }
  }

  // ---- CREATE POLICY ------------------------------------------------------
  // Must be preceded by a DROP POLICY IF EXISTS for the same name on the
  // same table. We require *some* DROP POLICY IF EXISTS earlier in the file
  // referencing the same policy name (table match is best-effort).
  const createPolicyRe = /^\s*CREATE\s+POLICY\s+"?([\w_-]+)"?/gim;
  let policyMatch;
  while ((policyMatch = createPolicyRe.exec(stripped)) !== null) {
    const name = policyMatch[1];
    const before = stripped.slice(0, policyMatch.index);
    const dropRe = new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"?${name}"?`, "i");
    if (!dropRe.test(before)) {
      violations.push({
        file,
        line: findLine(new RegExp(`^\\s*CREATE\\s+POLICY\\s+"?${name}"?`, "im")),
        rule: `CREATE POLICY "${name}" without preceding DROP POLICY IF EXISTS`,
        snippet: `Add \`DROP POLICY IF EXISTS "${name}" ON <table>;\` before the CREATE.`,
      });
    }
  }

  // ---- CREATE TYPE --------------------------------------------------------
  // Postgres < 16 has no IF NOT EXISTS for CREATE TYPE. We require a DO block
  // guard checking pg_type (or pg_enum for ALTER TYPE ... ADD VALUE).
  const createTypeRe = /^\s*CREATE\s+TYPE\s+(\w+)/gim;
  let typeMatch;
  while ((typeMatch = createTypeRe.exec(stripped)) !== null) {
    const name = typeMatch[1];
    const before = stripped.slice(Math.max(0, typeMatch.index - 400), typeMatch.index);
    const guarded = /DO\s+\$\$/i.test(before) && /pg_type/i.test(before);
    if (!guarded) {
      violations.push({
        file,
        line: findLine(new RegExp(`^\\s*CREATE\\s+TYPE\\s+${name}\\b`, "im")),
        rule: `CREATE TYPE ${name} not wrapped in a pg_type IF NOT EXISTS guard`,
        snippet:
          "Wrap in `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='" +
          name +
          "') THEN CREATE TYPE ... END IF; END $$;`",
      });
    }
  }

  // ---- CREATE FUNCTION / VIEW (low-cost: enforce OR REPLACE) --------------
  const createFnRe = /^\s*CREATE\s+(?!OR\s+REPLACE\b)FUNCTION\b/im;
  if (createFnRe.test(stripped)) {
    violations.push({
      file,
      line: findLine(createFnRe),
      rule: "CREATE FUNCTION without OR REPLACE",
      snippet: "Use `CREATE OR REPLACE FUNCTION ...`.",
    });
  }
  const createViewRe = /^\s*CREATE\s+(?!OR\s+REPLACE\b)(?:MATERIALIZED\s+)?VIEW\b/im;
  if (createViewRe.test(stripped)) {
    violations.push({
      file,
      line: findLine(createViewRe),
      rule: "CREATE VIEW without OR REPLACE",
      snippet: "Use `CREATE OR REPLACE VIEW ...` (or `DROP VIEW IF EXISTS` for materialized views).",
    });
  }

  return violations;
}

/**
 * Returns true if a migration file's name (timestamp prefix) is at or after
 * the configured BASELINE_TIMESTAMP. Files without a 14-digit prefix are
 * considered out-of-scope.
 */
export function isInScope(filename, baseline = BASELINE_TIMESTAMP) {
  const m = /^(\d{14})/.exec(filename);
  if (!m) return false;
  return m[1] >= baseline;
}

function toMigrationTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

/**
 * Check migration filenames for duplicate timestamps and future-dated prefixes.
 *
 * @param {string[]} files Basenames or paths to migration files.
 * @param {{ now?: Date; futureGraceDays?: number }} options
 * @returns {Violation[]}
 */
export function lintMigrationChronology(
  files,
  {
    now = new Date(),
    futureGraceDays = DEFAULT_FUTURE_GRACE_DAYS,
    appliedFutureVersions = [],
  } = {},
) {
  /** @type {Violation[]} */
  const violations = [];
  const maxAllowed = new Date(now);
  maxAllowed.setUTCDate(maxAllowed.getUTCDate() + futureGraceDays);
  const maxAllowedTimestamp = toMigrationTimestamp(maxAllowed);
  const seen = new Map();
  const appliedFutureSet = new Set(appliedFutureVersions);

  for (const file of files.filter((f) => f.endsWith(".sql")).sort()) {
    const name = basename(file);
    const match = /^(\d{14})_/.exec(name);
    if (!match) {
      violations.push({
        file: name,
        line: 1,
        rule: "Migration filename missing 14-digit timestamp prefix",
        snippet: "Use `<YYYYMMDDHHMMSS>_<description>.sql`.",
      });
      continue;
    }

    const timestamp = match[1];
    const previous = seen.get(timestamp);
    if (previous) {
      violations.push({
        file: name,
        line: 1,
        rule: `Duplicate migration timestamp ${timestamp}`,
        snippet: `Use a unique timestamp; ${previous} already has this prefix.`,
      });
    }
    seen.set(timestamp, name);

    if (timestamp > maxAllowedTimestamp && !appliedFutureSet.has(timestamp)) {
      violations.push({
        file: name,
        line: 1,
        rule: `Future-dated migration timestamp ${timestamp}`,
        snippet: `Migration timestamps must not be later than ${maxAllowedTimestamp} UTC.`,
      });
    }
  }

  return violations;
}

export function loadAppliedFutureVersions(file = APPLIED_FUTURE_MIGRATIONS_FILE) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error(`${file} must be a JSON array of migration timestamp strings`);
  }
  return parsed;
}

/**
 * Every live-applied future migration that is allowlisted must still have a
 * source-controlled SQL file. The allowlist explains chronology; it is not a
 * substitute for release traceability.
 *
 * @param {string[]} files Basenames or paths to migration files.
 * @param {string[]} appliedFutureVersions
 * @returns {Violation[]}
 */
export function lintAppliedFutureSources(files, appliedFutureVersions = []) {
  const present = new Set(
    files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => /^(\d{14})_/.exec(basename(f))?.[1])
      .filter(Boolean),
  );

  return appliedFutureVersions
    .filter((version) => !present.has(version))
    .map((version) => ({
      file: APPLIED_FUTURE_MIGRATIONS_FILE,
      line: 1,
      rule: `Applied future migration ${version} has no source SQL file`,
      snippet: `Add supabase/migrations/${version}_<description>.sql or remove the version from the allowlist after proving it is not applied remotely.`,
    }));
}

/**
 * Programmatic entry point — exported for tests.
 * @returns {{ scanned: number; violations: Violation[]; chronologyViolations: Violation[] }}
 */
export function run({
  dir = MIGRATIONS_DIR,
  baseline = BASELINE_TIMESTAMP,
  checkChronology = false,
  now = new Date(),
  appliedFutureVersions = loadAppliedFutureVersions(),
} = {}) {
  const allFiles = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const files = allFiles.filter((f) => isInScope(f, baseline));

  /** @type {Violation[]} */
  const violations = [];
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    violations.push(...lintMigration(basename(f), sql));
  }
  const chronologyViolations = checkChronology
    ? lintMigrationChronology(allFiles, { now, appliedFutureVersions })
    : [];
  const appliedFutureSourceViolations = checkChronology
    ? lintAppliedFutureSources(allFiles, appliedFutureVersions)
    : [];
  return {
    scanned: files.length,
    violations,
    chronologyViolations,
    appliedFutureSourceViolations,
  };
}

// CLI entry — only when invoked directly, not on import.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const checkChronology = process.argv.includes("--check-chronology");
  const { scanned, violations, chronologyViolations, appliedFutureSourceViolations } = run({
    checkChronology,
  });
  const allViolations = [
    ...chronologyViolations,
    ...appliedFutureSourceViolations,
    ...violations,
  ];
  if (allViolations.length === 0) {
    console.log(
      `[migration-idempotency] OK — ${scanned} new migration(s) inspected, no violations.`,
    );
    process.exit(0);
  }
  console.error(
    `[migration-idempotency] FAIL — ${allViolations.length} violation(s) in ${scanned} new migration(s):\n`,
  );
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  ${v.rule}`);
    console.error(`    ↳ ${v.snippet}`);
  }
  process.exit(1);
}
