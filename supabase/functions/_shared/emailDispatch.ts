// Admission for the two selected automatic emails. The database owns identity,
// frozen content, and the durable send decision; this module never retries a send.
type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type EmailPayload = {
  sender: { name: string; email: string };
  to: [{ email: string; name?: string }];
  subject: string;
  htmlContent: string;
};

type Decision = Record<string, unknown> & { decision: string };
export type EmailResult = {
  outcome: "applied" | "held" | "rejected";
  providerAccepted: boolean | null;
  acceptedNow: boolean;
  persistenceComplete: boolean;
  emailId: string | null;
  reason?: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function rpc(
  client: RpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}_failed`);
  return data;
}

function decision(value: unknown): Decision {
  if (
    !value || typeof value !== "object" ||
    typeof (value as Decision).decision !== "string"
  ) {
    throw new Error("email_dispatch_invalid_decision");
  }
  return value as Decision;
}

function safeDecisionReason(value: string): string {
  return [
      "applied",
      "already_applied",
      "conflict",
      "expired",
      "busy",
      "unknown",
      "replay_accepted",
    ].includes(value)
    ? value
    : "invalid_decision";
}

export function operationId(value: unknown): string | null {
  const id = decision(value).operation_id;
  return typeof id === "string" && UUID.test(id) ? id : null;
}

export function validPayload(value: unknown): value is EmailPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join(",") !== "htmlContent,sender,subject,to") {
    return false;
  }
  const sender = p.sender as Record<string, unknown> | null;
  const to = p.to as unknown[] | null;
  const recipient = Array.isArray(to)
    ? to[0] as Record<string, unknown> | undefined
    : undefined;
  return !!sender && typeof sender.name === "string" && !!sender.name &&
    typeof sender.email === "string" && !!sender.email && Array.isArray(to) &&
    to.length === 1 &&
    !!recipient && typeof recipient.email === "string" && !!recipient.email &&
    (recipient.name === undefined || typeof recipient.name === "string") &&
    typeof p.subject === "string" && !!p.subject &&
    typeof p.htmlContent === "string" && !!p.htmlContent;
}

export async function lookupEmailOperation(
  client: RpcClient,
  producer: "marketing_followup" | "saved_search_alert",
  entityId: string,
  step: number | null = null,
): Promise<Decision> {
  return decision(
    await rpc(client, "get_selected_email_operation_for_service", {
      p_producer: producer,
      p_entity_id: entityId,
      p_step: step,
    }),
  );
}

export async function prepareMarketingEmail(
  client: RpcClient,
  leadId: string,
  step: number,
  dispatchId: string,
  executionToken: string,
  expected: Record<string, unknown>,
  payload: EmailPayload,
): Promise<Decision> {
  return decision(
    await rpc(client, "prepare_marketing_followup_for_service", {
      p_lead_id: leadId,
      p_step: step,
      p_dispatch_id: dispatchId,
      p_execution_token: executionToken,
      p_expected: expected,
      p_payload: payload,
    }),
  );
}

export async function prepareSavedEmail(
  client: RpcClient,
  searchId: string,
  dispatchId: string,
  executionToken: string,
  expected: Record<string, unknown>,
  candidateIds: string[],
  sentIds: string[],
  payload: EmailPayload,
): Promise<Decision> {
  return decision(
    await rpc(client, "prepare_saved_search_alert_for_service", {
      p_search_id: searchId,
      p_dispatch_id: dispatchId,
      p_execution_token: executionToken,
      p_expected: expected,
      p_candidate_ids: candidateIds,
      p_sent_ids: sentIds,
      p_payload: payload,
    }),
  );
}

export async function repairSelectedEmailOperations(
  client: RpcClient,
): Promise<{ applied: number; held: number; maintenanceComplete: boolean }> {
  const rows = await rpc(
    client,
    "list_accepted_unapplied_email_operations_for_service",
    { p_limit: 100 },
  );
  if (!Array.isArray(rows)) throw new Error("email_repair_invalid_list");
  let applied = 0;
  let held = 0;
  for (const row of rows) {
    const id = row && typeof row === "object"
      ? (row as Record<string, unknown>).operation_id
      : null;
    if (typeof id !== "string" || !UUID.test(id)) {
      throw new Error("email_repair_invalid_operation");
    }
    try {
      const result = decision(
        await rpc(client, "apply_email_dispatch_result_for_service", {
          p_operation_id: id,
        }),
      );
      if (
        result.decision === "applied" || result.decision === "already_applied"
      ) applied++;
      else held++;
    } catch {
      held++;
    }
  }
  let maintenanceComplete = false;
  try {
    await rpc(client, "maintain_selected_email_operations_for_service", {
      p_limit: 100,
    });
    maintenanceComplete = true;
  } catch { /* Preserve known checkpoint repairs in the result. */ }
  return { applied, held, maintenanceComplete };
}

async function record(
  client: RpcClient,
  id: string,
  token: string,
  outcome: string,
  messageId: string | null,
  status: number | null,
  errorCode: string | null,
): Promise<boolean> {
  const args = {
    p_operation_id: id,
    p_attempt_token: token,
    p_outcome: outcome,
    p_provider_message_id: messageId,
    p_http_status: status,
    p_error_code: errorCode,
  };
  // A lost RPC response may follow a committed record. The exact same result is idempotent.
  for (let i = 0; i < 2; i++) {
    try {
      await rpc(client, "record_email_dispatch_result_for_service", args);
      return true;
    } catch { /* Keep the known result in memory for one same-result retry. */ }
  }
  return false;
}

export async function sendSelectedEmail(
  client: RpcClient,
  id: string,
  send: (payload: EmailPayload) => Promise<Response>,
): Promise<EmailResult> {
  const token = crypto.randomUUID();
  let admission: Decision;
  try {
    admission = decision(
      await rpc(client, "begin_email_dispatch_for_service", {
        p_operation_id: id,
        p_attempt_token: token,
      }),
    );
  } catch {
    return {
      outcome: "held",
      providerAccepted: null,
      acceptedNow: false,
      persistenceComplete: false,
      emailId: null,
      reason: "begin_unknown",
    };
  }

  if (admission.decision === "replay_accepted") {
    try {
      const applied = decision(
        await rpc(client, "apply_email_dispatch_result_for_service", {
          p_operation_id: id,
        }),
      );
      return {
        outcome: applied.decision === "applied" ||
            applied.decision === "already_applied"
          ? "applied"
          : "held",
        providerAccepted: true,
        acceptedNow: false,
        persistenceComplete: applied.decision === "applied" ||
          applied.decision === "already_applied",
        emailId: null,
        reason: safeDecisionReason(applied.decision),
      };
    } catch {
      return {
        outcome: "held",
        providerAccepted: true,
        acceptedNow: false,
        persistenceComplete: false,
        emailId: null,
        reason: "apply_failed",
      };
    }
  }
  if (
    admission.decision !== "send" || admission.operation_id !== id ||
    admission.attempt_token !== token || !validPayload(admission.payload)
  ) {
    return {
      outcome: "held",
      providerAccepted: null,
      acceptedNow: false,
      persistenceComplete: false,
      emailId: null,
      reason: safeDecisionReason(admission.decision),
    };
  }

  let response: Response;
  try {
    response = await send(admission.payload);
  } catch {
    await record(client, id, token, "unknown", null, null, "transport_unknown");
    return {
      outcome: "held",
      providerAccepted: null,
      acceptedNow: false,
      persistenceComplete: false,
      emailId: null,
      reason: "transport_unknown",
    };
  }

  let resultOutcome:
    | "accepted"
    | "rejected_retryable"
    | "rejected_final"
    | "unknown";
  let messageId: string | null = null;
  let errorCode: string | null = null;
  if (response.ok) {
    resultOutcome = "accepted";
    try {
      const body = await response.json();
      const value = body?.messageId ?? body?.message_id;
      if (
        typeof value === "string" && value.length > 0 && value.length <= 512
      ) messageId = value;
    } catch { /* HTTP acceptance does not depend on the optional body. */ }
  } else if (response.status === 429) {
    resultOutcome = "rejected_retryable";
    errorCode = "rate_limited";
  } else if (
    response.status >= 400 && response.status < 500 &&
    response.status !== 408 && response.status !== 409
  ) {
    let duplicateParameter = false;
    try {
      const body = await response.clone().json();
      duplicateParameter = body?.code === "duplicate_parameter" ||
        body?.message === "duplicate_parameter";
    } catch {
      /* A status alone is insufficient for ambiguous 400 responses. */
    }
    resultOutcome = duplicateParameter || response.status === 400
      ? "unknown"
      : "rejected_final";
    errorCode = resultOutcome === "unknown" ? null : "provider_rejected";
  } else {
    resultOutcome = "unknown";
    errorCode = response.status >= 500 ? "provider_5xx" : null;
  }
  const persisted = await record(
    client,
    id,
    token,
    resultOutcome,
    messageId,
    response.status,
    errorCode,
  );
  if (!persisted) {
    return {
      outcome: "held",
      providerAccepted: resultOutcome === "accepted" ? true : null,
      acceptedNow: resultOutcome === "accepted",
      persistenceComplete: false,
      emailId: messageId,
      reason: "record_unknown",
    };
  }
  if (resultOutcome === "unknown") {
    return {
      outcome: "held",
      providerAccepted: null,
      acceptedNow: false,
      persistenceComplete: false,
      emailId: null,
      reason: "unknown",
    };
  }
  if (resultOutcome !== "accepted") {
    return {
      outcome: "rejected",
      providerAccepted: false,
      acceptedNow: false,
      persistenceComplete: false,
      emailId: null,
      reason: resultOutcome,
    };
  }
  try {
    const applied = decision(
      await rpc(client, "apply_email_dispatch_result_for_service", {
        p_operation_id: id,
      }),
    );
    const complete = applied.decision === "applied" ||
      applied.decision === "already_applied";
    return {
      outcome: complete ? "applied" : "held",
      providerAccepted: true,
      acceptedNow: true,
      persistenceComplete: complete,
      emailId: messageId,
      reason: safeDecisionReason(applied.decision),
    };
  } catch {
    return {
      outcome: "held",
      providerAccepted: true,
      acceptedNow: true,
      persistenceComplete: false,
      emailId: messageId,
      reason: "apply_failed",
    };
  }
}
