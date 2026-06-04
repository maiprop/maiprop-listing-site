/* global Deno:readonly */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getPlanCap, hasPortalProAccess } from "./entitlements.ts";

function makeEntitlementClient(
  profile: Record<string, unknown>,
  pricingRow: Record<string, unknown> | null = null,
  rpcProAccess: boolean | null = null,
) {
  return {
    auth: {
      getUser(token: string) {
        return Promise.resolve(
          token === "valid-token"
            ? { data: { user: { id: "user-1" } }, error: null }
            : { data: { user: null }, error: { message: "invalid" } },
        );
      },
    },
    rpc() {
      return Promise.resolve(
        rpcProAccess == null
          ? { data: null, error: { message: "rpc unavailable" } }
          : { data: rpcProAccess, error: null },
      );
    },
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        limit() {
          return this;
        },
        single() {
          if (table === "profiles") return Promise.resolve({ data: profile });
          return Promise.resolve({ data: null });
        },
        maybeSingle() {
          if (table === "pricing_configs") {
            return Promise.resolve({ data: pricingRow });
          }
          return Promise.resolve({ data: null });
        },
      };
    },
  };
}

Deno.test("auction entitlement uses canonical Pro RPC for paid portal caps", async () => {
  const client = makeEntitlementClient(
    {
      role: "seller",
      participant_type: "seller",
      subscription_product_id: "prod_participant",
      force_pro_access: false,
    },
    null,
    true,
  );

  assertEquals(await hasPortalProAccess(client as never, "user-pro"), true);
  assertEquals(
    await getPlanCap(
      new Request("https://functions.supabase.co/fetch-os-auctions", {
        headers: { authorization: "Bearer valid-token" },
      }),
      client as never,
    ),
    600,
  );
});

Deno.test("auction entitlement rejects non-investor Stripe products without canonical Pro", async () => {
  const client = makeEntitlementClient({
    role: "agent",
    participant_type: "agent",
    subscription_product_id: "prod_agent",
    force_pro_access: false,
  });

  assertEquals(await hasPortalProAccess(client as never, "user-agent"), false);
  assertEquals(
    await getPlanCap(
      new Request("https://functions.supabase.co/fetch-os-auctions", {
        headers: { authorization: "Bearer valid-token" },
      }),
      client as never,
    ),
    60,
  );
});
