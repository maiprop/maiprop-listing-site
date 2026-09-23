import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
  return { included, excluded };
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

