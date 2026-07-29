import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCloudflareDeployment,
  assertEdgeBundleParity,
  assertSupabaseTargetIdentity,
  normalizeReleaseSha,
  selectApprovalRun,
  selectBackendProofRun,
  selectReleaseProofs,
  selectReadinessRun,
  selectStagingProofRun,
  validateReleaseCandidateAttestation,
  validateMutationLease,
  validateReleaseApproval,
  validateStagingLease,
} from "./production-release-validation.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const root = resolve(import.meta.dirname, "..");

describe("production release validation", () => {
  it("requires a full immutable Git SHA", () => {
    expect(normalizeReleaseSha(sha)).toBe(sha);
    expect(() => normalizeReleaseSha("main")).toThrow(/40-character/i);
    expect(() => normalizeReleaseSha("abc123")).toThrow(/40-character/i);
  });

  it("accepts only an exact-SHA CI run with the final readiness job green", () => {
    const run = selectReadinessRun({
      sha,
      runs: [
        { id: 10, head_sha: sha, event: "push", status: "completed", conclusion: "success" },
        { id: 11, head_sha: "f".repeat(40), event: "push", status: "completed", conclusion: "success" },
      ],
      jobsByRun: new Map([
        [10, [{ name: "Immutable release candidate built", status: "completed", conclusion: "success" }]],
        [11, [{ name: "Immutable release candidate built", status: "completed", conclusion: "success" }]],
      ]),
    });

    expect(run.id).toBe(10);
  });

  it("rejects workflow success when the final readiness job is absent or failed", () => {
    expect(() => selectReadinessRun({
      sha,
      runs: [{ id: 20, head_sha: sha, event: "push", status: "completed", conclusion: "success" }],
      jobsByRun: new Map([[20, [{ name: "Build / Lint / Test", conclusion: "success" }]]]),
    })).toThrow(/Immutable release candidate built/);

    expect(() => selectReadinessRun({
      sha,
      runs: [{ id: 21, head_sha: sha, event: "push", status: "completed", conclusion: "success" }],
      jobsByRun: new Map([[21, [{ name: "Immutable release candidate built", conclusion: "failure" }]]]),
    })).toThrow(/Immutable release candidate built/);
  });

  it("never falls back to an older green attempt when the newest exact-SHA attempt failed", () => {
    expect(() => selectReadinessRun({
      sha,
      runs: [
        { id: 30, run_attempt: 1, head_sha: sha, event: "push", status: "completed", conclusion: "success" },
        { id: 31, run_attempt: 2, head_sha: sha, event: "push", status: "completed", conclusion: "failure" },
      ],
      jobsByRun: new Map([
        [30, [{ name: "Build / Lint / Test", conclusion: "success" }]],
        [31, [{ name: "Build / Lint / Test", conclusion: "failure" }]],
      ]),
    })).toThrow(/newest exact-SHA CI run/i);
  });

  it("requires the latest main-only staging run and its attestation job", () => {
    const run = selectStagingProofRun({
      sha,
      runs: [
        { id: 50, run_attempt: 1, head_sha: sha, event: "workflow_run", status: "completed", conclusion: "success" },
      ],
      jobsByRun: new Map([[
        50,
        [{ name: "Release candidate attested", status: "completed", conclusion: "success" }],
      ]]),
    });

    expect(run.id).toBe(50);
    expect(() => selectStagingProofRun({
      sha,
      runs: [
        { id: 50, run_attempt: 1, head_sha: sha, event: "workflow_run", status: "completed", conclusion: "success" },
        { id: 51, run_attempt: 2, head_sha: sha, event: "workflow_run", status: "in_progress", conclusion: null },
      ],
      jobsByRun: new Map([[
        50,
        [{ name: "Release candidate attested", status: "completed", conclusion: "success" }],
      ]]),
    })).toThrow(/newest exact-SHA staging run/i);
  });

  it("selects CI and staging proof from the same exact release SHA", () => {
    const readiness = {
      id: 60,
      run_attempt: 2,
      head_sha: sha,
      event: "push",
      status: "completed",
      conclusion: "success",
    };
    const staging = {
      id: 61,
      run_attempt: 1,
      head_sha: sha,
      event: "workflow_run",
      status: "completed",
      conclusion: "success",
    };

    expect(selectReleaseProofs({
      sha,
      readinessRuns: [readiness],
      readinessJobsByRun: new Map([[
        readiness.id,
        [{ name: "Immutable release candidate built", status: "completed", conclusion: "success" }],
      ]]),
      stagingRuns: [staging],
      stagingJobsByRun: new Map([[
        staging.id,
        [{ name: "Release candidate attested", status: "completed", conclusion: "success" }],
      ]]),
    })).toEqual({ readiness, staging });
  });

  it("selects the newest successful exact-SHA manual approval run", () => {
    const selected = selectApprovalRun({
      sha,
      runs: [
        {
          id: 69,
          run_attempt: 9,
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 70,
          run_attempt: 1,
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 71,
          run_attempt: 2,
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "failure",
        },
        {
          id: 72,
          run_attempt: 3,
          head_sha: "f".repeat(40),
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
      ],
      jobsByRun: new Map([
        [
          69,
          [{
            name: "Production release approved",
            status: "completed",
            conclusion: "success",
          }],
        ],
        [
          70,
          [{
            name: "Production release approved",
            status: "completed",
            conclusion: "success",
          }],
        ],
        [
          71,
          [{
            name: "Production release approved",
            status: "completed",
            conclusion: "failure",
          }],
        ],
        [
          72,
          [{
            name: "Production release approved",
            status: "completed",
            conclusion: "success",
          }],
        ],
      ]),
    });

    expect(selected.id).toBe(70);
    expect(() => selectApprovalRun({
      sha,
      runs: [{
        id: 73,
        head_sha: sha,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
      }],
      jobsByRun: new Map([[73, [{
        name: "Different job",
        status: "completed",
        conclusion: "success",
      }]]]),
    })).toThrow(/Production release approved/);
  });

  it("rejects unsigned aggregate content that does not match the selected staging run", () => {
    const digest = "a".repeat(64);
    const attestation = {
      schema_version: 2,
      evidence_type: "maiprop-release-candidate-attestation",
      release_sha: sha,
      source_tree: "b".repeat(40),
      source_run_id: "60",
      source_run_attempt: "2",
      artifact_sha256: digest,
      manifest_sha256: "b".repeat(64),
      payload_sha256: "c".repeat(64),
      staging_run_id: "61",
      staging_run_attempt: "1",
      evidence_sha256: {
        provenance: "d".repeat(64),
        supabase: "e".repeat(64),
        cloudflare: "f".repeat(64),
        business: "0".repeat(64),
        security: "1".repeat(64),
      },
      provenance: [{}],
      supabase: {
        release_sha: sha,
        artifact_sha256: digest,
        database: { project_ref: "xsiehskfgeoqyazcgauv" },
      },
      cloudflare: {
        release_sha: sha,
        artifact_sha256: digest,
        stable_url: "https://maiprop-listing-site-staging.pages.dev",
      },
      business: { release_sha: sha, artifact_sha256: digest },
      security: {
        schema_version: 1,
        evidence_type: "maiprop-staging-live-security",
        ok: true,
        release_sha: sha,
        artifact_sha256: digest,
        target: {
          supabase_project_ref: "xsiehskfgeoqyazcgauv",
          app_origin: "https://maiprop-listing-site-staging.pages.dev",
        },
        playwright: {
          specs: [
            "gdpr-delete-account.spec.ts",
            "onboarding-role-selection.spec.ts",
            "rls-security.spec.ts",
          ],
          expected: 12,
          skipped: 0,
          unexpected: 0,
          flaky: 0,
          report_sha256: "2".repeat(64),
        },
      },
    };

    expect(validateReleaseCandidateAttestation({
      attestation,
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toEqual(attestation);
    expect(() => validateReleaseCandidateAttestation({
      attestation,
      sha,
      sourceTree: "c".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/source tree/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation,
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "59",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/source run/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation,
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "62",
      stagingRunAttempt: "1",
    })).toThrow(/staging run/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: { ...attestation, payload_sha256: "not-a-digest" },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/digest/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: {
        ...attestation,
        evidence_sha256: { ...attestation.evidence_sha256, business: "not-a-digest" },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/evidence digest/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: {
        ...attestation,
        security: {
          ...attestation.security,
          playwright: { ...attestation.security.playwright, skipped: 1 },
        },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/Security evidence/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: {
        ...attestation,
        security: {
          ...attestation.security,
          target: {
            ...attestation.security.target,
            app_origin: "https://different-staging.pages.dev",
          },
        },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/Security evidence/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: { ...attestation, cloudflare: { ...attestation.cloudflare, release_sha: "f".repeat(40) } },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/Cloudflare evidence/i);
  });

  it("leases staging only to the exact newest CI attempt while it remains current main", () => {
    const readinessRun = {
      id: 75,
      run_attempt: 2,
      head_sha: sha,
      head_branch: "main",
      head_repository: { full_name: "maiprop/maiprop-listing-site" },
      event: "push",
    };

    expect(validateStagingLease({
      readinessRun,
      releaseSha: sha,
      sourceRunId: "75",
      sourceRunAttempt: "2",
      mainSha: sha,
      repository: "maiprop/maiprop-listing-site",
    })).toEqual(readinessRun);
    expect(() => validateStagingLease({
      readinessRun,
      releaseSha: sha,
      sourceRunId: "75",
      sourceRunAttempt: "1",
      mainSha: sha,
      repository: "maiprop/maiprop-listing-site",
    })).toThrow(/attempt/i);
    expect(() => validateStagingLease({
      readinessRun,
      releaseSha: sha,
      sourceRunId: "75",
      sourceRunAttempt: "2",
      mainSha: "f".repeat(40),
      repository: "maiprop/maiprop-listing-site",
    })).toThrow(/current main/i);
  });

  it("requires database and Edge success in one exact-SHA release run for recovery", () => {
    const run = selectBackendProofRun({
      sha,
      runs: [{ id: 30, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" }],
      jobsByRun: new Map([[
        30,
        [
          { name: "deploy-database / Production database migration gate", conclusion: "success" },
          { name: "deploy-edge-functions / Deploy to Supabase", conclusion: "success" },
          { name: "deploy-cloudflare / Deploy to Cloudflare Pages", conclusion: "failure" },
        ],
      ]]),
    });

    expect(run.id).toBe(30);
  });

  it("rejects recovery proof split across different release runs", () => {
    expect(() => selectBackendProofRun({
      sha,
      runs: [
        { id: 40, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" },
        { id: 41, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" },
      ],
      jobsByRun: new Map([
        [40, [{ name: "deploy-database / Production database migration gate", conclusion: "success" }]],
        [41, [{ name: "deploy-edge-functions / Deploy to Supabase", conclusion: "success" }]],
      ]),
    })).toThrow(/database and Edge/i);
  });

  it("proves direct and pooler database URLs belong to the expected Supabase project", () => {
    const expectedRef = "abcdefghijklmnopqrst";

    expect(assertSupabaseTargetIdentity({
      expectedRef,
      supabaseUrl: `https://${expectedRef}.supabase.co`,
      databaseUrl: `postgresql://postgres:secret@db.${expectedRef}.supabase.co:5432/postgres`,
    })).toEqual({
      expectedRef,
      apiProjectRef: expectedRef,
      databaseProjectRef: expectedRef,
    });

    expect(assertSupabaseTargetIdentity({
      expectedRef,
      supabaseUrl: `https://${expectedRef}.supabase.co`,
      databaseUrl: `postgresql://postgres.${expectedRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    }).databaseProjectRef).toBe(expectedRef);
  });

  it("fails closed when Supabase URL and database identities disagree", () => {
    expect(() => assertSupabaseTargetIdentity({
      expectedRef: "abcdefghijklmnopqrst",
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      databaseUrl: "postgresql://postgres.zyxwvutsrqponmlkjihg:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    })).toThrow(/does not match/i);
  });

  it("requires a non-self, allowlisted, unexpired, non-revoked approval", () => {
    const approval = {
      schema_version: 1,
      release_sha: sha,
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      approval_run_id: "60",
      approver: "release-reviewer",
      approved_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T13:00:00.000Z",
      revoked: false,
    };

    expect(validateReleaseApproval({
      approval,
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toEqual(approval);

    expect(() => validateReleaseApproval({
      approval,
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-reviewer",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toThrow(/independent/i);

    expect(() => validateReleaseApproval({
      approval: { ...approval, revoked: true },
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toThrow(/revoked/i);

    expect(() => validateReleaseApproval({
      approval,
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T13:00:00.000Z"),
    })).toThrow(/expired/i);

    expect(() => validateReleaseApproval({
      approval: { ...approval, revoked: undefined },
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toThrow(/revoked.*false/i);

    expect(() => validateReleaseApproval({
      approval: {
        ...approval,
        expires_at: "2026-07-28T14:00:00.001Z",
      },
      sha,
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toThrow(/two hours/i);
  });

  it("revalidates the exact mutation lease before every production boundary", () => {
    const lease = {
      schema_version: 1,
      release_sha: sha,
      artifact_sha256: "b".repeat(64),
      staging_run_id: "50",
      approval_run_id: "60",
      production_run_id: "70",
      issued_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T12:45:00.000Z",
    };

    expect(validateMutationLease({
      lease,
      sha,
      artifactSha256: "b".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      productionRunId: "70",
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toEqual(lease);

    expect(() => validateMutationLease({
      lease,
      sha,
      artifactSha256: "c".repeat(64),
      stagingRunId: "50",
      approvalRunId: "60",
      productionRunId: "70",
      now: new Date("2026-07-28T12:30:00.000Z"),
    })).toThrow(/artifact/i);
  });

  it("exposes approval and mutation-lease validation through the CLI", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "maiprop-release-"));
    const approvalPath = resolve(directory, "approval.json");
    const leasePath = resolve(directory, "lease.json");
    writeFileSync(approvalPath, JSON.stringify({
      schema_version: 1,
      release_sha: sha,
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      approval_run_id: "60",
      approver: "release-reviewer",
      approved_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T13:00:00.000Z",
      revoked: false,
    }));
    writeFileSync(leasePath, JSON.stringify({
      schema_version: 1,
      release_sha: sha,
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      approval_run_id: "60",
      production_run_id: "70",
      issued_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T12:45:00.000Z",
    }));

    try {
      const approvalResult = spawnSync(process.execPath, [
        "scripts/production-release-validation.mjs",
        "release-approval",
        "--file",
        approvalPath,
        "--sha",
        sha,
        "--artifact-sha256",
        "a".repeat(64),
        "--staging-run-id",
        "50",
        "--approval-run-id",
        "60",
        "--deploy-actor",
        "release-operator",
        "--allowed-approvers",
        "release-reviewer,backup-reviewer",
        "--now",
        "2026-07-28T12:30:00.000Z",
      ], { cwd: root, encoding: "utf8" });
      expect(approvalResult.status, approvalResult.stderr).toBe(0);
      expect(approvalResult.stdout).toContain("Verified release approval");

      const leaseResult = spawnSync(process.execPath, [
        "scripts/production-release-validation.mjs",
        "mutation-lease",
        "--file",
        leasePath,
        "--sha",
        sha,
        "--artifact-sha256",
        "a".repeat(64),
        "--staging-run-id",
        "50",
        "--approval-run-id",
        "60",
        "--production-run-id",
        "70",
        "--now",
        "2026-07-28T12:30:00.000Z",
      ], { cwd: root, encoding: "utf8" });
      expect(leaseResult.status, leaseResult.stderr).toBe(0);
      expect(leaseResult.stdout).toContain("Verified production mutation lease");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires exact staging and production Supabase Edge bundle parity", () => {
    const staged = [
      { name: "alpha", ezbr_sha256: "a".repeat(64), verify_jwt: true },
      { name: "beta", ezbr_sha256: "b".repeat(64), verify_jwt: false },
    ];

    expect(assertEdgeBundleParity(staged, [...staged].reverse())).toEqual(
      staged,
    );
    expect(() => assertEdgeBundleParity(staged, [
      staged[0],
      { ...staged[1], ezbr_sha256: "c".repeat(64) },
    ])).toThrow(/bundle digest/i);
    expect(() => assertEdgeBundleParity(staged, [staged[0]])).toThrow(
      /function set/i,
    );
  });

  it("attests the exact Cloudflare deployment instead of trusting a list position", () => {
    const deployment = {
      id: "deployment-1",
      project_name: "maiprop-listing-site-staging",
      environment: "production",
      is_skipped: false,
      uses_functions: true,
      latest_stage: { name: "deploy", status: "success" },
      deployment_trigger: {
        metadata: {
          branch: "main",
          commit_hash: sha,
          commit_dirty: false,
        },
      },
      url: "https://deployment-1.maiprop-listing-site-staging.pages.dev",
    };

    expect(assertCloudflareDeployment({
      deployment,
      expectedProject: "maiprop-listing-site-staging",
      expectedEnvironment: "production",
      expectedBranch: "main",
      expectedSha: sha,
    })).toEqual(deployment);

    expect(() => assertCloudflareDeployment({
      deployment: {
        ...deployment,
        deployment_trigger: {
          metadata: {
            ...deployment.deployment_trigger.metadata,
            commit_dirty: true,
          },
        },
      },
      expectedProject: "maiprop-listing-site-staging",
      expectedEnvironment: "production",
      expectedBranch: "main",
      expectedSha: sha,
    })).toThrow(/dirty/i);
  });
});
