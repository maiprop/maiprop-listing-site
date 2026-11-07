import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeFixture, NOW, REQUIRED_JOBS } from "./github-fixtures.mjs";

const workspace = process.env.CANDIDATE_WORKSPACE;
assert.ok(workspace, "CANDIDATE_WORKSPACE is required; never import an implicit product checkout");
const moduleUrl = pathToFileURL(resolve(workspace, "scripts", "codex-muse-github.mjs"));
const { verifyMaiPropCiEvidence } = await import(moduleUrl.href);
assert.equal(typeof verifyMaiPropCiEvidence, "function");

function reject(change, now = NOW) {
  const { request, records } = makeFixture();
  change(request, records);
  assert.throws(() => verifyMaiPropCiEvidence(request, records, now));
}

test("exact successful post-main records produce an observation without production authority", () => {
  const { request, records } = makeFixture();
  const result = verifyMaiPropCiEvidence(request, records, NOW);
  assert.equal(result.evidence_type, "maiprop-github-ci-observation");
  assert.equal(result.provider, "github-actions");
  assert.equal(result.production_ready, false);
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.hmac_verified_locally, false);
  assert.equal(result.repository, "maiprop/maiprop-listing-site");
  for (const field of ["commit_sha", "tree_sha", "run_id", "run_attempt", "artifact_id", "artifact_digest"]) {
    assert.equal(result[field], request[field], field);
  }
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(request).sort().map(key => [key, request[key]])));
  assert.equal(result.request_sha256, createHash("sha256").update(canonical).digest("hex"));
});

test("additional GitHub metadata is allowed without mutating the request or records", () => {
  const { request, records } = makeFixture();
  records.repository.description = "Unrelated provider metadata";
  records.run.html_url = "https://github.com/maiprop/maiprop-listing-site/actions/runs/1234567890";
  records.jobs[0].steps = [{ name: "Example", status: "completed", conclusion: "success" }];
  records.artifacts[0].size_in_bytes = 12345;
  records.jobs.push({ id: 999999, name: "Publish Release PR CI Status", status: "completed", conclusion: "skipped", run_id: request.run_id, head_sha: request.commit_sha });
  records.artifacts.push({ id: 3333333333, name: "sbom", expired: true });
  const before = JSON.stringify({ request, records });
  assert.equal(verifyMaiPropCiEvidence(request, records, NOW).provider, "github-actions");
  assert.equal(JSON.stringify({ request, records }), before);
});

test("request digest binds contract, candidate, review and nonce independently", () => {
  const { request, records } = makeFixture();
  const original = verifyMaiPropCiEvidence(request, records, NOW).request_sha256;
  for (const field of ["contract_sha256", "candidate_sha256", "review_sha256", "nonce"]) {
    const changed = { ...request, [field]: "a".repeat(64) };
    assert.notEqual(verifyMaiPropCiEvidence(changed, records, NOW).request_sha256, original, field);
  }
});

test("missing or extra request fields cannot be silently ignored", () => {
  const { request } = makeFixture();
  for (const field of Object.keys(request)) reject(value => { delete value[field]; });
  reject(value => { value.unreviewed_option = true; });
  reject(value => { value.provider = "local-ci"; });
});

test("malformed IDs, digests, task identity and schema are rejected", () => {
  const malformed = [
    ["schema_version", 2], ["schema_version", true], ["task_id", "../escape"],
    ["task_id", ""], ["task_id", "x".repeat(513)], ["run_id", 0],
    ["run_id", "1234567890"], ["run_id", Number.MAX_SAFE_INTEGER + 1],
    ["artifact_id", -1], ["artifact_id", true], ["artifact_digest", "4".repeat(64)],
    ["contract_sha256", "1".repeat(63)], ["candidate_sha256", "z".repeat(64)],
    ["review_sha256", "sha256:" + "3".repeat(64)], ["nonce", "short"],
    ["base_sha", "main"], ["commit_sha", "c".repeat(39)], ["tree_sha", "q".repeat(40)],
    ["workflow_blob_sha", "e".repeat(41)],
  ];
  for (const [field, value] of malformed) reject(request => { request[field] = value; });
});

test("only unexpired strict UTC second timestamps and at most one hour TTL are accepted", () => {
  for (const value of ["2026-10-22T16:00:00+00:00", "2026-10-22T16:00:00.000Z", "not-a-date", "2026-02-30T16:00:00Z"]) {
    reject(request => { request.issued_at = value; });
    reject(request => { request.expires_at = value; });
  }
  reject(request => { request.issued_at = "2026-10-22T16:00:01Z"; });
  reject(request => { request.expires_at = NOW; });
  reject(request => { request.expires_at = request.issued_at; });
  reject(request => { request.expires_at = "2026-10-22T17:00:01Z"; });
  reject(() => {}, "invalid-clock");
  const { request, records } = makeFixture();
  request.issued_at = "2026-10-22T15:00:00Z";
  request.expires_at = "2026-10-22T16:00:00Z";
  assert.equal(verifyMaiPropCiEvidence(request, records, "2026-10-22T15:59:59Z").production_ready, false);
});

test("missing or malformed provider record collections are rejected", () => {
  const { records } = makeFixture();
  for (const field of Object.keys(records)) reject((_, value) => { delete value[field]; });
  for (const field of ["jobs", "artifacts"]) {
    reject((_, value) => { value[field] = {}; });
    reject((_, value) => { value[field] = []; });
  }
  for (const field of ["repository", "branch", "commit", "workflow", "workflow_source", "run"]) {
    reject((_, value) => { value[field] = null; });
  }
});

