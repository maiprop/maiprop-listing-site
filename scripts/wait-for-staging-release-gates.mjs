#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const FULL_LOWERCASE_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_MAX_ATTEMPTS = 120;
const DEFAULT_MAX_WAIT_MS = 60 * 60 * 1_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const API_PAGE_SIZE = 100;
const MAX_API_PAGES = 100;
const STRIPE_WORKFLOW = "verify-stripe-live-readiness.yml";
const PAGES_WORKFLOW = "provision-cloudflare-pages-runtime.yml";

function requireReleaseSha(value) {
  if (typeof value !== "string" || !FULL_LOWERCASE_SHA.test(value)) {
    throw new Error("Staging gate latch requires a lowercase full 40-character release SHA.");
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function evaluateStagingReleaseGate(input) {
  const releaseSha = requireReleaseSha(input?.releaseSha);
  const currentMainSha = String(input?.currentMainSha ?? "");

  if (currentMainSha !== releaseSha) {
    throw new Error("Staging gate latch failed closed because current main no longer matches the release SHA.");
  }

  const missing = [];
  if (input?.stripeReady !== true) missing.push("stripe");
  if (input?.stagingPagesReady !== true) missing.push("staging Pages");
  if (input?.productionPagesReady !== true) missing.push("production Pages");
  if (missing.length > 0) {
    const reason = missing.length === 1
      ? `missing ${missing[0]} proof`
      : `missing ${missing.slice(0, -1).join(", ")} and ${missing.at(-1)} proofs`;
    return Object.freeze({ ready: false, reason });
  }
  return Object.freeze({ ready: true, reason: "ready" });
}

export async function awaitStagingReleaseGate(options) {
  const releaseSha = requireReleaseSha(options?.releaseSha);
  const maxAttempts = requirePositiveInteger(options?.maxAttempts, "maxAttempts");
  const maxWaitMs = requirePositiveInteger(
    options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    "maxWaitMs",
  );
  const pollIntervalMs = requirePositiveInteger(options?.pollIntervalMs, "pollIntervalMs");
  const now = options?.now ?? (() => performance.now());
  if (typeof options?.readState !== "function") {
    throw new Error("readState must be a function.");
  }
  if (typeof options?.wait !== "function") {
    throw new Error("wait must be a function.");
  }
  if (typeof now !== "function") throw new Error("now must be a function.");

  const deadlineMs = now() + maxWaitMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (now() >= deadlineMs) {
      throw new Error("Staging gate latch timed out waiting for exact staging release gates.");
    }
    const gate = evaluateStagingReleaseGate({
      ...(await options.readState({ attempt, deadlineMs })),
      releaseSha,
    });
    if (now() >= deadlineMs) {
      throw new Error("Staging gate latch timed out waiting for exact staging release gates.");
    }
    if (gate.ready) {
      return Object.freeze({ attempts: attempt, releaseSha });
    }
    if (attempt < maxAttempts) {
      const waitMs = Math.min(pollIntervalMs, deadlineMs - now());
      if (waitMs <= 0) {
        throw new Error("Staging gate latch timed out waiting for exact staging release gates.");
      }
      options.onWait?.({ attempt, maxAttempts, reason: gate.reason });
      await options.wait(waitMs);
    }
  }

  throw new Error("Staging gate latch timed out waiting for exact staging release gates.");
}

async function githubJson(url, token, fetchImpl, options) {
  const now = options?.now ?? (() => performance.now());
  const deadlineMs = options?.deadlineMs ?? Number.POSITIVE_INFINITY;
  const remainingMs = Math.min(options.requestTimeoutMs, deadlineMs - now());
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw new Error("GitHub API request timed out before the staging gate deadline.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("GitHub API request timed out before the staging gate deadline."));
  }, remainingMs);
  timer.unref?.();
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub API request failed closed with status ${response.status}.`);
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("GitHub API request timed out before the staging gate deadline.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function githubPaginated(url, arrayKey, token, fetchImpl, options) {
  const items = [];
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("per_page", String(API_PAGE_SIZE));
    pageUrl.searchParams.set("page", String(page));
    const response = await githubJson(pageUrl.toString(), token, fetchImpl, options);
    const batch = response?.[arrayKey];
    if (!Array.isArray(batch)) {
      throw new Error(`GitHub API response is missing ${arrayKey}.`);
    }
    items.push(...batch);
    if (batch.length < API_PAGE_SIZE) return items;
  }
  throw new Error(`GitHub API pagination exceeded ${MAX_API_PAGES} pages.`);
}

function exactAttemptOneRun(run, releaseSha, expectedActor) {
  const actor = String(run?.actor?.login ?? "").toLowerCase();
  const triggeringActor = String(run?.triggering_actor?.login ?? "").toLowerCase();
  return run?.head_sha === releaseSha &&
    run?.head_branch === "main" &&
    run?.event === "workflow_dispatch" &&
    run?.status === "completed" &&
    run?.conclusion === "success" &&
    Number(run?.run_attempt) === 1 &&
    actor !== "" &&
    actor === triggeringActor &&
    actor === expectedActor;
}

function hasArtifactPair(artifacts, prefix, runId) {
  const names = new Set(
    (artifacts ?? [])
      .filter((artifact) => artifact?.expired === false)
      .map((artifact) => String(artifact?.name ?? "")),
  );
  const payload = `${prefix}-${runId}-1`;
  return names.has(payload) && names.has(`${payload}-binding`);
}

export async function readGitHubStagingReleaseGate(options) {
  const releaseSha = requireReleaseSha(options?.releaseSha);
  const repository = String(options?.repository ?? "");
  const token = String(options?.token ?? "");
  const expectedActor = String(options?.expectedActor ?? "").trim().toLowerCase();
  const apiUrl = String(options?.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const requestTimeoutMs = requirePositiveInteger(
    options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    "requestTimeoutMs",
  );
  if (!REPOSITORY.test(repository)) throw new Error("GITHUB_REPOSITORY is invalid.");
  if (!token) throw new Error("GITHUB_TOKEN is required.");
  if (!expectedActor) throw new Error("EXPECTED_ACTOR is required.");
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required.");

  const requestOptions = {
    deadlineMs: options?.deadlineMs,
    now: options?.now,
    requestTimeoutMs,
  };
  const base = `${apiUrl}/repos/${repository}`;
  const runsUrl = (workflow) =>
    `${base}/actions/workflows/${encodeURIComponent(workflow)}/runs` +
    `?branch=main&event=workflow_dispatch&status=success&head_sha=${releaseSha}`;
  const [branch, stripeRuns, pagesRuns] = await Promise.all([
    githubJson(`${base}/branches/main`, token, fetchImpl, requestOptions),
    githubPaginated(
      runsUrl(STRIPE_WORKFLOW),
      "workflow_runs",
      token,
      fetchImpl,
      requestOptions,
    ),
    githubPaginated(
      runsUrl(PAGES_WORKFLOW),
      "workflow_runs",
      token,
      fetchImpl,
      requestOptions,
    ),
  ]);

  const artifactCache = new Map();
  const artifactsFor = async (runId) => {
    if (!artifactCache.has(runId)) {
      artifactCache.set(
        runId,
        githubPaginated(
          `${base}/actions/runs/${runId}/artifacts`,
          "artifacts",
          token,
          fetchImpl,
          requestOptions,
        ),
      );
    }
    return artifactCache.get(runId);
  };

  let stripeReady = false;
  for (const run of stripeRuns) {
    if (!exactAttemptOneRun(run, releaseSha, expectedActor)) continue;
    const prefix = `stripe-live-readiness-${releaseSha}`;
    if (hasArtifactPair(await artifactsFor(run.id), prefix, run.id)) {
      stripeReady = true;
      break;
    }
  }

  let stagingPagesReady = false;
  let productionPagesReady = false;
  for (const run of pagesRuns) {
    if (!exactAttemptOneRun(run, releaseSha, expectedActor)) continue;
    const artifacts = await artifactsFor(run.id);
    if (!stagingPagesReady) {
      stagingPagesReady = hasArtifactPair(
        artifacts,
        `cloudflare-pages-runtime-staging-${releaseSha}`,
        run.id,
      );
    }
    if (!productionPagesReady) {
      productionPagesReady = hasArtifactPair(
        artifacts,
        `cloudflare-pages-runtime-production-${releaseSha}`,
        run.id,
      );
    }
    if (stagingPagesReady && productionPagesReady) break;
  }

  const finalBranch = stripeReady && stagingPagesReady && productionPagesReady
    ? await githubJson(`${base}/branches/main`, token, fetchImpl, requestOptions)
    : branch;

  return Object.freeze({
    currentMainSha: String(finalBranch?.commit?.sha ?? ""),
    productionPagesReady,
    releaseSha,
    stagingPagesReady,
    stripeReady,
  });
}

async function main(environment = process.env) {
  const releaseSha = requireReleaseSha(environment.RELEASE_SHA);
  const repository = String(environment.GITHUB_REPOSITORY ?? "");
  const token = String(environment.GITHUB_TOKEN ?? "");
  const expectedActor = String(environment.EXPECTED_ACTOR ?? "");
  const apiUrl = String(environment.GITHUB_API_URL ?? "https://api.github.com");

  const result = await awaitStagingReleaseGate({
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    maxWaitMs: DEFAULT_MAX_WAIT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    readState: ({ deadlineMs }) =>
      readGitHubStagingReleaseGate({
        apiUrl,
        deadlineMs,
        expectedActor,
        releaseSha,
        repository,
        token,
      }),
    releaseSha,
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    onWait: ({ attempt, maxAttempts, reason }) => {
      console.log(`Staging gate latch ${attempt}/${maxAttempts}: ${reason}.`);
    },
  });
  console.log(`Exact staging release proof gates accepted after ${result.attempts} check(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
