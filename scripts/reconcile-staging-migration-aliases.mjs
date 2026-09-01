import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertStagingMutationTarget } from "./assert-staging-mutation-target.mjs";

const VERSION_PATTERN = /^\d{14}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MIGRATION_FILE_PATTERN = /^(\d{14})_(.+)\.sql$/;

const repair = (
  remoteName,
  remoteStatementsSha256,
  canonicalVersion,
  canonicalName,
  canonicalFileSha256,
  reason,
) => ({
  remoteName,
  remoteStatementsSha256,
  canonicalVersion,
  canonicalName,
  canonicalFileSha256,
  reason,
});

// This is the complete reviewed repair inventory for the isolated staging
// project. No timestamp, name, or fuzzy-match heuristic may add to it.
export const STAGING_MIGRATION_REPAIR_MAP = new Map([
  [
    "20260726203311",
    repair(
      "20260726175234_allow_abandoned_trial_checkout_retry",
      "29768b41a8d01cb76d8147246932511e6d884b8d8a654204f7742f4c13a062ad",
      "20260726175234",
      "allow_abandoned_trial_checkout_retry",
      "5dc80957974127926c4c1d83bec4c66fb63d7c8e4eb3a4e5f8345ee3bde9f200",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203324",
    repair(
      "20260726180252_canonicalize_listing_promotion_subscription_source",
      "6780a151efa422ca2a408b56c1f6e7a00efa04dc1887a7593f612f112d232119",
      "20260726180252",
      "canonicalize_listing_promotion_subscription_source",
      "f3c1ad393452c9f7627ae3015d7e1e88659bcb4c46f95c9f3ab23bf4037d3a67",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203325",
    repair(
      "20260726181627_align_project_tenant_authorization",
      "5b389a949a9fced1a1d5b36eee9cf26d6f1087fece98c3fecb5b2d9181266541",
      "20260726181627",
      "align_project_tenant_authorization",
      "3b49d3cde9f226be6e73c8610f84f1cf0f490e95cc8b97de0c85ae39ab35d140",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203326",
    repair(
      "20260726182342_align_org_listing_mutation_authorization",
      "370c3e9fd3f809c8c832478a5d0bc3d773288594f72973d9c92055f95ca881e6",
      "20260726182342",
      "align_org_listing_mutation_authorization",
      "0574ddd87df2cdbfe16db92d8acb6d195bcc8bd36134c1ecfebefdd078bcfaba",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203327",
    repair(
      "20260726182846_create_new_building_atomic_boundary",
      "b00748dd7c90286e99aa2aa953defd58dd5ad2719cafd33cf849a5a3dc5b01aa",
      "20260726182846",
      "create_new_building_atomic_boundary",
      "488a8b8eb5cf6f50e84e295b832e7913320a4a298f982ba9b1435d4bad289287",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203329",
    repair(
      "20260726184938_protect_public_professional_projection",
      "60ab033cf5c06f8a9a7878b92b801827ddedef4591a5f099b4539fd3a065ee9a",
      "20260726184938",
      "protect_public_professional_projection",
      "8b951deaf0588d3fa517f82b7de2b757aa6a6646ac72935e344452d24bf43cbb",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203330",
    repair(
      "20260726201049_public_auction_candidate_boundary",
      "d9c7e5c98d730d521fdde0af4c7b2aafa240eb0e648f399d26864c32215d11f1",
      "20260726201049",
      "public_auction_candidate_boundary",
      "85b5fda0cedb5e5aebe448a0b515bdeb1730026b7a2d374e4a82b68e985d8317",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726203332",
    repair(
      "20260726202759_public_auction_candidate_indexes",
      "bcd24a88a1f40daa167f696ff81e2b502a20ef4d2229a5ab2befac37aed6ac23",
      "20260726202759",
      "public_auction_candidate_indexes",
      "faccf941d8b7967d54de2bba1197b42ada0959ca551037923133c38330348b02",
      "identical migration imported with its filename as the remote name",
    ),
  ],
  [
    "20260726204552",
    repair(
      "harden_public_auction_boundary_and_index",
      "befe9eedfb8cf01164771d3e7310be270f3190f086e85ac10fcf0c170b8042cd",
      "20260726204345",
      "harden_public_auction_boundary_and_index",
      "b7a5d6209dfdc3eabc45939cffb500f7581314564c08302e51d5211ae5376b05",
      "reviewed canonical replay adds fixture exclusion to the idempotent boundary",
    ),
  ],
  [
    "20260726205445",
    repair(
      "fix_owned_public_storage_cleanup",
      "25534fb721dd29744e7a8a2acf1469588a3b7889395455bc34386763aa365e4b",
      "20260726205309",
      "fix_owned_public_storage_cleanup",
      "af2c506d97f9696d22192172b1b1db23e2dc543f8797f44c6f93d0bd058e1a36",
      "reviewed canonical replay tightens the idempotent storage boundary",
    ),
  ],
  [
    "20260726213502",
    repair(
      "harden_listing_tenant_and_auction_provenance",
      "72e35aeb7afb019485dd7c634716f3c9080c1f4a2404046493e487fc3d373c86",
      "20260726211816",
      "harden_listing_tenant_and_auction_provenance",
      "151eaca3713c1e157850972678bca21e3821f63e76a1d86f0d9daae6cb1426b7",
      "reviewed canonical replay tightens idempotent tenant provenance checks",
    ),
  ],
  [
    "20260726215440",
    repair(
      "enforce_project_child_scope_immutability",
      "131d49b931d74bfd73acd3f866653b914680c426ad339fe285ac75d8cac456b6",
      "20260726215356",
      "enforce_project_child_scope_immutability",
      "9714f6b3e20c31354651726f4ed8fe3e06cdc5bb3d12e6de5b53c2904a38a087",
      "reviewed canonical replay completes idempotent child-scope guards",
    ),
  ],
  [
    "20260726223626",
    repair(
      "correct_active_listing_quota_and_managed_catalogue",
      "305db8e0bd66a5f26fb009568e1cb65c138f9708028796b58d40bd22c6fb3cca",
      "20260726220701",
      "correct_active_listing_quota_and_managed_catalogue",
      "2ff3f887f11e06282dc574ff68b68aaacf446be07acf4ba10139cfa84fa35c1d",
      "identical migration applied under a staging-generated version",
    ),
  ],
  [
    "20260726223644",
    repair(
      "require_listing_owner_for_public_promotion_rpc",
      "139c473f148b88bf4aeb40709e55ac82255a94474e4613583bf9c097ca46346e",
      "20260726221523",
      "require_listing_owner_for_public_promotion_rpc",
      "1548f7e2dede2eab1eac97878ac638c20412c2c09b6fa486cea3736a2c1bafc1",
      "identical migration applied under a staging-generated version",
    ),
  ],
  [
    "20260726223733",
    repair(
      "add_storage_cleanup_outbox",
      "2eed62f5cefc664ada6bafa27508866ca12c580fbe6b398fc13a2a5c456b69b6",
      "20260726222529",
      "add_storage_cleanup_outbox",
      "4742e0ed4d0f3023169bffe464a063198b54c9230860363120926cd6c680a790",
      "identical migration applied under a staging-generated version",
    ),
  ],
  [
    "20260726232355",
    repair(
      "harden_storage_cleanup_lifecycle",
      "4ed2a23a80fa7390d2a76988118d9f624b9861ee5ab937a7ca6286d1cb7a05e3",
      "20260726224342",
      "harden_storage_cleanup_lifecycle",
      "bfb41c33659d343d236d33be660dcb38d18049a6cccb516c09940048883b4198",
      "identical migration applied under a staging-generated version",
    ),
  ],
  [
    "20260726234052",
    repair(
      "use_current_service_role_claim",
      "dc56fe218c9fb4ff4031a8aa187428d3359e10526e0a93ff295baf385b1fd03a",
      "20260726233830",
      "use_current_service_role_claim",
      "71a8b340d2c750fbecbf829acdc8ae4597c0d2c871914d2bd570fa0f1895ddf7",
      "identical migration applied under a staging-generated version",
    ),
  ],
]);

function assertVersion(version, source) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `${source} migration version must be a 14-digit timestamp: ${version}`,
    );
  }
}

function assertHash(hash, source) {
  if (!HASH_PATTERN.test(hash ?? "")) {
    throw new Error(`${source} migration must include an exact SHA-256 identity`);
  }
}

export function exactSqlFileSha256(sql) {
  return createHash("sha256")
    .update(sql.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

export function buildLocalMigrationIndex(migrations) {
  const byVersion = new Map();

  for (const migration of migrations) {
    assertVersion(migration.version, "Local");
    if (!migration.name) {
      throw new Error(`Local migration ${migration.version} has no name`);
    }
    assertHash(migration.fileSha256, "Local");
    if (byVersion.has(migration.version)) {
      throw new Error(`Duplicate canonical migration version: ${migration.version}`);
    }
    byVersion.set(migration.version, migration);
  }

  return { byVersion };
}

export function readLocalMigrations(root = process.cwd()) {
  const migrationDirectory = resolve(root, "supabase", "migrations");
  const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      if (!match) return null;
      const sql = readFileSync(resolve(migrationDirectory, entry.name), "utf8");
      return {
        version: match[1],
        name: match[2],
        fileSha256: exactSqlFileSha256(sql),
      };
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
      const [version = "", name = "", statementsSha256 = ""] = line.split(
        "\t",
        3,
      );
      assertVersion(version, "Remote");
      assertHash(statementsSha256, "Remote");
      return { version, name, statementsSha256 };
    });
}

export function findStagingMigrationAliases({
  localIndex,
  remoteMigrations,
  repairMap = STAGING_MIGRATION_REPAIR_MAP,
}) {
  const versionsToRevert = [];
  const reasons = new Map();
  const unknownRemoteMigrations = [];

  for (const remote of remoteMigrations) {
    assertVersion(remote.version, "Remote");
    assertHash(remote.statementsSha256, "Remote");
    const canonicalAtVersion = localIndex.byVersion.get(remote.version);
    if (canonicalAtVersion) {
      if (canonicalAtVersion.name !== remote.name) {
        throw new Error(
          `Remote migration ${remote.version}_${remote.name} does not exactly ` +
            `match canonical ${canonicalAtVersion.version}_${canonicalAtVersion.name}`,
        );
      }
      continue;
    }

    const reviewed = repairMap.get(remote.version);
    const canonical = reviewed
      ? localIndex.byVersion.get(reviewed.canonicalVersion)
      : null;
    if (
      !reviewed ||
      reviewed.remoteName !== remote.name ||
      reviewed.remoteStatementsSha256 !== remote.statementsSha256 ||
      !canonical ||
      canonical.name !== reviewed.canonicalName ||
      canonical.fileSha256 !== reviewed.canonicalFileSha256
    ) {
      unknownRemoteMigrations.push(remote);
      continue;
    }

    versionsToRevert.push(remote.version);
    reasons.set(
      remote.version,
      `${reviewed.reason}; canonical ${canonical.version}_${canonical.name}`,
    );
  }

  return {
    versionsToRevert: versionsToRevert.sort(),
    reasons,
    unknownRemoteMigrations,
  };
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
    "SELECT version, COALESCE(name, ''),",
    "encode(digest(convert_to(array_to_json(statements)::text, 'UTF8'),",
    "'sha256'), 'hex')",
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
  acknowledgement,
  apply = false,
  root = process.cwd(),
  localIndex: suppliedLocalIndex,
  remoteMigrations: suppliedRemoteMigrations,
  repairMap = STAGING_MIGRATION_REPAIR_MAP,
  commandRunner = runCommand,
  output = process.stdout,
}) {
  if (apply) {
    throw new Error(
      "Supabase provider mutation must run in the protected workflow, not this planning helper.",
    );
  }
  assertStagingMutationTarget({
    projectRef: stagingProjectRef,
    databaseUrl,
    acknowledgement,
  });
  const localIndex = suppliedLocalIndex ?? readLocalMigrations(root);
  const remoteMigrations =
    suppliedRemoteMigrations ?? readRemoteMigrations(databaseUrl, commandRunner);
  const result = findStagingMigrationAliases({
    localIndex,
    remoteMigrations,
    repairMap,
  });

  if (result.unknownRemoteMigrations.length > 0) {
    const unknown = result.unknownRemoteMigrations
      .map(
        ({ version, name, statementsSha256 }) =>
          `${version}_${name || "unnamed"}@${statementsSha256}`,
      )
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
    output.write(
      `Reviewed staging repair ${version}: ${result.reasons.get(version)}\n`,
    );
  }
  output.write(
    `Dry run only: ${result.versionsToRevert.length} reviewed aliases require repair.\n`,
  );
  return result;
}

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function main() {
  const result = reconcileStagingMigrationAliases({
    databaseUrl: process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL,
    stagingProjectRef: process.env.STAGING_SUPABASE_PROJECT_ID,
    acknowledgement: process.env.STAGING_MUTATION_ACKNOWLEDGEMENT,
    apply: process.argv.includes("--apply"),
    root: resolve(argValue("--root", process.cwd())),
  });
  const out = argValue("--out");
  if (out) {
    writeFileSync(
      resolve(out),
      `${JSON.stringify({
        schema_version: 1,
        versions_to_revert: result.versionsToRevert,
        repairs: result.versionsToRevert.map((version) => ({
          version,
          reason: result.reasons.get(version),
        })),
      }, null, 2)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
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
