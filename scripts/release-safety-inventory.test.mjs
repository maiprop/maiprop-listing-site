import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  cataloguePerformanceHotfixWorkflowViolations,
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
  isAuthorizedCloudflareHttpMutationWorkflow,
  productionDatabaseCredentialScopeViolations,
  productionAuthorizationInputContractViolations,
  scanWorkflows,
  stageReleaseBuildPolicyViolation,
} from "./release-safety-inventory.mjs";

describe("release safety inventory", () => {
  it("fails closed unless the catalogue database hotfix stays manifest-bound and staged", () => {
    const path = resolve(
      process.cwd(),
      ".github/workflows/deploy-catalogue-performance-hotfix.yml",
    );
    const text = readFileSync(path, "utf8");
    const parsed = yaml.load(text);
    const supportText = [
      "scripts/catalogue-hotfix-behavioral-probe.mjs",
      "scripts/catalogue-hotfix-workflow-helpers.mjs",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    const probeScriptText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-staging-key-probe.sh"),
      "utf8",
    );
    const markerScriptText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-static-marker.sh"),
      "utf8",
    );
    const databaseLoginScriptText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-database-login.sh"),
      "utf8",
    );
    const violations = (overrides = {}) => cataloguePerformanceHotfixWorkflowViolations({
      text,
      parsed,
      supportText,
      probeScriptText,
      markerScriptText,
      databaseLoginScriptText,
      ...overrides,
    });

    expect(violations()).toEqual([]);
    const leakedAccessToken = structuredClone(parsed);
    leakedAccessToken.jobs.staging.env.SUPABASE_ACCESS_TOKEN = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
    expect(violations({ parsed: leakedAccessToken })).not.toEqual([]);
    const staleStagingKey = structuredClone(parsed);
    staleStagingKey.jobs.staging.env.TARGET_ANON_KEY = "${{ secrets.STAGING_SUPABASE_PUBLISHABLE_KEY }}";
    expect(violations({ parsed: staleStagingKey })).not.toEqual([]);
    for (const unsafeText of [
      text.replaceAll('${TARGET_API_URL%/}/auth/v1/settings', '${TARGET_API_URL%/}/rest/v1/'),
      text.replace("--retry-max-time 90", ""),
    ]) {
      expect(violations({
        text: unsafeText,
        parsed: yaml.load(unsafeText),
      })).not.toEqual([]);
    }
    for (const unsafeProbe of [
      probeScriptText.replace(
        'probe_url="https://${TARGET_PROJECT_REF}.supabase.co/auth/v1/settings"',
        'probe_url="${TARGET_API_URL%/}/auth/v1/settings"',
      ),
      probeScriptText.replace('[ "$publishable_status" = "401" ]', '[ "$publishable_status" != "401" ]'),
      probeScriptText.replace("probe_max_attempts=3", "probe_max_attempts=4"),
      probeScriptText.replace("000|408|429|5??)", "000|401|408|429|5??)"),
    ]) {
      expect(violations({ probeScriptText: unsafeProbe })).not.toEqual([]);
    }
    for (const unsafeMarker of [
      markerScriptText.replace(
        'marker_url="https://portal.maiprop.co/deploy-version.json"',
        'marker_url="${TARGET_API_URL%/}/deploy-version.json"',
      ),
      markerScriptText.replace("--retry 2", ""),
      `${markerScriptText}\ncurl https://portal.maiprop.co/api/release\n`,
    ]) {
      expect(violations({ markerScriptText: unsafeMarker })).not.toEqual([]);
    }
    for (const unsafeDatabaseLogin of [
      databaseLoginScriptText.replace("--request POST", "--request GET"),
      databaseLoginScriptText.replace("--max-time 30", ""),
      databaseLoginScriptText.replace("$status\" != \"201", "$status\" != \"200"),
      `${databaseLoginScriptText}\ncat "$response_file"\n`,
      databaseLoginScriptText.replace(
        "https://api.supabase.com/v1/projects/xsiehskfgeoqyazcgauv/cli/login-role",
        "https://api.supabase.com/v1/projects/$TARGET_PROJECT_REF/cli/login-role",
      ),
    ]) {
      expect(violations({ databaseLoginScriptText: unsafeDatabaseLogin })).not.toEqual([]);
    }
    expect(violations({
      supportText: supportText.replace('    "created_at",', '    "source_tree",'),
    })).not.toEqual([]);
    expect(violations({
      supportText: supportText.replaceAll(
        "validateDatabaseSearchParameters",
        "uncheckedDatabaseSearchParameters",
      ),
    })).not.toEqual([]);
    expect(violations({
      supportText: supportText.replace(
        'const expectedKeys = temporary ? ["options", "sslmode"] : ["sslmode"];',
        "const expectedKeys = [...db.searchParams.keys()].sort();",
      ),
    })).not.toEqual([]);
    expect(violations({
      text: text.replace("needs: [validate, staging]", "needs: [validate]"),
      parsed: yaml.load(text.replace("needs: [validate, staging]", "needs: [validate]")),
    })).not.toEqual([]);
    expect(violations({
      text: `${text}\n# forbidden scope\nstripe verify`,
    })).not.toEqual([]);
  });

  it("enforces the exact production authorization workflow-call contract", () => {
    const loadInputs = (name) => yaml.load(readFileSync(
      resolve(process.cwd(), `.github/workflows/${name}`),
      "utf8",
    )).on.workflow_call.inputs;
    const database = loadInputs("deploy-supabase-production-db.yml");
    const edge = loadInputs("deploy-edge-functions.yml");
    const cloudflare = loadInputs("reusable-cloudflare-production-deploy.yml");

    expect(productionAuthorizationInputContractViolations(database)).toEqual([]);
    expect(productionAuthorizationInputContractViolations(edge)).toEqual([]);
    expect(productionAuthorizationInputContractViolations(cloudflare, {
      directRecoveryCompatible: true,
    })).toEqual([]);

    const expectRejected = (inputs, options = {}) => {
      expect(productionAuthorizationInputContractViolations(inputs, options))
        .not.toEqual([]);
    };
    const missing = structuredClone(database);
    delete missing.authorization_sha256;
    expectRejected(missing);
    expectRejected({ ...database, authorization_actor: { required: true, type: "string" } });
    expectRejected({ ...database, consumption_nonce: { required: true, type: "string" } });
    expectRejected({
      ...database,
      authorization_sha256: { required: true, type: "number" },
    });
    expectRejected({
      ...database,
      consumption_artifact_id: { required: false, type: "string" },
    });
    expectRejected({
      ...cloudflare,
      authorization_mode: { required: false, default: "", type: "string" },
    }, { directRecoveryCompatible: true });
    expectRejected({
      ...cloudflare,
      consumption_payload_sha256: {
        required: false,
        default: "unexpected",
        type: "string",
      },
    }, { directRecoveryCompatible: true });
  });

  it("allows only the pinned, staging-only legacy N-1 reconstruction build", () => {
    const workflowPath = resolve(
      process.cwd(),
      ".github/workflows/stage-release.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(stageReleaseBuildPolicyViolation(source)).toBeNull();
    expect(
      stageReleaseBuildPolicyViolation(
        source.replace(
          "LEGACY_PRODUCTION_SHA: db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
          "LEGACY_PRODUCTION_SHA: 0000000000000000000000000000000000000000",
        ),
      ),
    ).toMatch(/without rebuilding/i);
    expect(
      stageReleaseBuildPolicyViolation(
        `${source}\n# A current-candidate rebuild must remain forbidden.\nnpm run build\n`,
      ),
    ).toMatch(/without rebuilding/i);
    expect(
      stageReleaseBuildPolicyViolation(
        source.replace(
          'purpose: "staging-n-minus-one-compatibility-only"',
          'purpose: "production-compatible"',
        ),
      ),
    ).toMatch(/without rebuilding/i);
  });

  it("fails closed on production database credential-scope regressions", () => {
    const calledWorkflow = {
      text: "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      parsed: {
        on: { workflow_call: { secrets: {} } },
        jobs: { deploy: { environment: "production" } },
      },
    };
    const release = {
      jobs: {
        "deploy-production-database": { secrets: {} },
        "deploy-production-edge": { secrets: {} },
      },
    };

    expect(
      productionDatabaseCredentialScopeViolations({
        release,
        calledWorkflows: [calledWorkflow, calledWorkflow],
      }),
    ).toEqual([]);

    expect(
      productionDatabaseCredentialScopeViolations({
        release: {
          jobs: {
            ...release.jobs,
            "deploy-production-database": {
              secrets: { SUPABASE_PRODUCTION_DB_URL: "forwarded" },
            },
          },
        },
        calledWorkflows: [
          {
            text: "secrets: inherit",
            parsed: {
              on: {
                workflow_call: {
                  secrets: { SUPABASE_PRODUCTION_DB_URL: { required: true } },
                },
              },
              jobs: { deploy: {} },
            },
          },
        ],
      }),
    ).toHaveLength(3);
  });

  it("inventories generic Cloudflare API HTTP mutations", () => {
    const workflow = `
      curl --request PATCH https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl -XPOST https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl -X PUT https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl --request=DELETE https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
    `;

    expect(findCloudflareHttpMutations(workflow)).toEqual([
      "DELETE",
      "PATCH",
      "POST",
      "PUT",
    ]);
    expect(findCloudflareHttpMutations(
      "curl -fsS https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p",
    )).toEqual([]);
    expect(findCloudflareHttpMutations(`
      CLOUDFLARE_ACCOUNT_ID=account
      curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"
    `)).toEqual(["PATCH"]);
  });

  it("never authorizes Cloudflare HTTP mutations in evidence workflows", () => {
    const patch = `
      curl --request PATCH https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
    `;
    const bootstrapPath =
      ".github/workflows/lock-cloudflare-pages-git-deploys.yml";
    const bootstrap = readFileSync(resolve(process.cwd(), bootstrapPath), "utf8");

    expect(cloudflareHttpMutationViolation({
      workflowPath: ".github/workflows/compliance-evidence.yml",
      text: patch,
    })).toMatch(/evidence workflow/i);
    expect(cloudflareHttpMutationViolation({
      workflowPath: bootstrapPath,
      text: patch,
    })).toMatch(/unauthorized/i);
    expect(cloudflareHttpMutationViolation({
      workflowPath: bootstrapPath,
      text: bootstrap,
    })).toBeNull();
  });

  it("detects non-curl Cloudflare API mutation clients", () => {
    const mutations = [
      {
        source: `await fetch("https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p", {
          method: "PATCH",
        });`,
        method: "PATCH",
      },
      {
        source:
          'Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p" -Method Delete',
        method: "DELETE",
      },
      {
        source:
          'Invoke-WebRequest -Method PUT -Uri "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"',
        method: "PUT",
      },
      {
        source:
          'wget --method=POST "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"',
        method: "POST",
      },
      {
        source:
          'gh api --method PATCH "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
        method: "PATCH",
      },
    ];

    for (const { source, method } of mutations) {
      expect(findCloudflareHttpMutations(source)).toEqual([method]);
    }

    expect(cloudflareHttpMutationViolation({
      workflowPath: ".github/workflows/untrusted-provider-control.yml",
      text: mutations.map(({ source }) => source).join("\n"),
      authorized: false,
    })).toMatch(/unauthorized/i);
  });

  it("keeps the Cloudflare HTTP mutation allowlist narrowly dedicated", () => {
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/stage-release.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/reusable-supabase-staging.yml",
    )).toBe(false);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/compliance-evidence.yml",
    )).toBe(false);
  });

  it("enforces the GitHub Free HMAC artifact binding contract", () => {
    const scopedViolations = scanWorkflows().violations.filter((violation) =>
      violation.startsWith("GitHub Free release binding:"));
    expect(scopedViolations).toEqual([]);
  });

  it("passes the checked inventory for documented environment variables", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/release-safety-inventory.mjs", "--check"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toContain("[release-safety] OK");
    const mutations =
      JSON.parse(result.stdout).workflow.provider_http_mutations;
    expect(mutations).toContainEqual({
      provider: "cloudflare",
      workflow:
        ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
      method: "PATCH",
    });
    expect(
      mutations.filter(({ workflow }) => /evidence/i.test(workflow)),
    ).toEqual([]);
  });
});
