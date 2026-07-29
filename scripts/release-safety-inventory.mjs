#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

const root = process.cwd();
const checkMode = process.argv.includes("--check");
const liveFunctionsMode =
  process.argv.includes("--live-functions") ||
  process.env.RELEASE_SAFETY_LIVE_FUNCTIONS === "true";
const requireLiveSourceEvidence = process.argv.includes(
  "--require-live-source-evidence",
);
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";

const functionDir = join(root, "supabase", "functions");
const configPath = join(root, "supabase", "config.toml");
const workflowDir = join(root, ".github", "workflows");
const envDocs = [
  ".env.example",
  ".env.staging.example",
  "docs/ENV_SETUP.md",
  "docs/PRODUCTION_RELEASE_RUNBOOK.md",
  "docs/SECRETS_ROTATION.md",
  "docs/OS_INTEGRATION.md",
];

const ignoredFunctionDirs = new Set(["_shared", "node_modules"]);
const productionReleaseWorkflow =
  ".github/workflows/deploy-production-release.yml";
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelativePath(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git"
      )
        continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function sourceGroup(files) {
  const records = [...new Set(files)]
    .filter((file) => existsSync(file))
    .sort((a, b) =>
      normalizedRelativePath(a).localeCompare(normalizedRelativePath(b)),
    )
    .map((file) => ({
      path: normalizedRelativePath(file),
      sha256: sha256(readFileSync(file)),
    }));
  return {
    source_sha256: sha256(JSON.stringify(records)),
    files: records,
  };
}

function buildEdgeSourceManifest(configured, sourceFunctions) {
  const runtimeFiles = [
    ...walk(join(functionDir, "_shared")),
    join(functionDir, "deno.json"),
    join(functionDir, "deno.lock"),
  ];
  const shared = sourceGroup(runtimeFiles);
  const configSha256 = sha256(read(configPath));
  const functions = sourceFunctions.map((name) => {
    const local = sourceGroup(walk(join(functionDir, name)));
    const verifyJwt = configured.get(name)?.verify_jwt ?? null;
    return {
      name,
      verify_jwt: verifyJwt,
      source_sha256: local.source_sha256,
      effective_source_sha256: sha256(
        JSON.stringify({
          function_source_sha256: local.source_sha256,
          shared_source_sha256: shared.source_sha256,
          config_sha256: configSha256,
          verify_jwt: verifyJwt,
        }),
      ),
      files: local.files,
    };
  });
  const manifest = {
    schema_version: 1,
    algorithm: "sha256",
    release_sha: process.env.RELEASE_SAFETY_RELEASE_SHA || "",
    config_sha256: configSha256,
    shared,
    functions,
  };
  return {
    ...manifest,
    manifest_sha256: sha256(JSON.stringify(manifest)),
  };
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
    if (!/^(src|supabase\/functions|functions|scripts|e2e)\//.test(rel))
      return false;
    if (rel.startsWith("coverage/") || rel.startsWith("playwright-report/"))
      return false;
    if (
      /(?:^|\/)(?:__tests__|test|tests)\//.test(rel) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)
    )
      return false;
    if (
      rel.endsWith(".lock") ||
      rel.endsWith(".png") ||
      rel.endsWith(".jpg") ||
      rel.endsWith(".jpeg")
    )
      return false;
    return (
      [
        ".ts",
        ".tsx",
        ".js",
        ".mjs",
        ".md",
        ".example",
        ".yml",
        ".yaml",
      ].includes(extname(file)) ||
      rel.endsWith(".env.example") ||
      rel.endsWith(".env.staging.example")
    );
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
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g))
      documented.add(match[1]);
  }

  return {
    used: [...used].sort(),
    documented: [...documented].sort(),
    undocumented: [...used].filter((name) => !documented.has(name)).sort(),
    undocumented_enforced: [...used]
      .filter(
        (name) => !documented.has(name) && !documentedEnvAllowlist.has(name),
      )
      .sort(),
  };
}

