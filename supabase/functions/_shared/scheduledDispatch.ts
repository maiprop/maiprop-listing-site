const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export type ScheduledRun = { dispatchId: string; executionToken: string };
export type ScheduledStart = { run?: ScheduledRun; response?: Response };
export type ScheduledOutcome = "succeeded" | "partial" | "failed" | "skipped";
export type ScheduledSummary = Record<string, boolean | number>;

const jsonHeaders = (headers: HeadersInit): HeadersInit => ({ ...headers, "Content-Type": "application/json" });

export async function startScheduledDispatch(
  client: RpcClient,
  request: Request,
  integration: "poll_os_auctions" | "scheduled_followups" | "saved_search_alerts",
  headers: HeadersInit,
): Promise<ScheduledStart> {
  const supplied = request.headers.get("x-maiprop-dispatch-id");
  if (supplied !== null && !UUID.test(supplied)) {
    return { response: new Response(JSON.stringify({ error: "invalid_dispatch_id", dispatch_id: null, trace_persistence_complete: false }), {
      status: 400, headers: jsonHeaders(headers),
    }) };
  }
  try {
    const { data, error } = await client.rpc("start_scheduled_http_dispatch_for_service", {
      p_dispatch_id: supplied,
      p_integration: integration,
    });
    if (error || !data || typeof data !== "object") throw new Error("trace_start_failed");
    const result = data as Record<string, unknown>;
    const dispatchId = typeof result.dispatch_id === "string" && UUID.test(result.dispatch_id)
      ? result.dispatch_id : null;
    if (!dispatchId) throw new Error("trace_start_invalid_result");
    if (supplied && dispatchId.toLowerCase() !== supplied.toLowerCase()) throw new Error("trace_identity_mismatch");
    if (result.decision === "run" && typeof result.execution_token === "string" && UUID.test(result.execution_token)) {
      return { run: { dispatchId, executionToken: result.execution_token } };
    }
    if (result.decision === "replay" || result.decision === "in_progress" || result.decision === "unknown") {
      return { response: new Response(JSON.stringify({ decision: result.decision, dispatch_id: dispatchId }), {
        status: 409, headers: jsonHeaders(headers),
      }) };
    }
    throw new Error("trace_start_invalid_result");
  } catch {
    return { response: new Response(JSON.stringify({ error: "trace_start_failed", dispatch_id: supplied, trace_persistence_complete: false }), {
      status: 503, headers: jsonHeaders(headers),
    }) };
  }
}

export async function finishScheduledDispatch(
  client: RpcClient,
  run: ScheduledRun,
  response: Response,
  outcome: ScheduledOutcome,
  summary: ScheduledSummary,
): Promise<Response> {
  let persisted = false;
  try {
    const { error } = await client.rpc("finish_scheduled_http_dispatch_for_service", {
      p_dispatch_id: run.dispatchId,
      p_execution_token: run.executionToken,
      p_outcome: outcome,
      p_summary: { ...summary, outcome },
      p_error_code: outcome === "failed" ? "handler_failed" : null,
    });
    persisted = !error;
  } catch { /* The business result remains authoritative. */ }
  let body: Record<string, unknown>;
  try { body = await response.json(); } catch { body = {}; }
  body.dispatch_id = run.dispatchId;
  body.trace_persistence_complete = persisted;
  if (!persisted) body.trace_error = "finish_failed";
  return new Response(JSON.stringify(body), {
    status: persisted ? response.status : response.status < 500 ? 503 : response.status,
    headers: response.headers,
  });
}
