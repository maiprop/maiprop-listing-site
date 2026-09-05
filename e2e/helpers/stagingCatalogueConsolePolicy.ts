export type StagingConsoleObservation = {
  text: string;
  sourceUrl: string;
  stagingBaseUrl: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const EXPECTED_FUNCTION_PATHS = new Set([
  "/functions/v1/owner-pro-status",
  "/functions/v1/record-listing-view",
]);

function expectedFunctionUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.toLowerCase().endsWith(".supabase.co")
      && EXPECTED_FUNCTION_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

export function isExpectedNMinusOneCorsConsoleError(
  observation: StagingConsoleObservation,
  compatibilityEnabled: boolean,
): boolean {
  if (!compatibilityEnabled) return false;

  let stagingOrigin: URL;
  try {
    stagingOrigin = new URL(observation.stagingBaseUrl);
  } catch {
    return false;
  }
  if (
    stagingOrigin.protocol !== "http:"
    || !LOOPBACK_HOSTS.has(stagingOrigin.hostname.toLowerCase())
  ) {
    return false;
  }

  if (observation.text === "Failed to load resource: net::ERR_FAILED") {
    return expectedFunctionUrl(observation.sourceUrl);
  }

  const corsMatch = observation.text.match(
    /^Access to fetch at '([^']+)' from origin '([^']+)' has been blocked by CORS policy: (.+)$/,
  );
  if (!corsMatch || corsMatch[2] !== stagingOrigin.origin) return false;
  if (!expectedFunctionUrl(corsMatch[1])) return false;

  return corsMatch[3].includes(
    "Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'https://maiprop.co' that is not equal to the supplied origin.",
  );
}
