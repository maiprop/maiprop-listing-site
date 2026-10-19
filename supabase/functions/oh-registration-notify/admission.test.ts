import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Capture the actual entrypoint without changing the shared test environment.
Deno.test("actual OH handler enforces admission, transition rendering, uncertainty and privacy", async () => {
  const originalServe = Deno.serve;
  const originalGet = Deno.env.get;
  const originalFetch = globalThis.fetch;
  const env: Record<string, string> = {
    WEBHOOK_SECRET: "fixture-webhook",
    SUPABASE_URL: "https://fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service",
    BREVO_API_KEY: "fixture-brevo",
    BREVO_FROM_EMAIL: "sender@example.test",
  };
  let handler!: (request: Request) => Promise<Response>;
  let id = "d1200003-0000-4000-8000-000000000001";
  const snapshot = {
    id: "d1200002-0000-4000-8000-000000000001",
    requester_id: "d1200001-0000-4000-8000-000000000002",
    listing_id: "d1200002-0000-4000-8000-000000000002",
    status: "approved",
    rejection_reason: null,
    timeslot_index: 1,
  };
  let state = "ready";
  let mode = "normal";
  let checkpoints = 0;
  let lookups = 0;
  let token = "";
  let lastArgs: unknown;
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const privateValue = "PRIVATE_LOOKUP_SENTINEL";
  const sent: Array<Record<string, unknown>> = [];
  let sends = 0;
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  try {
    console.log = console.error = console.warn = (...args) => {
      logs.push(JSON.stringify(args));
    };
    Deno.env.get = (key) => env[key];
    Deno.serve = ((fn: typeof handler) => {
      handler = fn;
      return {};
    }) as typeof Deno.serve;
    globalThis.fetch = async (input, init) => {
      await Promise.resolve(); // Preserve an asynchronous transport boundary.
      const url = new URL(String(input));
      if (
        url.pathname ===
          "/rest/v1/rpc/begin_oh_registration_status_event_for_service"
      ) {
        const args = JSON.parse(String((init as { body?: unknown })?.body));
        assertEquals(args.p_event_id, id);
        if (mode === "db-down") throw new Error(privateValue);
        if (mode === "unknown-id") {
          return json({ decision: "not_found", event_id: id });
        }
        if (state === "sending" || state === "unknown") {
          return json({
            decision: state === "sending" ? "busy" : "unknown",
            event_id: id,
          });
        }
        if (state === "accepted") {
          return json({
            decision: "replay_accepted",
            state,
            event_id: id,
            new_status: snapshot.status,
          });
        }
        state = "sending";
        token = args.p_attempt_token;
        if (mode === "begin-lost") throw new Error(privateValue);
        if (mode === "bad-begin") {
          return json({
            decision: "send",
            state: "ready",
            event_id: id,
            attempt_token: token,
            snapshot,
          });
        }
        if (mode === "bad-token") {
          return json({
            decision: "send",
            state,
            event_id: id,
            attempt_token: crypto.randomUUID(),
            snapshot,
          });
        }
        return json({
          decision: "send",
          state,
          event_id: id,
          attempt_token: token,
          snapshot: mode === "bad-snapshot"
            ? { ...snapshot, requester_id: null }
            : snapshot,
        });
      }
      if (
        url.pathname ===
          "/rest/v1/rpc/record_oh_registration_status_event_result_for_service"
      ) {
        const args = JSON.parse(String((init as { body?: unknown })?.body));
        checkpoints++;
        assertEquals(args.p_event_id, id);
        assertEquals(args.p_attempt_token, token);
        assert(!JSON.stringify(args).includes(privateValue));
        if (checkpoints > 1) assertEquals(args, lastArgs);
        lastArgs = args;
        if (mode === "checkpoint-down") throw new Error(privateValue);
        state = args.p_outcome;
        if (mode === "checkpoint-lost" && checkpoints === 1) {
          throw new Error(privateValue);
        }
        if (mode === "checkpoint-malformed") {
          return json({
            decision: "recorded",
            state,
            event_id: id,
            attempt_token: "wrong",
          });
        }
        return json({
          decision: "recorded",
          state,
          event_id: id,
          attempt_token: args.p_attempt_token,
        });
      }
      if (url.pathname === `/auth/v1/admin/users/${snapshot.requester_id}`) {
        lookups++;
        if (mode === "requester-deleted" || mode === "lookup-failed") {
          return new Response(JSON.stringify({ message: privateValue }), {
            status: 404,
          });
        }
        return json({
          user: { id: snapshot.requester_id, email: "requester@example.test" },
        });
      }
      if (url.pathname === "/rest/v1/listings") {
        assertEquals(
          url.searchParams.get("select"),
          "title,city,open_house_date",
        );
        assertEquals(url.searchParams.get("id"), `eq.${snapshot.listing_id}`);
        if (mode === "listing-deleted") {
          return new Response(JSON.stringify({ message: privateValue }), {
            status: 404,
          });
        }
        return json({
          title: "Fixture House",
          city: "Athens",
          open_house_date: "2030-10-10T12:00:00Z",
        });
      }
      if (url.href === "https://api.brevo.com/v3/smtp/email") {
        sends++;
        const body = JSON.parse(String((init as { body?: unknown })?.body));
        assertEquals(body.to, [{ email: "requester@example.test" }]);
        assertEquals((init as RequestInit).method, "POST");
        assertEquals(
          new Headers((init as RequestInit).headers).get("api-key"),
          "fixture-brevo",
        );
        assertEquals(body.sender, {
          email: "sender@example.test",
          name: "MaiProp Open Houses",
        });
        assertEquals(body.tags, ["oh_registration_status"]);
        assertEquals(
          body.headers["X-MaiProp-Template"],
          "oh_registration_status",
        );
        assert(
          body.htmlContent.includes(`/open-houses/${snapshot.listing_id}`),
        );
        sent.push(body);
        if (mode === "transport-lost") throw new Error(privateValue);
        if (mode === "http503" || mode === "http429") {
          return new Response(privateValue, {
            status: mode === "http503" ? 503 : 429,
          });
        }
        if (mode === "body-unreadable") {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error(privateValue));
              },
            }),
            { status: 202 },
          );
        }
        if (mode === "body-empty") return new Response(null, { status: 204 });
        if (mode === "body-malformed") {
          return new Response("{", { status: 200 });
        }
        return json({ messageId: "fixture" });
      }
      throw new Error("PRIVATE_LOOKUP_SENTINEL");
    };
    await import("./index.ts");
    const invoke = (payload: unknown) =>
      handler(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: {
            authorization: "Bearer fixture-webhook",
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
      );
    const payload = {
      event_id: id,
      event_version: 1,
      record: snapshot,
      old_record: { ...snapshot, status: "pending" },
    };
    assertEquals((await invoke(payload)).status, 200);
    assertEquals((await invoke(payload)).status, 200);
    assertEquals(sends, 1);
    assertEquals(lookups, 1);
    assert(String(sent[0].htmlContent).includes("Your assigned timeslot"));
    assertEquals(
      (sent[0].headers as Record<string, string>)["X-MaiProp-Message-Id"],
      `oh-event-${id}`,
    );
    const invalid = await invoke({ ...payload, event_id: null });
    assertEquals(invalid.status, 400);
    assertEquals(sends, 1);
    const reset = (next: string) => {
      mode = next;
      state = "ready";
      sends = 0;
      checkpoints = 0;
      lookups = 0;
      lastArgs = undefined;
    };
    for (
      const next of [
        "begin-lost",
        "bad-begin",
        "bad-token",
        "db-down",
        "unknown-id",
      ]
    ) {
      reset(next);
      const response = await invoke(payload);
      assertEquals(response.status, 500, next);
      assert(!JSON.stringify(await response.json()).includes(privateValue));
      assertEquals(sends, 0, next);
      assertEquals(lookups, 0, next);
      assertEquals((await invoke(payload)).status, 500, next);
      assertEquals(sends, 0, next);
    }
    for (
      const next of [
        "transport-lost",
        "http503",
        "http429",
        "requester-deleted",
        "lookup-failed",
        "bad-snapshot",
        "checkpoint-down",
        "checkpoint-malformed",
      ]
    ) {
      reset(next);
      const response = await invoke(payload);
      assertEquals(response.status, 500, next);
      assert(!JSON.stringify(await response.json()).includes(privateValue));
      const effects =
        ["requester-deleted", "lookup-failed", "bad-snapshot"].includes(next)
          ? 0
          : 1;
      assertEquals(sends, effects, next);
      assertEquals(checkpoints, next.startsWith("checkpoint-") ? 2 : 1, next);
      const replay = await invoke(payload);
      assertEquals(
        replay.status,
        next === "checkpoint-malformed" ? 200 : 500,
        next,
      );
      assertEquals(sends, effects, next);
    }
    for (
      const next of [
        "body-unreadable",
        "body-empty",
        "body-malformed",
        "checkpoint-lost",
        "listing-deleted",
      ]
    ) {
      reset(next);
      assertEquals((await invoke(payload)).status, 200, next);
      assertEquals((await invoke(payload)).status, 200, next);
      assertEquals(sends, 1, next);
      assertEquals(checkpoints, next === "checkpoint-lost" ? 2 : 1, next);
      if (next === "listing-deleted") {
        assert(String(sent.at(-1)?.subject).includes('"Open House"'));
      }
    }
    reset("normal");
    for (const status of ["approved", "rejected", "approved"]) {
      // Each ready record models a separately minted event; current registration is never queried.
      id = crypto.randomUUID();
      state = "ready";
      checkpoints = 0;
      lastArgs = undefined;
      snapshot.status = status;
      (snapshot as { rejection_reason: string | null }).rejection_reason =
        status === "rejected" ? "Historical reason" : null;
      assertEquals(
        (await invoke({
          ...payload,
          event_id: id,
          record: {
            ...snapshot,
            requester_id: "spoof",
            listing_id: "spoof",
            status: "rejected",
            rejection_reason: "SPOOF_REASON",
          },
        })).status,
        200,
      );
      const html = String(sent.at(-1)?.htmlContent);
      assertEquals(html.includes("Historical reason"), status === "rejected");
      assert(!html.includes("SPOOF_REASON"));
    }
    assertEquals(sends, 3);
    const capturedPath = originalGet.call(Deno.env, "OH_CAPTURED_PAYLOADS");
    if (capturedPath) {
      const captured = (await Deno.readTextFile(capturedPath)).split(/\r?\n/)
        .filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
      assertEquals(captured.length, 3);
      assertEquals(new Set(captured.map((row) => row.event_id)).size, 3);
      assertEquals(captured.map((row) => row.record.status), [
        "approved",
        "rejected",
        "approved",
      ]);
      reset("normal");
      for (const event of captured) {
        id = event.event_id;
        Object.assign(snapshot, event.record);
        state = "ready";
        checkpoints = 0;
        lastArgs = undefined;
        assertEquals((await invoke(event)).status, 200);
        assertEquals((await invoke(event)).status, 200);
        const html = String(sent.at(-1)?.htmlContent);
        assertEquals(
          html.includes("Historical rejection"),
          snapshot.status === "rejected",
        );
      }
      assertEquals(sends, 3);
    }
    reset("normal");
    const legacy = {
      record: snapshot,
      old_record: { ...snapshot, status: "pending" },
    };
    assertEquals((await invoke(legacy)).status, 200);
    assertEquals((await invoke(legacy)).status, 200);
    assertEquals(sends, 2); // Legacy remains explicitly nondeduplicated.
    assertEquals(
      (await invoke({ record: snapshot, old_record: snapshot })).status,
      200,
    );
    assertEquals(
      (await invoke({
        record: { ...snapshot, status: "pending" },
        old_record: snapshot,
      })).status,
      200,
    );
    assertEquals(sends, 2);
    assertEquals(
      (await invoke({ ...payload, event_id: id, event_version: 2 })).status,
      400,
    );
    mode = "transport-lost";
    const legacyFailure = await invoke(legacy);
    assertEquals(legacyFailure.status, 500);
    assert(!JSON.stringify(await legacyFailure.json()).includes(privateValue));
    assertEquals(sends, 3);

    for (const bad of [null, "bad", 17]) {
      assertEquals((await invoke({ ...payload, event_id: bad })).status, 400);
    }
    assertEquals(sends, 3);
    const unauthorized = await handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    assertEquals(unauthorized.status, 401);
    assertEquals(sends, 3);
    assert(!logs.join(" ").includes(privateValue));
    assert(!logs.join(" ").includes("requester@example.test"));
    assert(!logs.join(" ").includes("Historical reason"));
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    Deno.serve = originalServe;
    Deno.env.get = originalGet;
    globalThis.fetch = originalFetch;
  }
});
