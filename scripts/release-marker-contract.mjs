export const RELEASE_MANIFEST_SCHEMA_VERSION = 2;
export const LIVE_RELEASE_MARKER_SCHEMA_VERSION = 1;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

export function validateLiveReleaseMarker(marker, label = "Live release marker") {
  const normalized = {
    schema_version: marker?.schema_version,
    release_sha: String(marker?.release_sha ?? ""),
    source_tree: String(marker?.source_tree ?? ""),
    source_run_id: String(marker?.source_run_id ?? ""),
    source_run_attempt: String(marker?.source_run_attempt ?? ""),
    payload_sha256: String(marker?.payload_sha256 ?? ""),
  };
  if (
    normalized.schema_version !== LIVE_RELEASE_MARKER_SCHEMA_VERSION ||
    !FULL_SHA.test(normalized.release_sha) ||
    !FULL_SHA.test(normalized.source_tree) ||
    !POSITIVE_INTEGER.test(normalized.source_run_id) ||
    !POSITIVE_INTEGER.test(normalized.source_run_attempt) ||
    !SHA256.test(normalized.payload_sha256)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function liveReleaseMarkerFromManifest(manifest) {
  if (manifest?.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new Error("Release manifest has an unsupported schema version.");
  }
  return validateLiveReleaseMarker({
    schema_version: LIVE_RELEASE_MARKER_SCHEMA_VERSION,
    release_sha: manifest.release_sha,
    source_tree: manifest.source_tree,
    source_run_id: manifest.source_run_id,
    source_run_attempt: manifest.source_run_attempt,
    payload_sha256: manifest.payload_sha256,
  }, "Release manifest live marker projection");
}
