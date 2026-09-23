import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const IGNORED_TEST_DIRECTORIES = new Set([
  ".coverage-runs",
  "coverage",
  "node_modules",
]);

export function collectDenoTestFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (IGNORED_TEST_DIRECTORIES.has(entry)) continue;
    const fullPath = resolve(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectDenoTestFiles(fullPath, files);
    } else if (entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}
