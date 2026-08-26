import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { checkSlsaReadiness } from "./check-slsa-readiness.mjs";
import { releaseAuthorizationSha256 } from "./production-break-glass-validation.mjs";

const testRuntime =
  typeof globalThis.describe === "function" &&
  typeof globalThis.it === "function" &&
  typeof globalThis.expect === "function"
    ? globalThis
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const { afterEach, describe, it } = testRuntime;
const expect = globalThis.expect ?? ((actual) => ({
  toBe(expected) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}.`);
    }
  },
  toEqual(expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}.`);
    }
  },
  toMatch(expected) {
    if (!expected.test(String(actual))) {
      throw new Error(`Expected ${JSON.stringify(actual)} to match ${expected}.`);
    }
  },
}));

const roots = [];
const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/stage-release.yml",
  ".github/workflows/approve-production-release.yml",
  ".github/workflows/reusable-supabase-staging.yml",
  ".github/workflows/deploy-production-release.yml",
  ".github/workflows/direct-cloudflare-production-deploy.yml",
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
  "scripts/release-artifact-binding.mjs",
  "scripts/create-release-artifact-binding.mjs",
  "scripts/verify-release-artifact-binding.mjs",
];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-slsa-binding-"));
  roots.push(root);
  for (const relativePath of requiredFiles) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(process.cwd(), relativePath), target);
  }
  return root;
}

function rewrite(root, relativePath, transform) {
  const path = join(root, relativePath);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
}

const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";
const reasonSha256 = "3a7e0232d1a54441027669a65abbaf8ba8b9272a06e9205c6d9c1ffa4c9e6067";

function breakGlassAuthorization(overrides = {}) {
  return {
    mode: "break_glass",
    action: "production-deploy",
    actor: "krenios",
    release_sha: releaseSha,
    incident_id: incidentId,
    reason_sha256: reasonSha256,
    authorized_expires_at: "2026-08-26T12:00:00.000Z",
    workflow_run_id: "70",
    workflow_run_attempt: "1",
    ...overrides,
  };
}

function standardAuthorization(overrides = {}) {
  return {
    mode: "standard",
    action: "production-deploy",
    actor: "release-operator",
    release_sha: releaseSha,
    workflow_run_id: "70",
    workflow_run_attempt: "1",
    ...overrides,
  };
}

function breakGlassConsumption(overrides = {}) {
  return {
    artifact_id: "101",
    artifact_digest: "a".repeat(64),
    binding_artifact_id: "102",
    payload_sha256: "b".repeat(64),
    action: "production-deploy",
    incident_id: incidentId,
    release_sha: releaseSha,
    parent_run_id: "70",
    ...overrides,
  };
}

function attestation(name, mode, authorizationSha256, consumptionSha256, overrides = {}) {
  return {
    schema_version: 1,
    evidence_type: name,
    authorization_mode: mode,
    authorization_sha256: authorizationSha256,
    consumption_sha256: consumptionSha256,
    ...overrides,
  };
}

function coordinatedReleaseEvidence(overrides = {}) {
  const authorization = breakGlassAuthorization();
  const consumption = breakGlassConsumption();
  const authorizationSha256 = releaseAuthorizationSha256(authorization);
  const attestations = {
    database: attestation(
      "maiprop-production-database-promotion",
      "break_glass",
      authorizationSha256,
      consumption.payload_sha256,
    ),
    edge: attestation(
      "maiprop-production-edge-promotion",
      "break_glass",
      authorizationSha256,
      consumption.payload_sha256,
    ),
    cloudflare: attestation(
      "maiprop-cloudflare-production-promotion",
      "break_glass",
      authorizationSha256,
      consumption.payload_sha256,
    ),
    aggregate: attestation(
      "maiprop-coordinated-production-release",
      "break_glass",
      authorizationSha256,
      consumption.payload_sha256,
    ),
  };
  return {
    route: "coordinated",
    authorization,
    consumption,
    attestations,
    ...overrides,
  };
}

