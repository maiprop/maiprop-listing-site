import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

export const PUBLIC_LISTINGS_DIAGNOSTIC_PATHS = [
  "/api/public/listings?listing_type=sale&page=1&pageSize=12",
  "/api/public/listings?listing_type=sale&page=1&pageSize=28&offset=12",
  "/api/public/listings?listing_type=sale&page=1&limit=40",
  "/api/public/listings?listing_type=rent&page=1&pageSize=12",
  "/api/public/listings?listing_type=rent&page=1&limit=40",
  "/api/public/homepage?section=featured",
];

function parseNumberArg(argv, name, fallback) {
  const prefix = `--${name}=`;
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function fetchWithTiming(url, timeoutMs, fetchImpl) {
  const startedAt = performance.now();
  try {
    const res = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return {
      url,
      status: res.status,
      ok: res.ok,
      contentType: res.headers.get("content-type") ?? "",
      bytes: text.length,
      ms: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      contentType: "",
      bytes: 0,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runPublicListingsLatencyDiagnostics(baseUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const iterations = options.iterations ?? 1;
  const fetchImpl = options.fetchImpl ?? fetch;
  const paths = options.paths ?? PUBLIC_LISTINGS_DIAGNOSTIC_PATHS;
  const results = [];

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    for (const path of paths) {
      const url = new URL(path, baseUrl).toString();
      results.push({
        iteration,
        path,
        ...(await fetchWithTiming(url, timeoutMs, fetchImpl)),
      });
    }
  }

  return results;
}

async function main() {
  const baseUrl = process.argv[2] ?? "https://portal.maiprop.co";
  const timeoutMs = parseNumberArg(process.argv.slice(3), "timeout-ms", 8_000);
  const iterations = parseNumberArg(process.argv.slice(3), "iterations", 1);
  const results = await runPublicListingsLatencyDiagnostics(baseUrl, { timeoutMs, iterations });
  console.table(results.map(({ iteration, path, status, ok, bytes, ms, error }) => ({
    iteration,
    path,
    status,
    ok,
    bytes,
    ms,
    error: error ?? "",
  })));

  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
