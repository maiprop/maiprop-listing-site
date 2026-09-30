/**
 * Tests for scripts/check-migration-idempotency.mjs.
 *
 * Runs as part of `npm test` (vitest). The CI workflow also invokes the lint
 * itself separately via `npm run lint:migrations`.
 */
import { describe, test, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  lintMigration,
  lintMigrationChronology,
  loadAppliedFutureVersions,
  lintAppliedFutureSources,
  isInScope,
  run,
} from "./check-migration-idempotency.mjs";

// ---------------------------------------------------------------------------
// lintMigration — per-rule unit tests
// ---------------------------------------------------------------------------

describe("lintMigration", () => {
  test("passes for a fully-idempotent migration", () => {
    const sql = `
CREATE TABLE IF NOT EXISTS foo (id uuid PRIMARY KEY);
CREATE INDEX IF NOT EXISTS foo_idx ON foo(id);
CREATE UNIQUE INDEX IF NOT EXISTS foo_uniq ON foo(id);
DROP TRIGGER IF EXISTS t1 ON foo;
CREATE TRIGGER t1 AFTER INSERT ON foo FOR EACH ROW EXECUTE FUNCTION noop();
DROP POLICY IF EXISTS "p1" ON foo;
CREATE POLICY "p1" ON foo FOR SELECT USING (true);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='mood') THEN
    CREATE TYPE mood AS ENUM ('ok','bad');
  END IF;
END $$;
CREATE OR REPLACE FUNCTION my_fn() RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE OR REPLACE VIEW my_v AS SELECT 1;
`;
    const out = lintMigration("ok.sql", sql);
    expect(out, `expected zero violations, got: ${JSON.stringify(out)}`).toHaveLength(0);
  });

  test("flags CREATE TABLE without IF NOT EXISTS", () => {
    const out = lintMigration("a.sql", "CREATE TABLE foo (id int);\n");
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE TABLE/);
    expect(out[0].file).toBe("a.sql");
    expect(out[0].line).toBeGreaterThanOrEqual(1);
  });

  test("accepts the exact fail-closed quarantine migration's deliberate strict table creation", () => {
    const file = "20260728115959_quarantine_invalid_os_auction_identity.sql";
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");

    expect(lintMigration(file, sql)).toHaveLength(0);
  });

  test("does not extend the strict-table exception to renamed or weakened quarantine migrations", () => {
    const file = "20260728115959_quarantine_invalid_os_auction_identity.sql";
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");
    const weakened = sql.replace("IF v_candidate_count > 1 THEN", "IF v_candidate_count > 100 THEN");

    for (const [candidateFile, candidateSql] of [
      [`${file}.renamed`, sql],
      [file, weakened],
    ]) {
      expect(lintMigration(candidateFile, candidateSql)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "CREATE TABLE without IF NOT EXISTS" }),
        ]),
      );
    }
  });

  test("flags CREATE INDEX without IF NOT EXISTS", () => {
    const out = lintMigration("b.sql", "CREATE INDEX foo_idx ON foo(id);\n");
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE INDEX/);
  });

  test("flags CREATE UNIQUE INDEX without IF NOT EXISTS", () => {
    const out = lintMigration("c.sql", "CREATE UNIQUE INDEX uniq ON foo(id);\n");
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE INDEX/);
  });

  test("accepts adjacent exact public guards for plain and unique multiline indexes", () => {
    const sql = `DO $indexes$
BEGIN
  IF pg_catalog.to_regclass('public.first_idx') IS NULL THEN
    CREATE INDEX first_idx ON public.items (created_at)
      WHERE created_at IS NOT NULL;
  END IF;
  IF pg_catalog.to_regclass('public.second_uidx') IS NULL THEN
    CREATE UNIQUE INDEX second_uidx
      ON public.items (operation_id)
      WHERE operation_id IS NOT NULL;
  END IF;
END;
$indexes$;`;

    expect(lintMigration("guarded.sql", sql)).toHaveLength(0);
  });

  test("reports each unguarded index after a guarded index at its own line", () => {
    const sql = `IF pg_catalog.to_regclass('public.safe_idx') IS NULL THEN
  CREATE INDEX safe_idx ON public.items (id);
END IF;
CREATE INDEX unsafe_idx ON public.items (created_at);
CREATE UNIQUE INDEX unsafe_uidx ON public.items (operation_id);`;

    expect(lintMigration("mixed.sql", sql)).toEqual([
      expect.objectContaining({ rule: "CREATE INDEX without IF NOT EXISTS", line: 4 }),
      expect.objectContaining({ rule: "CREATE INDEX without IF NOT EXISTS", line: 5 }),
    ]);
  });

  test("preserves index line numbers across multiline and line comments", () => {
    const sql = `/* commented index:
CREATE INDEX ignored_idx ON public.items (id);
*/
-- CREATE INDEX also_ignored_idx ON public.items (id);
CREATE INDEX unsafe_idx ON public.items (id);`;

    expect(lintMigration("comments.sql", sql)).toEqual([
      expect.objectContaining({ rule: "CREATE INDEX without IF NOT EXISTS", line: 5 }),
    ]);
  });

  test.each([
    ["different guard name", `IF pg_catalog.to_regclass('public.other_idx') IS NULL THEN\n  CREATE INDEX item_idx ON public.items (id);\nEND IF;`, 2],
    ["guard elsewhere", `IF pg_catalog.to_regclass('public.item_idx') IS NULL THEN\n  SELECT 1;\n  CREATE INDEX item_idx ON public.items (id);\nEND IF;`, 3],
    ["missing end if", `IF pg_catalog.to_regclass('public.item_idx') IS NULL THEN\n  CREATE INDEX item_idx ON public.items (id);`, 2],
    ["missing is null", `IF pg_catalog.to_regclass('public.item_idx') THEN\n  CREATE INDEX item_idx ON public.items (id);\nEND IF;`, 2],
    ["wrong target schema", `IF pg_catalog.to_regclass('public.item_idx') IS NULL THEN\n  CREATE INDEX item_idx ON private.items (id);\nEND IF;`, 2],
    ["unqualified target", `IF pg_catalog.to_regclass('public.item_idx') IS NULL THEN\n  CREATE INDEX item_idx ON items (id);\nEND IF;`, 2],
  ])("rejects %s around index creation", (_case, sql, line) => {
    expect(lintMigration("bad-guard.sql", sql)).toEqual([
      expect.objectContaining({ rule: "CREATE INDEX without IF NOT EXISTS", line }),
    ]);
  });

  test("flags CREATE TRIGGER without preceding DROP", () => {
    const sql = "CREATE TRIGGER t1 AFTER INSERT ON foo FOR EACH ROW EXECUTE FUNCTION noop();\n";
    const out = lintMigration("d.sql", sql);
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE TRIGGER t1/);
  });

  test("accepts CREATE TRIGGER preceded by DROP TRIGGER IF EXISTS", () => {
    const sql = `DROP TRIGGER IF EXISTS t1 ON foo;
CREATE TRIGGER t1 AFTER INSERT ON foo FOR EACH ROW EXECUTE FUNCTION noop();`;
    const out = lintMigration("e.sql", sql);
    expect(out).toHaveLength(0);
  });

  test("flags CREATE POLICY without preceding DROP", () => {
    const out = lintMigration("f.sql", `CREATE POLICY "p1" ON foo FOR SELECT USING (true);\n`);
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE POLICY "p1"/);
  });

  test("accepts CREATE POLICY preceded by DROP POLICY IF EXISTS", () => {
    const sql = `DROP POLICY IF EXISTS "p1" ON foo;
CREATE POLICY "p1" ON foo FOR SELECT USING (true);`;
    const out = lintMigration("g.sql", sql);
    expect(out).toHaveLength(0);
  });

  test("flags bare CREATE TYPE without DO block guard", () => {
    const out = lintMigration("h.sql", "CREATE TYPE mood AS ENUM ('ok','bad');\n");
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE TYPE mood/);
  });

  test("flags CREATE FUNCTION without OR REPLACE", () => {
    const out = lintMigration(
      "i.sql",
      "CREATE FUNCTION my_fn() RETURNS void LANGUAGE sql AS $$ SELECT $$;\n",
    );
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE FUNCTION/);
  });

  test("flags CREATE VIEW without OR REPLACE", () => {
    const out = lintMigration("j.sql", "CREATE VIEW my_v AS SELECT 1;\n");
    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/CREATE VIEW/);
  });

  test("ignores patterns inside line comments", () => {
    const sql = "-- CREATE TABLE foo (id int);\nSELECT 1;\n";
    const out = lintMigration("k.sql", sql);
    expect(out).toHaveLength(0);
  });

  test("ignores patterns inside block comments", () => {
    const sql = "/* CREATE TABLE foo (id int); */\nSELECT 1;\n";
    const out = lintMigration("l.sql", sql);
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isInScope — baseline filter
// ---------------------------------------------------------------------------

describe("isInScope", () => {
  test("returns false for files older than baseline", () => {
    expect(isInScope("20260101000000_old.sql", "20260628000000")).toBe(false);
  });

  test("returns true for files at the baseline", () => {
    expect(isInScope("20260628000000_new.sql", "20260628000000")).toBe(true);
  });

  test("returns true for files newer than baseline", () => {
    expect(isInScope("20270101000000_future.sql", "20260628000000")).toBe(true);
  });

  test("returns false for files without a 14-digit prefix", () => {
    expect(isInScope("readme.md", "20260628000000")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lintMigrationChronology - filename timestamp checks
// ---------------------------------------------------------------------------

describe("lintMigrationChronology", () => {
  test("flags duplicate migration timestamps", () => {
    const out = lintMigrationChronology(
      [
        "20260501000000_first.sql",
        "20260501000000_second.sql",
      ],
      { now: new Date("2026-05-07T00:00:00Z") },
    );

    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/Duplicate migration timestamp/);
  });

  test("flags future-dated migration timestamps", () => {
    const out = lintMigrationChronology(
      ["20260601000000_future.sql"],
      { now: new Date("2026-05-07T00:00:00Z") },
    );

    expect(out).toHaveLength(1);
    expect(out[0].rule).toMatch(/Future-dated migration timestamp/);
  });

  test("allows future-dated migrations recorded as already applied", () => {
    const out = lintMigrationChronology(
      ["20260601000000_future.sql"],
      {
        now: new Date("2026-05-07T00:00:00Z"),
        appliedFutureVersions: ["20260601000000"],
      },
    );

    expect(out).toHaveLength(0);
  });

  test("allows a one-day UTC grace window for local clock skew", () => {
    const out = lintMigrationChronology(
      ["20260508000000_next_day.sql"],
      { now: new Date("2026-05-07T00:00:00Z") },
    );

    expect(out).toHaveLength(0);
  });
});

describe("loadAppliedFutureVersions", () => {
  test("loads the immutable applied-future allowlist", () => {
    expect(loadAppliedFutureVersions()).toContain("20260704000000");
  });

  test("rejects bare string allowlist entries without production evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "migr-lint-"));
    try {
      const file = join(dir, "applied-future-migrations.json");
      writeFileSync(file, JSON.stringify(["20260704000000"]));

      expect(() => loadAppliedFutureVersions(file)).toThrow(/evidence object/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads evidence-backed applied-future migration versions", () => {
    const dir = mkdtempSync(join(tmpdir(), "migr-lint-"));
    try {
      const file = join(dir, "applied-future-migrations.json");
      writeFileSync(file, JSON.stringify([
        {
          version: "20260704000000",
          name: "example",
          productionApplied: true,
          verifiedAt: "2026-07-03",
          reason: "Historical production-applied migration; source filename cannot be rewritten safely.",
        },
      ]));

      expect(loadAppliedFutureVersions(file)).toEqual(["20260704000000"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("lintAppliedFutureSources", () => {
  test("flags allowlisted future migrations without source SQL", () => {
    const out = lintAppliedFutureSources(
      ["20260704000000_present.sql"],
      ["20260704000000", "20260705000000"],
    );

    expect(out).toHaveLength(1);
    expect(out[0].rule).toContain("20260705000000");
  });

  test("passes when every allowlisted future migration has source SQL", () => {
    const out = lintAppliedFutureSources(
      ["20260704000000_present.sql", "20260705000000_present.sql"],
      ["20260704000000", "20260705000000"],
    );

    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// run — directory walker
// ---------------------------------------------------------------------------

describe("run", () => {
  test("scans only in-scope files and aggregates violations", () => {
    const dir = mkdtempSync(join(tmpdir(), "migr-lint-"));
    try {
      writeFileSync(join(dir, "20260101000000_old.sql"), "CREATE TABLE foo (id int);");
      writeFileSync(
        join(dir, "20300101000000_new_bad.sql"),
        "CREATE TABLE bar (id int);\nCREATE POLICY \"x\" ON bar FOR SELECT USING (true);",
      );
      writeFileSync(
        join(dir, "20300102000000_new_good.sql"),
        "CREATE TABLE IF NOT EXISTS baz (id int);",
      );

      const result = run({ dir, baseline: "20300101000000" });
      expect(result.scanned, "should ignore the pre-baseline file").toBe(2);
      expect(result.violations, "two violations in the new bad file").toHaveLength(2);
      expect(result.chronologyViolations).toHaveLength(0);
      expect(result.appliedFutureSourceViolations).toHaveLength(0);
      expect(result.violations.every((v) => v.file === "20300101000000_new_bad.sql")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("can include chronology violations", () => {
    const dir = mkdtempSync(join(tmpdir(), "migr-lint-"));
    try {
      writeFileSync(join(dir, "20260501000000_a.sql"), "SELECT 1;");
      writeFileSync(join(dir, "20260501000000_b.sql"), "SELECT 1;");
      writeFileSync(join(dir, "20260601000000_future.sql"), "SELECT 1;");

      const result = run({
        dir,
        baseline: "20260501000000",
        checkChronology: true,
        now: new Date("2026-05-07T00:00:00Z"),
        appliedFutureVersions: [],
      });
      expect(result.chronologyViolations).toHaveLength(2);
      expect(result.appliedFutureSourceViolations).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
