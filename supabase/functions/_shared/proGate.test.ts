import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hasResolvedProAccess,
  requireProSubscription,
} from "./proGate.ts";

Deno.test("resolved Pro access is audience-scoped and durable-state backed", () => {
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "developer",
      requiredAudience: "developer",
      state: {
        subscribed: true,
        audience: "developer",
        source: "billing_state",
      },
    }),
    true,
  );
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "agent",
      requiredAudience: "developer",
      state: {
        subscribed: true,
        audience: "agent",
        source: "billing_state",
      },
    }),
    false,
  );
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "developer",
      requiredAudience: "developer",
      state: {
        subscribed: true,
        audience: "participant",
        source: "billing_state",
      },
    }),
    false,
  );
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "developer",
      requiredAudience: "developer",
      state: {
        subscribed: false,
        audience: "developer",
        source: "database",
      },
    }),
    false,
  );
});

Deno.test("legacy investor resolver responses remain restricted to investor audiences", () => {
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "investor",
      requiredAudience: ["investor", "institutional"],
      state: { subscribed: true, source: "investor" },
    }),
    true,
  );
  assertEquals(
    hasResolvedProAccess({
      profileAudience: "developer",
      requiredAudience: "developer",
      state: { subscribed: true, source: "investor" },
    }),
    false,
  );
});

Deno.test("requireProSubscription fails closed when service config is unavailable", async () => {
  const originalUrl = Deno.env.get("SUPABASE_URL");
  const originalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

    const result = await requireProSubscription("user_123", {
      "Access-Control-Allow-Origin": "https://portal.maiprop.co",
    });

    assertEquals(result.allowed, false);
    assertEquals(result.errorResponse?.status, 503);
  } finally {
    if (originalUrl) Deno.env.set("SUPABASE_URL", originalUrl);
    if (originalKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalKey);
  }
});
