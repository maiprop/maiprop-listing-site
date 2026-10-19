// OH transition admission only. Provider calls are never retried.
type Client = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};
export type OHSnapshot = {
  id: string;
  requester_id: string;
  listing_id: string;
  status: "approved" | "rejected";
  rejection_reason: string | null;
  timeslot_index: number | null;
};
export const isEventId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function snapshot(value: unknown): OHSnapshot | null {
  const row = object(value);
  if (
    !row || !isEventId(row.id) || !isEventId(row.requester_id) ||
    !isEventId(row.listing_id) ||
    (row.status !== "approved" && row.status !== "rejected") ||
    (row.rejection_reason !== null &&
      typeof row.rejection_reason !== "string") ||
    (row.status === "approved" && row.rejection_reason !== null) ||
    (row.timeslot_index !== null && !Number.isInteger(row.timeslot_index))
  ) return null;
  return row as OHSnapshot;
}
async function rpc(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.rpc(name, args);
  if (!result || result.error) throw new Error("oh_event_rpc_failed");
  return object(result.data);
}

export async function dispatchOHStatusEvent(
  client: Client,
  eventId: string,
  prepare: (row: OHSnapshot) => Promise<() => Promise<Response>>,
): Promise<"approved" | "rejected" | null> {
  const token = crypto.randomUUID();
  let begin;
  try {
    begin = await rpc(
      client,
      "begin_oh_registration_status_event_for_service",
      { p_event_id: eventId, p_attempt_token: token },
    );
  } catch {
    return null;
  }
  if (!begin || begin.event_id !== eventId) return null;
  if (begin.decision === "replay_accepted") {
    return begin.state === "accepted" &&
        (begin.new_status === "approved" || begin.new_status === "rejected")
      ? begin.new_status
      : null;
  }
  if (
    begin.decision !== "send" || begin.state !== "sending" ||
    begin.attempt_token !== token
  ) return null;
  const row = snapshot(begin.snapshot);
  let outcome = "unknown";
  let status: number | null = null;
  let code = "preparation_failed";
  try {
    if (!row) throw new Error("oh_event_snapshot_invalid");
    const send = await prepare(row);
    code = "transport_unknown";
    const response = await send();
    if (
      Number.isInteger(response.status) && response.status >= 100 &&
      response.status <= 599
    ) {
      status = response.status;
      if (status >= 200 && status <= 299) {
        outcome = "accepted";
        code = "accepted_2xx";
      } else code = "http_unconfirmed";
    }
    // Acceptance is known from status; response content is unnecessary evidence.
  } catch { /* Preserve only the phase's fixed code. */ }
  const args = {
    p_event_id: eventId,
    p_attempt_token: token,
    p_outcome: outcome,
    p_http_status: status,
    p_result_code: code,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rpc(
        client,
        "record_oh_registration_status_event_result_for_service",
        args,
      );
      if (
        result?.decision === "recorded" && result.event_id === eventId &&
        result.attempt_token === token && result.state === outcome
      ) {
        return outcome === "accepted" && row ? row.status : null;
      }
    } catch { /* One identical checkpoint retry; never send again. */ }
  }
  return null;
}
