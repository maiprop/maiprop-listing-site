/**
 * Tests for send-saved-search-alerts edge function (cron).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    CRON_SECRET: "correct-cron-secret",
  },
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing cron secret returns 401", async () => {
  const res = await handler(req("POST", {}));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.ok, false);
});

Deno.test("wrong cron secret returns 401", async () => {
  const res = await handler(
    req("POST", {}, { authorization: "Bearer wrong-secret" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("correct cron secret returns an empty batch without provider work", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    if (url.pathname !== "/rest/v1/saved_searches") {
      throw new Error("Unexpected fake transport");
    }
    return new Response("[]", {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const res = await handler(
      req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
    );
    assertEquals(res.status, 200);
    assertEquals((await res.json()).processed, 0);
    assertEquals(calls, ["/rest/v1/saved_searches"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();

async function savedScenario(
  options: {
    missing?: boolean;
    ids?: string[] | null;
    failure?: string;
    provider?: string;
    concurrent?: string;
  } = {},
) {
  const oldFetch = globalThis.fetch;
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    name: "Synthetic",
    filters: { city: "Athens" },
    email_alerts: true,
    last_alert_listing_ids: options.ids === undefined ? [] : options.ids,
  };
  const listingId = "33333333-3333-4333-8333-333333333333";
  let sends = 0, writes = 0;
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch =
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ??
        (input instanceof Request ? input.method : "GET");
      if (url.hostname === "api.brevo.com") {
        sends++;
        if (options.concurrent === "filters") row.filters.city = "Patras";
        if (options.concurrent === "consent") row.email_alerts = false;
        if (options.concurrent === "ids") {
          row.last_alert_listing_ids = [listingId];
        }
        if (options.provider === "timeout") {
          throw new DOMException("Timed out", "TimeoutError");
        }
        return options.provider === "reject"
          ? json({ secret: "provider-private" }, 400)
          : new Response("", { status: 201 });
      }
      if (url.pathname === "/rest/v1/saved_searches" && method === "GET") {
        return options.failure === "search"
          ? json({ message: "private-db" }, 500)
          : json([structuredClone(row)]);
      }
      if (url.pathname === "/rest/v1/listings") {
        return options.failure === "list"
          ? json({ message: "private-db" }, 500)
          : json([{
            id: listingId,
            title: "Fixture",
            city: "Athens",
            price: 100,
          }]);
      }
      if (url.pathname.startsWith("/auth/v1/admin/users/")) {
        return options.failure === "auth"
          ? json({ message: "private-auth" }, 500)
          : json({ id: row.user_id, email: "recipient@example.test" });
      }
      if (url.pathname === "/rest/v1/saved_searches" && method === "PATCH") {
        writes++;
        if (options.failure === "update") {
          return json({ message: "private-db" }, 500);
        }
        const params = url.searchParams;
        assertEquals(params.get("id"), `eq.${row.id}`);
        assertEquals(params.get("user_id"), `eq.${row.user_id}`);
        assertEquals(params.get("select"), "id");
        const matches =
          (!params.has("filters") || params.get("filters") === `eq.${JSON.stringify(row.filters)}`) &&
          (!params.has("email_alerts") || params.get("email_alerts") === `eq.${row.email_alerts}`) &&
          (!params.has("last_alert_listing_ids") || params.get("last_alert_listing_ids") ===
            (row.last_alert_listing_ids === null
              ? "is.null"
              : `eq.{${row.last_alert_listing_ids.join(",")}}`));
        if (!matches || options.failure === "deleted") return json([]);
        Object.assign(row, JSON.parse(String(init?.body)));
        return json([{ id: row.id }]);
      }
      throw new Error(`Unexpected fake transport ${method} ${url.pathname}`);
    }) as typeof fetch;
  Deno.env.set("BREVO_API_KEY", "placeholder");
  try {
    if (options.missing) {
      Deno.env.delete("BREVO_API_KEY");
      const unauthorized = await handler(req("POST", {}));
      assertEquals(unauthorized.status, 401);
      const unavailable = await handler(
        req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
      );
      assertEquals(unavailable.status, 503);
      assertEquals(writes, 0);
      assertEquals(sends, 0);
      assertEquals(row.last_alert_listing_ids, []);
      Deno.env.set("BREVO_API_KEY", "placeholder");
    }
    const response = await handler(
      req("POST", {}, { authorization: "Bearer correct-cron-secret" }),
    );
    return { response, body: await response.json(), row, sends, writes };
  } finally {
    globalThis.fetch = oldFetch;
    Deno.env.set("BREVO_API_KEY", "placeholder-brevo");
  }
}

Deno.test("missing sender cannot suppress the same match after configuration", async () => {
  const result = await savedScenario({ missing: true });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 1);
  assertEquals(result.writes, 1);
  assertEquals(result.body.emailsSent, 1);
  assertEquals(result.body.checkpointsPersisted, 1);
});
for (const ids of [null, []]) {
  Deno.test(`saved alert preserves exact original ${JSON.stringify(ids)} checkpoint`, async () => {
    const result = await savedScenario({ ids });
    assertEquals(result.response.status, 200);
    assertEquals(result.row.last_alert_listing_ids?.length, 1);
  });
}
for (const failure of ["search", "list", "auth", "update", "deleted"]) {
  Deno.test(`saved alert reports ${failure} failure without false completion`, async () => {
    const result = await savedScenario({ failure });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.ok, false);
    assertEquals(JSON.stringify(result.body).includes("private"), false);
    assertEquals(result.sends, ["update", "deleted"].includes(failure) ? 1 : 0);
    assertEquals(result.row.last_alert_listing_ids, []);
    if (result.sends) {
      assertEquals(result.body.provider_accepted, true);
      assertEquals(result.body.persistence_complete, false);
    }
  });
}
for (const concurrent of ["filters", "consent", "ids"]) {
  Deno.test(`saved alert does not overwrite concurrent ${concurrent}`, async () => {
    const result = await savedScenario({ concurrent });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.persistence_complete, false);
    assertEquals(result.sends, 1);
    if (concurrent === "filters") {
      assertEquals(result.row.filters.city, "Patras");
    }
    if (concurrent === "consent") assertEquals(result.row.email_alerts, false);
  });
}
for (const provider of ["reject", "timeout"]) {
  Deno.test(`saved alert ${provider} does not advance checkpoint`, async () => {
    const result = await savedScenario({ provider });
    assertEquals(result.response.status, 503);
    assertEquals(result.body.ok, false);
    assertEquals(result.writes, 0);
    assertEquals(result.sends, 1);
    assertEquals(
      result.body[provider === "reject" ? "sendsRejected" : "sendsUnknown"],
      1,
    );
  });
}

Deno.test('already checkpointed saved match does not send or write again', async () => {
  const result = await savedScenario({ ids: ['33333333-3333-4333-8333-333333333333'] });
  assertEquals(result.response.status, 200);
  assertEquals(result.sends, 0);
  assertEquals(result.writes, 0);
  assertEquals(result.body.emailsSent, 0);
});
