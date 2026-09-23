import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import { collectDenoTestFiles } from "./deno-test-discovery-lib.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const functionsDir = resolve(repoRoot, "supabase/functions");
const requested = process.argv.slice(2);
const standardDeno = join(
  homedir(),
  ".deno",
  "bin",
  process.platform === "win32" ? "deno.exe" : "deno",
);
const deno = process.env.MAIPROP_DENO ?? (existsSync(standardDeno) ? standardDeno : "deno");

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
  : collectDenoTestFiles(functionsDir)
).sort();

for (const file of testFiles) {
  const testPath = relative(functionsDir, file);
  console.log(`\n> deno test ${testPath}`);
  const result = spawnSync(
    deno,
    [
      "test",
      "--node-modules-dir=none",
      "--frozen",
      "--import-map=coverage-import-map.json",
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
