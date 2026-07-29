import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLocalMigrationIndex,
  exactSqlFileSha256,
  findStagingMigrationAliases,
  parseRemoteMigrationRows,
  readLocalMigrations,
  readRemoteMigrations,
  reconcileStagingMigrationAliases,
  runCommand,
} from "../../scripts/reconcile-staging-migration-aliases.mjs";
import {
  MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
  MAIPROP_STAGING_SUPABASE_PROJECT_REF,
} from "../../scripts/assert-staging-mutation-target.mjs";

const canonicalSql = "select 1;\n";
const canonicalHash = exactSqlFileSha256(canonicalSql);
const canonical = {
  version: "20260717140300",
  name: "align_investor_runtime_entitlements",
  fileSha256: canonicalHash,
};
const remote = {
  version: "20260717145500",
  name: "staging_import",
  statementsSha256: "a".repeat(64),
};
const repairMap = new Map([
  [
    remote.version,
    {
      remoteName: remote.name,
      remoteStatementsSha256: remote.statementsSha256,
      canonicalVersion: canonical.version,
      canonicalName: canonical.name,
      canonicalFileSha256: canonical.fileSha256,
      reason: "reviewed test alias",
    },
  ],
]);
const databaseUrl =
  `postgresql://postgres.${MAIPROP_STAGING_SUPABASE_PROJECT_REF}:secret` +
  "@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require";

describe("staging migration alias reconciliation", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("repairs only exact reviewed version, name, and hash pairs", () => {
    const result = findStagingMigrationAliases({
      localIndex: buildLocalMigrationIndex([canonical]),
      remoteMigrations: [remote],
      repairMap,
    });

    expect(result.versionsToRevert).toEqual([remote.version]);
    expect(result.reasons.get(remote.version)).toContain(
      `canonical ${canonical.version}_${canonical.name}`,
    );
    expect(result.unknownRemoteMigrations).toEqual([]);
  });

  it.each([
    { ...remote, name: "renamed" },
    { ...remote, statementsSha256: "0".repeat(64) },
  ])("fails closed when a reviewed remote identity drifts", (changed) => {
    const result = findStagingMigrationAliases({
      localIndex: buildLocalMigrationIndex([canonical]),
      remoteMigrations: [changed],
      repairMap,
    });

    expect(result.versionsToRevert).toEqual([]);
    expect(result.unknownRemoteMigrations).toEqual([changed]);
  });

  it("rejects canonical history whose remote name drifted", () => {
    const localIndex = buildLocalMigrationIndex([canonical]);

    expect(() =>
      findStagingMigrationAliases({
        localIndex,
        remoteMigrations: [{
          version: canonical.version,
          name: "renamed",
          statementsSha256: "b".repeat(64),
        }],
        repairMap,
      }),
    ).toThrow(/does not exactly match canonical/);
  });

  it("requires exact statement-array SHA-256 evidence in remote history", () => {
    expect(() =>
      parseRemoteMigrationRows("20260717145500\tstaging_import"),
    ).toThrow(/exact SHA-256/);
    expect(
      parseRemoteMigrationRows(
        `${remote.version}\t${remote.name}\t${remote.statementsSha256}`,
      ),
    ).toEqual([remote]);
  });

  it("normalizes line endings but preserves SQL literal whitespace", () => {
    expect(exactSqlFileSha256("select 'a  b';\r\n")).toBe(
      exactSqlFileSha256("select 'a  b';\n"),
    );
    expect(exactSqlFileSha256("select 'a  b';\n")).not.toBe(
      exactSqlFileSha256("select 'a b';\n"),
    );
  });

  it("reads canonical migration SQL and computes its exact file hash", () => {
    const root = mkdtempSync(join(tmpdir(), "maiprop-migration-aliases-"));
    temporaryDirectories.push(root);
    const migrationsDirectory = join(root, "supabase", "migrations");
    mkdirSync(migrationsDirectory, { recursive: true });
    writeFileSync(
      join(migrationsDirectory, `${canonical.version}_${canonical.name}.sql`),
      canonicalSql,
    );
    writeFileSync(join(migrationsDirectory, "README.md"), "ignored\n");

    expect(readLocalMigrations(root).byVersion.get(canonical.version)).toEqual(
      canonical,
    );
  });

  it("reads remote name and exact statement-array hash through psql", () => {
    const commandRunner = vi.fn(
      () => `${remote.version}\t${remote.name}\t${remote.statementsSha256}\n`,
    );

    expect(readRemoteMigrations(databaseUrl, commandRunner)).toEqual([remote]);
    expect(commandRunner.mock.calls[0][0]).toBe("psql");
    expect(commandRunner.mock.calls[0][1]).toContain("--field-separator=\t");
    expect(commandRunner.mock.calls[0][1].at(-1)).toContain(
      "supabase_migrations.schema_migrations",
    );
    expect(commandRunner.mock.calls[0][1].at(-1)).toContain(
      "array_to_json(statements)",
    );
  });

  it("prints a dry run without repairing migration history", () => {
    const commandRunner = vi.fn();
    const output = { write: vi.fn() };

    reconcileStagingMigrationAliases({
      databaseUrl,
      stagingProjectRef: MAIPROP_STAGING_SUPABASE_PROJECT_REF,
      acknowledgement: MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
      localIndex: buildLocalMigrationIndex([canonical]),
      remoteMigrations: [remote],
      repairMap,
      commandRunner,
      output,
      apply: false,
    });

    expect(commandRunner).not.toHaveBeenCalled();
    expect(output.write).toHaveBeenCalledWith(
      expect.stringContaining("Dry run only"),
    );
  });

  it("applies only the exact set produced by the reviewed dry run", () => {
    const commandRunner = vi.fn(() => "");

    reconcileStagingMigrationAliases({
      databaseUrl,
      stagingProjectRef: MAIPROP_STAGING_SUPABASE_PROJECT_REF,
      acknowledgement: MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
      localIndex: buildLocalMigrationIndex([canonical]),
      remoteMigrations: [remote],
      repairMap,
      commandRunner,
      apply: true,
    });

    expect(commandRunner).toHaveBeenCalledWith(
      "supabase",
      expect.arrayContaining([
        "migration",
        "repair",
        remote.version,
        "--status",
        "reverted",
      ]),
      { stdio: "inherit" },
    );
  });

  it("rejects production, arbitrary targets, and missing acknowledgement", () => {
    const base = {
      databaseUrl,
      localIndex: buildLocalMigrationIndex([canonical]),
      remoteMigrations: [remote],
      commandRunner: vi.fn(),
    };

    expect(() =>
      reconcileStagingMigrationAliases({
        ...base,
        stagingProjectRef: "qvvicunqcrwpioqnvzxf",
        acknowledgement: MAIPROP_STAGING_MUTATION_ACKNOWLEDGEMENT,
      }),
    ).toThrow(/production Supabase project/);
    expect(() =>
      reconcileStagingMigrationAliases({
        ...base,
        stagingProjectRef: MAIPROP_STAGING_SUPABASE_PROJECT_REF,
        acknowledgement: "staging",
      }),
    ).toThrow(/acknowledgement/);
  });

  it("executes successful commands and surfaces process failures", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(
      runCommand(process.execPath, ["-e", "process.stdout.write('ok')"]),
    ).toBe("ok");
    expect(() =>
      runCommand(process.execPath, [
        "-e",
        "process.stderr.write('failed'); process.exit(7)",
      ]),
    ).toThrow(/status 7/);
    expect(() =>
      runCommand("definitely-not-a-real-maiprop-command", []),
    ).toThrow();
    stderr.mockRestore();
  });
});
