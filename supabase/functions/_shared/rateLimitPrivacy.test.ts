import { strict as assert } from "node:assert";
import { makeDbRateLimiter } from "./rateLimit.ts";

const key = "SYNTHETIC_PRIVATE_IP_192.0.2.8";
const bucket = "SYNTHETIC_DYNAMIC_BUCKET_DETAIL";
const rpcDetail = "SYNTHETIC_RPC_PRIVATE_DETAIL";
const transportDetail = "SYNTHETIC_TRANSPORT_PRIVATE_DETAIL";

Deno.test({
  name: "real SDK limiter logs only fixed diagnostics and preserves failure policy",
  sanitizeOps: true,
  sanitizeResources: true,
  fn: async () => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const logs: string[] = [];
    const rpcCalls: unknown[] = [];
    let mode: "rpc_error" | "exception" | "allowed" | "limited" = "rpc_error";
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      assert.equal(url.origin, "https://synthetic.supabase.test");
      assert.equal(url.pathname, "/rest/v1/rpc/check_and_increment_rate_limit");
      assert.equal(url.search, "");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("apikey"), "synthetic-service-key");
      const args = await request.json();
      assert.deepEqual(args, {
        p_bucket: `${bucket}:${key}`,
        p_window_seconds: 60,
        p_limit: 2,
      });
      rpcCalls.push(args);
      if (mode === "exception") throw new Error(transportDetail);
      if (mode === "rpc_error") {
        return Response.json({
          message: rpcDetail,
          details: "SYNTHETIC_RPC_DETAILS",
          hint: "SYNTHETIC_RPC_HINT",
          code: "P0001",
        }, { status: 500 });
      }
      return Response.json({
        allowed: mode === "allowed",
        count: mode === "allowed" ? 1 : 3,
        limit: 2,
        window_start: "2026-10-19T00:00:00Z",
        reset_in_seconds: 30,
      });
    };

    const make = (failClosed: boolean) => makeDbRateLimiter({
      bucket,
      maxRequests: 2,
      windowMs: 60_000,
      supabaseUrl: "https://synthetic.supabase.test",
      serviceRoleKey: "synthetic-service-key",
      failClosed,
    });

    try {
      mode = "rpc_error";
      assert.equal(await make(false).isLimited(key), false);
      assert.equal(await make(true).isLimited(key), true);
      mode = "exception";
      assert.equal(await make(false).isLimited(key), false);
      assert.equal(await make(true).isLimited(key), true);
      assert.equal((await make(false).status(key)).remaining, 2);
      assert.equal((await make(true).status(key)).remaining, 0);
      const invalidConfig = (failClosed: boolean) => makeDbRateLimiter({
        bucket,
        maxRequests: 2,
        windowMs: 60_000,
        supabaseUrl: "SYNTHETIC_INVALID_CONFIG_URL",
        serviceRoleKey: "synthetic-service-key",
        failClosed,
      });
      assert.equal(await invalidConfig(false).isLimited(key), false);
      assert.equal(await invalidConfig(true).isLimited(key), true);
      mode = "allowed";
      assert.equal(await make(false).isLimited(key), false);
      mode = "limited";
      assert.equal(await make(false).isLimited(key), true);
      assert.equal(rpcCalls.length, 8);

      assert.deepEqual(logs.map((line) => JSON.parse(line)), [
        { level: "error", event: "rate_limit_fail_open", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_closed", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_open", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_closed", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_open", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_closed", category: "rpc_error", alert: true },
        { level: "error", event: "rate_limit_fail_open", category: "exception", alert: true },
        { level: "error", event: "rate_limit_fail_closed", category: "exception", alert: true },
      ]);
      for (const secret of [key, bucket, rpcDetail, transportDetail, "SYNTHETIC_RPC_DETAILS", "SYNTHETIC_RPC_HINT", "SYNTHETIC_INVALID_CONFIG_URL"]) {
        assert.equal(logs.join("\n").includes(secret), false);
      }
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  },
});