function scanWorkflows() {
  const files = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(workflowDir, name));

  const violations = [];
  const secrets = new Set();
  const workflowText = {};
  const workflowYaml = {};
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    const text = read(file);
    workflowText[rel] = text;
    try {
      workflowYaml[rel] = yaml.load(text);
    } catch (error) {
      violations.push(
        `${rel} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (const match of text.matchAll(/secrets\.([A-Z0-9_]+)/g))
      secrets.add(match[1]);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        /\blatest\b/.test(line) &&
        !/^\s*runs-on:\s+ubuntu-latest\s*$/.test(line)
      ) {
        violations.push(`${rel}:${index + 1} uses 'latest'`);
      }
      if (line.includes("--no-verify-jwt")) {
        violations.push(`${rel}:${index + 1} uses --no-verify-jwt`);
      }
      if (/gitleaks-action/.test(line)) {
        const nextLines = lines.slice(index + 1, index + 8).join("\n");
        if (/continue-on-error:\s*true/.test(nextLines)) {
          violations.push(
            `${rel}:${index + 1} makes secret scanning advisory with continue-on-error`,
          );
        }
      }
      if (/printf\s+['"]SITE_LOCK_PASSWORD\s*=/.test(line)) {
        violations.push(
          `${rel}:${index + 1} writes SITE_LOCK_PASSWORD into plaintext Wrangler vars`,
        );
      }
    });
  }

  const ci = workflowText[".github/workflows/ci.yml"] ?? "";
  if (
    /\bsecrets\./.test(ci) ||
    /\bsupabase\s+(?:db\s+push|functions\s+deploy)\b/.test(ci) ||
    /\bpages\s+deploy\b/.test(ci) ||
    /uses:\s*\.\/\.github\/workflows\/reusable-(?:supabase-staging|cloudflare-production-deploy)\.yml/.test(
      ci,
    )
  ) {
    violations.push(
      ".github/workflows/ci.yml must remain secretless and mutation-free",
    );
  }

  const release = workflowText[productionReleaseWorkflow] ?? "";
  if (!release) {
    violations.push(`${productionReleaseWorkflow} is missing`);
  } else {
    const productionMutationsDisabled =
      release.includes("PRODUCTION_RELEASE_ENABLED") &&
      release.includes("Production mutations remain disabled") &&
      !release.includes(
        "uses: ./.github/workflows/deploy-supabase-production-db.yml",
      ) &&
      !release.includes(
        "uses: ./.github/workflows/deploy-edge-functions.yml",
      ) &&
      !release.includes(
        "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
      ) &&
      !release.includes("secrets: inherit");
    const requiredReleaseMarkers = [
      ["workflow_dispatch:", "manual workflow_dispatch trigger"],
      [
        "group: maiprop-production-release",
        "global production concurrency lease",
      ],
      ["cancel-in-progress: false", "non-cancelling production lease"],
      [
        "inputs.confirm == 'DEPLOY_PRODUCTION_RELEASE'",
        "typed production confirmation",
      ],
      ["release_sha:", "explicit release SHA input"],
      [
        "github-release-evidence",
        "final exact-SHA CI readiness validation",
      ],
      [
        "PRODUCTION_RELEASE_ENABLED",
        "explicit production release feature gate",
      ],
      [
        "Production mutations remain disabled",
        "validation-only production hard stop",
      ],
    ];
    for (const [marker, label] of requiredReleaseMarkers) {
      if (!release.includes(marker)) {
        violations.push(`${productionReleaseWorkflow} is missing ${label}`);
      }
    }

    if (!productionMutationsDisabled) {
      if (!release.includes("release_sha: ${{ inputs.release_sha }}")) {
        violations.push(
          `${productionReleaseWorkflow} is missing exact-SHA reusable workflow input`,
        );
      }
      const databaseJob = yamlJobBlock(release, "deploy-database");
      const edgeJob = yamlJobBlock(release, "deploy-edge-functions");
      const cloudflareJob = yamlJobBlock(release, "deploy-cloudflare");
      if (!databaseJob.includes("needs: validate")) {
        violations.push(
          `${productionReleaseWorkflow} database deploy must require exact-SHA validation`,
        );
      }
      if (!edgeJob.includes("needs: deploy-database")) {
        violations.push(
          `${productionReleaseWorkflow} Edge deploy must follow the database deploy`,
        );
      }
      if (!cloudflareJob.includes("needs: deploy-edge-functions")) {
        violations.push(
          `${productionReleaseWorkflow} Cloudflare deploy must follow the Edge deploy`,
        );
      }
    }
  }

  const ciReadiness = yamlJobBlock(ci, "release-candidate-built");
  for (const marker of [
    "name: Immutable release candidate built",
    "always() &&",
    "QUALITY_RESULT:",
    "RELEASE_SAFETY_RESULT:",
    "E2E_RESULT:",
    "MIGRATIONS_RESULT:",
    "LIGHTHOUSE_RESULT:",
    "production-release-candidate-${{ github.sha }}",
    "release:artifact:verify",
    "attestations: write",
    "id-token: write",
    "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
    "release-candidate/release-manifest.json",
  ]) {
    if (!ciReadiness.includes(marker)) {
      violations.push(
        `.github/workflows/ci.yml immutable candidate job is missing ${marker}`,
      );
    }
  }

  const releaseSafetyWorkflow =
    workflowText[".github/workflows/reusable-release-safety.yml"] ?? "";
  if (/\bsecrets\./.test(releaseSafetyWorkflow)) {
    violations.push(
      ".github/workflows/reusable-release-safety.yml must remain secretless",
    );
  }

  const stageRelease =
    workflowText[".github/workflows/stage-release.yml"] ?? "";
  for (const marker of [
    "workflow_run:",
    'workflows: ["CI"]',
    "vars.STAGING_RELEASE_ENABLED == 'true'",
    "github-staging-lease",
    "uses: ./.github/workflows/reusable-supabase-staging.yml",
    "production-release-candidate-${{ github.event.workflow_run.head_sha }}",
    "CLOUDFLARE_STAGING_PAGES_PROJECT",
    "--commit-dirty=false",
    "pages-deployment-id",
    "release:verify-live-marker",
    "name: Release candidate attested",
    "release-candidate-attestation-",
    "attestations: read",
    "gh attestation verify",
    "--signer-workflow",
    "--source-digest",
    '--source-ref "refs/heads/main"',
    "--deny-self-hosted-runners",
    "provenance-verification.json",
    "source-provenance-verification-",
    "manifest_sha256",
    "/domains",
    "project_domains",
  ]) {
    if (!stageRelease.includes(marker)) {
      violations.push(
        `.github/workflows/stage-release.yml is missing ${marker}`,
      );
    }
  }
  if (
    /build:homepage-initial/.test(stageRelease) ||
    /npm run build(?:\s|$)/m.test(stageRelease)
  ) {
    violations.push(
      ".github/workflows/stage-release.yml must deploy the source CI artifact without rebuilding it",
    );
  }

  const supabaseStaging =
    workflowText[".github/workflows/reusable-supabase-staging.yml"] ?? "";
  for (const marker of [
    "public_catalogue_postgrest_contract.mjs",
    "supabase-staging-db-attestation.json",
    "supabase-staging-edge-attestation-${{ inputs.release_sha }}",
  ]) {
    if (!supabaseStaging.includes(marker)) {
      violations.push(
        `.github/workflows/reusable-supabase-staging.yml is missing ${marker}`,
      );
    }
  }

  const direct =
    workflowText[".github/workflows/direct-cloudflare-production-deploy.yml"] ??
    "";
  for (const marker of [
    "release_sha:",
    "required: true",
    "RECOVER_CLOUDFLARE_PRODUCTION",
    "github-recovery",
    "PRODUCTION_RELEASE_ENABLED",
    "Production recovery mutations remain disabled",
  ]) {
    if (!direct.includes(marker)) {
      violations.push(
        `.github/workflows/direct-cloudflare-production-deploy.yml is missing ${marker}`,
      );
    }
  }
  if (
    direct.includes(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    ) ||
    direct.includes("secrets: inherit")
  ) {
    violations.push(
      ".github/workflows/direct-cloudflare-production-deploy.yml must remain validation-only while production mutations are disabled",
    );
  }

  const disabledProductionWorkflows = [
    ".github/workflows/reusable-cloudflare-production-deploy.yml",
    ".github/workflows/deploy-supabase-production-db.yml",
    ".github/workflows/deploy-edge-functions.yml",
  ];
  for (const workflowPath of disabledProductionWorkflows) {
    const text = workflowText[workflowPath] ?? "";
    const parsed = workflowYaml[workflowPath];
    const jobs = parsed && typeof parsed === "object" ? parsed.jobs : null;
    const permissions =
      parsed && typeof parsed === "object" ? parsed.permissions : null;
    if (!jobs?.["validate-disabled"] || !jobs?.deploy) {
      violations.push(
        `${workflowPath} must expose only explicit validation and hard-disabled deploy jobs`,
      );
      continue;
    }
    if (String(jobs.deploy.if ?? "").trim() !== "${{ false }}") {
      violations.push(
        `${workflowPath} deploy job must use the literal \${{ false }} guard`,
      );
    }
    if (jobs.deploy?.env?.PRODUCTION_MUTATIONS_DISABLED !== "true") {
      violations.push(
        `${workflowPath} deploy job must declare PRODUCTION_MUTATIONS_DISABLED=true`,
      );
    }
    const validationSteps = jobs["validate-disabled"]?.steps ?? [];
    if (
      !Array.isArray(validationSteps) ||
      !validationSteps.some((step) => /\bexit\s+1\b/.test(String(step?.run ?? "")))
    ) {
      violations.push(
        `${workflowPath} validation job must fail explicitly without mutating production`,
      );
    }
    if (
      !permissions ||
      permissions.contents !== "read" ||
      Object.keys(permissions).some((name) => name !== "contents")
    ) {
      violations.push(
        `${workflowPath} must grant only contents: read`,
      );
    }
    if (
      /\bsecrets\./.test(text) ||
      /\bsupabase\s+(?:db\s+push|functions\s+deploy|migration\s+repair)\b/.test(
        text,
      ) ||
      /\b(?:wrangler|npx\s+wrangler)\b/.test(text) ||
      /\bpages\s+deploy\b/.test(text) ||
      /api\.cloudflare\.com/i.test(text) ||
      /\b(?:CLOUDFLARE_API_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_PRODUCTION_DB_URL)\b/.test(
        text,
      )
    ) {
      violations.push(
        `${workflowPath} contains executable production mutation or credential wiring`,
      );
    }
  }

  const documented = new Set();
  for (const doc of envDocs) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const text = read(full);
    for (const match of text.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g))
      documented.add(match[1]);
  }
  const undocumentedSecrets = [...secrets]
    .filter((name) => !documented.has(name))
    .sort();
  for (const secret of undocumentedSecrets) {
    violations.push(`Workflow secret is undocumented: ${secret}`);
  }

  return {
    violations,
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
  const supabaseShim = join(
    root,
    "node_modules",
    "supabase",
    "dist",
    "supabase.js",
  );
  if (existsSync(supabaseShim)) {
    return { command: process.execPath, args: [supabaseShim, ...args] };
  }

  const localBin = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "supabase.cmd" : "supabase",
  );
  if (existsSync(localBin)) {
    if (process.platform === "win32") {
      return {
        command: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          [quoteCmdArg(localBin), ...args.map(quoteCmdArg)].join(" "),
        ],
      };
    }
    return { command: localBin, args };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        ["npx", "supabase", ...args].map(quoteCmdArg).join(" "),
      ],
    };
  }
  return { command: "npx", args: ["supabase", ...args] };
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function collectLiveFunctionInventory(sourceManifest) {
  if (!liveFunctionsMode) {
    return {
      checked: false,
      reason:
        "disabled; pass --live-functions or RELEASE_SAFETY_LIVE_FUNCTIONS=true",
    };
  }

  const configToml = existsSync(configPath) ? read(configPath) : "";
  const projectRef =
    process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
    process.env.SUPABASE_PROJECT_REF ||
    process.env.VITE_SUPABASE_PROJECT_ID ||
    parseProjectRefFromConfig(configToml) ||
    "";
  if (!projectRef) {
    return {
      checked: true,
      error:
        "Missing RELEASE_SAFETY_SUPABASE_PROJECT_REF, SUPABASE_PROJECT_REF, VITE_SUPABASE_PROJECT_ID, and supabase/config.toml project_id",
      deployed: [],
      live_missing_repo: [],
      repo_missing_live: [],
    };
  }

  try {
    const { command, args } = supabaseCliInvocation([
      "functions",
      "list",
      "--project-ref",
      projectRef,
      "--output-format",
      "json",
    ]);
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const deployed = parseSupabaseFunctionsList(output);
    const sourceByName = new Map(
      sourceManifest.functions.map((item) => [item.name, item]),
    );
    const linkedDeployments = deployed.map((item) => ({
      ...item,
      expected_source_sha256:
        sourceByName.get(item.name)?.effective_source_sha256 ?? null,
    }));
    const deployedNames = deployed.map((item) => item.name);
    const sourceNames = sourceManifest.functions.map((item) => item.name);
    return {
      checked: true,
      project_ref: projectRef,
      release_sha: process.env.RELEASE_SAFETY_RELEASE_SHA || "",
      source_manifest_sha256: sourceManifest.manifest_sha256,
      deployed: linkedDeployments,
      live_missing_repo: deployedNames
        .filter((name) => !sourceNames.includes(name))
        .sort(),
      repo_missing_live: sourceNames
        .filter((name) => !deployedNames.includes(name))
        .sort(),
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
  try {
    const parsed = JSON.parse(output);
    const records = Array.isArray(parsed) ? parsed : parsed.functions;
    if (Array.isArray(records)) {
      return records
        .map((record) => ({
          name: String(record.slug || record.name || ""),
          version: record.version ?? null,
          status: record.status ?? null,
          verify_jwt: record.verify_jwt ?? null,
          updated_at: record.updated_at ?? null,
          ezbr_sha256: record.ezbr_sha256 ?? null,
        }))
        .filter((record) => /^[A-Za-z0-9_-]+$/.test(record.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // Older CLIs can only emit a text table; retain a names-only fallback.
  }

  const names = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^ID\s+/.test(trimmed) || /^[|\-\s]+$/.test(trimmed))
      continue;
    const pipeCells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (
      pipeCells.length >= 2 &&
      /^[A-Za-z0-9_-]+$/.test(pipeCells[1]) &&
      !/^-+$/.test(pipeCells[1])
    ) {
      names.add(pipeCells[1]);
      continue;
    }
    const columns = trimmed
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (
      columns.length >= 2 &&
      /^[A-Za-z0-9_-]+$/.test(columns[1]) &&
      !/^-+$/.test(columns[1])
    ) {
      names.add(columns[1]);
    }
  }
  return [...names].sort().map((name) => ({
    name,
    version: null,
    status: null,
    verify_jwt: null,
    updated_at: null,
    ezbr_sha256: null,
  }));
}

function collectInventory() {
  const configured = parseFunctionConfig(read(configPath));
  const sourceFunctions = readdirSync(functionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !ignoredFunctionDirs.has(name))
    .filter((name) => existsSync(join(functionDir, name, "index.ts")))
    .sort();
  const edgeSourceManifest = buildEdgeSourceManifest(
    configured,
    sourceFunctions,
  );
  const sourceByName = new Map(
    edgeSourceManifest.functions.map((item) => [item.name, item]),
  );

  const configuredFunctions = [...configured.keys()].sort();
  const missingConfig = sourceFunctions.filter((name) => !configured.has(name));
  const missingSource = configuredFunctions.filter(
    (name) => !sourceFunctions.includes(name),
  );
  const functions = configuredFunctions.map((name) => ({
    name,
    verify_jwt: configured.get(name).verify_jwt,
    has_source: sourceFunctions.includes(name),
    source_sha256: sourceByName.get(name)?.effective_source_sha256 ?? null,
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
    edge_source_manifest: edgeSourceManifest,
    function_inventory_gaps: {
      source_without_config: missingConfig,
      config_without_source: missingSource,
    },
    live_function_inventory: collectLiveFunctionInventory(edgeSourceManifest),
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
    ...inventory.function_inventory_gaps.source_without_config.map(
      (name) => `Function source without config: ${name}`,
    ),
    ...inventory.function_inventory_gaps.config_without_source.map(
      (name) => `Function config without source: ${name}`,
    ),
    ...inventory.env.undocumented_enforced.map(
      (name) => `Env var is used but undocumented: ${name}`,
    ),
    ...inventory.workflow.violations,
  ];
  if (inventory.live_function_inventory.checked) {
    if (inventory.live_function_inventory.error) {
      failures.push(
        `Live Supabase function inventory failed: ${inventory.live_function_inventory.error}`,
      );
    }
    for (const name of inventory.live_function_inventory.live_missing_repo ??
      []) {
      failures.push(`Live Supabase function absent from repo: ${name}`);
    }
    for (const name of inventory.live_function_inventory.repo_missing_live ??
      []) {
      failures.push(`Repo function absent from live Supabase project: ${name}`);
    }
  }
  if (requireLiveSourceEvidence) {
    if (!/^[0-9a-f]{40}$/i.test(inventory.edge_source_manifest.release_sha)) {
      failures.push(
        "Exact Edge source evidence requires RELEASE_SAFETY_RELEASE_SHA as a full 40-character SHA",
      );
    }
    if (!inventory.live_function_inventory.checked) {
      failures.push("Exact Edge source evidence requires --live-functions");
    } else {
      if (
        inventory.live_function_inventory.source_manifest_sha256 !==
        inventory.edge_source_manifest.manifest_sha256
      ) {
        failures.push(
          "Live Edge inventory is not linked to the exact source manifest",
        );
      }
      for (const deployed of inventory.live_function_inventory.deployed ?? []) {
        if (!/^[0-9a-f]{64}$/i.test(String(deployed.ezbr_sha256 ?? ""))) {
          failures.push(
            `Live Edge function lacks a bundle hash: ${deployed.name}`,
          );
        }
        if (
          !/^[0-9a-f]{64}$/i.test(
            String(deployed.expected_source_sha256 ?? ""),
          )
        ) {
          failures.push(
            `Live Edge function lacks the expected source hash: ${deployed.name}`,
          );
        }
        if (deployed.version == null || !deployed.updated_at) {
          failures.push(
            `Live Edge function lacks version/update evidence: ${deployed.name}`,
          );
        }
      }
    }
  }

  if (failures.length) {
    console.error("\n[release-safety] FAIL");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.error("\n[release-safety] OK");
}
