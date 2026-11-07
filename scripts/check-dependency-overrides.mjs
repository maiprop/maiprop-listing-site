#!/usr/bin/env node
import { readFileSync } from "node:fs";

function fail(message) {
  console.error(`[check-dependency-overrides] ${message}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function overrideNames(pkg) {
  const overrides = pkg.overrides ?? {};
  if (Array.isArray(overrides) || typeof overrides !== "object") {
    fail("package.json overrides must be an object.");
  }
  return Object.keys(overrides).sort();
}

function findLockedPackages(lock, packageName) {
  return Object.entries(lock.packages ?? {})
    .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`))
    .map(([path, meta]) => ({
      path,
      version: meta.version,
    }));
}

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const overrides = pkg.overrides ?? {};
const rationale = pkg.overridesRationale ?? {};
const names = overrideNames(pkg);
const errors = [];
const summary = [];

for (const name of names) {
  if (!String(overrides[name] ?? "").trim()) {
    errors.push(`${name} has an empty override range.`);
  }

  if (!String(rationale[name] ?? "").trim()) {
    errors.push(`${name} is missing overridesRationale.`);
  }

  const locked = findLockedPackages(lock, name);
  if (locked.length === 0) {
    errors.push(`${name} override does not resolve to any package-lock entry.`);
  }

  summary.push({
    name,
    override: overrides[name],
    locked_versions: [...new Set(locked.map((entry) => entry.version))],
    lock_entries: locked.length,
  });
}

for (const name of Object.keys(rationale)) {
  if (!Object.prototype.hasOwnProperty.call(overrides, name)) {
    errors.push(`${name} has overridesRationale but no active override.`);
  }
}

// These security floors must hold at every resolution, including hoisted copies.
for (const { path, version } of findLockedPackages(lock, "sharp")) {
  const [major, minor, patch] = String(version).split(".").map(Number);
  if (!(major > 0 || minor > 35 || (minor === 35 && patch >= 5))) {
    errors.push(`${path} resolves sharp ${version}, below the 0.35.5 security floor.`);
  }
}

const extractors = findLockedPackages(lock, "extract-zip");
if (extractors.length === 0) {
  errors.push("Puppeteer's patched extract-zip resolution is missing.");
}
for (const { path } of extractors) {
  const entry = lock.packages[path];
  const target = String(entry.resolved ?? "").replaceAll("\\", "/");
  const local = lock.packages[target];
  if (!entry.link || target !== "vendor/safe-extract-zip" ||
      local?.name !== "@maiprop/safe-extract-zip" ||
      local?.version !== "2.0.1-maiprop.1") {
    errors.push(`${path} must link to the reviewed local safe extractor.`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  fail("dependency override metadata is not actionable.");
}

console.log(JSON.stringify({
  checked: true,
  override_count: names.length,
  overrides: summary,
}, null, 2));
