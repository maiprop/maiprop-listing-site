import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");
const functionsDir = resolve(repoRoot, "supabase/functions");
const configPath = resolve(repoRoot, "supabase/config.toml");
const publicFunctionRegisterPath = resolve(repoRoot, "docs/security/public-edge-functions.md");
const DENO_CHECK_ATTEMPTS = 3;
const DENO_CHECK_RETRY_DELAY_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export function parsePublicFunctionNames(configText) {
  const publicFunctions = [];
  const sections = configText.split(/\r?\n(?=\[functions\.)/g);

  for (const section of sections) {
    const name = section.match(/^\[functions\.([^\]]+)\]/)?.[1];
    if (!name) continue;
    if (/^\s*verify_jwt\s*=\s*false\s*$/m.test(section)) publicFunctions.push(name);
  }

  return publicFunctions.sort();
}

const parseRegisteredPublicFunctionNames = (registerText) => {
  const names = new Set();
  for (const line of registerText.split(/\r?\n/g)) {
    if (!line.trim().startsWith("|")) continue;
    const columns = line.split("|").map((part) => part.trim());
    const name = columns[1];
    if (!name || name === "---" || /^function$/i.test(name)) continue;
    names.add(name.replace(/`/g, ""));
  }
  return names;
};

export function validatePublicFunctionRegister({ configText, registerText }) {
  const publicFunctions = parsePublicFunctionNames(configText);
  const registered = parseRegisteredPublicFunctionNames(registerText);
  const missing = publicFunctions.filter((name) => !registered.has(name));
  return { publicFunctions, missing };
}

const checkPublicFunctionRegister = () => {
  const registerText = existsSync(publicFunctionRegisterPath)
    ? readFileSync(publicFunctionRegisterPath, "utf8")
    : "";
  const result = validatePublicFunctionRegister({
    configText: readFileSync(configPath, "utf8"),
    registerText,
  });

  if (result.missing.length > 0) {
    console.error("[check-edge-functions] Public Edge Function register is incomplete.");
    for (const name of result.missing) {
      console.error(`  - ${name} is verify_jwt=false but is missing from docs/security/public-edge-functions.md`);
    }
    process.exit(1);
  }

  console.log(`[check-edge-functions] Public register OK - ${result.publicFunctions.length} verify_jwt=false function(s) documented.`);
};

async function runDenoChecks(requested) {
  const entrypoints = (requested.length > 0
    ? requested.map((file) => resolve(functionsDir, toFunctionRelativePath(file)))
    : collectFunctionEntrypoints()
  ).sort();

  if (entrypoints.length === 0) {
    console.log("[check-edge-functions] No Supabase Edge Function entrypoints found.");
    return;
  }

  for (const entrypoint of entrypoints) {
    const relativeEntrypoint = relative(functionsDir, entrypoint);
    let result;
    for (let attempt = 1; attempt <= DENO_CHECK_ATTEMPTS; attempt += 1) {
      console.log(`\n> deno check ${relativeEntrypoint}${attempt > 1 ? ` (attempt ${attempt}/${DENO_CHECK_ATTEMPTS})` : ""}`);
      result = spawnSync(
        "deno",
        ["check", "--node-modules-dir=none", relativeEntrypoint],
        {
          cwd: functionsDir,
          stdio: "inherit",
        },
      );

      if (result.status === 0) break;
      if (attempt < DENO_CHECK_ATTEMPTS) {
        console.warn(
          `[check-edge-functions] deno check failed for ${relativeEntrypoint} on attempt ${attempt}; retrying after transient dependency fetch failure...`,
        );
        await sleep(DENO_CHECK_RETRY_DELAY_MS);
      }
    }

    if (!result || result.status !== 0) {
      process.exit(result?.status ?? 1);
    }
  }

  console.log(`\n[check-edge-functions] OK - ${entrypoints.length} entrypoint(s) checked.`);
}

async function main() {
  checkPublicFunctionRegister();
  await runDenoChecks(process.argv.slice(2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-edge-functions.mjs")
) {
  main();
}
