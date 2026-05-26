import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const functionsDir = resolve(repoRoot, "supabase/functions");
const requested = process.argv.slice(2);

function collectFunctionEntrypoints() {
  return readdirSync(functionsDir)
    .map((entry) => resolve(functionsDir, entry))
    .filter((fullPath) => statSync(fullPath).isDirectory())
    .filter((fullPath) => !fullPath.endsWith(`${sep}node_modules`))
    .map((fullPath) => resolve(fullPath, "index.ts"))
    .filter((entrypoint) => {
      try {
        return statSync(entrypoint).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function toFunctionRelativePath(input) {
  const normalized = input.replaceAll("\\", "/");
  const prefix = "supabase/functions/";
  const withoutPrefix = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
  return withoutPrefix.split("/").join(sep);
}

const entrypoints = (requested.length > 0
  ? requested.map((file) => resolve(functionsDir, toFunctionRelativePath(file)))
  : collectFunctionEntrypoints()
).sort();

if (entrypoints.length === 0) {
  console.log("[check-edge-functions] No Supabase Edge Function entrypoints found.");
  process.exit(0);
}

for (const entrypoint of entrypoints) {
  const relativeEntrypoint = relative(functionsDir, entrypoint);
  console.log(`\n> deno check ${relativeEntrypoint}`);
  const result = spawnSync(
    "deno",
    ["check", "--node-modules-dir=none", relativeEntrypoint],
    {
      cwd: functionsDir,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[check-edge-functions] OK - ${entrypoints.length} entrypoint(s) checked.`);