describe("GitHub Free private-repository release provenance readiness", () => {
  it("accepts the repository HMAC binding and GitHub artifact API contract", () => {
    const readiness = checkSlsaReadiness(process.cwd());
    expect(readiness.failures).toEqual([]);
    expect(readiness.summary.bindingWorkflowFiles).toEqual([
      ".github/workflows/approve-production-release.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/deploy-production-release.yml",
      ".github/workflows/direct-cloudflare-production-deploy.yml",
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      ".github/workflows/reusable-supabase-staging.yml",
      ".github/workflows/stage-release.yml",
    ]);
    expect(readiness.summary.githubFreePrivateEnvironmentControls).toEqual({
      active: false,
      purpose: "deployment attribution and paid-plan scope only",
    });
  });

  it("fails closed when signing-key ownership or same-run controls are removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/ci.yml",
      (source) => source
        .replaceAll("RELEASE_EVIDENCE_SIGNING_KEY", "REMOVED_SIGNING_KEY")
        .replaceAll("--same-run", "--removed-same-run"),
    );
    const readiness = checkSlsaReadiness(root);
    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/signing key|same-run/i);
  });

  it("fails closed when exact-SHA HMAC artifact binding names drift", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}-binding",
        "release-candidate-attestation-binding-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}",
      ),
    );
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        'binding_name="release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding"',
        'binding_name="release-candidate-attestation-binding-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}"',
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/exact.*binding|release-candidate-attestation/i);
  });

  it("fails closed when attempt-one actor equality is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source
        .replace("github.run_attempt == 1", "true")
        .replace("github.actor == github.triggering_actor", "true"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/run_attempt|triggering_actor|attempt-one actor/i);
  });

  it("fails closed when artifact ID or digest binding is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source
        .replaceAll('--artifact-id "$APPROVAL_ARTIFACT_ID"', "--removed-artifact-id")
        .replaceAll('--artifact-digest "$APPROVAL_ARTIFACT_DIGEST"', "--removed-artifact-digest"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/artifact-id|artifact-digest|artifact identity/i);
  });

  it("fails closed when the signed approval is not bound to the exact workflow SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replaceAll('--workflow-sha "$GITHUB_WORKFLOW_SHA"', "--removed-workflow-sha"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/workflow-sha|exact.*SHA/i);
  });

  it("fails closed when staging is not pinned to the exact candidate workflow SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "github.workflow_sha == github.event.workflow_run.head_sha",
        "true",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/workflow_sha|exact.*SHA/i);
  });

  it("fails closed when approval no longer proves the release is current main", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        '[ "$CURRENT_MAIN" != "$RELEASE_SHA" ]',
        "false",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/CURRENT_MAIN|current main/i);
  });

  it("fails closed when approval independence is removed", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/approve-production-release.yml",
      (source) => source.replace(
        "The allowlisted approver must be independent from CI and staging producers.",
        "Approval accepted.",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/independent/i);
  });

  it("fails closed when direct Cloudflare recovery loses attempt-one actor equality", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/direct-cloudflare-production-deploy.yml",
      (source) => source
        .replace("github.run_attempt == 1", "true")
        .replace("github.actor == github.triggering_actor", "true")
        .replace("github.run_attempt != 1", "false")
        .replace("github.actor != github.triggering_actor", "false"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/direct-cloudflare|run_attempt|triggering_actor/i);
  });

  it("fails closed when Cloudflare Pages deployment is not pinned to the exact release SHA", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replace('--commit-hash="$RELEASE_SHA"', "--commit-hash=main")
        .replace("--commit-dirty=false", "--commit-dirty=true"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/commit-hash|commit-dirty|exact release SHA/i);
  });

  it("fails closed when the Cloudflare mutation lease loses artifact ID or digest verification", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replace('artifact_id="$(jq -er \'.artifact.id\' "$binding")"', "artifact_id=unbound")
        .replace('artifact_digest="$(jq -er \'.digest\' "$metadata")"', "artifact_digest=unbound"),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/artifact_id|artifact_digest|artifact identity/i);
  });

  it("fails closed when the Cloudflare mutation lease is no longer verified as same-run", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source.replace(
        '"$PRODUCTION_RUN_ID" "$PRODUCTION_RUN_ATTEMPT" same-run',
        '"$PRODUCTION_RUN_ID" "$PRODUCTION_RUN_ATTEMPT" prior-run',
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/mutation lease|same-run/i);
  });

  it("fails closed when Cloudflare no longer revalidates independent approval against the deployer", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source
        .replaceAll('--deploy-actor "$GITHUB_ACTOR"', '--deploy-actor "$DEPLOY_ACTOR"')
        .replaceAll('--allowed-approvers "$ALLOWED_APPROVERS"', '--allowed-approvers "$ALLOWED_DEPLOYERS"'),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/deploy-actor|allowed-approvers|independent approval/i);
  });

  it("fails closed when the reusable Cloudflare contract drops a required run-tuple input", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
      (source) => source.replace(
        /      production_run_attempt:\r?\n        required: true\r?\n        type: string\r?\n/,
        "",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/production_run_attempt|required reusable input/i);
  });

  it("fails closed when coordinated production evidence loses its exact-SHA HMAC binding", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/deploy-production-release.yml",
      (source) => source.replace(
        "production-release-attestation-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
        "production-release-attestation-binding-${{ github.run_id }}",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/production-release-attestation|exact.*binding/i);
  });

  it("rejects legacy attestation and environment controls in Cloudflare production workflows", () => {
    const root = fixture();
    const workflowPath = join(root, ".github/workflows/reusable-cloudflare-production-deploy.yml");
    writeFileSync(
      workflowPath,
      `${readFileSync(workflowPath, "utf8")}\n` +
        "# actions/attest-build-provenance@floating\n" +
        "# gh attestation verify\n" +
        "    environment: production\n" +
        "      id-token: write\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/attestation|environment|OIDC/i);
  });

  it("rejects reintroduced GitHub attestation or OIDC dependencies in staging workflows", () => {
    const root = fixture();
    const stagePath = join(root, ".github/workflows/stage-release.yml");
    writeFileSync(
      stagePath,
      `${readFileSync(stagePath, "utf8")}\n` +
        "# actions/attest-build-provenance@floating\n" +
        "# gh attestation verify\n" +
        "      id-token: write\n",
    );
    const readiness = checkSlsaReadiness(root);
    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(/attestation|OIDC/i);
  });

  it("rejects staging environment scope on a reusable caller job", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  supabase-staging:\n    name: Stage Supabase exact SHA",
        "  supabase-staging:\n    name: Stage Supabase exact SHA\n    environment: staging",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /supabase-staging.*environment|environment.*supabase-staging/i,
    );
  });

  it("rejects an unclassified stage-release job without an environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-unscoped-job:\n" +
        "    name: Unknown unscoped job\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-unscoped-job.*not explicitly classified/i,
    );
  });

  it("rejects an unclassified stage-release job even when it uses staging", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-staging-job:\n" +
        "    name: Unknown staging job\n" +
        "    environment: staging\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-staging-job.*not explicitly classified/i,
    );
  });

  it("rejects an unclassified stage-release job assigned to another environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => `${source.trimEnd()}\n\n` +
        "  unknown-mis-scoped-job:\n" +
        "    name: Unknown mis-scoped job\n" +
        "    environment: production\n" +
        "    runs-on: ubuntu-latest\n" +
        "    steps:\n" +
        "      - run: echo unclassified\n",
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /unknown-mis-scoped-job.*not explicitly classified/i,
    );
  });

  it("rejects a renamed stage-release job until its classification changes", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  staging-business-proofs:\n",
        "  renamed-staging-business-proofs:\n",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /renamed-staging-business-proofs.*not explicitly classified/i,
    );
    expect(readiness.failures.join("\n")).toMatch(
      /classified job staging-business-proofs is missing/i,
    );
  });

  it("requires staging environment scope on mutation and evidence jobs", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: staging",
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /cloudflare-staging.*environment|environment.*cloudflare-staging/i,
    );
  });

  it("requires staging environment scope on Cloudflare preflight", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  cloudflare-staging-preflight:\n    name: Preflight staging Cloudflare before backend mutation\n    environment: staging",
        "  cloudflare-staging-preflight:\n    name: Preflight staging Cloudflare before backend mutation",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /cloudflare-staging-preflight.*environment|environment.*cloudflare-staging-preflight/i,
    );
  });

  it("rejects a classified staging job assigned to another environment", () => {
    const root = fixture();
    rewrite(
      root,
      ".github/workflows/stage-release.yml",
      (source) => source.replace(
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: staging",
        "  cloudflare-staging:\n    name: Stage Cloudflare exact artifact\n    environment: production",
      ),
    );

    const readiness = checkSlsaReadiness(root);

    expect(readiness.ok).toBe(false);
    expect(readiness.failures.join("\n")).toMatch(
      /cloudflare-staging.*staging environment/i,
    );
  });

  it("accepts only one exact signed break-glass hash tuple across all production attestations", () => {
    const readiness = checkSlsaReadiness(process.cwd(), {
      releaseEvidence: coordinatedReleaseEvidence(),
    });

    expect(readiness.failures).toEqual([]);
    expect(readiness.summary.releaseAuthorization).toEqual({
      mode: "break_glass",
      incident_id: incidentId,
    });
    expect(JSON.stringify(readiness.summary).includes(reasonSha256)).toBe(false);
  });

  it("rejects missing, malformed, uppercase, changed, partial, and mixed production hashes", () => {
    for (const [label, mutate] of [
      ["missing authorization hash", (value) => {
        delete value.attestations.database.authorization_sha256;
      }],
      ["missing consumption hash", (value) => {
        delete value.attestations.edge.consumption_sha256;
      }],
      ["malformed authorization hash", (value) => {
        value.attestations.cloudflare.authorization_sha256 = "not-a-digest";
      }],
      ["uppercase authorization hash", (value) => {
        value.attestations.aggregate.authorization_sha256 =
          value.attestations.aggregate.authorization_sha256.toUpperCase();
      }],
      ["changed consumption hash", (value) => {
        value.attestations.database.consumption_sha256 = "c".repeat(64);
      }],
      ["partial consumption tuple", (value) => {
        delete value.consumption.binding_artifact_id;
      }],
      ["extra consumption tuple identity", (value) => {
        value.consumption.binding_digest = "d".repeat(64);
      }],
      ["uppercase consumption identity", (value) => {
        value.consumption.payload_sha256 = value.consumption.payload_sha256.toUpperCase();
      }],
      ["mixed attestation mode", (value) => {
        value.attestations.edge.authorization_mode = "standard";
      }],
    ]) {
      const evidence = coordinatedReleaseEvidence();
      mutate(evidence);
      const readiness = checkSlsaReadiness(process.cwd(), {
        releaseEvidence: evidence,
      });
      expect(readiness.ok, label).toBe(false);
      expect(readiness.failures.join("\n"), label).toMatch(
        /authorization|consumption|hash|mode|evidence/i,
      );
    }
  });

  it("rejects changed, partial, or extra break-glass authorization evidence", () => {
    for (const [label, mutate] of [
      ["changed incident", (value) => {
        value.authorization.incident_id = "PERF-BOOTSTRAP-20260826-02";
      }],
      ["changed reason hash", (value) => {
        value.authorization.reason_sha256 = "e".repeat(64);
      }],
      ["partial authorization", (value) => {
        delete value.authorization.workflow_run_attempt;
      }],
      ["extra authorization", (value) => {
        value.authorization.reason = "plaintext must never be accepted or reported";
      }],
    ]) {
      const evidence = coordinatedReleaseEvidence();
      mutate(evidence);
      const readiness = checkSlsaReadiness(process.cwd(), {
        releaseEvidence: evidence,
      });
      expect(readiness.ok, label).toBe(false);
      expect(readiness.failures.join("\n"), label).toMatch(/authorization|incident|reason|fields/i);
      expect(JSON.stringify(readiness.summary).includes("plaintext")).toBe(false);
    }
  });

  it("preserves the coordinated standard evidence contract without break-glass consumption", () => {
    const authorization = standardAuthorization();
    const authorizationSha256 = releaseAuthorizationSha256(authorization);
    const attestations = Object.fromEntries([
      ["database", "maiprop-production-database-promotion"],
      ["edge", "maiprop-production-edge-promotion"],
      ["cloudflare", "maiprop-cloudflare-production-promotion"],
      ["aggregate", "maiprop-coordinated-production-release"],
    ].map(([key, evidenceType]) => [
      key,
      attestation(evidenceType, "standard", authorizationSha256, null),
    ]));

    const readiness = checkSlsaReadiness(process.cwd(), {
      releaseEvidence: {
        route: "coordinated",
        authorization,
        consumption: { mode: "standard" },
        attestations,
      },
    });

    expect(readiness.failures).toEqual([]);
    expect(readiness.summary.releaseAuthorization).toEqual({ mode: "standard" });
  });

  it("preserves legacy direct recovery evidence and rejects every break-glass field", () => {
    const direct = {
      route: "direct_recovery",
      attestation: {
        schema_version: 1,
        evidence_type: "maiprop-cloudflare-production-recovery",
        release_status: "passed",
        rollback_performed: false,
      },
    };
    expect(checkSlsaReadiness(process.cwd(), { releaseEvidence: direct }).failures).toEqual([]);

    for (const [field, value] of [
      ["authorization_mode", "break_glass"],
      ["authorization_sha256", "a".repeat(64)],
      ["consumption_sha256", "b".repeat(64)],
      ["incident_id", incidentId],
      ["authorization", breakGlassAuthorization()],
      ["consumption", breakGlassConsumption()],
    ]) {
      const readiness = checkSlsaReadiness(process.cwd(), {
        releaseEvidence: {
          ...direct,
          attestation: { ...direct.attestation, [field]: value },
        },
      });
      expect(readiness.ok, field).toBe(false);
      expect(readiness.failures.join("\n"), field).toMatch(/direct recovery|break-glass/i);
    }
  });
});
