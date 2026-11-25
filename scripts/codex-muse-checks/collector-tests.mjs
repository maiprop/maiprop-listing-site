import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeFixture, NOW } from "./github-fixtures.mjs";

assert.ok(process.env.CANDIDATE_WORKSPACE, "CANDIDATE_WORKSPACE is required");
const { collectMaiPropCiEvidence } = await import(pathToFileURL(resolve(
  process.env.CANDIDATE_WORKSPACE, "scripts", "codex-muse-github.mjs",
)).href);
assert.equal(typeof collectMaiPropCiEvidence, "function");

const ROOT = "/repos/maiprop/maiprop-listing-site";

function makeApi({ jobs, artifacts, changeResponse } = {}) {
  const { request, records } = makeFixture();
  const selectedJobs = jobs ?? records.jobs;
  const selectedArtifacts = artifacts ?? records.artifacts;
  const paths = [];
  const getJson = async (path, ...rest) => {
    assert.equal(rest.length, 0, "The injected seam receives a GET path only");
    assert.equal(typeof path, "string");
    assert.ok(path === ROOT || path.startsWith(ROOT + "/"), "Only the pinned repository may be queried");
    assert.ok(!path.includes("..") && !path.includes("://"), "No URL or parent-path injection");
    paths.push(path);
    let response;
    if (path === ROOT || path === ROOT + "/") response = records.repository;
    else if (path === ROOT + "/branches/main") response = records.branch;
    else if (path === ROOT + "/commits/" + request.commit_sha) response = records.commit;
    else if (path === ROOT + "/actions/workflows/262230414") response = records.workflow;
    else if (path === ROOT + "/contents/.github/workflows/ci.yml?ref=" + request.commit_sha) {
      // Native Contents API does not supply commit_sha; exact ref supplies its context.
      response = { type: "file", path: records.workflow_source.path, sha: records.workflow_source.sha, size: 123, encoding: "base64", content: "bmFtZTogQ0kK" };
    } else if (path === ROOT + "/actions/runs/" + request.run_id) response = records.run;
    else {
      const jobsMatch = path.match(new RegExp(`^${ROOT}/actions/runs/${request.run_id}/attempts/1/jobs\\?per_page=100&page=([1-9][0-9]*)$`));
      const artifactsMatch = path.match(new RegExp(`^${ROOT}/actions/runs/${request.run_id}/artifacts\\?per_page=100&page=([1-9][0-9]*)$`));
      assert.ok(jobsMatch || artifactsMatch, "Unexpected endpoint: " + path);
      const key = jobsMatch ? "jobs" : "artifacts";
      const rows = jobsMatch ? selectedJobs : selectedArtifacts;
      const page = Number((jobsMatch || artifactsMatch)[1]);
      assert.ok(page <= 10, "Collector exceeded its ten-page bound");
      response = { total_count: rows.length, [key]: rows.slice((page - 1) * 100, page * 100) };
    }
    response = structuredClone(response);
    return changeResponse ? changeResponse(path, response) : response;
  };
  return { request, records, paths, getJson };
}

function fillerJobs(count) {
  const { request } = makeFixture();
  return Array.from({ length: count }, (_, index) => ({
    id: 7000000 + index, name: "Optional job " + index, run_id: request.run_id,
    run_attempt: 1, head_sha: request.commit_sha, status: "completed", conclusion: "skipped",
  }));
}

function fillerArtifacts(count) {
  return Array.from({ length: count }, (_, index) => ({ id: 8000000 + index, name: "diagnostic-" + index, expired: true }));
}

async function collect(api) {
  return collectMaiPropCiEvidence(api.request, { getJson: api.getJson, nowIso: NOW });
}

test("collector uses scoped read endpoints and returns normalized records plus metadata-only observation", async () => {
  const api = makeApi();
  const result = await collect(api);
  assert.equal(result.observation.evidence_type, "maiprop-github-ci-observation");
  assert.equal(result.observation.provider, "github-actions");
  assert.equal(result.observation.production_ready, false);
  assert.equal(result.observation.mutation_authorized, false);
  assert.equal(result.observation.hmac_verified_locally, false);
  assert.match(result.observation.request_sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.records.workflow_source.commit_sha, api.request.commit_sha);
  assert.equal(result.records.workflow_source.sha, api.request.workflow_blob_sha);
  assert.equal(result.records.jobs.length, 6);
  assert.equal(result.records.artifacts.length, 1);
  assert.ok(api.paths.includes(ROOT + `/actions/runs/${api.request.run_id}/attempts/1/jobs?per_page=100&page=1`));
  assert.ok(api.paths.includes(ROOT + `/actions/runs/${api.request.run_id}/artifacts?per_page=100&page=1`));
});

