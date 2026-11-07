// Synthetic provider records for the external observer tests; no enrolled authority.
export const NOW = "2026-10-22T16:00:00Z";
export const REQUIRED_JOBS = [
  "Build / Lint / Test",
  "Release Safety Inventory / Release Safety Inventory",
  "E2E Tests",
  "Validate Supabase migrations",
  "Lighthouse CI",
  "Immutable release candidate built",
];

export function makeFixture() {
  const request = {
    schema_version: 1,
    task_id: "fixture-task-01",
    contract_sha256: "1".repeat(64),
    candidate_sha256: "2".repeat(64),
    review_sha256: "3".repeat(64),
    base_sha: "b".repeat(40),
    commit_sha: "c".repeat(40),
    tree_sha: "d".repeat(40),
    workflow_blob_sha: "e".repeat(40),
    run_id: 1234567890,
    run_attempt: 1,
    artifact_id: 2222222222,
    artifact_digest: "sha256:" + "4".repeat(64),
    nonce: "9".repeat(64),
    issued_at: "2026-10-22T15:59:00Z",
    expires_at: "2026-10-22T16:30:00Z",
  };
  const repository = {
    id: 1179072210,
    full_name: "maiprop/maiprop-listing-site",
    default_branch: "main",
    owner: { id: 182603068, login: "maiprop" },
  };
  const records = {
    repository,
    branch: { name: "main", commit: { sha: request.commit_sha } },
    commit: {
      sha: request.commit_sha,
      commit: { tree: { sha: request.tree_sha } },
      parents: [{ sha: request.base_sha }],
    },
    workflow: { id: 262230414, path: ".github/workflows/ci.yml", name: "CI", state: "active" },
    workflow_source: {
      path: ".github/workflows/ci.yml",
      sha: request.workflow_blob_sha,
      commit_sha: request.commit_sha,
    },
    run: {
      id: request.run_id,
      run_attempt: 1,
      workflow_id: 262230414,
      path: ".github/workflows/ci.yml",
      event: "push",
      head_branch: "main",
      head_sha: request.commit_sha,
      status: "completed",
      conclusion: "success",
      actor: { id: 8001, login: "fixture-operator" },
      triggering_actor: { id: 8001, login: "fixture-operator" },
      repository: structuredClone(repository),
      head_repository: structuredClone(repository),
      pull_requests: [],
    },
    jobs: REQUIRED_JOBS.map((name, index) => ({
      id: 900000 + index,
      name,
      run_id: request.run_id,
      run_attempt: 1,
      head_sha: request.commit_sha,
      status: "completed",
      conclusion: "success",
    })),
    artifacts: [{
      id: request.artifact_id,
      name: `production-release-candidate-${request.commit_sha}-1`,
      digest: request.artifact_digest,
      expired: false,
      expires_at: "2026-11-22T16:00:00Z",
      workflow_run: { id: request.run_id, head_sha: request.commit_sha },
    }],
  };
  return { request, records };
}
