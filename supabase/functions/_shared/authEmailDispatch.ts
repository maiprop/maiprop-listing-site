// Auth hook admission only. No email content or recipient is sent to the ledger.
export type AuthEmailSlot =
  | "signup" | "invite" | "magiclink" | "recovery" | "reauthentication"
  | "email_change_current" | "email_change_new";

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

function decision(value: unknown, id: string, slot: AuthEmailSlot): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  return result.webhook_id === id && result.slot === slot && typeof result.decision === "string"
    ? result : null;
}

async function rpc(client: RpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.rpc(name, args);
  if (!result || result.error) throw new Error("auth_email_rpc_failed");
  return result.data;
}

export async function dispatchAuthEmail(
  client: RpcClient,
  webhookId: string,
  slot: AuthEmailSlot,
  send: () => Promise<Response>,
): Promise<boolean> {
  const token = crypto.randomUUID();
  let begin: Record<string, unknown> | null;
  try {
    begin = decision(await rpc(client, "begin_auth_email_dispatch_for_service", {
      p_webhook_id: webhookId, p_slot: slot, p_attempt_token: token,
    }), webhookId, slot);
  } catch {
    return false; // A committed insert with a lost response must not authorize a send.
  }
  if (!begin) return false;
  if (begin.decision === "replay_accepted") return begin.state === "accepted";
  if (begin.decision !== "send" || begin.state !== "sending" || begin.attempt_token !== token) return false;

  let outcome: "accepted" | "unknown" = "unknown";
  let status: number | null = null;
  let code: "accepted_2xx" | "http_unconfirmed" | "transport_unknown" = "transport_unknown";
  try {
    const response = await send();
    status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? response.status : null;
    if (status !== null && status >= 200 && status <= 299) {
      outcome = "accepted";
      code = "accepted_2xx";
    } else {
      code = "http_unconfirmed";
    }
  } catch {
    // No response proves whether the provider accepted the request.
  }

  const args = {
    p_webhook_id: webhookId,
    p_slot: slot,
    p_attempt_token: token,
    p_outcome: outcome,
    p_http_status: status,
    p_result_code: code,
  };
  // Exact same-result checkpoint is idempotent. Never repeat the provider call.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const recorded = decision(await rpc(client, "record_auth_email_dispatch_result_for_service", args), webhookId, slot);
      if (recorded?.decision === "recorded" && recorded.attempt_token === token && recorded.state === outcome) {
        return outcome === "accepted";
      }
    } catch { /* One same-result checkpoint retry is allowed. */ }
  }
  return false;
}
