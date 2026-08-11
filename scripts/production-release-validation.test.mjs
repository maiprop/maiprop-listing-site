import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCloudflareDeployment,
  assertEdgeBundleParity,
  assertEdgeSourceManifestParity,
  assertMigrationDryRunParity,
  assertMigrationPromotionPlan,
  assertSupabaseTargetIdentity,
  normalizeReleaseSha,
  selectApprovalRun,
  selectBackendProofRun,
  selectReleaseProofs,
  selectReadinessRun,
  selectStripeReadinessRun,
  selectStagingProofRun,
  validateReleaseCandidateAttestation,
  validateMutationLease,
  validateProductionPromotionAttestations,
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

  it("orders exact-SHA readiness runs by newest run ID before run attempt", () => {
    const run = selectReadinessRun({
      sha,
      runs: [
        {
          id: 300,
          run_attempt: 99,
          head_sha: sha,
          event: "push",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 301,
          run_attempt: 1,
          head_sha: sha,
          event: "push",
          status: "completed",
          conclusion: "success",
        },
      ],
      jobsByRun: new Map([
        [300, [{
          name: "Immutable release candidate built",
          status: "completed",
          conclusion: "success",
        }]],
        [301, [{
          name: "Immutable release candidate built",
          status: "completed",
          conclusion: "success",
        }]],
      ]),
    });

    expect(run.id).toBe(301);
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

  it("orders exact-SHA staging runs by newest run ID before run attempt", () => {
    const run = selectStagingProofRun({
      sha,
      runs: [
        {
          id: 400,
          run_attempt: 99,
          head_sha: sha,
          event: "workflow_run",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 401,
          run_attempt: 1,
          head_sha: sha,
          event: "workflow_run",
          status: "completed",
          conclusion: "success",
        },
      ],
      jobsByRun: new Map([
        [400, [{
          name: "Release candidate attested",
          status: "completed",
          conclusion: "success",
        }]],
        [401, [{
          name: "Release candidate attested",
          status: "completed",
          conclusion: "success",
        }]],
      ]),
    });

    expect(run.id).toBe(401);
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
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 70,
          run_attempt: 1,
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 71,
          run_attempt: 2,
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "failure",
        },
        {
          id: 72,
          run_attempt: 3,
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: "f".repeat(40),
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 74,
          run_attempt: 1,
          actor: { login: "release-admin" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
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
        [
          74,
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

  it("selects only an attempt-1 same-actor Stripe readiness run", () => {
    const jobs = [{
      name: "Verify exact-SHA Stripe live catalogue",
      status: "completed",
      conclusion: "success",
    }];
    const selected = selectStripeReadinessRun({
      sha,
      runs: [
        {
          id: 80,
          run_attempt: 1,
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 81,
          run_attempt: 2,
          actor: { login: "release-operator" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 82,
          run_attempt: 1,
          actor: { login: "release-admin" },
          triggering_actor: { login: "release-operator" },
          head_sha: sha,
          event: "workflow_dispatch",
          status: "completed",
          conclusion: "success",
        },
      ],
      jobsByRun: new Map([[80, jobs], [81, jobs], [82, jobs]]),
    });

    expect(selected.id).toBe(80);
  });

  it("rejects unsigned aggregate content that does not match the selected staging run", () => {
    const digest = "a".repeat(64);
    const attestation = {
      schema_version: 4,
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
      artifact_bindings: {
        supabase: {
          name: `supabase-staging-edge-attestation-${sha}-1`,
          id: "12345",
          digest: "4".repeat(64),
          run_id: "61",
          run_attempt: "1",
          release_sha: sha,
        },
      },
      evidence_sha256: {
        provenance: "d".repeat(64),
        supabase: "e".repeat(64),
        cloudflare: "f".repeat(64),
        business: "0".repeat(64),
        security: "1".repeat(64),
        n_minus_one: "2".repeat(64),
        catalogue_performance: "3".repeat(64),
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
        deployment_url: "https://evidence.maiprop-listing-site-staging.pages.dev",
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
      n_minus_one: {
        schema_version: 1,
        evidence_type: "maiprop-staging-n-minus-one-compatibility",
        ok: true,
        release_sha: sha,
        artifact_sha256: digest,
        previous_sha: "c".repeat(40),
        staged_backend_project_ref: "xsiehskfgeoqyazcgauv",
        source: { previous_sha: "c".repeat(40) },
        playwright: {
          expected: 4,
          skipped: 0,
          unexpected: 0,
          flaky: 0,
          report_sha256: "4".repeat(64),
        },
        deploy_verification_sha256: "5".repeat(64),
      },
      catalogue_performance: {
        schema_version: 1,
        evidence_type: "maiprop-staging-catalogue-performance",
        ok: true,
        release_sha: sha,
        artifact_sha256: digest,
        target: {
          supabase_project_ref: "xsiehskfgeoqyazcgauv",
          deployment_origin: "https://evidence.maiprop-listing-site-staging.pages.dev",
          stable_origin: "https://maiprop-listing-site-staging.pages.dev",
        },
        endpoint_budget: {
          deployment_status: "passed",
          stable_status: "passed",
          deployment_report_sha256: "6".repeat(64),
          stable_report_sha256: "7".repeat(64),
        },
        route_e2e: {
          expected: 4,
          skipped: 0,
          unexpected: 0,
          flaky: 0,
          report_sha256: "8".repeat(64),
          forbidden_authority_requests: 0,
        },
        cwv_query: {
          expected: 14,
          skipped: 0,
          unexpected: 0,
          flaky: 0,
          report_sha256: "9".repeat(64),
          measurements_sha256: "a".repeat(64),
          budgets: { lcp_ms: 3000, cls: 0.1, inp_ms: 200 },
          routes: {
            "/": {
              lcp_ms: 2100,
              cls: 0.02,
              inp_ms: 80,
              forbidden_authority_requests: 0,
              query: { auth: 1, rest: 4, functions: 1, total: 6, budget: { auth: 2, rest: 8, functions: 2, total: 12 } },
            },
            "/listings": {
              lcp_ms: 2200,
              cls: 0.03,
              inp_ms: 90,
              forbidden_authority_requests: 0,
              query: { auth: 1, rest: 5, functions: 1, total: 7, budget: { auth: 2, rest: 10, functions: 2, total: 14 } },
            },
            "/auctions": {
              lcp_ms: 2300,
              cls: 0.04,
              inp_ms: 100,
              forbidden_authority_requests: 0,
              query: { auth: 1, rest: 3, functions: 1, total: 5, budget: { auth: 2, rest: 5, functions: 2, total: 8 } },
            },
            "/open-houses": {
              lcp_ms: 2400,
              cls: 0.05,
              inp_ms: 110,
              forbidden_authority_requests: 0,
              query: { auth: 1, rest: 4, functions: 1, total: 6, budget: { auth: 2, rest: 6, functions: 2, total: 10 } },
            },
          },
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
      attestation: {
        ...attestation,
        artifact_bindings: {
          supabase: {
            ...attestation.artifact_bindings.supabase,
            id: "not-an-artifact-id",
          },
        },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/Supabase artifact binding/i);
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
    expect(() => validateReleaseCandidateAttestation({
      attestation: {
        ...attestation,
        n_minus_one: {
          ...attestation.n_minus_one,
          previous_sha: sha,
        },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/N-1 evidence/i);
    expect(() => validateReleaseCandidateAttestation({
      attestation: {
        ...attestation,
        catalogue_performance: {
          ...attestation.catalogue_performance,
          cwv_query: {
            ...attestation.catalogue_performance.cwv_query,
            routes: {
              ...attestation.catalogue_performance.cwv_query.routes,
              "/auctions": {
                ...attestation.catalogue_performance.cwv_query.routes["/auctions"],
                lcp_ms: 3001,
              },
            },
          },
        },
      },
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "60",
      sourceRunAttempt: "2",
      stagingRunId: "61",
      stagingRunAttempt: "1",
    })).toThrow(/catalogue performance evidence/i);
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
      runs: [{
        id: 30,
        run_attempt: 1,
        actor: { login: "release-operator" },
        triggering_actor: { login: "release-operator" },
        head_sha: sha,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "failure",
      }],
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
    expect(run.run_attempt).toBe(1);
  });

  it("rejects rerun and substituted-actor backend proof", () => {
    const jobs = [
      { name: "deploy-database / Production database migration gate", conclusion: "success" },
      { name: "deploy-edge-functions / Deploy to Supabase", conclusion: "success" },
    ];
    expect(() => selectBackendProofRun({
      sha,
      runs: [{
        id: 32,
        run_attempt: 2,
        actor: { login: "release-operator" },
        triggering_actor: { login: "release-operator" },
        head_sha: sha,
        event: "workflow_dispatch",
        status: "completed",
      }],
      jobsByRun: new Map([[32, jobs]]),
    })).toThrow(/attempt-1/i);
    expect(() => selectBackendProofRun({
      sha,
      runs: [{
        id: 33,
        run_attempt: 1,
        actor: { login: "release-admin" },
        triggering_actor: { login: "release-operator" },
        head_sha: sha,
        event: "workflow_dispatch",
        status: "completed",
      }],
      jobsByRun: new Map([[33, jobs]]),
    })).toThrow(/attempt-1/i);
  });

  it("requires an explicit backend run attempt for recovery", () => {
    expect(() => selectBackendProofRun({
      sha,
      runs: [{ id: 31, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" }],
      jobsByRun: new Map([[
        31,
        [
          { name: "deploy-database / Production database migration gate", conclusion: "success" },
          { name: "deploy-edge-functions / Deploy to Supabase", conclusion: "success" },
        ],
      ]]),
    })).toThrow(/attempt/i);
  });

  it("rejects recovery proof split across different release runs", () => {
    expect(() => selectBackendProofRun({
      sha,
      runs: [
        { id: 40, run_attempt: 1, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" },
        { id: 41, run_attempt: 1, head_sha: sha, event: "workflow_dispatch", status: "completed", conclusion: "failure" },
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

  it("permits only staged migrations to remain pending in production", () => {
    const staged = [
      {
        version: "20260722060307",
        name: "replace_definer_listing_views_with_scoped_rpcs",
        file_sha256: "a".repeat(64),
        statements_sha256: "1".repeat(64),
        statement_count: 2,
        statement_marker_only: false,
      },
      {
        version: "20260726234052",
        name: "use_current_service_role_claim",
        file_sha256: "b".repeat(64),
        statements_sha256: "2".repeat(64),
        statement_count: 3,
        statement_marker_only: false,
      },
      {
        version: "20260729145205",
        name: "replace_public_professional_definer_view",
        file_sha256: "c".repeat(64),
        statements_sha256: "3".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ];
    const production = [{
      version: staged[0].version,
      name: staged[0].name,
      statements_sha256: staged[0].statements_sha256,
      statement_count: staged[0].statement_count,
      statement_marker_only: false,
    }];

    expect(assertMigrationPromotionPlan(staged, production)).toEqual({
      staged,
      production,
      pending: staged.slice(1),
      pending_files: [
        "20260726234052_use_current_service_role_claim.sql",
        "20260729145205_replace_public_professional_definer_view.sql",
      ],
    });
  });

  it("rejects unknown and version-name drift in production migration history", () => {
    const staged = [
      {
        version: "20260722060307",
        name: "canonical_name",
        file_sha256: "a".repeat(64),
        statements_sha256: "1".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
      {
        version: "20260729145205",
        name: "next_name",
        file_sha256: "b".repeat(64),
        statements_sha256: "2".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ];

    expect(() => assertMigrationPromotionPlan(staged, [
      {
        version: "20260722060307",
        name: "different_name",
        statements_sha256: "1".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ])).toThrow(/version-name drift/i);
    expect(() => assertMigrationPromotionPlan(staged, [
      ...staged,
      {
        version: "20260730000000",
        name: "unknown_remote",
        statements_sha256: "3".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ])).toThrow(/unknown production migration/i);
    expect(() => assertMigrationPromotionPlan([
      ...staged,
      staged[1],
    ], [])).toThrow(/duplicate staged migration/i);
  });

  it("requires signed SQL digests and an exact production history prefix", () => {
    const staged = [
      {
        version: "20260722060307",
        name: "first",
        file_sha256: "a".repeat(64),
        statements_sha256: "1".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
      {
        version: "20260726234052",
        name: "second",
        file_sha256: "b".repeat(64),
        statements_sha256: "2".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
      {
        version: "20260729145205",
        name: "third",
        file_sha256: "c".repeat(64),
        statements_sha256: "3".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ];

    expect(() => assertMigrationPromotionPlan(staged, [
      {
        version: staged[0].version,
        name: staged[0].name,
        statements_sha256: staged[0].statements_sha256,
        statement_count: staged[0].statement_count,
        statement_marker_only: false,
      },
      {
        version: staged[2].version,
        name: staged[2].name,
        statements_sha256: staged[2].statements_sha256,
        statement_count: staged[2].statement_count,
        statement_marker_only: false,
      },
    ])).toThrow(/exact staged prefix/i);
    expect(() => assertMigrationPromotionPlan([
      { version: staged[0].version, name: staged[0].name },
    ], [])).toThrow(/file digest/i);
    expect(() => assertMigrationPromotionPlan([
      { ...staged[0], file_sha256: "not-a-digest" },
    ], [])).toThrow(/file digest/i);
    expect(() => assertMigrationPromotionPlan(staged, [{
      version: staged[0].version,
      name: staged[0].name,
      statements_sha256: "f".repeat(64),
      statement_count: staged[0].statement_count,
      statement_marker_only: false,
    }])).toThrow(/executed SQL fingerprint drift/i);
    expect(() => assertMigrationPromotionPlan(staged, [{
      version: staged[0].version,
      name: staged[0].name,
      statements_sha256: staged[0].statements_sha256,
      statement_count: 0,
      statement_marker_only: false,
    }])).toThrow(/statement count/i);
    expect(() => assertMigrationPromotionPlan(staged, [{
      version: staged[0].version,
      name: staged[0].name,
      statements_sha256: staged[0].statements_sha256,
      statement_count: 1,
      statement_marker_only: true,
    }])).toThrow(/filename-only/i);
  });

  it("requires the Supabase dry run to report exactly the staged pending files", () => {
    const pending = [
      {
        version: "20260726234052",
        name: "use_current_service_role_claim",
        file_sha256: "a".repeat(64),
        statements_sha256: "1".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
      {
        version: "20260729145205",
        name: "replace_public_professional_definer_view",
        file_sha256: "b".repeat(64),
        statements_sha256: "2".repeat(64),
        statement_count: 1,
        statement_marker_only: false,
      },
    ];

    expect(assertMigrationDryRunParity(pending, [
      "20260729145205_replace_public_professional_definer_view.sql",
      "20260726234052_use_current_service_role_claim.sql",
    ])).toEqual([
      "20260726234052_use_current_service_role_claim.sql",
      "20260729145205_replace_public_professional_definer_view.sql",
    ]);
    expect(() => assertMigrationDryRunParity(pending, [
      "20260726234052_use_current_service_role_claim.sql",
    ])).toThrow(/dry-run migration inventory/i);
    expect(() => assertMigrationDryRunParity(pending, [
      "20260726234052_use_current_service_role_claim.sql",
      "20260729145205_replace_public_professional_definer_view.sql",
      "20260730000000_unstaged.sql",
    ])).toThrow(/dry-run migration inventory/i);
  });

  it("requires the candidate Edge source and JWT manifest to exactly match staging", () => {
    const manifest = {
      schema_version: 1,
      algorithm: "sha256",
      release_sha: sha,
      config_sha256: "a".repeat(64),
      shared: {
        source_sha256: "b".repeat(64),
        files: [{
          path: "supabase/functions/_shared/auth.ts",
          sha256: "c".repeat(64),
        }],
      },
      functions: [{
        name: "process-storage-cleanup",
        verify_jwt: false,
        source_sha256: "d".repeat(64),
        effective_source_sha256: "e".repeat(64),
        files: [{
          path: "supabase/functions/process-storage-cleanup/index.ts",
          sha256: "f".repeat(64),
        }],
      }],
      manifest_sha256: "0".repeat(64),
    };

    expect(assertEdgeSourceManifestParity(manifest, structuredClone(manifest)))
      .toEqual(manifest);
    expect(() => assertEdgeSourceManifestParity(manifest, {
      ...manifest,
      functions: [{
        ...manifest.functions[0],
        verify_jwt: true,
      }],
    })).toThrow(/Edge source manifest/i);
    expect(() => assertEdgeSourceManifestParity(manifest, {
      ...manifest,
      functions: [{
        ...manifest.functions[0],
        effective_source_sha256: "1".repeat(64),
      }],
    })).toThrow(/Edge source manifest/i);
  });

  it("requires a non-self, allowlisted, unexpired, non-revoked approval", () => {
    const approval = {
      schema_version: 1,
      repository: "maiprop/maiprop-listing-site",
      release_sha: sha,
      source_tree: "b".repeat(40),
      source_run_id: "40",
      source_run_attempt: "2",
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      staging_run_attempt: "1",
      approval_run_id: "60",
      approval_run_attempt: "3",
      approver: "release-reviewer",
      nonce: "c".repeat(64),
      approved_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T13:00:00.000Z",
      revoked: false,
    };
    const expected = {
      sha,
      repository: "maiprop/maiprop-listing-site",
      sourceTree: "b".repeat(40),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "3",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    };

    expect(validateReleaseApproval({
      approval,
      ...expected,
    })).toEqual(approval);

    expect(() => validateReleaseApproval({
      approval,
      ...expected,
      deployActor: "release-reviewer",
    })).toThrow(/independent/i);

    expect(() => validateReleaseApproval({
      approval: { ...approval, revoked: true },
      ...expected,
    })).toThrow(/revoked/i);

    expect(() => validateReleaseApproval({
      approval,
      ...expected,
      now: new Date("2026-07-28T13:00:00.000Z"),
    })).toThrow(/expired/i);

    expect(() => validateReleaseApproval({
      approval: { ...approval, revoked: undefined },
      ...expected,
    })).toThrow(/revoked.*false/i);

    expect(() => validateReleaseApproval({
      approval: {
        ...approval,
        expires_at: "2026-07-28T14:00:00.001Z",
      },
      ...expected,
    })).toThrow(/two hours/i);

    expect(() => validateReleaseApproval({
      approval: {
        ...approval,
        approved_at: "2026-07-28T12:31:01.000Z",
        expires_at: "2026-07-28T13:00:00.000Z",
      },
      ...expected,
    })).toThrow(/future/i);

    expect(() => validateReleaseApproval({
      approval,
      ...expected,
      now: "not-a-date",
    })).toThrow(/validation time.*ISO date/i);
  });

  it("binds approval schema v1 to the full release tuple and a cryptographic nonce", () => {
    const approval = {
      schema_version: 1,
      repository: "maiprop/maiprop-listing-site",
      release_sha: sha,
      source_tree: "b".repeat(40),
      source_run_id: "40",
      source_run_attempt: "2",
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      staging_run_attempt: "1",
      approval_run_id: "60",
      approval_run_attempt: "3",
      approver: "release-reviewer",
      nonce: "c".repeat(64),
      approved_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T13:00:00.000Z",
      revoked: false,
    };
    const expected = {
      approval,
      sha,
      repository: "maiprop/maiprop-listing-site",
      sourceTree: "b".repeat(40),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      artifactSha256: "a".repeat(64),
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "3",
      deployActor: "release-operator",
      allowedApprovers: ["release-reviewer"],
      now: new Date("2026-07-28T12:30:00.000Z"),
    };

    for (const [field, value, pattern] of [
      ["repository", "other/repository", /repository/i],
      ["source_tree", "d".repeat(40), /source tree/i],
      ["source_run_id", "41", /source run/i],
      ["source_run_attempt", "3", /source run attempt/i],
      ["staging_run_id", "51", /staging run/i],
      ["staging_run_attempt", "2", /staging run attempt/i],
      ["approval_run_id", "61", /approval run/i],
      ["approval_run_attempt", "4", /approval run attempt/i],
      ["artifact_sha256", "d".repeat(64), /artifact/i],
      ["nonce", "not-a-cryptographic-nonce", /nonce/i],
    ]) {
      expect(
        () => validateReleaseApproval({
          ...expected,
          approval: { ...approval, [field]: value },
        }),
        field,
      ).toThrow(pattern);
    }
  });

  it("revalidates the exact mutation lease before every production boundary", () => {
    const lease = {
      schema_version: 1,
      repository: "maiprop/maiprop-listing-site",
      release_sha: sha,
      source_tree: "b".repeat(40),
      artifact_sha256: "b".repeat(64),
      approval_nonce: "c".repeat(64),
      nonce: "d".repeat(64),
      source_run_id: "40",
      source_run_attempt: "2",
      staging_run_id: "50",
      staging_run_attempt: "1",
      approval_run_id: "60",
      approval_run_attempt: "1",
      production_run_id: "70",
      production_run_attempt: "3",
      stripe_readiness_run_id: "80",
      stripe_readiness_run_attempt: "1",
      stripe_readiness_sha256: "e".repeat(64),
      stripe_readiness_artifact_id: "90",
      stripe_readiness_artifact_digest: "f".repeat(64),
      issued_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T12:15:00.000Z",
    };
    const expectedIdentity = {
      repository: "maiprop/maiprop-listing-site",
      sourceTree: "b".repeat(40),
      approvalNonce: "c".repeat(64),
      stripeReadinessRunId: "80",
      stripeReadinessRunAttempt: "1",
      stripeReadinessSha256: "e".repeat(64),
      stripeReadinessArtifactId: "90",
      stripeReadinessArtifactDigest: "f".repeat(64),
    };

    expect(validateMutationLease({
      lease,
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toEqual(lease);

    const rollbackLease = {
      ...lease,
      rollback_deployment_id: "11111111-1111-4111-8111-111111111111",
      rollback_sha: "e".repeat(40),
      candidate_deployment_id: "22222222-2222-4222-8222-222222222222",
      candidate_sha: sha,
    };
    const rollbackIdentity = {
      rollbackDeploymentId: rollbackLease.rollback_deployment_id,
      rollbackSha: rollbackLease.rollback_sha,
      candidateDeploymentId: rollbackLease.candidate_deployment_id,
      candidateSha: sha,
    };
    expect(validateMutationLease({
      lease: rollbackLease,
      ...expectedIdentity,
      ...rollbackIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toEqual(rollbackLease);
    expect(() => validateMutationLease({
      lease: rollbackLease,
      ...expectedIdentity,
      ...rollbackIdentity,
      candidateDeploymentId: "33333333-3333-4333-8333-333333333333",
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/candidate deployment/i);

    expect(() => validateMutationLease({
      lease,
      ...expectedIdentity,
      sha,
      artifactSha256: "c".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/artifact/i);

    expect(() => validateMutationLease({
      lease,
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "3",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/source run attempt/i);

    expect(() => validateMutationLease({
      lease: { ...lease, stripe_readiness_sha256: "f".repeat(64) },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/Stripe readiness.*digest/i);

    expect(() => validateMutationLease({
      lease: { ...lease, stripe_readiness_artifact_id: "91" },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/Stripe readiness artifact/i);

    expect(() => validateMutationLease({
      lease: { ...lease, stripe_readiness_run_attempt: "2" },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/Stripe readiness.*attempt 1/i);

    const { stripe_readiness_sha256: _removed, ...strippedLease } = lease;
    expect(() => validateMutationLease({
      lease: strippedLease,
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/Stripe readiness.*digest/i);

    for (const [overrides, pattern] of [
      [{ repository: "other/repository" }, /repository/i],
      [{ sourceTree: "e".repeat(40) }, /source tree/i],
      [{ approvalNonce: "e".repeat(64) }, /approval nonce/i],
      [{ sourceRunId: "41" }, /source run/i],
      [{ stagingRunAttempt: "2" }, /staging run attempt/i],
      [{ approvalRunAttempt: "2" }, /approval run attempt/i],
    ]) {
      expect(() => validateMutationLease({
        lease,
        ...expectedIdentity,
        sha,
        artifactSha256: "b".repeat(64),
        sourceRunId: "40",
        sourceRunAttempt: "2",
        stagingRunId: "50",
        stagingRunAttempt: "1",
        approvalRunId: "60",
        approvalRunAttempt: "1",
        productionRunId: "70",
        productionRunAttempt: "3",
        now: new Date("2026-07-28T12:05:00.000Z"),
        ...overrides,
      })).toThrow(pattern);
    }

    expect(() => validateMutationLease({
      lease: { ...lease, nonce: "not-a-cryptographic-nonce" },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/nonce/i);

    expect(() => validateMutationLease({
      lease: {
        ...lease,
        expires_at: "2026-07-28T12:15:00.001Z",
      },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:05:00.000Z"),
    })).toThrow(/15 minutes/i);

    expect(() => validateMutationLease({
      lease: {
        ...lease,
        issued_at: "2026-07-28T12:01:01.000Z",
        expires_at: "2026-07-28T12:10:00.000Z",
      },
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: new Date("2026-07-28T12:00:00.000Z"),
    })).toThrow(/future/i);

    expect(() => validateMutationLease({
      lease,
      ...expectedIdentity,
      sha,
      artifactSha256: "b".repeat(64),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      now: "not-a-date",
    })).toThrow(/validation time.*ISO date/i);
  });

  it("binds production database and Edge attestations to one exact release tuple", () => {
    const tuple = {
      repository: "maiprop/maiprop-listing-site",
      sha,
      sourceTree: "b".repeat(40),
      sourceRunId: "40",
      sourceRunAttempt: "2",
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      productionRunId: "70",
      productionRunAttempt: "3",
      artifactSha256: "a".repeat(64),
      manifestSha256: "b".repeat(64),
      supabaseSha256: "c".repeat(64),
      databaseSha256: "d".repeat(64),
      edgeSha256: "e".repeat(64),
    };
    const shared = {
      schema_version: 1,
      repository: tuple.repository,
      release_sha: tuple.sha,
      source_tree: tuple.sourceTree,
      source_run_id: tuple.sourceRunId,
      source_run_attempt: tuple.sourceRunAttempt,
      staging_run_id: tuple.stagingRunId,
      staging_run_attempt: tuple.stagingRunAttempt,
      approval_run_id: tuple.approvalRunId,
      approval_run_attempt: tuple.approvalRunAttempt,
      production_run_id: tuple.productionRunId,
      production_run_attempt: tuple.productionRunAttempt,
      artifact_sha256: tuple.artifactSha256,
      manifest_sha256: tuple.manifestSha256,
      supabase_sha256: tuple.supabaseSha256,
      project_ref: "qvvicunqcrwpioqnvzxf",
    };
    const database = {
      ...shared,
      evidence_type: "maiprop-production-database-promotion",
      pending_migration_count: 2,
      migration_count: 140,
    };
    const edge = {
      ...shared,
      evidence_type: "maiprop-production-edge-promotion",
      production_database_sha256: tuple.databaseSha256,
      edge_bundles: [
        {
          name: "public-listings",
          ezbr_sha256: "f".repeat(64),
          verify_jwt: false,
        },
      ],
    };

    expect(
      validateProductionPromotionAttestations({
        database,
        edge,
        ...tuple,
      }),
    ).toEqual({ database, edge });

    for (const [field, value, pattern] of [
      ["staging_run_id", "51", /staging run/i],
      ["approval_run_attempt", "2", /approval run attempt/i],
      ["artifact_sha256", "9".repeat(64), /artifact digest/i],
      ["manifest_sha256", "8".repeat(64), /manifest digest/i],
      ["project_ref", "xsiehskfgeoqyazcgauv", /project ref/i],
    ]) {
      expect(() =>
        validateProductionPromotionAttestations({
          database: { ...database, [field]: value },
          edge,
          ...tuple,
        }),
      ).toThrow(pattern);
    }
    expect(() =>
      validateProductionPromotionAttestations({
        database,
        edge: {
          ...edge,
          production_database_sha256: "0".repeat(64),
        },
        ...tuple,
      }),
    ).toThrow(/database attestation digest/i);
    expect(() =>
      validateProductionPromotionAttestations({
        database,
        edge,
        ...tuple,
        edgeSha256: "not-a-digest",
      }),
    ).toThrow(/Edge attestation digest/i);
  });

  it("exposes approval and mutation-lease validation through the CLI", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "maiprop-release-"));
    const approvalPath = resolve(directory, "approval.json");
    const leasePath = resolve(directory, "lease.json");
    writeFileSync(approvalPath, JSON.stringify({
      schema_version: 1,
      repository: "maiprop/maiprop-listing-site",
      release_sha: sha,
      source_tree: "b".repeat(40),
      source_run_id: "40",
      source_run_attempt: "2",
      artifact_sha256: "a".repeat(64),
      staging_run_id: "50",
      staging_run_attempt: "1",
      approval_run_id: "60",
      approval_run_attempt: "3",
      approver: "release-reviewer",
      nonce: "c".repeat(64),
      approved_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T13:00:00.000Z",
      revoked: false,
    }));
    writeFileSync(leasePath, JSON.stringify({
      schema_version: 1,
      repository: "maiprop/maiprop-listing-site",
      release_sha: sha,
      source_tree: "b".repeat(40),
      artifact_sha256: "a".repeat(64),
      approval_nonce: "c".repeat(64),
      nonce: "d".repeat(64),
      source_run_id: "40",
      source_run_attempt: "2",
      staging_run_id: "50",
      staging_run_attempt: "1",
      approval_run_id: "60",
      approval_run_attempt: "1",
      production_run_id: "70",
      production_run_attempt: "3",
      issued_at: "2026-07-28T12:00:00.000Z",
      expires_at: "2026-07-28T12:15:00.000Z",
    }));

    try {
      const approvalResult = spawnSync(process.execPath, [
        "scripts/production-release-validation.mjs",
        "release-approval",
        "--file",
        approvalPath,
        "--sha",
        sha,
        "--repository",
        "maiprop/maiprop-listing-site",
        "--source-tree",
        "b".repeat(40),
        "--source-run-id",
        "40",
        "--source-run-attempt",
        "2",
        "--artifact-sha256",
        "a".repeat(64),
        "--staging-run-id",
        "50",
        "--staging-run-attempt",
        "1",
        "--approval-run-id",
        "60",
        "--approval-run-attempt",
        "3",
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
        "--repository",
        "maiprop/maiprop-listing-site",
        "--source-tree",
        "b".repeat(40),
        "--approval-nonce",
        "c".repeat(64),
        "--artifact-sha256",
        "a".repeat(64),
        "--source-run-id",
        "40",
        "--source-run-attempt",
        "2",
        "--staging-run-id",
        "50",
        "--staging-run-attempt",
        "1",
        "--approval-run-id",
        "60",
        "--approval-run-attempt",
        "1",
        "--production-run-id",
        "70",
        "--production-run-attempt",
        "3",
        "--now",
        "2026-07-28T12:05:00.000Z",
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

  it("builds deterministic serial Edge forward-convergence recovery", async () => {
    const validation = await import("./production-release-validation.mjs");
    expect(validation.buildEdgeForwardConvergencePlan).toBeTypeOf("function");

    const staged = [
      { name: "beta", ezbr_sha256: "b".repeat(64), verify_jwt: false },
      { name: "alpha", ezbr_sha256: "a".repeat(64), verify_jwt: true },
      { name: "gamma", ezbr_sha256: "c".repeat(64), verify_jwt: true },
    ];
    const production = [
      { name: "alpha", ezbr_sha256: "a".repeat(64), verify_jwt: true },
      { name: "beta", ezbr_sha256: "d".repeat(64), verify_jwt: false },
    ];

    expect(validation.buildEdgeForwardConvergencePlan(
      staged,
      production,
    )).toMatchObject({
      pending_names: ["beta", "gamma"],
      pending: [
        { name: "beta", ezbr_sha256: "b".repeat(64), verify_jwt: false },
        { name: "gamma", ezbr_sha256: "c".repeat(64), verify_jwt: true },
      ],
    });
    expect(() => validation.buildEdgeForwardConvergencePlan(staged, [
      ...production,
      { name: "orphan", ezbr_sha256: "e".repeat(64), verify_jwt: true },
    ])).toThrow(/unexpected production Edge function/i);
  });

  it("attests the exact Cloudflare deployment instead of trusting a list position", () => {
    const deployment = {
      id: "deployment-1",
      project_id: "staging-project-id",
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
      expectedProjectId: "staging-project-id",
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
      expectedProjectId: "staging-project-id",
      expectedEnvironment: "production",
      expectedBranch: "main",
      expectedSha: sha,
    })).toThrow(/dirty/i);

    expect(() => assertCloudflareDeployment({
      deployment: {
        ...deployment,
        project_id: "replacement-project-id",
      },
      expectedProject: "maiprop-listing-site-staging",
      expectedProjectId: "staging-project-id",
      expectedEnvironment: "production",
      expectedBranch: "main",
      expectedSha: sha,
    })).toThrow(/project ID/i);
  });
});
