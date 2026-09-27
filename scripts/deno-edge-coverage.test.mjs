import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  assertBehavioralSourceIdentities,
  assertCoverageThreshold,
  captureCoverageInputs,
  discoverRuntimeManifest,
  finalizeCoverageResult,
  mergeRuntimeCoverage,
  renderInventoryHarness,
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

test("runtime manifest rejects direct, re-exported, and dynamic test-support dependencies", () => {
  withTempRoot("maiprop-deno-boundary-", (root) => {
    const functionsDir = join(root, "supabase", "functions");
    write(functionsDir, "_shared/coverage-test-support/fake.ts");

    for (const source of [
      "import { value } from '../_shared/coverage-test-support/fake.ts';\nexport { value };\n",
      "export { value } from '../_shared/coverage-test-support/fake.ts';\n",
      "export const loaded = await import('../_shared/coverage-test-support/fake.ts');\n",
    ]) {
      write(functionsDir, "example/index.ts", source);
      assert.throws(
        () => discoverRuntimeManifest({ root, functionsDir }),
        /runtime source imports excluded test support.*example\/index\.ts/i,
      );
    }
  });
});

test("runtime manifest permits dependency replacement only through a scoped test import map", () => {
  withTempRoot("maiprop-deno-test-map-", (root) => {
    const functionsDir = join(root, "supabase", "functions");
    write(functionsDir, "_shared/coverage-test-support/fake.ts", "export const value = 42;\n");
    write(functionsDir, "example/index.ts", [
      "import { value } from 'test-provider';",
      "export const actual = value;",
      "",
    ].join("\n"));
    write(functionsDir, "example/index.test.ts", [
      "import { actual } from './index.ts';",
      "Deno.test('uses scoped replacement', () => {",
      "  if (actual !== 42) throw new Error('scoped replacement was not applied');",
      "});",
      "",
    ].join("\n"));
    const importMap = write(functionsDir, "coverage-import-map.json", `${JSON.stringify({
      scopes: {
        "./example/": {
          "test-provider": "./_shared/coverage-test-support/fake.ts",
        },
      },
    }, null, 2)}\n`);

    const manifest = discoverRuntimeManifest({ root, functionsDir });
    assert.deepEqual(manifest.included, [{ path: "supabase/functions/example/index.ts" }]);
    assert.doesNotThrow(() => execFileSync(deno, [
      "test",
      "--no-config",
      "--cached-only",
      "--frozen",
      "--deny-net",
      `--import-map=${importMap}`,
      "example/index.test.ts",
    ], { cwd: functionsDir, stdio: "pipe" }));
  });
});

test("finalization rejects source drift before writing an accepted result", () => {
  withTempRoot("maiprop-deno-finalization-", (root) => {
    const functionsDir = join(root, "supabase", "functions");
    write(functionsDir, "example/index.ts", "export const value = 1;\n");
    write(functionsDir, "example/index.test.ts", "Deno.test('example', () => {});\n");
    write(functionsDir, "_shared/coverage-test-support/fake.ts");
    write(functionsDir, "coverage-import-map.json", "{\"imports\":{}}\n");
    write(functionsDir, "deno.json", "{\"nodeModulesDir\":\"none\"}\n");
    const reproducibilityPaths = [
      "supabase/functions/coverage-import-map.json",
      "supabase/functions/deno.json",
    ];
    const initialInputs = captureCoverageInputs({ root, functionsDir, reproducibilityPaths });
    assert.equal(
      initialInputs.excluded.find((entry) => entry.reason === "coverage-test-support")?.sha256.length,
      64,
    );
    assert.deepEqual(
      initialInputs.reproducibility.map((entry) => entry.path),
      reproducibilityPaths,
    );
    assert.equal(initialInputs.harnessSetSha256.length, 64);

    const resultPath = join(root, "accepted-result.json");
    const assertFinalizationRejected = (pattern) => {
      let acceptedArtifactsWritten = false;
      const currentInputs = captureCoverageInputs({ root, functionsDir, reproducibilityPaths });
      assert.throws(
        () => finalizeCoverageResult({
          initialInputs,
          currentInputs,
          resultPath,
          result: { coverage: { hit: 1, found: 1, percent: 100 } },
          summary: { hit: 1, found: 1, percent: 100 },
          threshold: 0,
          writeAcceptedArtifacts: () => { acceptedArtifactsWritten = true; },
        }),
        pattern,
      );
      assert.equal(acceptedArtifactsWritten, false);
      assert.equal(existsSync(resultPath), false);
    };

    write(functionsDir, "example/index.ts", "export const value = 2;\n");
    assertFinalizationRejected(/coverage inputs changed.*example\/index\.ts changed in included/i);

    write(functionsDir, "example/index.ts", "export const value = 1;\n");
    write(functionsDir, "future/new-runtime.ts");
    assertFinalizationRejected(/coverage inputs changed.*future\/new-runtime\.ts was added to included/i);
    rmSync(join(functionsDir, "future"), { recursive: true, force: true });

    write(functionsDir, "coverage-import-map.json", "{\"imports\":{\"changed\":\"./changed.ts\"}}\n");
    assertFinalizationRejected(/coverage inputs changed.*coverage-import-map\.json changed in reproducibility/i);
    write(functionsDir, "coverage-import-map.json", "{\"imports\":{}}\n");

    write(functionsDir, "_shared/coverage-test-support/fake.ts", "export const value = 2;\n");
    assertFinalizationRejected(/coverage inputs changed.*fake\.ts changed in excluded/i);
  });
});

