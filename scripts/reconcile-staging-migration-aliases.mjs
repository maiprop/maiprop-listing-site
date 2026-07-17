import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^\d{14}$/;
const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

export const LEGACY_STAGING_VERSIONS = new Set([
  "20260614083000",
  "20260614090000",
  "20260614153000",
  "20260614154000",
  "20260714114032",
  "20260714114358",
  "20260714120414",
  "20260714124912",
  "20260714162345",
  "20260714162407",
  "20260714164244",
  "20260714164246",
  "20260714164249",
  "20260714164250",
  "20260714164252",
  "20260714164254",
  "20260714173841",
  "20260714173858",
]);

export const STAGING_REPAIR_NAME_ALIASES = new Map([
  ["repair_deleted_listing_promotion_audit_detach", "preserve_deleted_listing_promotion_audit"],
  ["repair_investor_feed_admin_helper", "harden_investor_feed_grants"],
  ["authorize_typing_broadcast_presence_extensions", "authorize_typing_presence_channels"],
]);

export const STAGING_VERSION_NAME_ALIASES = new Map([
  ["20260628203708", {
    remoteName: "reconcile_remote_migration_history",
    canonicalName: "fix_ai_addon_credit_reservation",
  }],
]);

function assertVersion(version, source) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`${source} migration version must be a 14-digit timestamp: ${version}`);
  }
}

export function buildLocalMigrationIndex(migrations) {
  const byVersion = new Map();
  const byName = new Map();

  for (const migration of migrations) {
    assertVersion(migration.version, "Local");
    if (!migration.name) throw new Error(`Local migration ${migration.version} has no name`);
    if (byVersion.has(migration.version)) {
      throw new Error(`Duplicate canonical migration version: ${migration.version}`);
    }
    byVersion.set(migration.version, migration);
    const migrationsWithName = byName.get(migration.name) ?? [];
    migrationsWithName.push(migration);
    byName.set(migration.name, migrationsWithName);
  }

  return { byVersion, byName };
}

export function readLocalMigrations(root = process.cwd()) {
  const migrationDirectory = resolve(root, "supabase", "migrations");
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      return match ? { version: match[1], name: match[2] } : null;
    })
    .filter(Boolean);

  return buildLocalMigrationIndex(migrations);
}

export function parseRemoteMigrationRows(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [version = "", name = ""] = line.split("\t", 2);
      assertVersion(version, "Remote");
      return { version, name };
    });
}

export function findStagingMigrationAliases({
  localIndex,
  remoteMigrations,
  legacyVersions = LEGACY_STAGING_VERSIONS,
  repairNameAliases = STAGING_REPAIR_NAME_ALIASES,
  versionNameAliases = STAGING_VERSION_NAME_ALIASES,
}) {
  const versionsToRevert = new Set();
  const reasons = new Map();
  const unknownRemoteMigrations = [];

  for (const remote of remoteMigrations) {
    assertVersion(remote.version, "Remote");
    const canonicalAtVersion = localIndex.byVersion.get(remote.version);
    if (canonicalAtVersion) {
      if (remote.name && canonicalAtVersion.name !== remote.name) {
        const documentedAlias = versionNameAliases.get(remote.version);
        if (
          documentedAlias?.remoteName === remote.name
          && documentedAlias.canonicalName === canonicalAtVersion.name
        ) {
          versionsToRevert.add(remote.version);
          reasons.set(
            remote.version,
            `documented same-version staging alias of ${remote.version}_${canonicalAtVersion.name}`,
          );
          continue;
        }
        throw new Error(
          `Remote migration ${remote.version} is named ${remote.name}, ` +
          `but the canonical local migration is ${canonicalAtVersion.name}`,
        );
      }
      continue;
    }

    if (legacyVersions.has(remote.version)) {
      versionsToRevert.add(remote.version);
      reasons.set(remote.version, "documented legacy staging version");
      continue;
    }

    const canonicalByExactNameCandidates = remote.name
      ? localIndex.byName.get(remote.name)
      : [];
    const canonicalByExactName = canonicalByExactNameCandidates?.length === 1
      ? canonicalByExactNameCandidates[0]
      : undefined;
    if (canonicalByExactName) {
      versionsToRevert.add(remote.version);
      reasons.set(
        remote.version,
        `exact-name alias of ${canonicalByExactName.version}_${canonicalByExactName.name}`,
      );
      continue;
    }

    const canonicalRepairName = repairNameAliases.get(remote.name);
    const canonicalRepairCandidates = canonicalRepairName
      ? localIndex.byName.get(canonicalRepairName)
      : [];
    const canonicalRepair = canonicalRepairCandidates?.length === 1
      ? canonicalRepairCandidates[0]
      : undefined;
    if (canonicalRepair) {
      versionsToRevert.add(remote.version);
      reasons.set(
        remote.version,
        `documented repair folded into ${canonicalRepair.version}_${canonicalRepair.name}`,
      );
      continue;
    }

    unknownRemoteMigrations.push(remote);
  }

  return {
    versionsToRevert: [...versionsToRevert].sort(),
    reasons,
    unknownRemoteMigrations,
  };
}

