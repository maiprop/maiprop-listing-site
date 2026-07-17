import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertIsolatedStagingTarget,
  buildLocalMigrationIndex,
  findStagingMigrationAliases,
  parseRemoteMigrationRows,
  readLocalMigrations,
  readRemoteMigrations,
  reconcileStagingMigrationAliases,
  runCommand,
} from "../../scripts/reconcile-staging-migration-aliases.mjs";

describe("staging migration alias reconciliation", () => {
  const temporaryDirectories: string[] = [];
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  const localMigrations = [
    { version: "20260716113200", name: "preserve_deleted_listing_promotion_audit" },
    { version: "20260716113451", name: "harden_investor_feed_grants" },
    { version: "20260716122630", name: "authorize_typing_presence_channels" },
    { version: "20260716140300", name: "align_investor_runtime_entitlements" },
  ];

  it("reverts exact-name aliases and explicitly mapped staging repairs only", () => {
    const remoteMigrations = parseRemoteMigrationRows([
      "20260716113200\tpreserve_deleted_listing_promotion_audit",
      "20260716114723\talign_investor_runtime_entitlements",
      "20260716115321\trepair_deleted_listing_promotion_audit_detach",
      "20260716121455\trepair_investor_feed_admin_helper",
      "20260716122910\tauthorize_typing_broadcast_presence_extensions",
      "20260714114032\tlegacy_staging_alias",
    ].join("\n"));

    const result = findStagingMigrationAliases({
      localIndex: buildLocalMigrationIndex(localMigrations),
      remoteMigrations,
    });

    expect(result.versionsToRevert).toEqual([
      "20260714114032",
      "20260716114723",
      "20260716115321",
      "20260716121455",
      "20260716122910",
    ]);
    expect(result.unknownRemoteMigrations).toEqual([]);
  });

  it("leaves unknown remote-only migrations unresolved so the gate fails closed", () => {
    const result = findStagingMigrationAliases({
      localIndex: buildLocalMigrationIndex(localMigrations),
      remoteMigrations: parseRemoteMigrationRows(
        "20260717145500\tunknown_staging_change",
      ),
    });

    expect(result.versionsToRevert).toEqual([]);
    expect(result.unknownRemoteMigrations).toEqual([
      { version: "20260717145500", name: "unknown_staging_change" },
    ]);
  });

  it("rejects malformed remote migration versions", () => {
    expect(() => parseRemoteMigrationRows("not-a-version\tbroken")).toThrow(
      /14-digit timestamp/,
    );
  });

  it("rejects malformed, unnamed, and duplicate canonical migrations", () => {
    expect(() => buildLocalMigrationIndex([
      { version: "broken", name: "invalid" },
    ])).toThrow(/14-digit timestamp/);
    expect(() => buildLocalMigrationIndex([
      { version: "20260717120000", name: "" },
    ])).toThrow(/has no name/);
    expect(() => buildLocalMigrationIndex([
      { version: "20260717120000", name: "one" },
      { version: "20260717120000", name: "two" },
    ])).toThrow(/Duplicate canonical migration version/);
  });

  it("does not auto-repair aliases whose canonical name is ambiguous", () => {
    const localIndex = buildLocalMigrationIndex([
      ...localMigrations,
      { version: "20260717120000", name: "align_investor_runtime_entitlements" },
    ]);
    const result = findStagingMigrationAliases({
      localIndex,
      remoteMigrations: parseRemoteMigrationRows(
        "20260717145500\talign_investor_runtime_entitlements",
      ),
    });

    expect(result.versionsToRevert).toEqual([]);
    expect(result.unknownRemoteMigrations).toHaveLength(1);
  });

  it("requires the database pooler target to match isolated staging", () => {
    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres.staging_ref:secret@pooler.example.com:5432/postgres",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
    })).not.toThrow();

    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres.production_ref:secret@pooler.example.com:5432/postgres",
      stagingProjectRef: "production_ref",
      productionProjectRef: "production_ref",
    })).toThrow(/must differ from production/);

    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres.other_ref:secret@pooler.example.com:5432/postgres",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
    })).toThrow(/does not match staging/);

    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
    })).toThrow(/DB_URL.*required/i);
    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres.staging_ref:secret@pooler.example.com/postgres",
      stagingProjectRef: "",
      productionProjectRef: "production_ref",
    })).toThrow(/staging.*required/i);
    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres.staging_ref:secret@pooler.example.com/postgres",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "",
    })).toThrow(/production.*required/i);
    expect(() => assertIsolatedStagingTarget({
      databaseUrl: "postgresql://postgres:secret@pooler.example.com/postgres",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
    })).toThrow(/unknown.*does not match staging/);
  });

  it("reads only canonical migration filenames from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "maiprop-migration-aliases-"));
    temporaryDirectories.push(root);
    const migrationsDirectory = join(root, "supabase", "migrations");
    mkdirSync(join(migrationsDirectory, "ignored-directory"), { recursive: true });
    writeFileSync(join(migrationsDirectory, "20260717120000_one.sql"), "SELECT 1;\n");
    writeFileSync(join(migrationsDirectory, "README.md"), "ignored\n");

    const index = readLocalMigrations(root);
    expect(index.byVersion.get("20260717120000")).toEqual({
      version: "20260717120000",
      name: "one",
    });
    expect(index.byVersion).toHaveLength(1);
  });

  it("reads remote migration history through a parameterized psql command", () => {
    const commandRunner = vi.fn(() => "20260717120000\tone\n");
    const rows = readRemoteMigrations("postgresql://example", commandRunner);

    expect(rows).toEqual([{ version: "20260717120000", name: "one" }]);
    expect(commandRunner).toHaveBeenCalledOnce();
    expect(commandRunner.mock.calls[0][0]).toBe("psql");
    expect(commandRunner.mock.calls[0][1]).toContain("--field-separator=\t");
    expect(commandRunner.mock.calls[0][1].at(-1)).toContain(
      "supabase_migrations.schema_migrations",
    );
  });

  it("fails reconciliation before mutation when remote history is unknown", () => {
    const commandRunner = vi.fn();
    expect(() => reconcileStagingMigrationAliases({
      databaseUrl: "postgresql://postgres.staging_ref:secret@pooler.example.com/postgres",
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
      localIndex: buildLocalMigrationIndex(localMigrations),
      remoteMigrations: [{ version: "20260717145500", name: "unknown_change" }],
      commandRunner,
    })).toThrow(/operator review/);
    expect(commandRunner).not.toHaveBeenCalled();
  });

  it("repairs known aliases once and reports canonical history as a no-op", () => {
    const databaseUrl = "postgresql://postgres.staging_ref:secret@pooler.example.com/postgres";
    const commandRunner = vi.fn(() => "");
    const output = { write: vi.fn() };
    const localIndex = buildLocalMigrationIndex(localMigrations);

    reconcileStagingMigrationAliases({
      databaseUrl,
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
      localIndex,
      remoteMigrations: [{
        version: "20260716142926",
        name: "align_investor_runtime_entitlements",
      }],
      commandRunner,
      output,
    });

    expect(commandRunner).toHaveBeenCalledWith(
      "supabase",
      expect.arrayContaining([
        "migration",
        "repair",
        "20260716142926",
        "--status",
        "reverted",
      ]),
      { stdio: "inherit" },
    );
    expect(output.write).toHaveBeenCalledWith(expect.stringContaining("exact-name alias"));

    commandRunner.mockClear();
    output.write.mockClear();
    reconcileStagingMigrationAliases({
      databaseUrl,
      stagingProjectRef: "staging_ref",
      productionProjectRef: "production_ref",
      localIndex,
      remoteMigrations: [{
        version: "20260716140300",
        name: "align_investor_runtime_entitlements",
      }],
      commandRunner,
      output,
    });
    expect(commandRunner).not.toHaveBeenCalled();
    expect(output.write).toHaveBeenCalledWith(
      "Staging migration history already uses canonical versions.\n",
    );
  });

  it("rejects a canonical timestamp whose remote name conflicts", () => {
    expect(() => findStagingMigrationAliases({
      localIndex: buildLocalMigrationIndex(localMigrations),
      remoteMigrations: [{
        version: "20260716140300",
        name: "different_name",
      }],
    })).toThrow(/canonical local migration/);
  });

  it("executes successful commands and surfaces process failures", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(runCommand(process.execPath, [
      "-e",
      "process.stdout.write('ok')",
    ])).toBe("ok");
    expect(() => runCommand(process.execPath, [
      "-e",
      "process.stderr.write('failed'); process.exit(7)",
    ])).toThrow(/status 7/);
    expect(() => runCommand("definitely-not-a-real-maiprop-command", [])).toThrow();
    stderr.mockRestore();
  });
});
