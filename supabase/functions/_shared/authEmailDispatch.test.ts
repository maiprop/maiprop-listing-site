import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dispatchAuthEmail } from "./authEmailDispatch.ts";

type Row = { state: "sending" | "accepted" | "unknown"; token: string };
type FixtureOptions = {
  send?: () => Promise<Response>;
  loseBegin?: boolean;
  loseBeginAfterCommit?: boolean;
  loseRecord?: boolean;
  loseFirstRecordAfterCommit?: boolean;
  malformed?: boolean;
  malformedRecord?: "event" | "slot" | "token" | "state" | "decision";
};

function fixture(options: FixtureOptions = {}) {
  const rows = new Map<string, Row>();
  const calls: string[] = [];
  const recordArgs: Array<Record<string, unknown>> = [];
  let beginCalls = 0;
  let recordCalls = 0;
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      const key = `${args.p_webhook_id}:${args.p_slot}`;
      if (name === "begin_auth_email_dispatch_for_service") {
        beginCalls++;
        if (options.loseBegin) throw new Error("lost admission response");
        if (options.malformed) return { data: { decision: "send" }, error: null };
        const row = rows.get(key);
        if (row) return { data: { decision: row.state === "accepted" ? "replay_accepted" : row.state === "unknown" ? "unknown" : "busy", state: row.state, webhook_id: args.p_webhook_id, slot: args.p_slot }, error: null };
        rows.set(key, { state: "sending", token: String(args.p_attempt_token) });
        if (options.loseBeginAfterCommit && beginCalls === 1) throw new Error("committed begin response lost");
        return { data: { decision: "send", state: "sending", webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token }, error: null };
      }
      recordCalls++;
      recordArgs.push({ ...args });
      if (options.loseRecord && recordCalls <= 2) throw new Error("lost checkpoint");
      const row = rows.get(key)!;
      assertEquals(args.p_attempt_token, row.token);
      row.state = args.p_outcome === "accepted" ? "accepted" : "unknown";
      if (options.loseFirstRecordAfterCommit && recordCalls === 1) throw new Error("committed checkpoint response lost");
      const data: Record<string, unknown> = { decision: "recorded", state: row.state, webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token };
      if (options.malformedRecord === "event") data.webhook_id = "wrong-event";
      if (options.malformedRecord === "slot") data.slot = "invite";
      if (options.malformedRecord === "token") data.attempt_token = "wrong-token";
      if (options.malformedRecord === "state") data.state = "unknown";
      if (options.malformedRecord === "decision") delete data.decision;
      return { data, error: null };
    },
  };
  let sends = 0;
  const send = async () => {
    sends++;
    return options.send ? options.send() : new Response(null, { status: 201 });
  };
  return { rows, calls, recordArgs, client, send, sends: () => sends };
}

Deno.test("Auth admission accepts once and skips same-ID replay while admitting a new ID", async () => {
  const f = fixture();
  assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), true);
  assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), true);
  assertEquals(await dispatchAuthEmail(f.client, "evt-two", "signup", f.send), true);
  assertEquals(f.sends(), 2);
});

Deno.test("lost or malformed admission never sends", async () => {
  for (const options of [{ loseBegin: true }, { malformed: true }]) {
    const f = fixture(options);
    assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), false);
    assertEquals(f.sends(), 0);
  }
});

Deno.test("all unproved responses hold, including 503 and lost response", async () => {
  for (const send of [() => Promise.resolve(new Response("secret", { status: 503 })), () => Promise.reject(new Error("secret token"))]) {
    const f = fixture({ send });
    assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), false);
    assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), false);
    assertEquals(f.sends(), 1);
    assertEquals(f.rows.get("evt-one:signup")?.state, "unknown");
  }
});

Deno.test("known 2xx acceptance does not read an unreadable body", async () => {
  const f = fixture({ send: async () => new Response(new ReadableStream({ pull() { throw new Error("body unreadable"); } }), { status: 202 }) });
  assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), true);
  assertEquals(f.rows.get("evt-one:signup")?.state, "accepted");
});

Deno.test("lost acceptance checkpoint retries exact result once and never resends", async () => {
  const f = fixture({ loseRecord: true });
  assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), false);
  assertEquals(await dispatchAuthEmail(f.client, "evt-one", "signup", f.send), false);
  assertEquals(f.sends(), 1);
  assertEquals(f.calls.filter((name) => name === "record_auth_email_dispatch_result_for_service").length, 2);
  assertEquals(f.recordArgs[0], f.recordArgs[1]);
});

Deno.test("committed begin with lost response holds the same ID without a provider call", async () => {
  const f = fixture({ loseBeginAfterCommit: true });
  assertEquals(await dispatchAuthEmail(f.client, "evt-committed-begin", "signup", f.send), false);
  assertEquals(f.rows.get("evt-committed-begin:signup")?.state, "sending");
  assertEquals(await dispatchAuthEmail(f.client, "evt-committed-begin", "signup", f.send), false);
  assertEquals(f.sends(), 0);
  assertEquals(f.recordArgs, []);
});

Deno.test("committed first checkpoint with lost response retries exact arguments then replays accepted", async () => {
  const f = fixture({ loseFirstRecordAfterCommit: true });
  assertEquals(await dispatchAuthEmail(f.client, "evt-committed-record", "signup", f.send), true);
  assertEquals(f.rows.get("evt-committed-record:signup")?.state, "accepted");
  assertEquals(f.recordArgs.length, 2);
  assertEquals(f.recordArgs[0], f.recordArgs[1]);
  assertEquals(Object.keys(f.recordArgs[0]).sort(), [
    "p_attempt_token", "p_http_status", "p_outcome", "p_result_code", "p_slot", "p_webhook_id",
  ]);
  assertEquals(f.recordArgs[0].p_outcome, "accepted");
  assertEquals(f.recordArgs[0].p_http_status, 201);
  assertEquals(f.recordArgs[0].p_result_code, "accepted_2xx");
  assertEquals(await dispatchAuthEmail(f.client, "evt-committed-record", "signup", f.send), true);
  assertEquals(f.sends(), 1);
  assertEquals(f.recordArgs.length, 2);
});

Deno.test("malformed committed checkpoint responses fail closed without another send", async () => {
  for (const malformedRecord of ["event", "slot", "token", "state", "decision"] as const) {
    const f = fixture({ malformedRecord });
    assertEquals(await dispatchAuthEmail(f.client, "evt-malformed-record", "signup", f.send), false);
    assertEquals(f.recordArgs.length, 2);
    assertEquals(f.recordArgs[0], f.recordArgs[1]);
    assertEquals(f.sends(), 1);
    assertEquals(f.rows.get("evt-malformed-record:signup")?.state, "accepted");
  }
});
