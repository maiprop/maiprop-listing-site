import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

import {
  assertCoverageThreshold,
  discoverRuntimeManifest,
  mergeRuntimeCoverage,
} from "./deno-edge-coverage-lib.mjs";
import { collectDenoTestFiles } from "./deno-test-discovery-lib.mjs";

const standardDeno = join(
  homedir(),
  ".deno",
  "bin",
  process.platform === "win32" ? "deno.exe" : "deno",
);
const deno = process.env.MAIPROP_DENO ?? standardDeno;

function write(root, path, contents = "export const value = 1;\n") {
  const absolute = join(root, ...path.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  return absolute;
}

function lcov(records) {
  return records.map(({ source, lines }) => [
    "TN:",
    `SF:${source}`,
    ...lines.map(([line, count]) => `DA:${line},${count}`),
    `LF:${lines.length}`,
    `LH:${lines.filter(([, count]) => count > 0).length}`,
    "end_of_record",
  ].join("\n")).join("\n");
}

function withTempRoot(prefix, callback) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("runtime manifest includes future TS/TSX files and classifies every explicit exclusion", () => {
  withTempRoot("maiprop-deno-manifest-", (root) => {
    const functionsDir = join(root, "supabase", "functions");
    write(functionsDir, "alpha/index.ts");
    write(functionsDir, "_shared/email-templates/welcome.tsx");
    write(functionsDir, "future/new-runtime.ts");
    write(functionsDir, "alpha/index.test.ts");
    write(functionsDir, "_shared/testUtils.ts");
    write(functionsDir, "_shared/coverage-test-support/fake.ts");
    write(functionsDir, "create-checkout/types.ts", "export type A = string;\n");
    write(functionsDir, "fetch-os-auctions/types.ts", "export interface B {}\n");
    write(functionsDir, "fetch-os-auctions/auctionFilterRequest.openapi.snapshot.ts");
    write(functionsDir, "coverage/old-run/runtime-inventory.test.ts");

    const manifest = discoverRuntimeManifest({ root, functionsDir });

    assert.deepEqual(manifest.included.map((entry) => entry.path), [
      "supabase/functions/_shared/email-templates/welcome.tsx",
      "supabase/functions/alpha/index.ts",
      "supabase/functions/future/new-runtime.ts",
    ]);
    assert.deepEqual(
      [...new Set(manifest.excluded.map((entry) => entry.reason))].sort(),
      ["coverage-test-support", "openapi-test-snapshot", "test", "test-utility", "type-only"],
    );

    write(functionsDir, "create-checkout/types.ts", "export const runtimeValue = 1;\n");
    assert.throws(
      () => discoverRuntimeManifest({ root, functionsDir }),
      /declared type-only source emits runtime code/i,
    );
  });
});

test("ordinary Deno discovery ignores retained coverage inventory artifacts", () => {
  withTempRoot("maiprop-deno-test-discovery-", (root) => {
    const functionsDir = join(root, "supabase", "functions");
    const ordinary = write(functionsDir, "alpha/index.test.ts");
    write(functionsDir, "coverage/retained/runtime-inventory.test.ts");
    write(functionsDir, ".coverage-runs/retained/runtime-inventory.test.ts");

    assert.deepEqual(collectDenoTestFiles(functionsDir), [ordinary]);
  });
});

test("merger unions duplicate source identities by line and forces inventory-only hits to zero", () => {
  withTempRoot("maiprop-deno-merge-", (root) => {
    const a = write(root, "supabase/functions/a/index.ts");
    const b = write(root, "supabase/functions/b/index.ts");
    const runtimePaths = [
      "supabase/functions/a/index.ts",
      "supabase/functions/b/index.ts",
    ];
    const behaviorLcov = lcov([
      { source: a, lines: [[1, 1], [2, 0]] },
      { source: a, lines: [[1, 0], [2, 3]] },
    ]);
    const inventoryLcov = lcov([
      { source: a, lines: [[1, 8], [2, 8]] },
      { source: b, lines: [[1, 9], [2, 9]] },
    ]);

    const merged = mergeRuntimeCoverage({ root, runtimePaths, behaviorLcov, inventoryLcov });

    assert.equal(merged.records.length, 2);
    assert.deepEqual(merged.records[0].lines, [[1, 1], [2, 3]]);
    assert.deepEqual(merged.records[1].lines, [[1, 0], [2, 0]]);
    assert.deepEqual(merged.summary, { hit: 2, found: 4, percent: 50 });
    assert.equal(merged.inventoryPositiveCountsDiscarded, 4);
  });
});

test("merger rejects missing runtime identities, outside paths, unexpected sources, and malformed counts", () => {
  withTempRoot("maiprop-deno-reject-", (root) => {
    const a = write(root, "supabase/functions/a/index.ts");
    const b = write(root, "supabase/functions/b/index.ts");
    const runtimePaths = [
      "supabase/functions/a/index.ts",
      "supabase/functions/b/index.ts",
    ];
    const onlyA = lcov([{ source: a, lines: [[1, 1]] }]);

    assert.throws(
      () => mergeRuntimeCoverage({ root, runtimePaths, behaviorLcov: "", inventoryLcov: onlyA }),
      /missing runtime coverage identity.*b\/index\.ts/i,
    );
    assert.throws(
      () => mergeRuntimeCoverage({
        root,
        runtimePaths,
        behaviorLcov: lcov([{ source: resolve(root, "..", "outside.ts"), lines: [[1, 1]] }]),
        inventoryLcov: lcov([
          { source: a, lines: [[1, 0]] },
          { source: b, lines: [[1, 0]] },
        ]),
      }),
      /outside repository/i,
    );
    assert.throws(
      () => mergeRuntimeCoverage({
        root,
        runtimePaths,
        behaviorLcov: lcov([{ source: write(root, "supabase/functions/a/helper.ts"), lines: [[1, 1]] }]),
        inventoryLcov: lcov([
          { source: a, lines: [[1, 0]] },
          { source: b, lines: [[1, 0]] },
        ]),
      }),
      /unexpected coverage source/i,
    );
    assert.throws(
      () => mergeRuntimeCoverage({
        root,
        runtimePaths,
        behaviorLcov: "",
        inventoryLcov: `TN:\nSF:${a}\nDA:1,nope\nLF:1\nLH:0\nend_of_record\n`,
      }),
      /invalid DA count/i,
    );
  });
});

test("threshold enforcement uses the weighted aggregate", () => {
  assert.doesNotThrow(() => assertCoverageThreshold({ hit: 80, found: 100 }, 80));
  assert.throws(
    () => assertCoverageThreshold({ hit: 79, found: 100 }, 80),
    /79\.00%.*80\.00%/,
  );
});

test("official Deno identities produce truthful zero, partial, and full branch-fixture coverage", () => {
  withTempRoot("maiprop-deno-official-", (root) => {
    const branchPath = write(root, "branch.ts", [
      "export function choose(flag: boolean): string {",
      "  if (flag) {",
      "    return 'yes';",
      "  }",
      "  return 'no';",
      "}",
      "",
    ].join("\n"));
    write(root, "inventory.ts", "import './branch.ts';\nDeno.test('inventory', () => {});\n");
    write(root, "partial.test.ts", "import { choose } from './branch.ts';\nDeno.test('partial', () => { if (choose(true) !== 'yes') throw Error('bad'); });\n");
    write(root, "full.test.ts", "import { choose } from './branch.ts';\nDeno.test('full', () => { if (choose(true) !== 'yes' || choose(false) !== 'no') throw Error('bad'); });\n");

    const collect = (name) => {
      const raw = join(root, `${name}-raw`);
      const output = join(root, `${name}.lcov`);
      execFileSync(deno, [
        "test",
        "--no-config",
        "--cached-only",
        "--deny-net",
        `--coverage=${raw}`,
        "--coverage-raw-data-only",
        name === "inventory" ? "inventory.ts" : `${name}.test.ts`,
      ], { cwd: root, stdio: "pipe" });
      execFileSync(deno, [
        "coverage",
        "--lcov",
        "--exclude=inventory\\.ts$",
        `--output=${output}`,
        raw,
      ], {
        cwd: root,
        stdio: "pipe",
      });
      return readFileSync(output, "utf8");
    };

    const inventoryLcov = collect("inventory");
    const zero = mergeRuntimeCoverage({
      root,
      runtimePaths: [relative(root, branchPath).replaceAll("\\", "/")],
      behaviorLcov: "",
      inventoryLcov,
    });
    const partial = mergeRuntimeCoverage({
      root,
      runtimePaths: ["branch.ts"],
      behaviorLcov: collect("partial"),
      inventoryLcov,
    });
    const full = mergeRuntimeCoverage({
      root,
      runtimePaths: ["branch.ts"],
      behaviorLcov: collect("full"),
      inventoryLcov,
    });

    assert.equal(zero.records[0].path, "branch.ts");
    assert.equal(zero.summary.hit, 0);
    assert.ok(zero.summary.found > 0);
    assert.ok(partial.summary.hit > zero.summary.hit);
    assert.ok(partial.summary.hit < full.summary.hit);
    assert.equal(full.summary.hit, full.summary.found);
  });
});