test("required jobs and selected artifact on second pages are actually fetched", async () => {
  const fixture = makeFixture();
  const api = makeApi({ jobs: [...fillerJobs(100), ...fixture.records.jobs], artifacts: [...fillerArtifacts(100), ...fixture.records.artifacts] });
  const result = await collect(api);
  assert.equal(result.records.jobs.length, 106);
  assert.equal(result.records.artifacts.length, 101);
  assert.equal(result.observation.artifact_id, fixture.request.artifact_id);
  assert.equal(api.paths.filter(path => path.includes("/jobs?")).length, 2);
  assert.equal(api.paths.filter(path => path.includes("/artifacts?")).length, 2);
});

test("exactly one thousand jobs fit the ten-page limit", async () => {
  const api = makeApi({ jobs: [...fillerJobs(994), ...makeFixture().records.jobs] });
  const result = await collect(api);
  assert.equal(result.records.jobs.length, 1000);
  assert.equal(api.paths.filter(path => path.includes("/jobs?")).length, 10);
});

test("invalid or expired request is rejected before any provider read", async () => {
  for (const change of [
    request => { request.commit_sha = "../other"; },
    request => { request.run_id = 0; },
    request => { request.run_attempt = 2; },
    request => { request.expires_at = NOW; },
    request => { request.provider = "local-ci"; },
  ]) {
    const api = makeApi();
    change(api.request);
    await assert.rejects(() => collect(api));
    assert.equal(api.paths.length, 0, "Malformed requests must not reach the provider");
  }
});

test("missing, string, negative or fractional total_count cannot imply completeness", async () => {
  for (const key of ["jobs", "artifacts"]) {
    for (const total of [undefined, "6", -1, 1.5]) {
      const api = makeApi({ changeResponse: (path, response) => {
        if (path.includes(`/${key}?`)) {
          if (total === undefined) delete response.total_count;
          else response.total_count = total;
        }
        return response;
      } });
      await assert.rejects(() => collect(api));
    }
  }
});

test("inconsistent counts across pages fail instead of silently accepting a subset", async () => {
  const api = makeApi({ jobs: [...fillerJobs(100), ...makeFixture().records.jobs], changeResponse: (path, response) => {
    if (path.includes("/jobs?") && path.endsWith("page=2")) response.total_count -= 1;
    return response;
  } });
  await assert.rejects(() => collect(api));
});

test("truncated jobs or artifact pages fail closed", async () => {
  for (const key of ["jobs", "artifacts"]) {
    const fixture = makeFixture();
    const api = makeApi({
      jobs: [...fillerJobs(100), ...fixture.records.jobs],
      artifacts: [...fillerArtifacts(100), ...fixture.records.artifacts],
      changeResponse: (path, response) => {
        if (path.includes(`/${key}?`) && path.endsWith("page=2")) response[key] = [];
        return response;
      },
    });
    await assert.rejects(() => collect(api));
  }
});

test("duplicate optional job or artifact IDs across pages are rejected", async () => {
  const fixture = makeFixture();
  const jobs = fillerJobs(100);
  const jobApi = makeApi({ jobs: [...jobs, ...fixture.records.jobs, structuredClone(jobs[0])] });
  await assert.rejects(() => collect(jobApi));
  const artifacts = fillerArtifacts(100);
  const artifactApi = makeApi({ artifacts: [...artifacts, ...fixture.records.artifacts, structuredClone(artifacts[0])] });
  await assert.rejects(() => collect(artifactApi));
});

test("more than one thousand records is rejected without an eleventh request", async () => {
  for (const key of ["jobs", "artifacts"]) {
    const api = makeApi({ changeResponse: (path, response) => {
      if (path.includes(`/${key}?`)) response.total_count = 1001;
      return response;
    } });
    await assert.rejects(() => collect(api));
    assert.ok(api.paths.filter(path => path.includes(`/${key}?`)).length <= 10);
  }
});

test("oversized or malformed provider page arrays are rejected", async () => {
  for (const key of ["jobs", "artifacts"]) {
    for (const rows of [null, {}, Array.from({ length: 101 }, (_, index) => ({ id: index + 1 }))]) {
      const api = makeApi({ changeResponse: (path, response) => {
        if (path.includes(`/${key}?`)) {
          response[key] = rows;
          response.total_count = 101;
        }
        return response;
      } });
      await assert.rejects(() => collect(api));
    }
  }
});

test("provider errors do not produce a partial observation", async () => {
  const api = makeApi();
  const getJson = async path => {
    if (path.includes("/artifacts?")) throw new Error("synthetic provider unavailable");
    return api.getJson(path);
  };
  await assert.rejects(() => collectMaiPropCiEvidence(api.request, { getJson, nowIso: NOW }));
});

test("collected records are checked by the observer before output is returned", async () => {
  const api = makeApi({ changeResponse: (path, response) => {
    if (path === ROOT + "/branches/main") response.commit.sha = "a".repeat(40);
    return response;
  } });
  await assert.rejects(() => collect(api));
});
