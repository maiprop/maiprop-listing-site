import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PRODUCTION_SUPABASE_PROJECT_REF = "qvvicunqcrwpioqnvzxf";
const MIN_SIGNING_KEY_BYTES = 32;
const DEFAULT_MAX_EVIDENCE_AGE_MS = 15 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60 * 1000;

function positiveIntegerString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function evidenceNonce(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 256) {
    throw new Error("Stripe migration evidence nonce is required and must be at most 256 characters.");
  }
  return normalized;
}

export function normalizeStripeMigrationReleaseSha(releaseSha) {
  const normalizedSha = String(releaseSha ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalizedSha)) {
    throw new Error("Stripe migration evidence requires a full 40-character release SHA.");
  }
  return normalizedSha;
}

export function resolveCheckedOutReleaseSha({
  requestedSha,
  headSha,
  statusPorcelain,
}) {
  const normalizedHead = normalizeStripeMigrationReleaseSha(headSha);
  const normalizedRequested = requestedSha == null || String(requestedSha).trim() === ""
    ? normalizedHead
    : normalizeStripeMigrationReleaseSha(requestedSha);
  if (normalizedRequested !== normalizedHead) {
    throw new Error(
      `Requested release SHA ${normalizedRequested} does not match checked-out HEAD ${normalizedHead}.`,
    );
  }
  if (String(statusPorcelain ?? "").trim() !== "") {
    throw new Error(
      "Stripe migration evidence requires a clean checkout with no tracked or untracked changes.",
    );
  }
  return normalizedHead;
}

export function requireEvidenceVerificationReleaseSha({
  requestedSha,
  headSha,
}) {
  if (requestedSha == null || String(requestedSha).trim() === "") {
    throw new Error(
      "Expected release SHA is required when verifying Stripe live migration evidence.",
    );
  }
  return resolveCheckedOutReleaseSha({
    requestedSha,
    headSha,
    statusPorcelain: "",
  });
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function signingKeyBuffer(signingKey) {
  const key = Buffer.from(String(signingKey ?? ""), "utf8");
  if (key.length < MIN_SIGNING_KEY_BYTES) {
    throw new Error(
      `Release evidence signing key must be at least ${MIN_SIGNING_KEY_BYTES} bytes.`,
    );
  }
  return key;
}

function unsignedEvidence(signedEvidence) {
  const {
    evidence_digest_sha256: _digest,
    signature: _signature,
    ...evidence
  } = signedEvidence ?? {};
  return evidence;
}

export function signStripeLiveMigrationEvidence(evidence, {
  signingKey,
  keyId,
}) {
  const normalizedKeyId = String(keyId ?? "").trim();
  if (!normalizedKeyId) {
    throw new Error("Release evidence signing key ID is required.");
  }
  const payload = stableJson(unsignedEvidence(evidence));
  const key = signingKeyBuffer(signingKey);
  return {
    ...unsignedEvidence(evidence),
    evidence_digest_sha256: createHash("sha256").update(payload).digest("hex"),
    signature: {
      algorithm: "hmac-sha256",
      key_id: normalizedKeyId,
      value: createHmac("sha256", key).update(payload).digest("hex"),
    },
  };
}

export function verifyStripeLiveMigrationEvidence(signedEvidence, {
  signingKey,
  expectedKeyId,
  expectedWorkflowRunId,
  expectedWorkflowRunAttempt,
  expectedEvidenceNonce,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_EVIDENCE_AGE_MS,
} = {}) {
  try {
    const signature = signedEvidence?.signature;
    if (
      signature?.algorithm !== "hmac-sha256" ||
      !/^[0-9a-f]{64}$/i.test(String(signature?.value ?? "")) ||
      (expectedKeyId && signature?.key_id !== expectedKeyId)
    ) return false;

    const payload = stableJson(unsignedEvidence(signedEvidence));
    const digest = createHash("sha256").update(payload).digest("hex");
    if (digest !== signedEvidence?.evidence_digest_sha256) return false;

    const expected = Buffer.from(
      createHmac("sha256", signingKeyBuffer(signingKey)).update(payload).digest("hex"),
      "hex",
    );
    const actual = Buffer.from(signature.value, "hex");
    if (!(expected.length === actual.length && timingSafeEqual(expected, actual))) {
      return false;
    }

    const checkedAtMs = Date.parse(String(signedEvidence?.checked_at ?? ""));
    const nowMs = now instanceof Date ? now.getTime() : Number(now);
    if (
      !Number.isFinite(checkedAtMs) ||
      !Number.isFinite(nowMs) ||
      !Number.isFinite(maxAgeMs) ||
      maxAgeMs <= 0 ||
      checkedAtMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS ||
      nowMs - checkedAtMs > maxAgeMs
    ) return false;

    const provenance = signedEvidence?.provenance;
    const workflowRunId = positiveIntegerString(
      provenance?.workflow_run_id,
      "Evidence workflow run ID",
    );
    const workflowRunAttempt = positiveIntegerString(
      provenance?.workflow_run_attempt,
      "Evidence workflow run attempt",
    );
    const nonce = evidenceNonce(provenance?.evidence_nonce);
    if (
      (expectedWorkflowRunId && workflowRunId !== String(expectedWorkflowRunId)) ||
      (expectedWorkflowRunAttempt && workflowRunAttempt !== String(expectedWorkflowRunAttempt)) ||
      (expectedEvidenceNonce && nonce !== String(expectedEvidenceNonce))
    ) return false;
    return true;
  } catch {
    return false;
  }
}

export function buildStripeLiveMigrationEvidence({
  releaseSha,
  supabaseProjectRef,
  stripeApiVersion,
  account,
  checked,
  webhook,
  issues,
  warnings,
  checkedAt = new Date().toISOString(),
  workflowRunId,
  workflowRunAttempt,
  evidenceNonce: nonce,
}) {
  const normalizedSha = normalizeStripeMigrationReleaseSha(releaseSha);
  if (supabaseProjectRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Stripe migration evidence must target production Supabase ${PRODUCTION_SUPABASE_PROJECT_REF}.`,
    );
  }

  return {
    schema_version: 1,
    evidence_type: "maiprop-stripe-live-migration",
    ok: issues.length === 0,
    release_sha: normalizedSha,
    supabase_project_ref: supabaseProjectRef,
    stripe_api_version: stripeApiVersion,
    account,
    checked,
    webhook,
    issues,
    warnings,
    checked_at: checkedAt,
    provenance: {
      workflow_run_id: positiveIntegerString(
        workflowRunId,
        "Evidence workflow run ID",
      ),
      workflow_run_attempt: positiveIntegerString(
        workflowRunAttempt,
        "Evidence workflow run attempt",
      ),
      evidence_nonce: evidenceNonce(nonce),
    },
  };
}
