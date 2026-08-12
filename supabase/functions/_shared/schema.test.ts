/**
 * Deno unit tests for shared request schema parsing.
 * Run: deno test supabase/functions/_shared/schema.test.ts
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseBoundedJsonBody,
  parseJsonBody,
  SchemaValidationError,
  z,
} from "./schema.ts";

async function settleBeforeCeiling(
  operation: Promise<unknown>,
  ceilingMs = 100,
): Promise<
  | { kind: "resolved" }
  | { kind: "rejected"; error: unknown }
  | { kind: "ceiling" }
> {
  let ceilingTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(
        () => ({ kind: "resolved" as const }),
        (error: unknown) => ({ kind: "rejected" as const, error }),
      ),
      new Promise<{ kind: "ceiling" }>((resolve) => {
        ceilingTimer = setTimeout(
          () => resolve({ kind: "ceiling" }),
          ceilingMs,
        );
      }),
    ]);
  } finally {
    if (ceilingTimer !== undefined) clearTimeout(ceilingTimer);
  }
}

Deno.test("parseJsonBody: rejects invalid JSON with a machine-readable error", async () => {
  const schema = z.object({ name: z.string() });
  const req = new Request("https://example.test", {
    method: "POST",
    body: "{",
    headers: { "Content-Type": "application/json" },
  });

  const error = await assertRejects(
    () => parseJsonBody(req, schema),
    SchemaValidationError,
    "Invalid JSON body",
  );

  assertEquals(error.code, "invalid_json");
  assertEquals(error.issues, [{
    code: "invalid_json",
    path: [],
    message: "Invalid JSON body",
  }]);
});

Deno.test("parseJsonBody: rejects an empty body instead of applying a fallback", async () => {
  const schema = z.object({ name: z.string() });
  const req = new Request("https://example.test", { method: "POST" });

  const error = await assertRejects(
    () => parseJsonBody(req, schema),
    SchemaValidationError,
    "Invalid JSON body",
  );

  assertEquals(error.code, "invalid_json");
});

Deno.test("parseJsonBody: rejects unknown keys for object request bodies", async () => {
  const schema = z.object({ name: z.string() });
  const req = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ name: "Ada", extra: true }),
    headers: { "Content-Type": "application/json" },
  });

  const error = await assertRejects(
    () => parseJsonBody(req, schema),
    SchemaValidationError,
  );

  assertEquals(error.code, "validation_error");
  assertEquals(error.issues[0]?.code, "unrecognized_keys");
  assertEquals(error.issues[0]?.path, []);
});

Deno.test("parseJsonBody: surfaces the first schema issue as the error message", async () => {
  const schema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Email must be valid"),
  });
  const req = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ name: "", email: "bad" }),
    headers: { "Content-Type": "application/json" },
  });

  const error = await assertRejects(
    () => parseJsonBody(req, schema),
    SchemaValidationError,
    "Name must be at least 2 characters",
  );

  assertEquals(error.issues[0]?.message, "Name must be at least 2 characters");
});

Deno.test("SchemaValidationError: keeps message compatibility while exposing code and issues", () => {
  const error = new SchemaValidationError("Email must be valid", {
    code: "validation_error",
    issues: [{
      code: "invalid_format",
      path: ["email"],
      message: "Email must be valid",
    }],
  });

  assertEquals(error.name, "SchemaValidationError");
  assertEquals(error.message, "Email must be valid");
  assertEquals(error.code, "validation_error");
  assertEquals(error.issues, [{
    code: "invalid_format",
    path: ["email"],
    message: "Email must be valid",
  }]);
});

Deno.test("parseBoundedJsonBody: timeout rejects before the ceiling when cancellation never settles", async () => {
  let cancelCalled = false;
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel: () => {
        cancelCalled = true;
        return new Promise<void>(() => undefined);
      },
    }),
  });

  const outcome = await settleBeforeCeiling(
    parseBoundedJsonBody(request, z.object({}), {
      maxBytes: 1_024,
      timeoutMs: 10,
    }),
  );

  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.error instanceof SchemaValidationError, true);
    assertEquals(
      (outcome.error as SchemaValidationError).code,
      "request_timeout",
    );
    assertEquals((outcome.error as SchemaValidationError).status, 408);
  }
  assertEquals(cancelCalled, true);
});

Deno.test("parseBoundedJsonBody: oversize rejects before the ceiling when cancellation never settles", async () => {
  let cancelCalled = false;
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
      },
      cancel: () => {
        cancelCalled = true;
        return new Promise<void>(() => undefined);
      },
    }),
  });

  const outcome = await settleBeforeCeiling(
    parseBoundedJsonBody(request, z.object({}), {
      maxBytes: 4,
      timeoutMs: 1_000,
    }),
  );

  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.error instanceof SchemaValidationError, true);
    assertEquals(
      (outcome.error as SchemaValidationError).code,
      "payload_too_large",
    );
    assertEquals((outcome.error as SchemaValidationError).status, 413);
  }
  assertEquals(cancelCalled, true);
});
