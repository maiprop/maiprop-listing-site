import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/live-operational-smoke.yml", "utf8");

type ProbeResult = {
  elapsedMs?: number;
  jsonThrows?: Error;
  payload?: unknown;
  status?: number;
  throws?: Error;
};

const extractEmbeddedSmoke = () => {
  const match = workflow.match(
    /node(?: --input-type=module)? <<'NODE'\r?\n([\s\S]*?)\r?\n\s*NODE/,
  );
  if (!match) {
    throw new Error("Unable to find embedded live smoke program");
  }

  const lines = match[1].split(/\r?\n/);
  const indentation = Math.min(
    ...lines
      .filter((line) => line.trim())
      .map((line) => line.match(/^\s*/)?.[0].length ?? 0),
  );
  return lines.map((line) => line.slice(indentation)).join("\n");
};

const runEmbeddedSmoke = (results: ProbeResult[]) => {
  const calls: string[] = [];
  let clockMs = 0;
  const pending = [...results];
  const fakeFetch = async (target: URL) => {
    const result = pending.shift();
    if (!result) {
      throw new Error(`Unexpected probe request: ${target.pathname}${target.search}`);
    }

    calls.push(`${target.pathname}${target.search}`);
    clockMs += result.elapsedMs ?? 1;
    if (result.throws) {
      throw result.throws;
    }

    const status = result.status ?? 200;
    return {
      json: async () => {
        if (result.jsonThrows) throw result.jsonThrows;
        return result.payload;
      },
      ok: status >= 200 && status < 300,
      status,
    };
  };
  const execute = new Function(
    "fetch",
    "performance",
    "AbortSignal",
    "setTimeout",
    "URL",
    "process",
    "console",
    `return (async () => {\n${extractEmbeddedSmoke()}\n})();`,
  ) as (...args: unknown[]) => Promise<void>;

  return {
    calls,
    run: execute(
      fakeFetch,
      { now: () => clockMs },
      AbortSignal,
      (callback: () => void) => callback(),
      URL,
      { env: { PUBLIC_BASE_URL: "https://portal.maiprop.co" } },
      { log: () => undefined },
    ),
  };
};

const successfulRemainingProbes: ProbeResult[] = [
  { payload: { data: [] } },
  { payload: [] },
  { payload: {} },
];

describe("live operational smoke workflow", () => {
  it("uses only unauthenticated public GET and HEAD health checks", () => {
    expect(workflow).toContain("Run unauthenticated public read-only checks");
    expect(workflow).toContain('method: "HEAD"');
    expect(workflow).toContain('method: "GET"');
    expect(workflow).toContain('"/"');
    expect(workflow).toContain("/api/public/listings?limit=1");
    expect(workflow).toContain("/api/public/auctions?limit=1");
    expect(workflow).toContain("/api/public/open-houses?limit=1");
    expect(workflow).toContain("/api/public/homepage?section=type-counts");
    expect(workflow).not.toContain("/api/public/homepage?section=listing_counts");
    expect(workflow).toContain("performance.now()");
    expect(workflow).toContain("3_500");
    expect(workflow).toContain(
      'Object.prototype.hasOwnProperty.call(payload, "error")',
    );
    expect(workflow).toContain('shape: "data-array"');
    expect(workflow).toContain('shape: "array"');
    expect(workflow).toContain('shape: "object"');
    expect(workflow).toContain("Array.isArray(payload.data)");
    expect(workflow).toContain("Array.isArray(payload)");
    expect(workflow).toContain("!Array.isArray(payload)");
    expect(workflow).toContain("elapsedMs");
    expect(workflow).toContain("Public read-only probe passed");
    expect(workflow).toContain("Public read-only probe failed");
  });

  it("cannot reach authenticated, metered, or repository-controlled production paths", () => {
    expect(workflow).not.toMatch(
      /secrets\.|SUPABASE_|VITE_SUPABASE_|E2E_|\/auth\/|ai-quota-status/i,
    );
    expect(workflow).not.toMatch(
      /\b(?:POST|PUT|PATCH|DELETE)\b|npm\s+(?:run|exec)|\bnpx\b|playwright/i,
    );
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("Run role and tier matrix smoke");
    expect(workflow).not.toContain("Run non-consuming AI quota smoke");
  });

  it("runs the embedded program in module mode", () => {
    expect(workflow).toContain("node --input-type=module <<'NODE'");
  });

  it.each([
    {
      firstFailure: { status: 503 },
      name: "an HTTP 5xx response",
    },
    {
      firstFailure: { throws: new Error("connection reset") },
      name: "a transport failure",
    },
  ])("retries $name and accepts the next valid response", async ({ firstFailure }) => {
    const execution = runEmbeddedSmoke([
      {},
      firstFailure,
      { payload: { data: [] } },
      ...successfulRemainingProbes,
    ]);

    await expect(execution.run).resolves.toBeUndefined();
    expect(
      execution.calls.filter((path) => path.startsWith("/api/public/listings")),
    ).toHaveLength(2);
  });

  it.each([
    {
      firstFailure: { status: 400 },
      name: "an HTTP 4xx response",
    },
    {
      firstFailure: { payload: { error: "upstream application error" } },
      name: "an application error payload",
    },
    {
      firstFailure: { payload: { data: "not-an-array" } },
      name: "a response shape mismatch",
    },
    {
      firstFailure: { jsonThrows: new SyntaxError("invalid JSON") },
      name: "an invalid JSON body",
    },
    {
      firstFailure: { elapsedMs: 3_501, payload: { data: [] } },
      name: "a response over the latency ceiling",
    },
  ])("treats $name as terminal even if the next response would pass", async ({ firstFailure }) => {
    const execution = runEmbeddedSmoke([
      {},
      firstFailure,
      { payload: { data: [] } },
      ...successfulRemainingProbes,
    ]);

    await expect(execution.run).rejects.toThrow("Public read-only probe failed");
    expect(
      execution.calls.filter((path) => path.startsWith("/api/public/listings")),
    ).toHaveLength(1);
  });
});
