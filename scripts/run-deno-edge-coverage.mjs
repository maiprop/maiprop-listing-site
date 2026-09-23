import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertCoverageThreshold,
  discoverRuntimeManifest,
  mergeRuntimeCoverage,
} from "./deno-edge-coverage-lib.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const functionsDir = resolve(repoRoot, "supabase/functions");
const importMap = resolve(functionsDir, "coverage-import-map.json");
const thresholdArgument = process.argv.find((argument) => argument.startsWith("--threshold="));
const threshold = thresholdArgument ? Number(thresholdArgument.slice("--threshold=".length)) : undefined;
if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
  throw new Error(`invalid coverage threshold: ${thresholdArgument}`);
}

function resolveDeno() {
  if (process.env.MAIPROP_DENO) return process.env.MAIPROP_DENO;
  const standard = join(homedir(), ".deno", "bin", process.platform === "win32" ? "deno.exe" : "deno");
  return existsSync(standard) ? standard : "deno";
}

const deno = resolveDeno();
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}-${randomUUID().slice(0, 8)}`;
const coverageRoot = resolve(functionsDir, "coverage");
mkdirSync(coverageRoot, { recursive: true });
const outputDir = resolve(coverageRoot, `edge-${runId}`);
mkdirSync(outputDir, { recursive: false });
const behaviorRaw = resolve(outputDir, "behavior-raw");
const inventoryRaw = resolve(outputDir, "inventory-raw");
mkdirSync(behaviorRaw);
mkdirSync(inventoryRaw);

function run(command, args, { cwd = functionsDir, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw result.error ?? new Error(`${basename(command)} exited ${result.status}`);
  }
  if (!quiet) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  return result.stdout ?? "";
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function writeLcov(path, records) {
  const text = records.map((record) => {
    const hit = record.lines.filter(([, count]) => count > 0).length;
    return [
      "TN:",
      `SF:${resolve(repoRoot, ...record.path.split("/"))}`,
      ...record.lines.map(([line, count]) => `DA:${line},${count}`),
      `LF:${record.lines.length}`,
      `LH:${hit}`,
      "end_of_record",
    ].join("\n");
  }).join("\n");
  writeFileSync(path, `${text}\n`);
}

function summarizeOfficialLcov(text) {
  const found = [...text.matchAll(/^LF:(\d+)\r?$/gm)]
    .reduce((total, match) => total + Number(match[1]), 0);
  const hit = [...text.matchAll(/^LH:(\d+)\r?$/gm)]
    .reduce((total, match) => total + Number(match[1]), 0);
  return { records: [...text.matchAll(/^SF:/gm)].length, hit, found };
}

const manifest = discoverRuntimeManifest({ root: repoRoot, functionsDir });
const included = manifest.included.map(({ path }) => {
  const bytes = readFileSync(resolve(repoRoot, ...path.split("/")));
  return { path, sha256: sha256(bytes) };
});
const excluded = manifest.excluded.map(({ path, reason }) => {
  const bytes = readFileSync(resolve(repoRoot, ...path.split("/")));
  return { path, reason, sha256: sha256(bytes) };
});
const sourceSetSha256 = sha256(included.map(({ path, sha256: hash }) => `${path}\0${hash}\n`).join(""));
const manifestPath = resolve(outputDir, "runtime-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify({ sourceSetSha256, included, excluded }, null, 2)}\n`);

const testFiles = manifest.excluded
  .filter(({ reason }) => reason === "test")
  .map(({ path }) => resolve(repoRoot, ...path.split("/")))
  .sort();

const inventoryTest = resolve(outputDir, "runtime-inventory.ts");
const inventoryImports = included.map(({ path }) => {
  const url = pathToFileURL(resolve(repoRoot, ...path.split("/"))).href;
  return `  await import(${JSON.stringify(url)});`;
}).join("\n");
writeFileSync(inventoryTest, `
const originalServe = Deno.serve;
const originalEnvGet = Deno.env.get.bind(Deno.env);
const originalEnvSet = Deno.env.set.bind(Deno.env);
const originalEnvDelete = Deno.env.delete.bind(Deno.env);
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalSetInterval = globalThis.setInterval;
const values = new Map<string, string>([
  ["SUPABASE_URL", "https://inventory.test"],
  ["SUPABASE_ANON_KEY", "inventory-anon-key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "inventory-service-role-key"],
  ["STRIPE_SECRET_KEY", "sk_test_inventory"],
  ["FRONTEND_URL", "https://inventory.test"],
  ["SITE_URL", "https://inventory.test"],
  ["ENVIRONMENT", "test"],
  ["RATE_LIMIT_FORCE_MEMORY", "true"],
]);
const env = Deno.env as typeof Deno.env & {
  get: typeof Deno.env.get;
  set: typeof Deno.env.set;
  delete: typeof Deno.env.delete;
};
env.get = ((key: string) => values.get(key) ?? (/(?:URL|ORIGIN)$/.test(key) ? "https://inventory.test" : "inventory-value")) as typeof Deno.env.get;
env.set = ((key: string, value: string) => { values.set(key, value); }) as typeof Deno.env.set;
env.delete = ((key: string) => { values.delete(key); }) as typeof Deno.env.delete;
(Deno as typeof Deno & { serve: typeof Deno.serve }).serve = (() => ({
  finished: Promise.resolve(),
  shutdown: () => Promise.resolve(),
  ref: () => {},
  unref: () => {},
  addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
})) as unknown as typeof Deno.serve;
globalThis.fetch = (() => { throw new Error("inventory transport blocked"); }) as typeof fetch;
globalThis.setTimeout = (() => 0) as typeof setTimeout;
globalThis.setInterval = (() => 0) as typeof setInterval;

try {
${inventoryImports}
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.setInterval = originalSetInterval;
  (Deno as typeof Deno & { serve: typeof Deno.serve }).serve = originalServe;
  env.get = originalEnvGet;
  env.set = originalEnvSet;
  env.delete = originalEnvDelete;
}

Deno.test("imports every runtime source without transport", () => {});
`);

