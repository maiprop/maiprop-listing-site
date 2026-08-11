#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  getCloudflareAccessHeaders,
  getSiteLockCookieHeader,
  getSiteLockPassword,
  mergeHeaders,
} from "./check-production-deploy-site-lock.mjs";
import { fetchReleaseResource } from "./release-http.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function markerFromManifest(manifest) {
  const marker = {
    schema_version: manifest?.schema_version,
    release_sha: String(manifest?.release_sha ?? ""),
    source_tree: String(manifest?.source_tree ?? ""),
    source_run_id: String(manifest?.source_run_id ?? ""),
    source_run_attempt: String(manifest?.source_run_attempt ?? ""),
    payload_sha256: String(manifest?.payload_sha256 ?? ""),
  };
  if (
    marker.schema_version !== 1 ||
    !FULL_SHA.test(marker.release_sha) ||
    !FULL_SHA.test(marker.source_tree) ||
    !POSITIVE_INTEGER.test(marker.source_run_id) ||
    !POSITIVE_INTEGER.test(marker.source_run_attempt) ||
    !SHA256.test(marker.payload_sha256)
  ) {
    throw new Error("Release manifest cannot produce a valid live marker.");
  }
  return marker;
}

function sameMarker(actual, expected) {
  return actual &&
    typeof actual === "object" &&
    Object.entries(expected).every(([key, value]) => actual[key] === value);
}

export function validateLiveReleaseMarkers({
  manifest,
  staticMarker,
  apiMarker,
}) {
  const expected = markerFromManifest(manifest);
  if (!sameMarker(staticMarker, expected)) {
    throw new Error("Static marker does not match the immutable artifact.");
  }
  if (!sameMarker(apiMarker, expected)) {
    throw new Error(
      "Pages Function marker does not match the immutable artifact.",
    );
  }
  return expected;
}

export function validateLiveReleaseSha({
  expectedSha,
  staticMarker,
  apiMarker,
}) {
  const normalizedExpectedSha = String(expectedSha ?? "")
    .trim()
    .toLowerCase();
  if (!FULL_SHA.test(normalizedExpectedSha)) {
    throw new Error("Expected rollback SHA must be a full Git commit SHA.");
  }
  const expected = markerFromManifest(staticMarker);
  if (expected.release_sha.toLowerCase() !== normalizedExpectedSha) {
    throw new Error("Static marker does not match the expected rollback SHA.");
  }
  if (!sameMarker(apiMarker, expected)) {
    throw new Error(
      "Pages Function marker does not match the static rollback marker.",
    );
  }
  return expected;
}

async function fetchJson(url, headers) {
  const response = await fetchReleaseResource(url, {
    signal: AbortSignal.timeout(30_000),
    headers: mergeHeaders(
      { Accept: "application/json", "Cache-Control": "no-cache" },
      headers,
    ),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${url} returned HTTP ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} did not return JSON.`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const baseUrl = argv[0];
  const expectedShaIndex = argv.indexOf("--expected-sha");
  const expectedSha = expectedShaIndex >= 0
    ? argv[expectedShaIndex + 1] ?? ""
    : "";
  const manifestPath = expectedShaIndex >= 0
    ? ""
    : argv[1] ?? "release-candidate/release-manifest.json";
  if (!baseUrl) {
    throw new Error(
      "Usage: verify-live-release-marker.mjs <base-url> [manifest-path] | <base-url> --expected-sha <full-sha>",
    );
  }
  const origin = new URL(baseUrl);
  const manifest = manifestPath
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  const password = getSiteLockPassword();
  const siteLockHeaders = password
    ? { Cookie: await getSiteLockCookieHeader(password) }
    : {};
  const headers = mergeHeaders(
    getCloudflareAccessHeaders(),
    siteLockHeaders,
  );
  const [staticMarker, apiMarker] = await Promise.all([
    fetchJson(new URL("/deploy-version.json", origin), headers),
    fetchJson(new URL("/api/release", origin), headers),
  ]);
  const marker = expectedSha
    ? validateLiveReleaseSha({ expectedSha, staticMarker, apiMarker })
    : validateLiveReleaseMarkers({ manifest, staticMarker, apiMarker });
  process.stdout.write(`${JSON.stringify(marker, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
