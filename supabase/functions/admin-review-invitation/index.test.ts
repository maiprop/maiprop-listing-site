import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

type MockScenario = {
  calls: Array<{ name: string; args?: unknown }>;
  rpcData?: Record<string, unknown>;
  rpcError?: string;
};

declare global {
  // deno-lint-ignore no-var
  var __adminReviewInvitationScenario: MockScenario;
}

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

const resetScenario = (overrides: Partial<MockScenario> = {}) => {
  globalThis.__adminReviewInvitationScenario = { calls: [], ...overrides };
};

const authedJson = (body: unknown) =>
  req("POST", body, { authorization: `Bearer ${crypto.randomUUID()}` });

const requestId = "00000000-0000-4000-8000-000000000000";

Deno.test("OPTIONS preflight returns 200", async () => {
  resetScenario();
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET does not review invitations", async () => {
  resetScenario();
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("missing Authorization returns 401", async () => {
  resetScenario();
  const res = await handler(req("POST", {
    requestId,
    decision: "approved",
    tier: "private",
  }));
  assertEquals(res.status, 401);
});

Deno.test("approved invite forwards review to RPC without activation flag", async () => {
  resetScenario({
    rpcData: {
      request_id: requestId,
      status: "approved",
      tier: "institutional",
      granted_role: "institutional",
      subscription_status: "pending_payment",
    },
  });

  const res = await handler(authedJson({
    requestId,
    decision: "approved",
    tier: "institutional",
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.result.subscription_status, "pending_payment");
  const rpcCall = globalThis.__adminReviewInvitationScenario.calls.find((call) => call.name === "rpc");
  assertEquals(rpcCall?.args, {
    name: "admin_review_invitation_request",
    args: {
      p_admin_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_request_id: requestId,
      p_decision: "approved",
      p_tier: "institutional",
      p_rejection_reason: null,
    },
  });
});

Deno.test("rejected invite forwards rejection reason with null tier and no payment activation", async () => {
  resetScenario({
    rpcData: {
      request_id: requestId,
      status: "rejected",
      tier: null,
      granted_role: null,
      subscription_status: null,
    },
  });

  const res = await handler(authedJson({
    requestId,
    decision: "rejected",
    rejectionReason: "Documents did not match",
  }));
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.result.status, "rejected");
  assertEquals(body.result.subscription_status, null);
  const rpcCall = globalThis.__adminReviewInvitationScenario.calls.find((call) => call.name === "rpc");
  assertEquals(rpcCall?.args, {
    name: "admin_review_invitation_request",
    args: {
      p_admin_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_request_id: requestId,
      p_decision: "rejected",
      p_tier: null,
      p_rejection_reason: "Documents did not match",
    },
  });
});

Deno.test("invalid approval tier is rejected before RPC", async () => {
  resetScenario();
  const res = await handler(authedJson({
    requestId,
    decision: "approved",
    tier: "investor",
  }));

  assertEquals(res.status, 400);
  assert(!globalThis.__adminReviewInvitationScenario.calls.some((call) => call.name === "rpc"));
});

restore();
