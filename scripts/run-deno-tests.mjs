import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const functionsDir = resolve(repoRoot, "supabase/functions");
const requested = process.argv.slice(2);

function collectTestFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectTestFiles(fullPath, files);
    } else if (entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function toFunctionRelativePath(input) {
  const normalized = input.replaceAll("\\", "/");
  const prefix = "supabase/functions/";
  const withoutPrefix = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
  return withoutPrefix.split("/").join(sep);
}

const testFiles = (requested.length > 0
  ? requested.map((file) => resolve(functionsDir, toFunctionRelativePath(file)))
  : collectTestFiles(functionsDir)
).sort();

for (const file of testFiles) {
  const testPath = relative(functionsDir, file);
  console.log(`\n> deno test ${testPath}`);
  const result = spawnSync(
    "deno",
    [
      "test",
      "--node-modules-dir=none",
      "--allow-env",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      testPath,
    ],
    {
      cwd: functionsDir,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
