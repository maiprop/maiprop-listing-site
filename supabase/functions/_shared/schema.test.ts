/**
 * Deno unit tests for shared request schema parsing.
 * Run: deno test supabase/functions/_shared/schema.test.ts
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseJsonBody, SchemaValidationError, z } from "./schema.ts";

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
    issues: [{ code: "invalid_format", path: ["email"], message: "Email must be valid" }],
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
