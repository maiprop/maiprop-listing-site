import { strict as assert } from "node:assert";

Deno.env.set("RATE_LIMIT_FORCE_MEMORY", "true");
Deno.env.set("SUPABASE_URL", "https://synthetic.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");

Deno.test({
  name: "invitation notification retains preflight, auth, and body guards with real SDK",
  sanitizeOps: true,
  sanitizeResources: true,
  fn: async () => {
    const originalServe = Deno.serve;
    const originalFetch = globalThis.fetch;
    const originalInterval = globalThis.setInterval;
    const timers: number[] = [];
    let handler!: (request: Request) => Promise<Response>;
    let authCalls = 0;
    let profileCalls = 0;
    let providerCalls = 0;
    let invalidToken = false;
    globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
      const timer = originalInterval(...args);
      timers.push(timer);
      return timer;
    }) as typeof setInterval;
    Deno.serve = ((registered: typeof handler) => {
      handler = registered;
      return {} as Deno.HttpServer;
    }) as typeof Deno.serve;
    try {
      await import("./index.ts");
    } finally {
      Deno.serve = originalServe;
    }
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      await Promise.resolve();
      if (url.origin === "https://synthetic.supabase.test" && url.pathname === "/auth/v1/user" && request.method === "GET" && url.search === "") {
        authCalls++;
        assert.equal(request.headers.get("authorization"), invalidToken ? "Bearer invalid-token" : "Bearer admin-token");
        return invalidToken
          ? Response.json({ message: "invalid token" }, { status: 401 })
          : Response.json({ id: "d1240001-0000-4000-8000-000000000001", email: "admin@example.test" });
      }
      if (url.origin === "https://synthetic.supabase.test" && url.pathname === "/rest/v1/profiles" && request.method === "GET") {
        profileCalls++;
        assert.equal(url.searchParams.get("select"), "role,is_platform_admin");
        assert.equal(url.searchParams.get("user_id"), "eq.d1240001-0000-4000-8000-000000000001");
        assert.equal([...url.searchParams].length, 2);
        return Response.json({ role: "admin", is_platform_admin: false });
      }
      if (request.url === "https://api.brevo.com/v3/smtp/email") {
        providerCalls++;
        throw new Error("Guard test must not reach provider");
      }
      throw new Error(`DENIED_FAKE_FETCH ${request.method} ${url.origin}${url.pathname}`);
    };

    const invoke = async (method: string, body?: string, token?: string) => {
      const response = await handler(new Request("https://synthetic.local/invitation-notify", {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-forwarded-for": crypto.randomUUID(),
        },
        ...(body === undefined ? {} : { body }),
      }));
      assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
      const text = await response.text();
      return { status: response.status, body: text === "ok" ? text : JSON.parse(text) };
    };

    try {
      const preflight = await invoke("OPTIONS");
      assert.equal(preflight.status, 200);
      const missing = await invoke("POST", "{}");
      assert.equal(missing.status, 401);
      assert.deepEqual(missing.body, { error: "Unauthorized" });
      assert.equal(authCalls, 0);

      invalidToken = true;
      const badToken = await invoke("POST", "{}", "invalid-token");
      assert.equal(badToken.status, 401);
      assert.deepEqual(badToken.body, { error: "Unauthorized" });
      assert.equal(authCalls, 1);
      assert.equal(profileCalls, 0);

      invalidToken = false;
      const malformed = await invoke("POST", "{", "admin-token");
      assert.equal(malformed.status, 400);
      assert.deepEqual(malformed.body, { error: "Invalid JSON body", code: "invalid_json" });
      assert.equal(authCalls, 2);
      assert.equal(profileCalls, 1);

      const invalid = await invoke("POST", JSON.stringify({ invitation_id: "inv_123" }), "admin-token");
      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body, { error: "Invalid request body", code: "validation_error" });
      assert.equal(authCalls, 3);
      assert.equal(profileCalls, 2);
      assert.equal(providerCalls, 0);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 50));
      globalThis.fetch = originalFetch;
      globalThis.setInterval = originalInterval;
      for (const timer of timers) clearInterval(timer);
    }
  },
});