export function assertIsolatedStagingTarget({
  databaseUrl,
  stagingProjectRef,
  productionProjectRef,
}) {
  if (!databaseUrl) throw new Error("SUPABASE_STAGING_EFFECTIVE_DB_URL is required");
  if (!stagingProjectRef) throw new Error("STAGING_SUPABASE_PROJECT_ID is required");
  if (!productionProjectRef) throw new Error("PRODUCTION_SUPABASE_PROJECT_ID is required");
  if (stagingProjectRef === productionProjectRef) {
    throw new Error("Staging project ref must differ from production");
  }

  const parsed = new URL(databaseUrl);
  const username = decodeURIComponent(parsed.username);
  const poolerProjectRef = username.startsWith("postgres.")
    ? username.slice("postgres.".length)
    : "";
  if (poolerProjectRef !== stagingProjectRef) {
    throw new Error(
      `Database pooler project ${poolerProjectRef || "unknown"} does not match staging ${stagingProjectRef}`,
    );
  }
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout ?? "";
}

export function readRemoteMigrations(databaseUrl, commandRunner = runCommand) {
  const query = [
    "SELECT version, COALESCE(name, '')",
    "FROM supabase_migrations.schema_migrations",
    "ORDER BY version;",
  ].join(" ");
  const output = commandRunner("psql", [
    databaseUrl,
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--field-separator=\t",
    "--command",
    query,
  ]);
  return parseRemoteMigrationRows(output);
}

export function reconcileStagingMigrationAliases({
  databaseUrl,
  stagingProjectRef,
  productionProjectRef,
  root = process.cwd(),
  localIndex: suppliedLocalIndex,
  remoteMigrations: suppliedRemoteMigrations,
  commandRunner = runCommand,
  output = process.stdout,
}) {
  assertIsolatedStagingTarget({ databaseUrl, stagingProjectRef, productionProjectRef });
  const localIndex = suppliedLocalIndex ?? readLocalMigrations(root);
  const remoteMigrations = suppliedRemoteMigrations
    ?? readRemoteMigrations(databaseUrl, commandRunner);
  const result = findStagingMigrationAliases({ localIndex, remoteMigrations });

  if (result.unknownRemoteMigrations.length > 0) {
    const unknown = result.unknownRemoteMigrations
      .map(({ version, name }) => `${version}_${name || "unnamed"}`)
      .join(", ");
    throw new Error(
      `Unknown remote-only staging migrations require operator review: ${unknown}`,
    );
  }

  if (result.versionsToRevert.length === 0) {
    output.write("Staging migration history already uses canonical versions.\n");
    return result;
  }

  for (const version of result.versionsToRevert) {
    output.write(`Reverting staging alias ${version}: ${result.reasons.get(version)}\n`);
  }
  commandRunner("supabase", [
    "migration",
    "repair",
    ...result.versionsToRevert,
    "--db-url",
    databaseUrl,
    "--status",
    "reverted",
    "--yes",
  ], { stdio: "inherit" });
  return result;
}

function main() {
  reconcileStagingMigrationAliases({
    databaseUrl: process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL,
    stagingProjectRef: process.env.STAGING_SUPABASE_PROJECT_ID,
    productionProjectRef: process.env.VITE_SUPABASE_PROJECT_ID,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
