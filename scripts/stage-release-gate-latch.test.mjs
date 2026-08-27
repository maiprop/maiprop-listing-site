import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const directNodeTest =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? null
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const describe = directNodeTest ? directNodeTest.describe.skip : globalThis.describe;
const it = directNodeTest ? directNodeTest.it : globalThis.it;
const expect = globalThis.expect;

import {
  awaitStagingReleaseGate,
  evaluateStagingReleaseGate,
  readGitHubStagingReleaseGate,
} from "./wait-for-staging-release-gates.mjs";

const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567";
const workflow = yaml.load(readFileSync(
  resolve(import.meta.dirname, "..", ".github", "workflows", "stage-release.yml"),
  "utf8",
));

describe("staging release gate latch", () => {
  it("starts every trusted attempt-one CI event and latches after candidate verification", () => {
    const validation = workflow.jobs["validate-source"];
    const condition = String(validation.if);
    const stepNames = validation.steps.map((step) => step.name ?? "");
    const provenanceIndex = stepNames.indexOf("Verify cryptographic build provenance");
    const latchIndex = stepNames.indexOf("Await exact staging release gates");
    const acknowledgementIndex = stepNames.indexOf(
      "Require fixed production identity and staging acknowledgement",
    );

    expect(condition).not.toContain("STAGING_RELEASE_ENABLED");
    expect(condition).not.toContain("STAGING_TRUSTED_CONTROL_SHA");
    expect(condition).toContain("github.workflow_sha == github.event.workflow_run.head_sha");
    expect(condition).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(condition).toContain("github.run_attempt == 1");
    expect(condition).toContain("github.event.workflow_run.run_attempt == 1");
    expect(validation.environment).toBeUndefined();
    expect(validation["timeout-minutes"]).toBe(70);
    expect(provenanceIndex).toBeGreaterThanOrEqual(0);
    expect(latchIndex).toBeGreaterThan(provenanceIndex);
    expect(acknowledgementIndex).toBeGreaterThan(latchIndex);

    const provenance = validation.steps.find(
      (step) => step.name === "Validate workflow_run provenance",
    );
    const latch = validation.steps[latchIndex];
    expect(provenance.env).not.toHaveProperty("TRUSTED_CONTROL_SHA");
    expect(provenance.run).not.toContain("TRUSTED_CONTROL_SHA");
    expect(latch.env).toEqual({
      EXPECTED_ACTOR: "${{ github.event.workflow_run.triggering_actor.login }}",
      GITHUB_TOKEN: "${{ github.token }}",
      RELEASE_SHA: "${{ github.event.workflow_run.head_sha }}",
    });
    expect(latch.run.trim()).toBe("node scripts/wait-for-staging-release-gates.mjs");
  });

  it("accepts only complete exact-SHA provider proof bindings on current main", () => {
    expect(evaluateStagingReleaseGate({
      currentMainSha: RELEASE_SHA,
      productionPagesReady: true,
      releaseSha: RELEASE_SHA,
      stagingPagesReady: true,
      stripeReady: true,
    })).toEqual({ ready: true, reason: "ready" });
  });

  it("waits for missing provider proofs and then accepts all three", async () => {
    const states = [
      {
        currentMainSha: RELEASE_SHA,
        productionPagesReady: false,
        stagingPagesReady: false,
        stripeReady: false,
      },
      {
        currentMainSha: RELEASE_SHA,
        productionPagesReady: true,
        stagingPagesReady: true,
        stripeReady: true,
      },
    ];
    let reads = 0;
    let waits = 0;

    const result = await awaitStagingReleaseGate({
      maxAttempts: 2,
      pollIntervalMs: 1,
      readState: async () => states[reads++],
      releaseSha: RELEASE_SHA,
      wait: async () => {
        waits += 1;
      },
    });

    expect(result).toEqual({ attempts: 2, releaseSha: RELEASE_SHA });
    expect(reads).toBe(2);
    expect(waits).toBe(1);
  });

  it("fails closed as soon as current main advances", async () => {
    await expect(awaitStagingReleaseGate({
      maxAttempts: 3,
      pollIntervalMs: 1,
      readState: async () => ({
        currentMainSha: "89abcdef0123456789abcdef0123456789abcdef",
        productionPagesReady: false,
        stagingPagesReady: false,
        stripeReady: false,
      }),
      releaseSha: RELEASE_SHA,
      wait: async () => {},
    })).rejects.toThrow("current main no longer matches the release SHA");
  });

  it("reports every missing proof without treating partial evidence as ready", () => {
    expect(evaluateStagingReleaseGate({
      currentMainSha: RELEASE_SHA,
      productionPagesReady: false,
      releaseSha: RELEASE_SHA,
      stagingPagesReady: true,
      stripeReady: false,
    })).toEqual({
      ready: false,
      reason: "missing stripe and production Pages proofs",
    });
  });

  it("times out without performing an extra wait", async () => {
    let reads = 0;
    let waits = 0;

    await expect(awaitStagingReleaseGate({
      maxAttempts: 2,
      pollIntervalMs: 1,
      readState: async () => {
        reads += 1;
        return {
          currentMainSha: RELEASE_SHA,
          productionPagesReady: false,
          stagingPagesReady: false,
          stripeReady: false,
        };
      },
      releaseSha: RELEASE_SHA,
      wait: async () => {
        waits += 1;
      },
    })).rejects.toThrow("timed out waiting for exact staging release gates");

    expect(reads).toBe(2);
    expect(waits).toBe(1);
  });

  it("enforces an absolute deadline and clamps the final wait", async () => {
    let now = 1_000;
    const waits = [];

    await expect(awaitStagingReleaseGate({
      maxAttempts: 20,
      maxWaitMs: 100,
      now: () => now,
      pollIntervalMs: 60,
      readState: async () => ({
        currentMainSha: RELEASE_SHA,
        productionPagesReady: false,
        stagingPagesReady: false,
        stripeReady: false,
      }),
      releaseSha: RELEASE_SHA,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
    })).rejects.toThrow("timed out waiting for exact staging release gates");

    expect(waits).toEqual([60, 40]);
    expect(now).toBe(1_100);
  });

  it("reads exact attempt-one signed proof pairs through Actions APIs", async () => {
    const run = (id) => ({
      actor: { login: "krenios" },
      conclusion: "success",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: RELEASE_SHA,
      id,
      run_attempt: 1,
      status: "completed",
      triggering_actor: { login: "krenios" },
    });
    const pair = (prefix, runId) => ({
      artifacts: [
        { expired: false, name: `${prefix}-${runId}-1` },
        { expired: false, name: `${prefix}-${runId}-1-binding` },
      ],
    });
    const responses = new Map([
      ["/branches/main", { commit: { sha: RELEASE_SHA } }],
      ["/actions/workflows/verify-stripe-live-readiness.yml/runs", {
        workflow_runs: [run(101)],
      }],
      ["/actions/workflows/provision-cloudflare-pages-runtime.yml/runs", {
        workflow_runs: [run(201), run(202)],
      }],
      ["/actions/runs/101/artifacts", pair(`stripe-live-readiness-${RELEASE_SHA}`, 101)],
      ["/actions/runs/201/artifacts", pair(`cloudflare-pages-runtime-staging-${RELEASE_SHA}`, 201)],
      ["/actions/runs/202/artifacts", pair(`cloudflare-pages-runtime-production-${RELEASE_SHA}`, 202)],
    ]);
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      const key = [...responses.keys()].find((candidate) => url.pathname.endsWith(candidate));
      const body = responses.get(key);
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toEqual({
      currentMainSha: RELEASE_SHA,
      productionPagesReady: true,
      releaseSha: RELEASE_SHA,
      stagingPagesReady: true,
      stripeReady: true,
    });
  });

  it("rejects proof runs that do not match the original CI actor", async () => {
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith("/branches/main")
        ? { commit: { sha: RELEASE_SHA } }
        : url.pathname.endsWith("/actions/workflows/verify-stripe-live-readiness.yml/runs")
          ? {
              workflow_runs: [{
                actor: { login: "different-admin" },
                conclusion: "success",
                event: "workflow_dispatch",
                head_branch: "main",
                head_sha: RELEASE_SHA,
                id: 301,
                run_attempt: 1,
                status: "completed",
                triggering_actor: { login: "different-admin" },
              }],
            }
          : { workflow_runs: [] };
      return { json: async () => body, ok: true, status: 200 };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({ stripeReady: false });
  });

  it.each([
    ["wrong SHA", { head_sha: "89abcdef0123456789abcdef0123456789abcdef" }],
    ["wrong branch", { head_branch: "feature" }],
    ["wrong event", { event: "push" }],
    ["incomplete status", { status: "in_progress" }],
    ["failed conclusion", { conclusion: "failure" }],
    ["rerun", { run_attempt: 2 }],
    ["actor mismatch", { triggering_actor: { login: "other-admin" } }],
  ])("rejects a proof run with %s", async (_label, override) => {
    const runId = 302;
    const prefix = `stripe-live-readiness-${RELEASE_SHA}-${runId}-1`;
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      let body;
      if (url.pathname.endsWith("/branches/main")) {
        body = { commit: { sha: RELEASE_SHA } };
      } else if (url.pathname.endsWith("/verify-stripe-live-readiness.yml/runs")) {
        body = {
          workflow_runs: [{
            actor: { login: "krenios" },
            conclusion: "success",
            event: "workflow_dispatch",
            head_branch: "main",
            head_sha: RELEASE_SHA,
            id: runId,
            run_attempt: 1,
            status: "completed",
            triggering_actor: { login: "krenios" },
            ...override,
          }],
        };
      } else if (url.pathname.endsWith("/provision-cloudflare-pages-runtime.yml/runs")) {
        body = { workflow_runs: [] };
      } else if (url.pathname.endsWith(`/actions/runs/${runId}/artifacts`)) {
        body = {
          artifacts: [
            { expired: false, name: prefix },
            { expired: false, name: `${prefix}-binding` },
          ],
        };
      }
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({ stripeReady: false });
  });

  it.each([
    ["an expired payload", [
      { expired: true, name: `stripe-live-readiness-${RELEASE_SHA}-303-1` },
      { expired: false, name: `stripe-live-readiness-${RELEASE_SHA}-303-1-binding` },
    ]],
    ["a partial pair", [
      { expired: false, name: `stripe-live-readiness-${RELEASE_SHA}-303-1` },
    ]],
  ])("rejects %s", async (_label, artifacts) => {
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      let body;
      if (url.pathname.endsWith("/branches/main")) {
        body = { commit: { sha: RELEASE_SHA } };
      } else if (url.pathname.endsWith("/verify-stripe-live-readiness.yml/runs")) {
        body = {
          workflow_runs: [{
            actor: { login: "krenios" },
            conclusion: "success",
            event: "workflow_dispatch",
            head_branch: "main",
            head_sha: RELEASE_SHA,
            id: 303,
            run_attempt: 1,
            status: "completed",
            triggering_actor: { login: "krenios" },
          }],
        };
      } else if (url.pathname.endsWith("/provision-cloudflare-pages-runtime.yml/runs")) {
        body = { workflow_runs: [] };
      } else if (url.pathname.endsWith("/actions/runs/303/artifacts")) {
        body = { artifacts };
      }
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({ stripeReady: false });
  });

  it("never combines a payload and binding from different runs", async () => {
    const baseRun = {
      actor: { login: "krenios" },
      conclusion: "success",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: RELEASE_SHA,
      run_attempt: 1,
      status: "completed",
      triggering_actor: { login: "krenios" },
    };
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      let body;
      if (url.pathname.endsWith("/branches/main")) {
        body = { commit: { sha: RELEASE_SHA } };
      } else if (url.pathname.endsWith("/verify-stripe-live-readiness.yml/runs")) {
        body = { workflow_runs: [{ ...baseRun, id: 304 }, { ...baseRun, id: 305 }] };
      } else if (url.pathname.endsWith("/provision-cloudflare-pages-runtime.yml/runs")) {
        body = { workflow_runs: [] };
      } else if (url.pathname.endsWith("/actions/runs/304/artifacts")) {
        body = {
          artifacts: [{
            expired: false,
            name: `stripe-live-readiness-${RELEASE_SHA}-304-1`,
          }],
        };
      } else if (url.pathname.endsWith("/actions/runs/305/artifacts")) {
        body = {
          artifacts: [{
            expired: false,
            name: `stripe-live-readiness-${RELEASE_SHA}-305-1-binding`,
          }],
        };
      }
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({ stripeReady: false });
  });

  it("fails closed on malformed paginated API responses", async () => {
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith("/branches/main")
        ? { commit: { sha: RELEASE_SHA } }
        : {};
      return { json: async () => body, ok: true, status: 200 };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).rejects.toThrow(/missing workflow_runs/i);
  });

  it("finds exact proof runs and artifacts beyond the first API page", async () => {
    const run = {
      actor: { login: "krenios" },
      conclusion: "success",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: RELEASE_SHA,
      id: 401,
      run_attempt: 1,
      status: "completed",
      triggering_actor: { login: "krenios" },
    };
    const payloadPrefix = `stripe-live-readiness-${RELEASE_SHA}-401-1`;
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      let body;
      if (url.pathname.endsWith("/branches/main")) {
        body = { commit: { sha: RELEASE_SHA } };
      } else if (url.pathname.endsWith("/verify-stripe-live-readiness.yml/runs")) {
        body = {
          workflow_runs: url.searchParams.get("page") === "2" ? [run] : Array(100).fill({}),
        };
      } else if (url.pathname.endsWith("/provision-cloudflare-pages-runtime.yml/runs")) {
        body = { workflow_runs: [] };
      } else if (url.pathname.endsWith("/actions/runs/401/artifacts")) {
        body = {
          artifacts: url.searchParams.get("page") === "2"
            ? [
                { expired: false, name: payloadPrefix },
                { expired: false, name: `${payloadPrefix}-binding` },
              ]
            : Array.from({ length: 100 }, (_, index) => ({
                expired: false,
                name: `unrelated-${index}`,
              })),
        };
      }
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({ stripeReady: true });
  });

  it("revalidates previously observed proof artifacts instead of caching booleans", async () => {
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.endsWith("/branches/main")
        ? { commit: { sha: RELEASE_SHA } }
        : { workflow_runs: [] };
      return { json: async () => body, ok: true, status: 200 };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      knownProofs: {
        productionPagesReady: true,
        stagingPagesReady: true,
        stripeReady: true,
      },
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({
      productionPagesReady: false,
      stagingPagesReady: false,
      stripeReady: false,
    });
  });

  it("aborts a stalled GitHub API request within its request deadline", async () => {
    const fetchImpl = async (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      requestTimeoutMs: 5,
      token: "test-token",
    })).rejects.toThrow(/deadline|abort|timed out/i);
  });

  it("keeps the request deadline active while a response body stalls", async () => {
    const fetchImpl = async (_input, init) => ({
      json: async () => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
      ok: true,
      status: 200,
    });

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      requestTimeoutMs: 5,
      token: "test-token",
    })).rejects.toThrow(/deadline|abort|timed out/i);
  });

  it("re-reads main after finding all proofs and exposes an intervening branch advance", async () => {
    let branchReads = 0;
    const run = (id) => ({
      actor: { login: "krenios" },
      conclusion: "success",
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: RELEASE_SHA,
      id,
      run_attempt: 1,
      status: "completed",
      triggering_actor: { login: "krenios" },
    });
    const pair = (prefix, runId) => ({
      artifacts: [
        { expired: false, name: `${prefix}-${runId}-1` },
        { expired: false, name: `${prefix}-${runId}-1-binding` },
      ],
    });
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      let body;
      if (url.pathname.endsWith("/branches/main")) {
        branchReads += 1;
        body = {
          commit: {
            sha: branchReads === 1
              ? RELEASE_SHA
              : "89abcdef0123456789abcdef0123456789abcdef",
          },
        };
      } else if (url.pathname.endsWith("/verify-stripe-live-readiness.yml/runs")) {
        body = { workflow_runs: [run(501)] };
      } else if (url.pathname.endsWith("/provision-cloudflare-pages-runtime.yml/runs")) {
        body = { workflow_runs: [run(502), run(503)] };
      } else if (url.pathname.endsWith("/actions/runs/501/artifacts")) {
        body = pair(`stripe-live-readiness-${RELEASE_SHA}`, 501);
      } else if (url.pathname.endsWith("/actions/runs/502/artifacts")) {
        body = pair(`cloudflare-pages-runtime-staging-${RELEASE_SHA}`, 502);
      } else if (url.pathname.endsWith("/actions/runs/503/artifacts")) {
        body = pair(`cloudflare-pages-runtime-production-${RELEASE_SHA}`, 503);
      }
      return {
        json: async () => body,
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
      };
    };

    await expect(readGitHubStagingReleaseGate({
      expectedActor: "krenios",
      fetchImpl,
      releaseSha: RELEASE_SHA,
      repository: "maiprop/maiprop-listing-site",
      token: "test-token",
    })).resolves.toMatchObject({
      currentMainSha: "89abcdef0123456789abcdef0123456789abcdef",
      productionPagesReady: true,
      stagingPagesReady: true,
      stripeReady: true,
    });
    expect(branchReads).toBe(2);
  });
});
