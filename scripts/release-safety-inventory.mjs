#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
} from "./cloudflare-http-mutation-policy.mjs";

const root = process.cwd();
const checkMode = process.argv.includes("--check");
const liveFunctionsMode = process.argv.includes("--live-functions") ||
  process.env.RELEASE_SAFETY_LIVE_FUNCTIONS === "true";
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";

const functionDir = join(root, "supabase", "functions");
const configPath = join(root, "supabase", "config.toml");
const workflowDir = join(root, ".github", "workflows");
const envDocs = [
  ".env.example",
  ".env.staging.example",
  "docs/ENV_SETUP.md",
  "docs/SECRETS_ROTATION.md",
  "docs/OS_INTEGRATION.md",
];

const ignoredFunctionDirs = new Set(["_shared", "node_modules"]);
const productionDeployNeeds = [
  "quality",
  "release-safety",
  "e2e",
  "e2e-security-staging",
  "migrations-validate",
  "lighthouse",
];
const documentedEnvAllowlist = new Set([
  "CI",
  "DEV",
  "GITHUB_STEP_SUMMARY",
  "MODE",
  "NODE_ENV",
  "PROD",
  "SSR",
]);

function read(path) {
  return readFileSync(path, "utf8");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function parseFunctionConfig(toml) {
  const functions = new Map();
  let current = null;
  for (const line of toml.split(/\r?\n/)) {
    const section = line.match(/^\s*\[functions\.([A-Za-z0-9_-]+)\]\s*$/);
    if (section) {
      current = section[1];
      functions.set(current, { verify_jwt: null });
      continue;
    }
    if (!current) continue;
    const verify = line.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/);
    if (verify) functions.get(current).verify_jwt = verify[1] === "true";
  }
  return functions;
}

function parseProjectRefFromConfig(toml) {
  const match = toml.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);
  return match?.[1] ?? "";
}

function scanEnvNames() {
  const files = walk(root).filter((file) => {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    if (!/^(src|supabase\/functions|functions|scripts|e2e)\//.test(rel)) return false;
    if (rel.startsWith("coverage/") || rel.startsWith("playwright-report/")) return false;
    if (rel.endsWith(".lock") || rel.endsWith(".png") || rel.endsWith(".jpg") || rel.endsWith(".jpeg")) return false;
    return [".ts", ".tsx", ".js", ".mjs", ".md", ".example", ".yml", ".yaml"].includes(extname(file)) ||
      rel.endsWith(".env.example") ||
      rel.endsWith(".env.staging.example");
  });

  const used = new Set();
  const envReadPatterns = [
    /Deno\.env\.get\(["'`]([A-Z][A-Z0-9_]+)["'`]\)/g,
    /process\.env\.([A-Z][A-Z0-9_]+)/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]+)/g,
  ];
  for (const file of files) {
    const text = read(file);
    for (const pattern of envReadPatterns) {
      for (const match of text.matchAll(pattern)) used.add(match[1]);
    }
  }

  const documented = new Set();
  for (const doc of envDocs) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const text = read(full);
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) documented.add(match[1]);
  }

  return {
    used: [...used].sort(),
    documented: [...documented].sort(),
    undocumented: [...used].filter((name) => !documented.has(name)).sort(),
    undocumented_enforced: [...used]
      .filter((name) => !documented.has(name) && !documentedEnvAllowlist.has(name))
      .sort(),
  };
}

function scanWorkflows() {
  const files = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(workflowDir, name));

  const violations = [];
  const providerHttpMutations = [];
  const secrets = new Set();
  const workflowText = {};
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    const text = read(file);
    workflowText[rel] = text;
    for (const match of text.matchAll(/secrets\.([A-Z0-9_]+)/g)) secrets.add(match[1]);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\blatest\b/.test(line) && !/^\s*runs-on:\s+ubuntu-latest\s*$/.test(line)) {
        violations.push(`${rel}:${index + 1} uses 'latest'`);
      }
      if (line.includes("--no-verify-jwt")) {
        violations.push(`${rel}:${index + 1} uses --no-verify-jwt`);
      }
      if (/gitleaks-action/.test(line)) {
        const nextLines = lines.slice(index + 1, index + 8).join("\n");
        if (/continue-on-error:\s*true/.test(nextLines)) {
          violations.push(`${rel}:${index + 1} makes secret scanning advisory with continue-on-error`);
        }
      }
    });
  }

  for (const [workflowPath, text] of Object.entries(workflowText)) {
    for (const method of findCloudflareHttpMutations(text)) {
      providerHttpMutations.push({
        provider: "cloudflare",
        workflow: workflowPath,
        method,
      });
    }
    const violation = cloudflareHttpMutationViolation({
      workflowPath,
      text,
    });
    if (violation) violations.push(violation);
  }

  const ci = workflowText[".github/workflows/ci.yml"] ?? "";
  const deployBlock = yamlJobBlock(ci, "deploy");
  for (const need of productionDeployNeeds) {
    if (!deployBlock.includes("needs:") || !deployBlock.includes(need)) {
      violations.push(`.github/workflows/ci.yml deploy job does not require '${need}'`);
    }
  }

  const documented = new Set();
  for (const doc of envDocs) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const text = read(full);
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) documented.add(match[1]);
  }
  const undocumentedSecrets = [...secrets].filter((name) => !documented.has(name)).sort();
  for (const secret of undocumentedSecrets) {
    violations.push(`Workflow secret is undocumented: ${secret}`);
  }

  return {
    violations,
    provider_http_mutations: providerHttpMutations,
    secrets: [...secrets].sort(),
    undocumented_secrets: undocumentedSecrets,
  };
}