process.stdout.write(`[inventory] importing ${included.length} runtime sources\n`);
run(deno, [
  "test",
  "--node-modules-dir=none",
  "--cached-only",
  "--frozen",
  "--allow-env",
  "--allow-read",
  `--allow-write=${outputDir},${tmpdir()}`,
  "--deny-net",
  `--coverage=${inventoryRaw}`,
  "--coverage-raw-data-only",
  inventoryTest,
], { quiet: true });

let passedCases = 0;
for (const [index, testFile] of testFiles.entries()) {
  const testPath = relative(functionsDir, testFile);
  process.stdout.write(`[behavior ${index + 1}/${testFiles.length}] ${testPath}\n`);
  const output = run(deno, [
    "test",
    "--node-modules-dir=none",
    "--cached-only",
    "--frozen",
    "--allow-env",
    "--allow-read",
    `--allow-write=${outputDir},${tmpdir()}`,
    "--allow-net=127.0.0.1,localhost",
    `--import-map=${importMap}`,
    `--coverage=${behaviorRaw}`,
    "--coverage-raw-data-only",
    testPath,
  ], { quiet: true });
  const match = /ok \| (\d+) passed \| 0 failed/.exec(output);
  if (!match) throw new Error(`could not verify passing case count for ${testPath}`);
  passedCases += Number(match[1]);
}

const includeRuntime = "^file:.*[/\\\\]supabase[/\\\\]functions[/\\\\]";
const excludeSupport = "(?:^|[/\\\\])coverage[/\\\\]|(?:^|[/\\\\])(?:[^/\\\\]+\\.)?(?:test|spec)\\.(?:ts|tsx)$|testUtils\\.ts$|coverage-test-support|\\.openapi\\.snapshot\\.ts$|(?:create-checkout|fetch-os-auctions)[/\\\\]types\\.ts$";
const behaviorLcovPath = resolve(outputDir, "behavior-official.lcov");
const inventoryLcovPath = resolve(outputDir, "inventory-official.lcov");
for (const [raw, output] of [[behaviorRaw, behaviorLcovPath], [inventoryRaw, inventoryLcovPath]]) {
  run(deno, [
    "coverage",
    "--lcov",
    `--include=${includeRuntime}`,
    `--exclude=${excludeSupport}`,
    `--output=${output}`,
    raw,
  ], { quiet: true });
}

const behaviorLcov = readFileSync(behaviorLcovPath, "utf8");
const inventoryLcov = readFileSync(inventoryLcovPath, "utf8");
const merged = mergeRuntimeCoverage({
  root: repoRoot,
  runtimePaths: included.map(({ path }) => path),
  behaviorLcov,
  inventoryLcov,
});
const mergedPath = resolve(outputDir, "runtime-merged.lcov");
writeLcov(mergedPath, merged.records);
const zeroHitRuntimePaths = merged.records
  .filter(({ lines }) => lines.every(([, count]) => count === 0))
  .map(({ path }) => path);

const relocatedServices = Object.keys(JSON.parse(readFileSync(importMap, "utf8")).scopes)
  .map((scope) => scope.replace(/^\.\//, "").replace(/\/$/, ""));
const relocatedSourceIdentities = relocatedServices.map((service) => `supabase/functions/${service}/index.ts`);
const mergedPathSet = new Set(merged.records.map(({ path }) => path));
for (const path of relocatedSourceIdentities) {
  if (!mergedPathSet.has(path)) throw new Error(`missing relocated production source identity: ${path}`);
}

const denoVersion = run(deno, ["--version"], { quiet: true }).trim().split(/\r?\n/);
const result = {
  runId,
  outputDir: relative(repoRoot, outputDir).replaceAll("\\", "/"),
  runtime: { node: process.version, deno: denoVersion },
  sourceSetSha256,
  manifest: {
    included: included.length,
    excluded: excluded.length,
    exclusionsByReason: Object.fromEntries(
      [...new Set(excluded.map(({ reason }) => reason))].sort().map((reason) => [
        reason,
        excluded.filter((entry) => entry.reason === reason).length,
      ]),
    ),
  },
  behavior: { files: testFiles.length, cases: passedCases },
  inventory: {
    files: included.length,
    positiveLineCountsDiscarded: merged.inventoryPositiveCountsDiscarded,
  },
  officialRawTotals: {
    behavior: summarizeOfficialLcov(behaviorLcov),
    inventory: summarizeOfficialLcov(inventoryLcov),
  },
  coverage: merged.summary,
  zeroHitRuntimePaths,
  threshold: threshold === undefined ? null : {
    percent: threshold,
    meets: merged.summary.percent >= threshold,
  },
  relocatedSourceIdentities,
  networkPolicy: "loopback-only behavior tests; deny-net inventory; cached-only and frozen throughout",
  artifacts: {
    manifest: relative(repoRoot, manifestPath).replaceAll("\\", "/"),
    behaviorOfficialLcov: relative(repoRoot, behaviorLcovPath).replaceAll("\\", "/"),
    inventoryOfficialLcov: relative(repoRoot, inventoryLcovPath).replaceAll("\\", "/"),
    mergedLcov: relative(repoRoot, mergedPath).replaceAll("\\", "/"),
  },
};
const resultPath = resolve(outputDir, "result.json");
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (threshold !== undefined) assertCoverageThreshold(merged.summary, threshold);
