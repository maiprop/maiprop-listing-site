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
