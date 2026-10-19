import { strict as assert } from "node:assert";

Deno.env.set("RATE_LIMIT_FORCE_MEMORY", "true");
Deno.env.set("SUPABASE_URL", "https://synthetic.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
Deno.env.set("BREVO_API_KEY", "synthetic-brevo");
Deno.env.set("BREVO_FROM_EMAIL", "sender@example.test");

const privateDetail = "SYNTHETIC_PROVIDER_PRIVATE_DETAIL";
const schemaDetail = "SYNTHETIC_SCHEMA_PRIVATE_DETAIL";
const adminId = "d1240001-0000-4000-8000-000000000001";

Deno.test({
  name: "invitation errors disclose no provider, schema, or config detail",
  sanitizeOps: true,
  sanitizeResources: true,
  fn: async () => {
    let handler!: (request: Request) => Promise<Response>;
    const originalServe = Deno.serve;
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const originalInterval = globalThis.setInterval;
    const timers: number[] = [];
    const logs: string[] = [];
    let mode: "success" | "provider" | "transport" | "nonadmin" = "success";
    let attempts = 0;
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
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === "https://synthetic.supabase.test" && url.pathname === "/auth/v1/user" && request.method === "GET" && url.search === "") {
        assert.equal(request.headers.get("authorization"), "Bearer synthetic-admin-token");
        return Response.json({ id: adminId, email: "admin@example.test" });
      }
      if (url.origin === "https://synthetic.supabase.test" && url.pathname === "/rest/v1/profiles" && request.method === "GET") {
        assert.equal(url.searchParams.get("select"), "role,is_platform_admin");
        assert.equal(url.searchParams.get("user_id"), `eq.${adminId}`);
        assert.equal([...url.searchParams].length, 2);
        return Response.json({ role: mode === "nonadmin" ? "buyer" : "admin", is_platform_admin: false });
      }
      if (request.url === "https://api.brevo.com/v3/smtp/email" && request.method === "POST") {
        attempts++;
        assert.equal(request.headers.get("api-key"), "synthetic-brevo");
        const body = await request.json();
        assert.deepEqual(body.to, [{ email: "recipient@example.test" }]);
        assert.equal(body.sender.email, "sender@example.test");
        assert.equal(body.headers["X-MaiProp-Template"], "deal_flow_invitation_status");
        assert.deepEqual(body.tags, ["deal_flow_invitation_status"]);
        if (mode === "provider") return new Response(privateDetail, { status: 503 });
        if (mode === "transport") throw new Error("SYNTHETIC_TRANSPORT_PRIVATE_DETAIL");
        return Response.json({ messageId: "synthetic-accepted" }, { status: 201 });
      }
      throw new Error(`DENIED_FAKE_FETCH ${request.method} ${url.origin}${url.pathname}`);
    };

    const invoke = async (body: string, ip: string) => {
      const response = await handler(new Request("https://synthetic.local/invitation-notify", {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic-admin-token",
          "content-type": "application/json",
          origin: "http://localhost:5173",
          "x-forwarded-for": ip,
        },
        body,
      }));
      assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
      return { status: response.status, body: await response.json() };
    };
    const valid = JSON.stringify({ type: "approved", email: "recipient@example.test", full_name: "Pat Example", tier: "institutional" });

    try {
      mode = "provider";
      const provider = await invoke(valid, "192.0.2.11");
      assert.equal(provider.status, 500);
      assert.deepEqual(provider.body, { error: "Invitation notification failed", code: "notification_failed" });
      assert.equal(attempts, 1);
      assert.equal(JSON.stringify(provider.body).includes(privateDetail), false);
      assert.equal(logs.join("\n").includes(privateDetail), false);

      mode = "transport";
      const transport = await invoke(valid, "192.0.2.12");
      assert.equal(transport.status, 500);
      assert.deepEqual(transport.body, provider.body);
      assert.equal(logs.join("\n").includes("SYNTHETIC_TRANSPORT_PRIVATE_DETAIL"), false);

      const invalid = await invoke(JSON.stringify({ type: "approved", email: schemaDetail }), "192.0.2.13");
      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body, { error: "Invalid request body", code: "validation_error" });
      assert.equal(JSON.stringify(invalid.body).includes(schemaDetail), false);

      const malformed = await invoke("{", "192.0.2.14");
      assert.equal(malformed.status, 400);
      assert.deepEqual(malformed.body, { error: "Invalid JSON body", code: "invalid_json" });

      mode = "nonadmin";
      const beforeNonadmin = attempts;
      const nonadmin = await invoke(valid, "192.0.2.15");
      assert.equal(nonadmin.status, 403);
      assert.equal(attempts, beforeNonadmin);

      mode = "success";
      const approved = await invoke(valid, "192.0.2.16");
      assert.equal(approved.status, 200);
      assert.deepEqual(approved.body, { success: true });
      const rejected = await invoke(JSON.stringify({ type: "rejected", email: "recipient@example.test", rejection_reason: "Synthetic reason" }), "192.0.2.17");
      assert.equal(rejected.status, 200);
      assert.deepEqual(rejected.body, { success: true });
      assert.equal(attempts, 4);
      Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
      try {
        const configuration = await invoke(valid, "192.0.2.18");
        assert.equal(configuration.status, 500);
        assert.deepEqual(configuration.body, provider.body);
        assert.equal(attempts, 4);
      } finally {
        Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service");
      }
      assert.equal(logs.every((line) => !line.includes(privateDetail) && !line.includes(schemaDetail)), true);
      assert.equal(logs.join("\n").includes("SUPABASE_SERVICE_ROLE_KEY"), false);
      assert.deepEqual(logs.map((line) => {
        const entry = JSON.parse(line);
        return { msg: entry.msg, category: entry.category, status: entry.status, err: entry.err };
      }), [
        { msg: "invitation_notification_failed", category: "delivery", status: 500, err: undefined },
        { msg: "invitation_notification_failed", category: "delivery", status: 500, err: undefined },
        { msg: "invitation_notification_failed", category: "configuration", status: 500, err: undefined },
      ]);
    } finally {
      // The real Auth SDK settles its request-lock timer after response delivery.
      await new Promise((resolve) => setTimeout(resolve, 50));
      globalThis.fetch = originalFetch;
      console.error = originalError;
      globalThis.setInterval = originalInterval;
      for (const timer of timers) clearInterval(timer);
    }
  },
});
