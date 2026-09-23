import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPE_ONLY_RUNTIME_PATHS = new Set([
  "supabase/functions/create-checkout/types.ts",
  "supabase/functions/fetch-os-auctions/types.ts",
]);
const require = createRequire(import.meta.url);
const ts = require("typescript");

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function walkTypeScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (["coverage", ".coverage-runs", "node_modules"].includes(entry.name)) continue;
      files.push(...walkTypeScriptFiles(absolute));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function assertTypeOnly(path, absolute) {
  const output = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      removeComments: true,
    },
    fileName: absolute,
    reportDiagnostics: true,
  });
  const emitted = output.outputText.trim();
  if (emitted !== "" && emitted !== "export {};") {
    throw new Error(`declared type-only source emits runtime code: ${path}`);
  }
}

function exclusionReason(path, absolute) {
  if (/(^|\/)coverage-test-support\//.test(path)) return "coverage-test-support";
  if (/(^|\/)testUtils\.ts$/.test(path)) return "test-utility";
  if (/\.openapi\.snapshot\.ts$/.test(path)) return "openapi-test-snapshot";
  if (/(^|\/)(?:[^/]+\.)?(?:test|spec)\.tsx?$/.test(path)) return "test";
  if (TYPE_ONLY_RUNTIME_PATHS.has(path)) {
    assertTypeOnly(path, absolute);
    return "type-only";
  }
  return undefined;
}

function moduleSpecifierText(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function assertRuntimeImportBoundary({ root, path, absolute }) {
  const source = readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(
    absolute,
    source,
    ts.ScriptTarget.Latest,
    true,
    absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const inspectSpecifier = (specifier, node) => {
    if (specifier === undefined) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      throw new Error(
        `unsupported dynamic import in runtime source prevents coverage boundary validation: ${path}:${line + 1}:${character + 1}`,
      );
    }
    const withoutSuffix = specifier.replace(/[?#].*$/, "");
    let target;
    if (withoutSuffix.startsWith("file:")) {
      target = fileURLToPath(withoutSuffix);
    } else if (withoutSuffix.startsWith(".")) {
      target = resolve(dirname(absolute), withoutSuffix);
    }
    const normalizedTarget = target ? toPosix(relative(root, target)) : toPosix(withoutSuffix);
    if (/(^|\/)coverage-test-support(?:\/|$)/.test(normalizedTarget)) {
      throw new Error(`runtime source imports excluded test support: ${path} -> ${specifier}`);
    }
  };

  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      inspectSpecifier(moduleSpecifierText(node.moduleSpecifier), node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      inspectSpecifier(moduleSpecifierText(node.arguments[0]), node.arguments[0] ?? node);
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "require"
      && node.arguments.length > 0
    ) {
      inspectSpecifier(moduleSpecifierText(node.arguments[0]), node.arguments[0]);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      inspectSpecifier(moduleSpecifierText(node.moduleReference.expression), node.moduleReference);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

export function discoverRuntimeManifest({ root, functionsDir }) {
  const included = [];
  const excluded = [];

  for (const absolute of walkTypeScriptFiles(functionsDir)) {
    const path = toPosix(relative(root, absolute));
    const reason = exclusionReason(path, absolute);
    if (reason) excluded.push({ path, reason });
    else included.push({ path });
  }

  included.sort((a, b) => a.path.localeCompare(b.path));
  excluded.sort((a, b) => a.path.localeCompare(b.path));
  for (const { path } of included) {
    assertRuntimeImportBoundary({
      root,
      path,
      absolute: resolve(root, ...path.split("/")),
    });
  }
  return { included, excluded };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function hashEntries(entries) {
  return sha256(entries.map((entry) => (
    `${entry.path}\0${entry.reason ?? ""}\0${entry.sha256}\n`
  )).join(""));
}

function hashRepoFile(root, path, extra = {}) {
  const absolute = resolve(root, ...path.split("/"));
  const pathFromRoot = relative(resolve(root), absolute);
  if (isAbsolute(pathFromRoot) || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`coverage input is outside repository: ${path}`);
  }
  return { path: toPosix(pathFromRoot), ...extra, sha256: sha256(readFileSync(absolute)) };
}

export function captureCoverageInputs({ root, functionsDir, reproducibilityPaths = [] }) {
  const manifest = discoverRuntimeManifest({ root, functionsDir });
  const included = manifest.included.map(({ path }) => hashRepoFile(root, path));
  const excluded = manifest.excluded.map(({ path, reason }) => hashRepoFile(root, path, { reason }));
  const reproducibility = reproducibilityPaths
    .map((path) => hashRepoFile(root, toPosix(path)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const sourceSetSha256 = sha256(
    included.map(({ path, sha256: hash }) => `${path}\0${hash}\n`).join(""),
  );
  const harnessSetSha256 = hashEntries([...excluded, ...reproducibility]);
  return {
    sourceSetSha256,
    harnessSetSha256,
    measurementInputSha256: hashEntries([...included, ...excluded, ...reproducibility]),
    included,
    excluded,
    reproducibility,
  };
}

function describeInputDifference(initialInputs, currentInputs) {
  for (const section of ["included", "excluded", "reproducibility"]) {
    const initial = new Map(initialInputs[section].map((entry) => [entry.path, entry]));
    const current = new Map(currentInputs[section].map((entry) => [entry.path, entry]));
    const paths = [...new Set([...initial.keys(), ...current.keys()])].sort();
    for (const path of paths) {
      const before = initial.get(path);
      const after = current.get(path);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        if (!before) return `${path} was added to ${section}`;
        if (!after) return `${path} was removed from ${section}`;
        return `${path} changed in ${section}`;
      }
    }
  }
  return undefined;
}

export function assertCoverageInputsUnchanged(initialInputs, currentInputs) {
  const difference = describeInputDifference(initialInputs, currentInputs);
  if (difference) throw new Error(`coverage inputs changed during collection: ${difference}`);
}

export function finalizeCoverageResult({
  initialInputs,
  currentInputs,
  resultPath,
  result,
  summary,
  threshold,
  writeAcceptedArtifacts,
}) {
  assertCoverageInputsUnchanged(initialInputs, currentInputs);
  if (threshold !== undefined) assertCoverageThreshold(summary, threshold);
  writeAcceptedArtifacts?.();
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

export function renderInventoryHarness({ moduleUrls }) {
  const inventoryImports = moduleUrls
    .map((url) => `  await import(${JSON.stringify(url)});`)
    .join("\n");
  return `
const originalServe = Deno.serve;
const originalEnvGet = Deno.env.get.bind(Deno.env);
const originalEnvSet = Deno.env.set.bind(Deno.env);
const originalEnvDelete = Deno.env.delete.bind(Deno.env);
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalSetInterval = globalThis.setInterval;
const inventoryTransportAttempts: string[] = [];
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
globalThis.fetch = ((input: RequestInfo | URL) => {
  const destination = input instanceof Request ? input.url : String(input);
  inventoryTransportAttempts.push(\`fetch \${destination}\`);
  throw new Error("inventory transport blocked");
}) as typeof fetch;
globalThis.setTimeout = (() => 0) as typeof setTimeout;
globalThis.setInterval = (() => 0) as typeof setInterval;

let inventoryImportFailure: unknown;
try {
${inventoryImports}
} catch (error) {
  inventoryImportFailure = error;
} finally {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.setInterval = originalSetInterval;
  (Deno as typeof Deno & { serve: typeof Deno.serve }).serve = originalServe;
  env.get = originalEnvGet;
  env.set = originalEnvSet;
  env.delete = originalEnvDelete;
}

if (inventoryTransportAttempts.length > 0) {
  throw new Error(\`inventory transport attempted: \${inventoryTransportAttempts.join(", ")}\`);
}
if (inventoryImportFailure !== undefined) throw inventoryImportFailure;

Deno.test("imports every runtime source without transport", () => {});
`;
}

function parseNonNegativeInteger(value, label) {
  if (!/^\d+$/.test(value)) throw new Error(`invalid ${label}: ${value}`);
  return Number(value);
}

function parseLcov(text, label) {
  if (!text.trim()) return [];
  const records = [];
  let current;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;
    if (rawLine.startsWith("TN:")) continue;
    if (rawLine.startsWith("SF:")) {
      if (current) throw new Error(`${label}: SF before end_of_record`);
      const source = rawLine.slice(3);
      if (!source) throw new Error(`${label}: empty SF`);
      current = { source, lines: new Map(), declaredFound: undefined, declaredHit: undefined };
      continue;
    }
    if (!current) throw new Error(`${label}: LCOV field outside a record: ${rawLine}`);
    if (rawLine.startsWith("DA:")) {
      const match = /^DA:(\d+),([^,]+)(?:,.*)?$/.exec(rawLine);
      if (!match) throw new Error(`${label}: invalid DA record: ${rawLine}`);
      const line = parseNonNegativeInteger(match[1], "DA line");
      if (line < 1) throw new Error(`${label}: invalid DA line: ${match[1]}`);
      const count = parseNonNegativeInteger(match[2], "DA count");
      current.lines.set(line, Math.max(current.lines.get(line) ?? 0, count));
    } else if (rawLine.startsWith("LF:")) {
      current.declaredFound = parseNonNegativeInteger(rawLine.slice(3), "LF count");
    } else if (rawLine.startsWith("LH:")) {
      current.declaredHit = parseNonNegativeInteger(rawLine.slice(3), "LH count");
    } else if (rawLine === "end_of_record") {
      const found = current.lines.size;
      const hit = [...current.lines.values()].filter((count) => count > 0).length;
      if (current.declaredFound !== undefined && current.declaredFound !== found) {
        throw new Error(`${label}: LF count ${current.declaredFound} does not match ${found}`);
      }
      if (current.declaredHit !== undefined && current.declaredHit !== hit) {
        throw new Error(`${label}: LH count ${current.declaredHit} does not match ${hit}`);
      }
      records.push(current);
      current = undefined;
    }
  }
  if (current) throw new Error(`${label}: unterminated LCOV record`);
  return records;
}

function normalizeSource(root, source) {
  let absolute;
  try {
    absolute = source.startsWith("file:")
      ? fileURLToPath(source)
      : resolve(root, source);
  } catch (error) {
    throw new Error(`invalid coverage source ${source}: ${error.message}`);
  }
  const pathFromRoot = relative(resolve(root), resolve(absolute));
  if (isAbsolute(pathFromRoot) || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`coverage source is outside repository: ${source}`);
  }
  return toPosix(pathFromRoot);
}

function collectRecords({ root, text, label, runtimeSet }) {
  const sources = new Map();
  for (const record of parseLcov(text, label)) {
    const path = normalizeSource(root, record.source);
    if (!runtimeSet.has(path)) throw new Error(`unexpected coverage source: ${path}`);
    let lines = sources.get(path);
    if (!lines) {
      lines = new Map();
      sources.set(path, lines);
    }
    for (const [line, count] of record.lines) {
      lines.set(line, Math.max(lines.get(line) ?? 0, count));
    }
  }
  return sources;
}

export function mergeRuntimeCoverage({ root, runtimePaths, behaviorLcov, inventoryLcov }) {
  const normalizedRuntimePaths = runtimePaths.map(toPosix);
  const runtimeSet = new Set(normalizedRuntimePaths);
  if (runtimeSet.size !== normalizedRuntimePaths.length) {
    throw new Error("runtime manifest contains duplicate paths");
  }

  const inventory = collectRecords({ root, text: inventoryLcov, label: "inventory LCOV", runtimeSet });
  const behavior = collectRecords({ root, text: behaviorLcov, label: "behavior LCOV", runtimeSet });
  const missing = normalizedRuntimePaths.filter((path) => !inventory.has(path));
  if (missing.length) throw new Error(`missing runtime coverage identity: ${missing.join(", ")}`);

  let inventoryPositiveCountsDiscarded = 0;
  const records = normalizedRuntimePaths.slice().sort().map((path) => {
    const executable = inventory.get(path);
    const observed = behavior.get(path) ?? new Map();
    for (const count of executable.values()) {
      if (count > 0) inventoryPositiveCountsDiscarded += 1;
    }
    for (const line of observed.keys()) {
      if (!executable.has(line)) {
        throw new Error(`behavior line ${path}:${line} is absent from the inventory identity`);
      }
    }
    return {
      path,
      lines: [...executable.keys()]
        .sort((a, b) => a - b)
        .map((line) => [line, observed.get(line) ?? 0]),
    };
  });
  const found = records.reduce((total, record) => total + record.lines.length, 0);
  const hit = records.reduce(
    (total, record) => total + record.lines.filter(([, count]) => count > 0).length,
    0,
  );
  return {
    records,
    summary: { hit, found, percent: found === 0 ? 100 : (hit / found) * 100 },
    inventoryPositiveCountsDiscarded,
  };
}

export function assertCoverageThreshold(summary, threshold) {
  const percent = summary.found === 0 ? 100 : (summary.hit / summary.found) * 100;
  if (percent < threshold) {
    throw new Error(`coverage ${percent.toFixed(2)}% is below threshold ${threshold.toFixed(2)}%`);
  }
}

