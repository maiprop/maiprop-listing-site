import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AuthError } from "./auth.ts";
import { verifiedGatewayUserFromJwt } from "./gatewayJwt.ts";

const encode = (value: Record<string, unknown>) =>
  btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");

const requestFor = (claims: Record<string, unknown>) =>
  new Request("https://example.test", {
    headers: { Authorization: `Bearer header.${encode(claims)}.signature` },
  });

Deno.test("verified gateway JWT returns an authenticated, unexpired identity", () => {
  const user = verifiedGatewayUserFromJwt(
    requestFor({
      sub: "00000000-0000-4000-8000-000000000001",
      role: "authenticated",
      email: "user@example.com",
      exp: 2_000,
    }),
    1_000,
  );

  assertEquals(user, {
    id: "00000000-0000-4000-8000-000000000001",
    email: "user@example.com",
  });
});

Deno.test("verified gateway JWT rejects expired or non-user claims", async () => {
  for (const claims of [
    {
      sub: "00000000-0000-4000-8000-000000000001",
      role: "authenticated",
      exp: 999,
    },
    {
      sub: "00000000-0000-4000-8000-000000000001",
      role: "anon",
      exp: 2_000,
    },
    { sub: "not-a-uuid", role: "authenticated", exp: 2_000 },
  ]) {
    await assertRejects(
      async () => {
        verifiedGatewayUserFromJwt(requestFor(claims), 1_000);
      },
      AuthError,
    );
  }
});
