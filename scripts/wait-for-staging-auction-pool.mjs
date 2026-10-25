/**
 * Poll a staged deployment's public auctions endpoint until auction rows are
 * visible through the edge cache, then exit 0. Used by the stage ceremony:
 * the catalogue job seeds auction fixtures after an earlier job has already
 * warmed the anonymous auctions cache with an empty pool, and the 300s edge
 * TTL would otherwise serve stale-empty rows to the catalogue proof.
 *
 * Exits non-zero on timeout or on a base URL that never serves auction rows.
 */

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1_000;
const DEFAULT_INTERVAL_MS = 10_000;

export function parsePollArgs(argv = process.argv.slice(2)) {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const options = { timeoutMs: DEFAULT_TIMEOUT_MS, intervalMs: DEFAULT_INTERVAL_MS };
  for (const arg of argv) {
    const match = arg.match(/^--(timeout-ms|interval-ms)=(\d+)$/);
    if (match) {
      const value = Number(match[2]);
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Invalid ${match[1]} value: ${match[2]}`);
      }
      if (match[1] === "timeout-ms") options.timeoutMs = value;
      else options.intervalMs = value;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  const baseUrl = (positional[0] ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("A staged deployment base URL is required.");
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error(`Invalid staged deployment base URL: ${positional[0]}`);
  }
  return { baseUrl: origin, ...options };
}

function auctionRowCount(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return 0;
  if (!Array.isArray(body.data)) return 0;
  const total = Number(body.total);
  if (Number.isSafeInteger(total) && total >= 0) return Math.min(total, body.data.length);
  return body.data.length;
}

export async function waitForAuctionPool({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowImpl = () => Date.now(),
} = {}) {
  if (!baseUrl) throw new Error("baseUrl is required.");
  const url = `${baseUrl.replace(/\/+$/, "")}/api/public/auctions?limit=60`;
  const deadline = nowImpl() + timeoutMs;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (response.ok) {
        const count = auctionRowCount(await response.json());
        if (count >= 1) return { status: "ready", attempts, auctionRows: count };
        process.stderr.write(`[wait-for-auction-pool] attempt ${attempts}: empty pool, retrying\n`);
      } else {
        process.stderr.write(`[wait-for-auction-pool] attempt ${attempts}: HTTP ${response.status}, retrying\n`);
      }
    } catch (error) {
      process.stderr.write(
        `[wait-for-auction-pool] attempt ${attempts}: ${error instanceof Error ? error.message : String(error)}, retrying\n`,
      );
    }
    if (nowImpl() + intervalMs > deadline) {
      throw new Error(`Staged auction pool at ${url} showed no rows within ${timeoutMs}ms.`);
    }
    await sleepImpl(intervalMs);
  }
}

const invokedAsScript = Boolean(
  process.argv[1] && process.argv[1].endsWith("wait-for-staging-auction-pool.mjs"),
);

if (invokedAsScript) {
  (async () => {
    const { baseUrl, timeoutMs, intervalMs } = parsePollArgs();
    const result = await waitForAuctionPool({ baseUrl, timeoutMs, intervalMs });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