test("repository name cannot substitute for the pinned repository and owner IDs", () => {
  for (const field of ["repository", "run.repository", "run.head_repository"]) {
    const get = records => field.split(".").reduce((node, name) => node[name], records);
    reject((_, records) => { get(records).id = 1179072211; });
    reject((_, records) => { get(records).full_name = "someone/maiprop-listing-site"; });
    reject((_, records) => { get(records).owner.id = 182603069; });
  }
});

test("main branch and exact current main commit are mandatory", () => {
  reject((_, records) => { records.branch.name = "release"; });
  reject((_, records) => { records.branch.commit.sha = "a".repeat(40); });
  reject((_, records) => { records.commit.sha = "a".repeat(40); });
  reject((_, records) => { records.run.head_branch = "release"; });
});

test("source tree and the single direct base parent must match the request", () => {
  reject((_, records) => { records.commit.commit.tree.sha = "a".repeat(40); });
  reject((_, records) => { records.commit.parents = []; });
  reject((_, records) => { records.commit.parents[0].sha = "a".repeat(40); });
  reject((_, records) => { records.commit.parents.push({ sha: "a".repeat(40) }); });
});

test("workflow ID, path, source blob and checked commit cannot be substituted", () => {
  reject((_, records) => { records.workflow.id = 262230415; });
  reject((_, records) => { records.workflow.path = ".github/workflows/other.yml"; });
  reject((_, records) => { records.run.workflow_id = 262230415; });
  reject((_, records) => { records.run.path = ".github/workflows/other.yml"; });
  reject((_, records) => { records.workflow_source.path = ".github/workflows/other.yml"; });
  reject((_, records) => { records.workflow_source.sha = "a".repeat(40); });
  reject((_, records) => { records.workflow_source.commit_sha = "a".repeat(40); });
});

test("run ID, exact commit and original attempt must match", () => {
  reject((_, records) => { records.run.id += 1; });
  reject((_, records) => { records.run.head_sha = "a".repeat(40); });
  reject(request => { request.run_attempt = 2; });
  reject((_, records) => { records.run.run_attempt = 2; });
  reject((_, records) => { records.run.run_attempt = "1"; });
});

test("pull requests, dispatches and merge groups are not post-main push proof", () => {
  for (const event of ["pull_request", "workflow_dispatch", "workflow_run", "merge_group"]) {
    reject((_, records) => { records.run.event = event; });
  }
  reject((_, records) => { records.run.pull_requests = [{ number: 42 }]; });
  reject((_, records) => { records.run.pull_requests = null; });
});

test("incomplete or failed newest selected run cannot fall back to some green result", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "neutral", "timed_out", "action_required", null]) {
    reject((_, records) => { records.run.conclusion = conclusion; });
  }
  for (const status of ["queued", "in_progress", null]) {
    reject((_, records) => { records.run.status = status; });
  }
});

test("actor labels must be present and match the original triggering actor", () => {
  reject((_, records) => { records.run.actor.login = ""; });
  reject((_, records) => { records.run.triggering_actor.login = "other-operator"; });
  reject((_, records) => { delete records.run.actor; });
  reject((_, records) => { delete records.run.triggering_actor; });
});

test("every named static and immutable-candidate job must have passed once", () => {
  for (const name of REQUIRED_JOBS) {
    reject((_, records) => { records.jobs = records.jobs.filter(job => job.name !== name); });
    reject((_, records) => { records.jobs.find(job => job.name === name).conclusion = "failure"; });
    reject((_, records) => { records.jobs.push(structuredClone(records.jobs.find(job => job.name === name))); });
  }
});

test("skipped, neutral, canceled, running or wrong-run required jobs do not pass", () => {
  for (const conclusion of ["skipped", "neutral", "cancelled", null]) {
    reject((_, records) => { records.jobs[0].conclusion = conclusion; });
  }
  reject((_, records) => { records.jobs[0].status = "in_progress"; });
  reject((_, records) => { records.jobs[0].run_id += 1; });
  reject((_, records) => { records.jobs[0].head_sha = "a".repeat(40); });
});

test("selected candidate artifact must match exact identity, name, digest and producer", () => {
  reject((_, records) => { records.artifacts[0].id += 1; });
  reject((_, records) => { records.artifacts[0].name = "production-release-candidate-latest"; });
  reject((_, records) => { records.artifacts[0].digest = "sha256:" + "a".repeat(64); });
  reject((_, records) => { records.artifacts[0].workflow_run.id += 1; });
  reject((_, records) => { records.artifacts[0].workflow_run.head_sha = "a".repeat(40); });
  reject((_, records) => { delete records.artifacts[0].workflow_run; });
});

test("expired, invalid-expiry or duplicate selected artifact records are rejected", () => {
  reject((_, records) => { records.artifacts[0].expired = true; });
  reject((_, records) => { records.artifacts[0].expires_at = NOW; });
  reject((_, records) => { records.artifacts[0].expires_at = "invalid"; });
  reject((_, records) => { records.artifacts.push(structuredClone(records.artifacts[0])); });
});

test("SSH labels and fake local attestations cannot replace missing provider proof", () => {
  reject((_, records) => {
    records.run = { provider: "local-ci", signed: true, principal: "ci-operator", ssh_signature: "fake" };
  });
  reject((_, records) => {
    records.jobs = [];
    records.approval = { principal: "reviewer", identity_verified: true, decision: "approve" };
  });
});
