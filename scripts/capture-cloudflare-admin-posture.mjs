import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_OUT = "artifacts/compliance/live-evidence/cloudflare-admin-posture.json";

export const cloudflareProjectName = (env = process.env) =>
  env.CLOUDFLARE_PAGES_PROJECT || env.CLOUDFLARE_PROJECT_NAME || env.CF_PROJECT || "";

export const validateCloudflareEnv = (env = process.env) => {
  const missing = [];
  if (!env.CLOUDFLARE_API_TOKEN) missing.push("CLOUDFLARE_API_TOKEN");
  if (!env.CLOUDFLARE_ACCOUNT_ID) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (!cloudflareProjectName(env)) missing.push("CLOUDFLARE_PAGES_PROJECT");
  return missing;
};

const normalizePagesProject = (project) => ({
  idPresent: Boolean(project?.id),
  name: project?.name ?? null,
  productionBranch: project?.production_branch ?? null,
  domains: Array.isArray(project?.domains) ? project.domains : [],
  latestDeployment: project?.latest_deployment
    ? {
        idPresent: Boolean(project.latest_deployment.id),
        environment: project.latest_deployment.environment ?? null,
        aliases: Array.isArray(project.latest_deployment.aliases) ? project.latest_deployment.aliases : [],
      }
    : null,
  latestProductionDeployment:
    project?.latest_deployment?.environment === "production"
      ? {
          status:
            project.latest_deployment?.latest_stage?.status ??
            project.latest_deployment?.latest_stage?.name ??
            project.latest_deployment?.stages?.at?.(-1)?.status ??
            null,
          commitHash:
            project.latest_deployment?.deployment_trigger?.metadata?.commit_hash ??
            project.latest_deployment?.source?.config?.commit_hash ??
            null,
        }
      : null,
});

const validatePagesProject = (project) => {
  const errors = [];
  if (!project?.id) errors.push("Pages project record is missing a project id or production branch");
  else if (!project?.production_branch) errors.push("Pages project record is missing a project id or production branch");
  return errors;
};

export async function buildCloudflarePostureEvidence({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const queriedAt = now().toISOString();
  const missingEnv = validateCloudflareEnv(env);
  if (missingEnv.length > 0) {
    return {
      provider: "cloudflare",
      status: "unconfigured",
      queriedAt,
      missingEnv,
    };
  }

  const apiBase = env.CF_API_BASE || "https://api.cloudflare.com/client/v4";
  const projectName = cloudflareProjectName(env);
  const url = `${apiBase}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`;
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  const body = await response.json();

  if (!response.ok || body?.success === false) {
    return {
      provider: "cloudflare",
      status: "failed",
      queriedAt,
      httpStatus: response.status,
      errors: body?.errors ?? [],
    };
  }

  const errors = validatePagesProject(body.result);
  if (errors.length > 0) {
    return {
      provider: "cloudflare",
      status: "failed",
      queriedAt,
      errors,
    };
  }

  return {
    provider: "cloudflare",
    status: "captured",
    queriedAt,
    pagesProject: normalizePagesProject(body.result ?? {}),
  };
}

const parseArgs = (argv) => {
  const args = { out: DEFAULT_OUT, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") args.strict = true;
    if (arg === "--out") args.out = argv[index + 1] ?? args.out;
  }
  return args;
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await buildCloudflarePostureEvidence();
  writeJson(resolve(process.cwd(), args.out), evidence);

  if (args.strict && evidence.status !== "captured") {
    process.stderr.write(`Cloudflare admin posture is ${evidence.status}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Cloudflare admin posture ${evidence.status}: ${args.out}\n`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("capture-cloudflare-admin-posture.mjs")
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