test("inventory harness rejects a fetch attempt even when the imported module catches it", () => {
  withTempRoot("maiprop-deno-inventory-transport-", (root) => {
    const safeModulePath = write(root, "safe.ts", "export const loaded = true;\n");
    const safeHarnessPath = write(root, "safe-inventory.ts", renderInventoryHarness({
      moduleUrls: [pathToFileURL(safeModulePath).href],
    }));
    assert.doesNotThrow(() => execFileSync(deno, [
      "test",
      "--no-config",
      "--cached-only",
      "--frozen",
      "--allow-env",
      "--allow-read",
      "--deny-net",
      safeHarnessPath,
    ], { cwd: root, encoding: "utf8", stdio: "pipe" }));

    const modulePath = write(root, "caught-fetch.ts", [
      "try {",
      "  await fetch('https://inventory-transport.invalid');",
      "} catch {",
      "  // Optional initialization must not hide that transport was attempted.",
      "}",
      "export const loaded = true;",
      "",
    ].join("\n"));
    const harnessPath = write(root, "runtime-inventory.ts", renderInventoryHarness({
      moduleUrls: [pathToFileURL(modulePath).href],
    }));

    assert.throws(
      () => execFileSync(deno, [
        "test",
        "--no-config",
        "--cached-only",
        "--frozen",
        "--allow-env",
        "--allow-read",
        "--deny-net",
        harnessPath,
      ], { cwd: root, encoding: "utf8", stdio: "pipe" }),
      (error) => /inventory transport attempted.*fetch/i.test(`${error.stdout ?? ""}${error.stderr ?? ""}`),
    );
  });
});

