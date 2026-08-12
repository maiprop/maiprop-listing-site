type AssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type ReleaseEnv = {
  ASSETS?: AssetFetcher;
};

type ReleaseMarker = {
  schema_version: number;
  release_sha: string;
  source_tree: string;
  source_run_id: string;
  source_run_attempt: string;
  payload_sha256: string;
};

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

function isReleaseMarker(value: unknown): value is ReleaseMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<ReleaseMarker>;
  return marker.schema_version === 1 &&
    FULL_SHA.test(String(marker.release_sha ?? "")) &&
    FULL_SHA.test(String(marker.source_tree ?? "")) &&
    POSITIVE_INTEGER.test(String(marker.source_run_id ?? "")) &&
    POSITIVE_INTEGER.test(String(marker.source_run_attempt ?? "")) &&
    SHA256.test(String(marker.payload_sha256 ?? ""));
}

function responseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export const onRequestGet: PagesFunction<ReleaseEnv> = async (context) => {
  if (!context.env.ASSETS) {
    return Response.json(
      { error: "release_marker_unavailable" },
      { status: 503, headers: responseHeaders() },
    );
  }

  try {
    const markerResponse = await context.env.ASSETS.fetch(
      new URL("/deploy-version.json", context.request.url),
    );
    if (!markerResponse.ok) throw new Error("marker asset request failed");
    const marker: unknown = await markerResponse.json();
    if (!isReleaseMarker(marker)) throw new Error("marker is malformed");

    return Response.json(marker, {
      status: 200,
      headers: responseHeaders(),
    });
  } catch {
    return Response.json(
      { error: "release_marker_unavailable" },
      { status: 503, headers: responseHeaders() },
    );
  }
};
