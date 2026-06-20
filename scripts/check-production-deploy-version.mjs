const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "maiprop-production-deploy-check/1.0";

const defaultAssertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

const defaultFetchText = async (url, options = {}) => {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const text = await res.text();
  defaultAssertOk(res.ok, `${url} returned HTTP ${res.status}: ${text.slice(0, 160)}`);
  return { res, text };
};

export async function validateDeploymentVersion(
  baseUrl,
  {
    expectedSha = "",
    versionPath = "/deploy-version.json",
    fetchText = defaultFetchText,
    assertOk = defaultAssertOk,
  } = {},
) {
  if (!expectedSha) return;

  const markerUrl = new URL(versionPath, baseUrl).toString();
  const { res, text } = await fetchText(markerUrl, {
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
    },
  });
  const contentType = res.headers.get("content-type") ?? "";
  assertOk(
    /application\/json/i.test(contentType),
    `${markerUrl} returned ${contentType || "<missing>"} instead of JSON`,
  );

  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${markerUrl} returned invalid JSON: ${error.message}`);
  }

  const observedSha = body && typeof body === "object" ? String(body.sha ?? "") : "";
  assertOk(
    observedSha === expectedSha,
    `${markerUrl} is serving deployment ${observedSha || "<missing>"} instead of ${expectedSha}`,
  );
}
