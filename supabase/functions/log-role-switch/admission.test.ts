import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";
const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);
Deno.test("strict valid HTTP request stops at closed DB admission before all provider work", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push(url);
    const json = (body: unknown, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    if (url.includes("/auth/v1/user")) {
      return json({
        user: {
          id: "7c010000-0000-4000-8000-000000000001",
          email: "actor@example.test",
        },
      });
    }
    if (url.includes("/rest/v1/profiles?")) {
      return json({
        role: "buyer",
        participant_type: "buyer",
        role_switch_in_progress_at: null,
        role_switch_audit_id: null,
      });
    }
    if (url.includes("/rest/v1/pricing_configs?")) {
      return json([{ key: "pro", amount: 20 }]);
    }
    if (url.endsWith("/rpc/record_role_switch_audit_for_user")) {
      return json(
        { code: "P0001", message: "role_switch_enrollment_closed" },
        400,
      );
    }
    throw new Error("unexpected provider or database request: " + url);
  }) as typeof fetch;
  try {
    const response = await handler(
      req("POST", {
        operation_id: "7c020000-0000-4000-8000-000000000001",
        from_type: "buyer",
        to_type: "seller",
        cancel_subscription: true,
      }, {
        authorization: `Bearer ${crypto.randomUUID()}`,
        "x-forwarded-for": crypto.randomUUID(),
      }),
    );
    assertEquals(response.status, 503);
    assertEquals(await response.json(), {
      error: "Role switch audit unavailable",
    });
    assertEquals(
      requests.filter((url) =>
        url.includes("record_role_switch_audit_for_user")
      ).length,
      1,
    );
    assertEquals(
      requests.filter((url) => !url.startsWith("https://test.supabase.co/"))
        .length,
      0,
    );
  } finally {
    globalThis.fetch = original;
  }
});
restore();
Deno.test("durable customer HTTP lookup binds verified actor and test/live mode and excludes a foreign owner", async () => {
  const original = globalThis.fetch;
  const actor = "7c010000-0000-4000-8000-000000000001";
  const operation = "7c020000-0000-4000-8000-000000000001";
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", "acct_task7c");
  try {
    for (const mode of ["test", "live", "foreign"] as const) {
      const runtime = mode === "live" ? "live" : "test";
      Deno.env.set("STRIPE_SECRET_KEY", `sk_${runtime}_task7c${mode}`);
      Deno.env.set("STRIPE_RUNTIME_MODE", runtime);
      Deno.env.set("STRIPE_LIVE_MODE", runtime === "live" ? "true" : "false");
      const retrieved: string[] = [];
      const lookup: URL[] = [];
      globalThis.fetch = ((input: string | URL | Request) => {
        const url = new URL(
          String(input instanceof Request ? input.url : input),
        );
        const json = (body: unknown) =>
          Promise.resolve(
            new Response(JSON.stringify(body), {
              headers: { "content-type": "application/json" },
            }),
          );
        if (url.pathname === "/auth/v1/user") {
          return json({ user: { id: actor, email: "actor@example.test" } });
        }
        if (url.pathname === "/rest/v1/profiles") {
          return json({
            role: "buyer",
            participant_type: "buyer",
            role_switch_in_progress_at: null,
            role_switch_audit_id: null,
          });
        }
        if (url.pathname === "/rest/v1/pricing_configs") {
          return json([{ key: "pro", amount: 20 }]);
        }
        if (url.pathname.endsWith("/record_role_switch_audit_for_user")) {
          return json(operation);
        }
        if (url.pathname === "/rest/v1/role_switch_history") {
          return json({
            billing_outcome: "pending",
            billing_reconciliation_required: true,
            billing_subscription_count: null,
            billing_cancelled_count: null,
            had_active_sub: null,
            sub_cancelled: false,
          });
        }
        if (url.pathname.endsWith("/finalize_role_switch_audit_for_user")) {
          return json(null);
        }
        if (url.pathname === "/rest/v1/billing_customers") {
          lookup.push(url);
          const fixtures = [
            {
              user_id: mode === "foreign" ? "other-actor" : actor,
              runtime_mode: "test",
              livemode: false,
              stripe_customer_id: "cus_test_owned",
            },
            {
              user_id: mode === "foreign" ? "other-actor" : actor,
              runtime_mode: "live",
              livemode: true,
              stripe_customer_id: "cus_live_owned",
            },
          ];
          return json(
            fixtures.filter((row) =>
              url.searchParams.get("user_id") === `eq.${row.user_id}` &&
              url.searchParams.get("runtime_mode") ===
                `eq.${row.runtime_mode}` &&
              url.searchParams.get("livemode") === `eq.${row.livemode}`
            ),
          );
        }
        if (url.pathname === "/v1/account") return json({ id: "acct_task7c" });
        if (url.pathname === "/v1/balance") {
          return json({ livemode: runtime === "live" });
        }
        if (url.pathname === "/v1/customers/search") return json({ data: [] });
        if (url.pathname.startsWith("/v1/customers/")) {
          retrieved.push(url.pathname);
          return json({ id: url.pathname.split("/").at(-1) });
        }
        if (url.pathname === "/v1/subscriptions") {
          return json({ data: [], has_more: false });
        }
        throw new Error("unexpected provider mutation: " + url);
      }) as typeof fetch;
      const response = await handler(
        req("POST", {
          operation_id: operation,
          from_type: "buyer",
          to_type: "seller",
          cancel_subscription: true,
        }, {
          authorization: `Bearer ${crypto.randomUUID()}`,
          "x-forwarded-for": crypto.randomUUID(),
        }),
      );
      assertEquals(
        response.status,
        200,
        JSON.stringify(await response.clone().json()),
      );
      assertEquals(lookup.length, 1);
      assertEquals(lookup[0].searchParams.get("user_id"), `eq.${actor}`);
      assertEquals(lookup[0].searchParams.get("runtime_mode"), `eq.${runtime}`);
      assertEquals(
        lookup[0].searchParams.get("livemode"),
        `eq.${runtime === "live"}`,
      );
      assertEquals(
        retrieved,
        mode === "foreign" ? [] : [`/v1/customers/cus_${runtime}_owned`],
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
