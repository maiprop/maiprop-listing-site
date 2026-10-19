import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dispatchAuthEmail } from "./authEmailDispatch.ts";

type Row = { state: "sending" | "accepted" | "unknown"; token: string };

function fixture(options: { send?: () => Promise<Response>; loseBegin?: boolean; loseRecord?: boolean; malformed?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const calls: string[] = [];
  let recordCalls = 0;
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      const key = `${args.p_webhook_id}:${args.p_slot}`;
      if (name === "begin_auth_email_dispatch_for_service") {
        if (options.loseBegin) throw new Error("lost admission response");
        if (options.malformed) return { data: { decision: "send" }, error: null };
        const row = rows.get(key);
        if (row) return { data: { decision: row.state === "accepted" ? "replay_accepted" : row.state === "unknown" ? "unknown" : "busy", state: row.state, webhook_id: args.p_webhook_id, slot: args.p_slot }, error: null };
        rows.set(key, { state: "sending", token: String(args.p_attempt_token) });
        return { data: { decision: "send", state: "sending", webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token }, error: null };
      }
      recordCalls++;
      if (options.loseRecord && recordCalls <= 2) throw new Error("lost checkpoint");
      const row = rows.get(key)!;
      assertEquals(args.p_attempt_token, row.token);
      row.state = args.p_outcome === "accepted" ? "accepted" : "unknown";
      return { data: { decision: "recorded", state: row.state, webhook_id: args.p_webhook_id, slot: args.p_slot, attempt_token: args.p_attempt_token }, error: null };
    },
  };
  let sends = 0;
  const send = async () => {
    sends++;
    return options.send ? options.send() : new Response(null, { status: 201 });
  };
  return { rows, calls, client, send, sends: () => sends };
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
});
