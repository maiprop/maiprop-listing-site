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
    const databaseLoginWrapperText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-with-database-login.sh"),
      "utf8",
    );
    const canonicalDatabaseUrlWrapperText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-with-canonical-database-url.sh"),
      "utf8",
    );
    const linkedDatabasePushText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-linked-db-push.sh"),
      "utf8",
    );
    const sourceQualityProbeText = readFileSync(
      resolve(process.cwd(), "scripts/catalogue-hotfix-source-quality-probe.mjs"),
      "utf8",
    );
    const violations = (overrides = {}) => cataloguePerformanceHotfixWorkflowViolations({
      text,
      parsed,
      supportText,
      probeScriptText,
      markerScriptText,
      databaseLoginScriptText,
      databaseLoginWrapperText,
      canonicalDatabaseUrlWrapperText,
      linkedDatabasePushText,
      sourceQualityProbeText,
      ...overrides,
    });

    expect(violations()).toEqual([]);
    const leakedAccessToken = structuredClone(parsed);
    leakedAccessToken.jobs.staging.env.SUPABASE_ACCESS_TOKEN = "${{ secrets.SUPABASE_ACCESS_TOKEN }}";
    expect(violations({ parsed: leakedAccessToken })).not.toEqual([]);
    const staleStagingKey = structuredClone(parsed);
    staleStagingKey.jobs.staging.env.TARGET_ANON_KEY = "${{ secrets.STAGING_SUPABASE_PUBLISHABLE_KEY }}";
    expect(violations({ parsed: staleStagingKey })).not.toEqual([]);
    for (const [target, timeout] of [["staging", 46], ["production", 60]]) {
      const unsafeTimeout = structuredClone(parsed);
      unsafeTimeout.jobs[target]["timeout-minutes"] = timeout;
      expect(violations({ parsed: unsafeTimeout })).not.toEqual([]);
    }
    const requiredDatabasePhases = {
      staging: [
        "Prove recorded staging database state",
        "Prepare manifest-bound staging migration dry-run",
        "Verify staging database and pgTAP",
        "Prove staging publish-public-catalogue cron liveness",
      ],
      production: [
        "Prove recorded production database state",
        "Measure production catalogue bootstrap source quality",
        "Prepare manifest-bound production migration dry-run",
        "Verify production database",
        "Prove production publish-public-catalogue cron liveness",
      ],
    };
    for (const [target, names] of Object.entries(requiredDatabasePhases)) {
      for (const name of names) {
        const missingMint = structuredClone(parsed);
        const phase = missingMint.jobs[target].steps.find((step) => step.name === name);
        phase.run = phase.run.replace(
          "bash scripts/catalogue-hotfix-with-database-login.sh bash -s",
          "bash -s",
        );
        expect(violations({ parsed: missingMint })).not.toEqual([]);
      }
    }
    for (const target of ["staging", "production"]) {
      const missingLinkedApply = structuredClone(parsed);
      const phase = missingLinkedApply.jobs[target].steps.find((step) =>
        step.name === `Apply only manifest-bound ${target} migrations`
      );
      phase.run = phase.run.replace("catalogue-hotfix-linked-db-push.sh apply", "true");
      expect(violations({ parsed: missingLinkedApply })).not.toEqual([]);
    }
    const longDatabasePhase = structuredClone(parsed);
    longDatabasePhase.jobs.staging.steps.find(
      (step) => step.name === "Verify staging database and pgTAP",
    )["timeout-minutes"] = 5;
    expect(violations({ parsed: longDatabasePhase })).not.toEqual([]);
    const rawDatabaseCommand = structuredClone(parsed);
    rawDatabaseCommand.jobs.staging.steps.find(
      (step) => step.name === "Sample staging legacy PostgREST directly",
    ).run += '\npsql "$TARGET_DB_URL" -c "select 1"';
    expect(violations({ parsed: rawDatabaseCommand })).not.toEqual([]);
    const rawSourceQualityProbe = structuredClone(parsed);
    rawSourceQualityProbe.jobs.production.steps.find(
      (step) => step.name === "Sample production public API pairs",
    ).run += "\nnode scripts/catalogue-hotfix-source-quality-probe.mjs";
    expect(violations({ parsed: rawSourceQualityProbe })).not.toEqual([]);
    const sourceQualityWithoutInvalidDiagnostics = sourceQualityProbeText.replaceAll(
      "all_os_source_invalid_non_auction_rows",
      "removed_invalid_source_diagnostic",
    );
    expect(violations({
      sourceQualityProbeText: sourceQualityWithoutInvalidDiagnostics,
    })).not.toEqual([]);
    const sourceQualityWithoutCandidateCap = sourceQualityProbeText.replace(
      "value.all_os_source_rows_with_invalid_identity > 1",
      "false",
    );
    expect(violations({
      sourceQualityProbeText: sourceQualityWithoutCandidateCap,
    })).not.toEqual([]);
    const downgradedSourceQualitySchema = sourceQualityProbeText
      .replace("'schema_version', 2", "'schema_version', 1")
      .replace("value.schema_version !== 2", "value.schema_version !== 1");
    expect(violations({
      sourceQualityProbeText: downgradedSourceQualitySchema,
    })).not.toEqual([]);
    for (const diagnosticMarker of [
      "maiprop-os-identity-components",
      "overall_contract",
      "duplicate_quarantine_relation",
      "duplicate_quarantine_acl",
      "extractor_owner",
      "extractor_posture",
      "extractor_body",
      "extractor_acl",
      "generated_column",
      "unique_index",
      "source_check",
      "stored_parity",
    ]) {
      expect(violations({
        supportText: supportText.replaceAll(diagnosticMarker, "removed_identity_diagnostic"),
      })).not.toEqual([]);
    }
    const rawRoleMarker = "--command 'SET ROLE postgres'";
    const rawRoleOccurrences = [...text.matchAll(new RegExp(rawRoleMarker, "g"))];
    expect(rawRoleOccurrences).toHaveLength(6);
    for (const occurrence of rawRoleOccurrences) {
      const missingSameSessionRole =
        text.slice(0, occurrence.index) + text.slice(occurrence.index + rawRoleMarker.length);
      expect(violations({
        text: missingSameSessionRole,
        parsed: yaml.load(missingSameSessionRole),
      })).not.toEqual([]);
    }
    const databaseUrlInHttp = structuredClone(parsed);
    databaseUrlInHttp.jobs.production.steps.find(
      (step) => step.name === "Sample production public API pairs",
    ).env = { TARGET_DB_URL: "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}" };
    expect(violations({ parsed: databaseUrlInHttp })).not.toEqual([]);
    const oldJobWideLogin = structuredClone(parsed);
    oldJobWideLogin.jobs.staging.steps.push({
      name: "Mint temporary staging database login",
      run: "bash scripts/catalogue-hotfix-database-login.sh",
    });
    expect(violations({ parsed: oldJobWideLogin })).not.toEqual([]);
    expect(violations({ databaseLoginWrapperText: "" })).not.toEqual([]);
    expect(violations({ canonicalDatabaseUrlWrapperText: "" })).not.toEqual([]);
    expect(violations({ linkedDatabasePushText: "" })).not.toEqual([]);
    for (const target of ["staging", "production"]) {
      const leakedParentToken = structuredClone(parsed);
      const phase = leakedParentToken.jobs[target].steps.find((step) =>
        step.name === `Prepare manifest-bound ${target} migration dry-run`
      );
      phase.run = phase.run.replace("unset SUPABASE_ACCESS_TOKEN\n", "");
      expect(violations({ parsed: leakedParentToken })).not.toEqual([]);
    }
    for (const target of ["staging", "production"]) {
      const missingCanonicalIdentity = structuredClone(parsed);
      const identity = missingCanonicalIdentity.jobs[target].steps.find((step) =>
        step.name === `Revalidate ${target} identity immediately before mutation`
      );
      identity.run = identity.run.replace(
        "bash scripts/catalogue-hotfix-with-canonical-database-url.sh bash -s <<'IDENTITY_PHASE'",
        "bash -s <<'IDENTITY_PHASE'",
      );
      expect(violations({ parsed: missingCanonicalIdentity })).not.toEqual([]);
    }
    const postMintPrint = databaseLoginWrapperText.replace(
      '\n"$@"',
      '\nprintf \'%s\\n\' "$SUPABASE_ACCESS_TOKEN"\n"$@"',
    );
    expect(violations({ databaseLoginWrapperText: postMintPrint })).not.toEqual([]);
    const missingTokenUnset = databaseLoginWrapperText.replace(
      "unset SUPABASE_ACCESS_TOKEN\n",
      "",
    );
    expect(violations({ databaseLoginWrapperText: missingTokenUnset })).not.toEqual([]);
    const lateTokenUnset = databaseLoginWrapperText
      .replace("unset SUPABASE_ACCESS_TOKEN\n", "")
      .replace(
        "node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target\n",
        "node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target\nunset SUPABASE_ACCESS_TOKEN\n",
      );
    expect(violations({ databaseLoginWrapperText: lateTokenUnset })).not.toEqual([]);
    const postUnsetExport = databaseLoginWrapperText.replace(
      '\n"$@"',
      '\nexport SUPABASE_ACCESS_TOKEN\n"$@"',
    );
    expect(violations({ databaseLoginWrapperText: postUnsetExport })).not.toEqual([]);
    const missingReadinessProbe = databaseLoginWrapperText.replace("database_max_attempts=4\n", "");
    expect(violations({ databaseLoginWrapperText: missingReadinessProbe })).not.toEqual([]);
    const unboundedReadinessProbe = databaseLoginWrapperText.replace(
      "timeout --signal=TERM --kill-after=1s 6s env ",
      "env ",
    );
    expect(violations({ databaseLoginWrapperText: unboundedReadinessProbe })).not.toEqual([]);
    const readinessBeforeValidation = databaseLoginWrapperText.replace(
      "node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target\n\ndatabase_ready=false",
      "database_ready=false\nnode scripts/catalogue-hotfix-workflow-helpers.mjs validate-target",
    );
    expect(violations({ databaseLoginWrapperText: readinessBeforeValidation })).not.toEqual([]);
    for (const unsafeLinkedPush of [
      linkedDatabasePushText.replace("db push --linked", 'db push --db-url "$TARGET_DB_URL"'),
      linkedDatabasePushText.replace('pooler_url_file="$temporary/pooler-url"\n', ""),
      linkedDatabasePushText.replace('--yes link --project-ref "$TARGET_PROJECT_REF"', "--yes link"),
      linkedDatabasePushText.replace("unset SUPABASE_ACCESS_TOKEN\n", ""),
      linkedDatabasePushText.replace(
        "staging:xsiehskfgeoqyazcgauv|production:qvvicunqcrwpioqnvzxf)",
        "staging:*|production:*)",
      ),
      `${linkedDatabasePushText}\ncat "$output"\n`,
      linkedDatabasePushText.replace('mode_flag="--dry-run"', 'mode_flag="--yes"'),
    ]) {
      expect(violations({ linkedDatabasePushText: unsafeLinkedPush })).not.toEqual([]);
    }
    for (const unsafeSupportText of [
      supportText.replace('"VERBOSITY=sqlstate"', '"VERBOSITY=default"'),
      supportText.replace('"SET ROLE postgres"', '"SET ROLE anon"'),
      supportText.replace(
        'String(result.stderr ?? "").match(/\\b(?:ERROR|FATAL):\\s+([0-9A-Z]{5})\\b/)',
        'String(result.stderr ?? "")',
      ),
      supportText.replace(
        'Database behavioral contract query failed with SQLSTATE ${sqlstate}.',
        "Database behavioral contract query failed with provider output.",
      ),
    ]) {
      expect(violations({ supportText: unsafeSupportText })).not.toEqual([]);
    }
    const oversizedCronBudget = text.replace("for n in $(seq 1 15); do", "for n in $(seq 1 17); do");
    expect(violations({ text: oversizedCronBudget, parsed: yaml.load(oversizedCronBudget) })).not.toEqual([]);
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
      databaseLoginScriptText.replace("--request GET --connect-timeout 5 --max-time 10", "--request GET"),
      databaseLoginScriptText.replace("--max-time 30", ""),
      databaseLoginScriptText.replace("$status\" != \"201", "$status\" != \"200"),
      databaseLoginScriptText.replace("$pooler_status\" != \"200", "$pooler_status\" != \"201"),
      databaseLoginScriptText.replace(' "$pooler_response_file"', ""),
      `${databaseLoginScriptText}\ncat "$response_file"\n`,
      databaseLoginScriptText.replace(
        "https://api.supabase.com/v1/projects/xsiehskfgeoqyazcgauv/cli/login-role",
        "https://api.supabase.com/v1/projects/$TARGET_PROJECT_REF/cli/login-role",
      ),
      databaseLoginScriptText.replace(
        "https://api.supabase.com/v1/projects/xsiehskfgeoqyazcgauv/config/database/pooler",
        "https://api.supabase.com/v1/projects/$TARGET_PROJECT_REF/config/database/pooler",
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
      supportText: supportText.replace('  parsed.search = "";\n', ""),
    })).not.toEqual([]);
    expect(violations({
      supportText: supportText.replace(
        'parsed.searchParams.set("sslmode", "require");',
        'parsed.searchParams.append("sslmode", "require");',
      ),
    })).not.toEqual([]);
    expect(violations({
      supportText: supportText.replace(
        "const MAXIMUM_DATABASE_PHASE_SECONDS = 4 * 60;",
        "const MAXIMUM_DATABASE_PHASE_SECONDS = 5 * 60;",
      ),
    })).not.toEqual([]);
    expect(violations({
      supportText: supportText.replace(
        "const DATABASE_CREDENTIAL_MARGIN_SECONDS = 60;",
        "const DATABASE_CREDENTIAL_MARGIN_SECONDS = 0;",
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
