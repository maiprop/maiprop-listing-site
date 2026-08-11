import { describe, expect, it } from "vitest";
import {
  validateLiveReleaseMarkers,
  validateLiveReleaseSha,
} from "./verify-live-release-marker.mjs";

const manifest = {
  schema_version: 1,
  release_sha: "0123456789abcdef0123456789abcdef01234567",
  source_tree: "89abcdef0123456789abcdef0123456789abcdef",
  source_run_id: "123",
  source_run_attempt: "2",
  payload_sha256: "a".repeat(64),
  artifact_sha256: "b".repeat(64),
};

const marker = {
  schema_version: 1,
  release_sha: manifest.release_sha,
  source_tree: manifest.source_tree,
  source_run_id: manifest.source_run_id,
  source_run_attempt: manifest.source_run_attempt,
  payload_sha256: manifest.payload_sha256,
};

describe("live release marker verification", () => {
  it("requires both static and Pages Function markers to match the artifact", () => {
    expect(
      validateLiveReleaseMarkers({
        manifest,
        staticMarker: marker,
        apiMarker: { ...marker },
      }),
    ).toEqual(marker);
  });

  it("rejects stale, incomplete, or split-brain markers", () => {
    expect(() =>
      validateLiveReleaseMarkers({
        manifest,
        staticMarker: { ...marker, release_sha: "f".repeat(40) },
        apiMarker: marker,
      }),
    ).toThrow(/static marker/i);
    expect(() =>
      validateLiveReleaseMarkers({
        manifest,
        staticMarker: marker,
        apiMarker: { ...marker, payload_sha256: "c".repeat(64) },
      }),
    ).toThrow(/function marker/i);
    expect(() =>
      validateLiveReleaseMarkers({
        manifest,
        staticMarker: marker,
        apiMarker: { error: "release_marker_unavailable" },
      }),
    ).toThrow(/function marker/i);
  });

  it("verifies an exact rollback SHA without requiring the old manifest", () => {
    expect(
      validateLiveReleaseSha({
        expectedSha: manifest.release_sha,
        staticMarker: marker,
        apiMarker: { ...marker },
      }),
    ).toEqual(marker);
  });

  it("rejects stale or split-brain rollback markers", () => {
    expect(() =>
      validateLiveReleaseSha({
        expectedSha: "f".repeat(40),
        staticMarker: marker,
        apiMarker: marker,
      }),
    ).toThrow(/rollback SHA/i);
    expect(() =>
      validateLiveReleaseSha({
        expectedSha: manifest.release_sha,
        staticMarker: marker,
        apiMarker: { ...marker, source_tree: "f".repeat(40) },
      }),
    ).toThrow(/function marker/i);
  });
});
