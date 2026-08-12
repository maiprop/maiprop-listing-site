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
  if (env.CLOUDFLARE_DNS_MODE && !env.CLOUDFLARE_ZONE_ID && !env.CLOUDFLARE_ZONE_NAME) {
    missing.push("CLOUDFLARE_ZONE_ID or CLOUDFLARE_ZONE_NAME");
  }
  return missing;
};

const allowedDnsModes = new Set(["registrar", "cloudflare-authoritative"]);

export const normalizePagesGitAutoDeploy = (project) => {
  const sourceFieldPresent = Object.prototype.hasOwnProperty.call(
    project ?? {},
    "source",
  );
  if (!sourceFieldPresent) {
    return {
      sourceConnected: false,
      productionDeploymentsEnabled: null,
      previewDeploymentSetting: null,
      allAutomaticDeploymentsDisabled: false,
      status: "unknown",
    };
  }

  if (project.source == null) {
    return {
      sourceConnected: false,
      productionDeploymentsEnabled: false,
      previewDeploymentSetting: "none",
      allAutomaticDeploymentsDisabled: true,
      status: "disabled",
    };
  }

  const config = project.source?.config ?? {};
  const productionDeploymentsEnabled =
    typeof config.production_deployments_enabled === "boolean"
      ? config.production_deployments_enabled
      : null;
  const previewDeploymentSetting =
    typeof config.preview_deployment_setting === "string"
      ? config.preview_deployment_setting
      : null;
  const allAutomaticDeploymentsDisabled =
    productionDeploymentsEnabled === false &&
    previewDeploymentSetting === "none" &&
    config.deployments_enabled !== true;

  return {
    sourceConnected: true,
    productionDeploymentsEnabled,
    previewDeploymentSetting,
    allAutomaticDeploymentsDisabled,
    status: allAutomaticDeploymentsDisabled ? "disabled" : "enabled-or-unknown",
  };
};

const normalizePagesProject = (project) => ({
  idPresent: Boolean(project?.id),
  name: project?.name ?? null,
  productionBranch: project?.production_branch ?? null,
  domains: Array.isArray(project?.domains) ? project.domains : [],
  gitAutoDeploy: normalizePagesGitAutoDeploy(project),
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
  if (
    errors.length === 0 &&
    !normalizePagesGitAutoDeploy(project).allAutomaticDeploymentsDisabled
  ) {
    errors.push(
      "Pages Git integration must disable production and preview automatic deployments",
    );
  }
  return errors;
};

const normalizeDnsPosture = (zone, mode) => {
  const authoritativeAtCloudflare = mode === "cloudflare-authoritative" && zone?.status === "active";
  return {
    mode,
    zoneIdPresent: Boolean(zone?.id),
    zoneName: zone?.name ?? null,
    zoneStatus: zone?.status ?? null,
    authoritativeAtCloudflare,
    zoneSecurityControlsClaimed: authoritativeAtCloudflare,
    cloudflareNameServers: Array.isArray(zone?.name_servers) ? zone.name_servers : [],
    originalNameServers: Array.isArray(zone?.original_name_servers) ? zone.original_name_servers : [],
    limitations:
      mode === "registrar"
        ? [
            "Cloudflare zone-level WAF, Bot, and DNS controls are not effective while registrar DNS remains authoritative",
            "Cloudflare Pages HTTPS and deployment controls remain available for portal.maiprop.co",
          ]
        : [],
  };
};

const cloudflareRequest = async ({ url, token, fetchImpl }) => {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = await response.json();
  return { response, body };
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

  const dnsMode = env.CLOUDFLARE_DNS_MODE || null;
  if (dnsMode && !allowedDnsModes.has(dnsMode)) {
    return {
      provider: "cloudflare",
      status: "failed",
      queriedAt,
      errors: [`Unsupported CLOUDFLARE_DNS_MODE: ${dnsMode}`],
    };
  }

  const apiBase = env.CF_API_BASE || "https://api.cloudflare.com/client/v4";
  const projectName = cloudflareProjectName(env);
  const url = `${apiBase}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`;
  const { response, body } = await cloudflareRequest({
    url,
    token: env.CLOUDFLARE_API_TOKEN,
    fetchImpl,
  });

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
      pagesProject: normalizePagesProject(body.result ?? {}),
    };
  }


  let dnsPosture;
  if (dnsMode) {
    const zoneUrl = env.CLOUDFLARE_ZONE_ID
      ? `${apiBase}/zones/${env.CLOUDFLARE_ZONE_ID}`
      : `${apiBase}/zones?name=${encodeURIComponent(env.CLOUDFLARE_ZONE_NAME)}&account.id=${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}&match=all`;
    const zoneResult = await cloudflareRequest({
      url: zoneUrl,
      token: env.CLOUDFLARE_API_TOKEN,
      fetchImpl,
    });
    if (!zoneResult.response.ok || zoneResult.body?.success === false) {
      return {
        provider: "cloudflare",
        status: "failed",
        queriedAt,
        httpStatus: zoneResult.response.status,
        errors: zoneResult.body?.errors ?? [],
      };
    }
    const zone = env.CLOUDFLARE_ZONE_ID
      ? zoneResult.body.result
      : Array.isArray(zoneResult.body.result) && zoneResult.body.result.length === 1
        ? zoneResult.body.result[0]
        : null;
    if (!zone) {
      return {
        provider: "cloudflare",
        status: "failed",
        queriedAt,
        errors: [`Expected exactly one Cloudflare zone named ${env.CLOUDFLARE_ZONE_NAME}`],
      };
    }
    dnsPosture = normalizeDnsPosture(zone, dnsMode);
    if (dnsMode === "cloudflare-authoritative" && !dnsPosture.authoritativeAtCloudflare) {
      return {
        provider: "cloudflare",
        status: "failed",
        queriedAt,
        errors: ["Cloudflare authoritative DNS requires an active zone"],
        pagesProject: normalizePagesProject(body.result ?? {}),
        dnsPosture,
      };
    }
  }

  return {
    provider: "cloudflare",
    status: "captured",
    queriedAt,
    pagesProject: normalizePagesProject(body.result ?? {}),
    ...(dnsPosture ? { dnsPosture } : {}),
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
