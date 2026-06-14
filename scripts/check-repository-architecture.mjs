import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const readJson = (root, relativePath, failures) => {
  const text = readText(root, relativePath);
  if (text === null) {
    failures.push(`${relativePath} is missing`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const requireText = (root, relativePath, failures) => {
  const text = readText(root, relativePath);
  if (text === null || text.trim().length === 0) failures.push(`${relativePath} is missing or empty`);
  return text;
};

const includesAll = (text, required) => required.filter((needle) => !text.includes(needle));

const requiredTopLevelReadmes = [
  "apps/README.md",
  "packages/README.md",
  "infrastructure/README.md",
];

const requiredCodeownerPatterns = [
  "/apps/",
  "/packages/",
  "/infrastructure/",
  "/supabase/",
];

const requiredArchitectureDocMarkers = [
  "Current layout",
  "Target layout",
  "/apps/web",
  "/packages/domain",
  "/packages/ui",
  "/packages/data-access",
  "/infrastructure/cloudflare",
  "no physical move without dedicated migration PR",
  "Cloudflare Pages",
  "Supabase",
  "React Query",
];

const requiredAdrMarkers = [
  "- **Status:** Accepted",
  "phased",
  "no npm workspaces until package extraction",
  "codemod/import migration",
  "/apps",
  "/packages",
  "/infrastructure",
];

const requiredTargets = [
  "apps/web",
  "packages/domain",
  "packages/ui",
  "packages/data-access",
  "infrastructure/cloudflare",
  "infrastructure/capacitor",
];

const requiredBoundaries = [
  "app-web",
  "shared-ui",
  "domain",
  "data-access",
  "cloudflare-pages",
  "supabase-backend",
];

const hasCodeownersPattern = (codeowners, pattern) =>
  codeowners
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((line) => line.split(/\s+/)[0] === pattern);

const flattenTargetLayout = (targetLayout) => {
  if (!targetLayout || typeof targetLayout !== "object") return [];
  return Object.values(targetLayout).flatMap((value) => Array.isArray(value) ? value : []);
};

export function checkRepositoryArchitecture(root = process.cwd()) {
  const failures = [];

  for (const relativePath of requiredTopLevelReadmes) {
    requireText(root, relativePath, failures);
  }

  const packageJson = readJson(root, "package.json", failures);
  if (packageJson && packageJson.scripts?.["check:repo-architecture"] !== "node scripts/check-repository-architecture.mjs") {
    failures.push("package.json scripts must include check:repo-architecture");
  }

  const codeowners = requireText(root, ".github/CODEOWNERS", failures);
  if (codeowners) {
    for (const pattern of requiredCodeownerPatterns) {
      if (!hasCodeownersPattern(codeowners, pattern)) {
        failures.push(`.github/CODEOWNERS must cover ${pattern}`);
      }
    }
  }

  const architectureDoc = requireText(root, "docs/REPOSITORY_ARCHITECTURE.md", failures);
  if (architectureDoc) {
    for (const marker of includesAll(architectureDoc, requiredArchitectureDocMarkers)) {
      failures.push(`docs/REPOSITORY_ARCHITECTURE.md must mention ${marker}`);
    }
  }

  const adr = requireText(root, "docs/adr/0005-repository-package-architecture.md", failures);
  if (adr) {
    for (const marker of includesAll(adr, requiredAdrMarkers)) {
      failures.push(`docs/adr/0005-repository-package-architecture.md must mention ${marker}`);
    }
  }

  const boundaryMap = readJson(root, "docs/governance/repository-boundaries.json", failures);
  if (boundaryMap) {
    if (boundaryMap.version !== 1) {
      failures.push("docs/governance/repository-boundaries.json version must be 1");
    }
    if (boundaryMap.currentMode !== "single-package") {
      failures.push("repository-boundaries currentMode must be single-package until package extraction");
    }

    const flattenedTargets = flattenTargetLayout(boundaryMap.targetLayout);
    for (const target of requiredTargets) {
      if (!flattenedTargets.includes(target)) {
        failures.push(`repository-boundaries targetLayout must include ${target}`);
      }
    }

    const boundaryIds = Array.isArray(boundaryMap.boundaries)
      ? boundaryMap.boundaries.map((boundary) => boundary.id)
      : [];
    if (!Array.isArray(boundaryMap.boundaries)) {
      failures.push("repository-boundaries boundaries must be an array");
    }
    for (const id of requiredBoundaries) {
      if (!boundaryIds.includes(id)) {
        failures.push(`repository-boundaries must define boundary ${id}`);
      }
    }

    for (const boundary of Array.isArray(boundaryMap.boundaries) ? boundaryMap.boundaries : []) {
      if (!Array.isArray(boundary.current) || boundary.current.length === 0) {
        failures.push(`repository-boundaries ${boundary.id ?? "<unknown>"} must define current paths`);
      }
      if (typeof boundary.target !== "string" || boundary.target.length === 0) {
        failures.push(`repository-boundaries ${boundary.id ?? "<unknown>"} must define a target path`);
      }
      if (!requiredCodeownerPatterns.includes(boundary.ownerPath)) {
        failures.push(`repository-boundaries ${boundary.id ?? "<unknown>"} ownerPath must map to CODEOWNERS`);
      }
    }
  }

  return result(failures);
}

const main = () => {
  const check = checkRepositoryArchitecture(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Repository architecture contract OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-repository-architecture.mjs")
) {
  main();
}