function yamlJobBlock(text, jobName) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function packageVersion(packageName) {
  const packagePath = join(root, "node_modules", packageName, "package.json");
  if (!existsSync(packagePath)) return "unknown";
  try {
    return JSON.parse(read(packagePath)).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function supabaseCliInvocation(args) {
  const supabaseShim = join(root, "node_modules", "supabase", "dist", "supabase.js");
  if (existsSync(supabaseShim)) {
    return { command: process.execPath, args: [supabaseShim, ...args] };
  }

  const localBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  if (existsSync(localBin)) {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", [quoteCmdArg(localBin), ...args.map(quoteCmdArg)].join(" ")],
      };
    }
    return { command: localBin, args };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", ["npx", "supabase", ...args].map(quoteCmdArg).join(" ")],
    };
  }
  return { command: "npx", args: ["supabase", ...args] };
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function collectLiveFunctionInventory(sourceFunctions) {
  if (!liveFunctionsMode) {
    return {
      checked: false,
      reason: "disabled; pass --live-functions or RELEASE_SAFETY_LIVE_FUNCTIONS=true",
    };
  }

  const configToml = existsSync(configPath) ? read(configPath) : "";
  const projectRef = process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
    process.env.SUPABASE_PROJECT_REF ||
    process.env.VITE_SUPABASE_PROJECT_ID ||
    parseProjectRefFromConfig(configToml) ||
    "";
  if (!projectRef) {
    return {
      checked: true,
      error: "Missing RELEASE_SAFETY_SUPABASE_PROJECT_REF, SUPABASE_PROJECT_REF, VITE_SUPABASE_PROJECT_ID, and supabase/config.toml project_id",
      deployed: [],
      live_missing_repo: [],
      repo_missing_live: [],
    };
  }

  try {
    const { command, args } = supabaseCliInvocation(["functions", "list", "--project-ref", projectRef]);
    const output = execFileSync(
      command,
      args,
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const deployed = parseSupabaseFunctionsList(output);
    return {
      checked: true,
      project_ref: projectRef,
      deployed,
      live_missing_repo: deployed.filter((name) => !sourceFunctions.includes(name)).sort(),
      repo_missing_live: sourceFunctions.filter((name) => !deployed.includes(name)).sort(),
    };
  } catch (error) {
    return {
      checked: true,
      project_ref: projectRef,
      error: error.stderr?.toString() || error.message,
      deployed: [],
      live_missing_repo: [],
      repo_missing_live: [],
    };
  }
}

function parseSupabaseFunctionsList(output) {
  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^ID\s+/.test(trimmed) || /^[|\-\s]+$/.test(trimmed)) continue;
    const pipeCells = trimmed.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (
      pipeCells.length >= 2 &&
      /^[A-Za-z0-9_-]+$/.test(pipeCells[1]) &&
      !/^-+$/.test(pipeCells[1])
    ) {
      names.add(pipeCells[1]);
      continue;
    }
    const columns = trimmed.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    if (columns.length >= 2 && /^[A-Za-z0-9_-]+$/.test(columns[1]) && !/^-+$/.test(columns[1])) {
      names.add(columns[1]);
    }
  }
  return [...names].sort();
}

function collectInventory() {
  const configured = parseFunctionConfig(read(configPath));
  const sourceFunctions = readdirSync(functionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !ignoredFunctionDirs.has(name))
    .filter((name) => existsSync(join(functionDir, name, "index.ts")))
    .sort();

  const configuredFunctions = [...configured.keys()].sort();
  const missingConfig = sourceFunctions.filter((name) => !configured.has(name));
  const missingSource = configuredFunctions.filter((name) => !sourceFunctions.includes(name));
  const functions = configuredFunctions.map((name) => ({
    name,
    verify_jwt: configured.get(name).verify_jwt,
    has_source: sourceFunctions.includes(name),
  }));

  return {
    generated_at: new Date().toISOString(),
    toolchain: {
      node: ">=20.19.0 <21",
      npm: ">=10.8.0 <11",
      deno: "2.7.12",
      supabase_cli: packageVersion("supabase"),
    },
    functions,
    function_inventory_gaps: {
      source_without_config: missingConfig,
      config_without_source: missingSource,
    },
    live_function_inventory: collectLiveFunctionInventory(sourceFunctions),
    env: scanEnvNames(),
    workflow: scanWorkflows(),
  };
}

const inventory = collectInventory();
if (outPath) {
  writeFileSync(join(root, outPath), `${JSON.stringify(inventory, null, 2)}\n`);
}
console.log(JSON.stringify(inventory, null, 2));

if (checkMode) {
  const failures = [
    ...inventory.function_inventory_gaps.source_without_config.map((name) => `Function source without config: ${name}`),
    ...inventory.function_inventory_gaps.config_without_source.map((name) => `Function config without source: ${name}`),
    ...inventory.env.undocumented_enforced.map((name) => `Env var is used but undocumented: ${name}`),
    ...inventory.workflow.violations,
  ];
  if (inventory.live_function_inventory.checked) {
    if (inventory.live_function_inventory.error) {
      failures.push(`Live Supabase function inventory failed: ${inventory.live_function_inventory.error}`);
    }
    for (const name of inventory.live_function_inventory.live_missing_repo ?? []) {
      failures.push(`Live Supabase function absent from repo: ${name}`);
    }
    for (const name of inventory.live_function_inventory.repo_missing_live ?? []) {
      failures.push(`Repo function absent from live Supabase project: ${name}`);
    }
  }

  if (failures.length) {
    console.error("\n[release-safety] FAIL");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.error("\n[release-safety] OK");
}
