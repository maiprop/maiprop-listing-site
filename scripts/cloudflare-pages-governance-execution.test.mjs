import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const omitted = Symbol("omitted");

function workflowStepRun(workflowName, jobName, stepName) {
  const parsed = yaml.load(
    readFileSync(resolve(root, ".github", "workflows", workflowName), "utf8"),
  );
  return parsed.jobs[jobName].steps.find((step) => step.name === stepName).run;
}

const complianceRun = workflowStepRun(
  "compliance-evidence.yml",
  "cloudflare-pages-verify",
  "Verify Cloudflare Pages Git deployment lockout",
);
const lockRun = workflowStepRun(
  "lock-cloudflare-pages-git-deploys.yml",
  "lock",
  "Lock both Cloudflare Pages Git integrations",
);

function projectResponse({ id, name, source = omitted }) {
  const result = {
    id,
    name,
    production_branch: "main",
    domains: [],
    latest_deployment: null,
  };
  if (source !== omitted) result.source = source;
  return JSON.stringify({ success: true, result });
}

function gitSource({ deployments = false, complete = true } = {}) {
  return {
    type: "github",
    config: complete
      ? {
          deployments_enabled: deployments,
          production_deployments_enabled: deployments,
          preview_deployment_setting: deployments ? "all" : "none",
        }
      : {},
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function toShellPath(path) {
  if (process.platform !== "win32") return path;
  const converted = spawnSync("wsl.exe", ["--exec", "wslpath", "-a", path], {
    encoding: "utf8",
  });
  if (converted.status !== 0) {
    throw new Error(converted.stderr || "Unable to convert the WSL test path");
  }
  return converted.stdout.trim();
}

const curlMock = String.raw`
curl() {
  local method="GET"
  local url=""
  local authorization=""
  local body_file=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --request)
        method="$2"
        shift 2
        ;;
      --retry)
        shift 2
        ;;
      -H)
        case "$2" in
          Authorization:*) authorization="$(printf '%s' "$2" | sed 's/^Authorization: //')" ;;
        esac
        shift 2
        ;;
      --data-binary)
        body_file="$(printf '%s' "$2" | cut -c2-)"
        shift 2
        ;;
      http://*|https://*)
        url="$1"
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  printf '%s\t%s\n' "$method" "$url" >> "$CURL_LOG"
  if [ "$method" = "PATCH" ]; then
    printf '%s\n' "$url" >> "$PATCH_LOG"
    jq -cn \
      --arg url "$url" \
      --arg authorization "$authorization" \
      --slurpfile body "$body_file" \
      '{url: $url, authorization: $authorization, body: $body[0]}' \
      >> "$PATCH_REQUEST_LOG"
    cp "$body_file" "$MOCK_STATE_DIR/$(basename "$url").json"
    printf '%s\n' '{"success":true}'
    return 0
  fi

  local response
  if [ "$(basename "$url")" = "$STAGING_PROJECT" ]; then
    response="$STAGING_JSON"
  else
    response="$PRODUCTION_JSON"
  fi
  local state_file="$MOCK_STATE_DIR/$(basename "$url").json"
  if [ -f "$state_file" ]; then
    printf '%s\n' "$response" |
      jq --slurpfile patch "$state_file" '.result.source = $patch[0].source'
  else
    printf '%s\n' "$response"
  fi
}

gh() {
  printf '%s\n' "$GITHUB_WORKFLOW_SHA"
}
`;

function runWorkflow(run, options = {}) {
  const hostRoot = mkdtempSync(join(tmpdir(), "maiprop-cf-governance-"));
  const shellRoot = toShellPath(hostRoot);
  const patchLog = join(hostRoot, "patch.log");
  const patchRequestLog = join(hostRoot, "patch-requests.jsonl");
  const curlLog = join(hostRoot, "curl.log");
  writeFileSync(patchLog, "", "utf8");
  writeFileSync(patchRequestLog, "", "utf8");
  writeFileSync(curlLog, "", "utf8");

  const production =
    options.production ??
    projectResponse({
      id: "production-id",
      name: "maiprop-listing-site",
      source: null,
    });
  const staging =
    options.staging ??
    projectResponse({
      id: "staging-id",
      name: "maiprop-listing-site-staging",
      source: null,
    });
  const environment = {
    CLOUDFLARE_PAGES_READ_TOKEN: "production-read",
    CLOUDFLARE_PAGES_EDIT_TOKEN: "production-edit",
    CLOUDFLARE_ACCOUNT_ID: "production-account",
    CLOUDFLARE_STAGING_PAGES_READ_TOKEN: "staging-read",
    CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN: "staging-edit",
    CLOUDFLARE_STAGING_ACCOUNT_ID: "staging-account",
    EXPECTED_PRODUCTION_PROJECT_ID: "production-id",
    EXPECTED_STAGING_PROJECT_ID: "staging-id",
    GITHUB_OUTPUT: `${shellRoot}/github-output.txt`,
    GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
    GITHUB_WORKFLOW_SHA: "trusted-main-sha",
    RUNNER_TEMP: shellRoot,
    CURL_LOG: `${shellRoot}/curl.log`,
    PATCH_LOG: `${shellRoot}/patch.log`,
    PATCH_REQUEST_LOG: `${shellRoot}/patch-requests.jsonl`,
    MOCK_STATE_DIR: `${shellRoot}/mock-state`,
    PRODUCTION_JSON: production,
    STAGING_JSON: staging,
    ...options.environment,
  };
  const exports = Object.entries(environment)
    .map(([name, value]) => `export ${name}=${shellQuote(value)}`)
    .join("\n");
  const command = process.platform === "win32" ? "wsl.exe" : "bash";
  const args = process.platform === "win32" ? ["--exec", "bash", "-s"] : ["-s"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: `${exports}\nmkdir -p "$MOCK_STATE_DIR"\n${curlMock}\n${run}\n`,
    maxBuffer: 5 * 1024 * 1024,
  });

  const readJson = (relativePath) => {
    const path = join(hostRoot, ...relativePath.split("/"));
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  };
  return {
    cleanup: () => rmSync(hostRoot, { force: true, recursive: true }),
    curlRequests: readFileSync(curlLog, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean),
    patches: readFileSync(patchLog, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean),
    patchRequests: readFileSync(patchRequestLog, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
    readJson,
    result,
  };
}

describe("Cloudflare Pages governance workflow execution", () => {
  it("accepts omitted and null Direct Upload sources without issuing a PATCH", () => {
    const result = runWorkflow(lockRun, {
      production: projectResponse({
        id: "production-id",
        name: "maiprop-listing-site",
      }),
      staging: projectResponse({
        id: "staging-id",
        name: "maiprop-listing-site-staging",
        source: null,
      }),
    });
    try {
      expect(
        result.result.status,
        `${result.result.stderr}\n${result.result.stdout}`,
      ).toBe(0);
      expect(result.patches).toEqual([]);
      expect(result.curlRequests).toHaveLength(4);
      const evidence = result.readJson(
        "cloudflare-pages-lock-evidence/cloudflare-pages-git-auto-deploy-post-state.json",
      );
      expect(evidence.projects.production.source).toBeNull();
      expect(evidence.projects.staging.source).toBeNull();
    } finally {
      result.cleanup();
    }
  }, 60_000);

  it("locks Git-connected projects and records exactly two PATCH requests", () => {
    const result = runWorkflow(lockRun, {
      production: projectResponse({
        id: "production-id",
        name: "maiprop-listing-site",
        source: gitSource({ deployments: true }),
      }),
      staging: projectResponse({
        id: "staging-id",
        name: "maiprop-listing-site-staging",
        source: gitSource({ deployments: true }),
      }),
    });
    try {
      expect(
        result.result.status,
        `${result.result.stderr}\n${result.result.stdout}`,
      ).toBe(0);
      expect(result.patches).toHaveLength(2);
      expect(result.patchRequests).toEqual([
        {
          authorization: "Bearer production-edit",
          body: {
            source: {
              config: {
                deployments_enabled: false,
                preview_deployment_setting: "none",
                production_deployments_enabled: false,
              },
              type: "github",
            },
          },
          url: "https://api.cloudflare.com/client/v4/accounts/production-account/pages/projects/maiprop-listing-site",
        },
        {
          authorization: "Bearer staging-edit",
          body: {
            source: {
              config: {
                deployments_enabled: false,
                preview_deployment_setting: "none",
                production_deployments_enabled: false,
              },
              type: "github",
            },
          },
          url: "https://api.cloudflare.com/client/v4/accounts/staging-account/pages/projects/maiprop-listing-site-staging",
        },
      ]);
      const evidence = result.readJson(
        "cloudflare-pages-lock-evidence/cloudflare-pages-git-auto-deploy-post-state.json",
      );
      expect(evidence.projects.production.source.config).toEqual({
        deployments_enabled: false,
        preview_deployment_setting: "none",
        production_deployments_enabled: false,
      });
      expect(evidence.projects.staging.source.config).toEqual(
        evidence.projects.production.source.config,
      );
    } finally {
      result.cleanup();
    }
  }, 60_000);

  it("fails closed for invalid identity, source, account, and deployment postures", () => {
    const cases = [
      {
        label: "wrong project ID",
        options: {
          environment: { EXPECTED_PRODUCTION_PROJECT_ID: "wrong-id" },
        },
      },
      {
        label: "shared provider account",
        options: {
          environment: {
            CLOUDFLARE_STAGING_ACCOUNT_ID: "production-account",
          },
        },
        noProviderCall: true,
      },
      {
        label: "invalid Git provider",
        options: {
          production: projectResponse({
            id: "production-id",
            name: "maiprop-listing-site",
            source: { type: "bitbucket", config: {} },
          }),
        },
      },
      {
        label: "enabled Git deployments",
        options: {
          production: projectResponse({
            id: "production-id",
            name: "maiprop-listing-site",
            source: gitSource({ deployments: true }),
          }),
        },
      },
      {
        label: "missing Git deployment flags",
        options: {
          production: projectResponse({
            id: "production-id",
            name: "maiprop-listing-site",
            source: gitSource({ complete: false }),
          }),
        },
      },
    ];

    for (const testCase of cases) {
      const result = runWorkflow(complianceRun, testCase.options);
      try {
        expect(
          result.result.status,
          `${testCase.label} unexpectedly passed\n${result.result.stdout}`,
        ).not.toBe(0);
        if (testCase.noProviderCall) expect(result.curlRequests).toEqual([]);
      } finally {
        result.cleanup();
      }
    }
  }, 90_000);

  it("emits verified evidence for null and omitted Direct Upload sources", () => {
    const result = runWorkflow(complianceRun, {
      production: projectResponse({
        id: "production-id",
        name: "maiprop-listing-site",
      }),
    });
    try {
      expect(
        result.result.status,
        `${result.result.stderr}\n${result.result.stdout}`,
      ).toBe(0);
      expect(result.patches).toEqual([]);
      const evidence = result.readJson(
        "cloudflare-pages-posture-evidence/cloudflare-pages-git-auto-deploy-posture.json",
      );
      expect(evidence).toMatchObject({
        allAutomaticDeploymentsDisabled: true,
        bootstrap_required: false,
        verified: true,
      });
      expect(evidence.projects.production.source).toBeNull();
      expect(evidence.projects.staging.source).toBeNull();
    } finally {
      result.cleanup();
    }
  }, 60_000);

  it("preserves false in minimized Git deployment evidence", () => {
    const result = runWorkflow(complianceRun, {
      production: projectResponse({
        id: "production-id",
        name: "maiprop-listing-site",
        source: gitSource(),
      }),
      staging: projectResponse({
        id: "staging-id",
        name: "maiprop-listing-site-staging",
        source: gitSource(),
      }),
    });
    try {
      expect(
        result.result.status,
        `${result.result.stderr}\n${result.result.stdout}`,
      ).toBe(0);
      const evidence = result.readJson(
        "cloudflare-pages-posture-evidence/cloudflare-admin-posture.json",
      );
      expect(
        evidence.pagesProject.gitAutoDeploy.productionDeploymentsEnabled,
      ).toBe(false);
    } finally {
      result.cleanup();
    }
  }, 60_000);
});