test("inventory harness rejects undefined import failures and restores intercepted APIs", () => {
  withTempRoot("maiprop-deno-inventory-undefined-", (root) => {
    const fixtures = [
      ["safe", "export const loaded = true;\n", false],
      ["throw-undefined", "throw undefined;\nexport {};\n", true],
      ["reject-undefined", "await Promise.reject(undefined);\nexport {};\n", true],
    ];
    for (const [name, source, shouldFail] of fixtures) {
      const modulePath = write(root, `${name}.ts`, source);
      const harnessPath = write(root, `${name}-inventory.ts`, renderInventoryHarness({
        moduleUrls: [pathToFileURL(modulePath).href],
      }));
      const args = ["test", "--no-config", "--cached-only", "--frozen", "--allow-env", "--allow-read", "--deny-net", harnessPath];
      if (shouldFail) {
        assert.throws(() => execFileSync(deno, args, { cwd: root, encoding: "utf8", stdio: "pipe" }),
          (error) => /error: Test failed/.test(`${error.stdout ?? ""}${error.stderr ?? ""}`)
            && !/SyntaxError|TS\d{4}/.test(`${error.stdout ?? ""}${error.stderr ?? ""}`));
      } else {
        assert.doesNotThrow(() => execFileSync(deno, args, { cwd: root, encoding: "utf8", stdio: "pipe" }));
      }
    }

    for (const name of ["throw-undefined", "reject-undefined"]) {
      const rejectedPath = join(root, `${name}-inventory.ts`);
      const wrapperPath = write(root, `${name}-restoration.test.ts`, [
        "const originalFetch = globalThis.fetch;",
        "const originalSetTimeout = globalThis.setTimeout;",
        "const originalSetInterval = globalThis.setInterval;",
        "const originalServe = Deno.serve;",
        "let caught = false;",
        `try { await import(${JSON.stringify(pathToFileURL(rejectedPath).href)}); } catch (error) { caught = true; if (error !== undefined) throw error; }`,
        "Deno.test('undefined rejection restores intercepted APIs', () => {",
        "  if (!caught) throw new Error('inventory failure was accepted');",
        "  if (globalThis.fetch !== originalFetch || globalThis.setTimeout !== originalSetTimeout || globalThis.setInterval !== originalSetInterval || Deno.serve !== originalServe) throw new Error('intercepted API was not restored');",
        "  const key = 'MAIPROP_INVENTORY_RESTORATION_SENTINEL';",
        "  const previous = Deno.env.get(key);",
        "  try { Deno.env.set(key, 'restored'); if (Deno.env.get(key) !== 'restored') throw new Error('env set/get not restored'); Deno.env.delete(key); if (Deno.env.get(key) !== undefined) throw new Error('env delete not restored'); }",
        "  finally { if (previous === undefined) Deno.env.delete(key); else Deno.env.set(key, previous); }",
        "});",
        "",
      ].join("\n"));
      assert.doesNotThrow(() => execFileSync(deno, [
        "test", "--no-config", "--cached-only", "--frozen", "--allow-env", "--allow-read", "--deny-net", wrapperPath,
      ], { cwd: root, encoding: "utf8", stdio: "pipe" }));
    }

    const transportThenUndefined = write(root, "caught-fetch-then-undefined.ts", [
      "try { await fetch('https://inventory-transport.invalid'); } catch { /* caught by runtime */ }",
      "throw undefined;",
      "export {};",
      "",
    ].join("\n"));
    const precedenceHarness = write(root, "transport-precedence-inventory.ts", renderInventoryHarness({
      moduleUrls: [pathToFileURL(transportThenUndefined).href],
    }));
    assert.throws(() => execFileSync(deno, [
      "test", "--no-config", "--cached-only", "--frozen", "--allow-env", "--allow-read", "--deny-net", precedenceHarness,
    ], { cwd: root, encoding: "utf8", stdio: "pipe" }),
    (error) => /inventory transport attempted.*fetch/.test(`${error.stdout ?? ""}${error.stderr ?? ""}`));
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

test("relocated original source identity must come from actual behavioral LCOV", () => {
  withTempRoot("maiprop-deno-relocated-", (root) => {
    const original = write(root, "supabase/functions/example/index.ts", "export function value() { return 7; }\n");
    const copied = write(root, "supabase/functions/copied/index.ts", readFileSync(original, "utf8"));
    const unhit = write(root, "supabase/functions/unhit/index.ts", "export function untouched() { return 9; }\n");
    const runtimePaths = [original, copied, unhit].map((path) => relative(root, path).replaceAll("\\", "/"));
    write(root, "inventory.test.ts", [
      "import './supabase/functions/example/index.ts';",
      "import './supabase/functions/copied/index.ts';",
      "import './supabase/functions/unhit/index.ts';",
      "Deno.test('inventory', () => {});",
      "",
    ].join("\n"));
    write(root, "wrong.test.ts", "import { value } from './supabase/functions/copied/index.ts';\nDeno.test('wrong copy', () => { if (value() !== 7) throw Error('bad'); });\n");
    write(root, "correct.test.ts", "import { value } from './supabase/functions/example/index.ts';\nDeno.test('original', () => { if (value() !== 7) throw Error('bad'); });\n");
    const collect = (name) => {
      const raw = join(root, `${name}-raw`);
      const output = join(root, `${name}.lcov`);
      execFileSync(deno, ["test", "--no-config", "--cached-only", "--frozen", "--deny-net", `--coverage=${raw}`, "--coverage-raw-data-only", `${name}.test.ts`], { cwd: root, stdio: "pipe" });
      execFileSync(deno, ["coverage", "--lcov", "--include=.*supabase[/\\\\]functions[/\\\\].*index\\.ts$", `--output=${output}`, raw], { cwd: root, stdio: "pipe" });
      return readFileSync(output, "utf8");
    };
    const inventoryLcov = collect("inventory");
    const wrongLcov = collect("wrong");
    const correctLcov = collect("correct");
    assert.match(inventoryLcov, /SF:.*example.*index\.ts/);
    assert.doesNotMatch(wrongLcov, /SF:.*example.*index\.ts/);
    assert.match(wrongLcov, /SF:.*copied.*index\.ts/);
    const wrongMerged = mergeRuntimeCoverage({ root, runtimePaths, behaviorLcov: wrongLcov, inventoryLcov });
    assert.ok(wrongMerged.records.some(({ path }) => path === runtimePaths[0]));
    assert.throws(() => assertBehavioralSourceIdentities({ root, runtimePaths, behaviorLcov: wrongLcov, expectedPaths: [runtimePaths[0]] }), /missing relocated production source identity.*example\/index\.ts/i);
    assert.doesNotThrow(() => assertBehavioralSourceIdentities({ root, runtimePaths, behaviorLcov: correctLcov, expectedPaths: [runtimePaths[0]] }));
    const merged = mergeRuntimeCoverage({ root, runtimePaths, behaviorLcov: correctLcov, inventoryLcov });
    assert.equal(merged.records.length, 3);
    assert.ok(merged.records.find(({ path }) => path === runtimePaths[0]).lines.some(([, count]) => count > 0));
    for (const path of runtimePaths.slice(1)) {
      assert.ok(merged.records.find((record) => record.path === path).lines.every(([, count]) => count === 0));
    }
    assert.equal(merged.summary.found, merged.records.reduce((total, record) => total + record.lines.length, 0));
    assert.ok(merged.summary.found > merged.records.find(({ path }) => path === runtimePaths[0]).lines.length);
    assert.doesNotThrow(() => assertBehavioralSourceIdentities({
      root,
      runtimePaths,
      behaviorLcov: lcov([{ source: pathToFileURL(original).href, lines: [[1, 0]] }]),
      expectedPaths: [runtimePaths[0]],
    }));
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
        "--frozen",
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
