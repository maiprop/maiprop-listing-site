/**
 * Deno unit tests for the shared Brevo email helper.
 * Run: deno test supabase/functions/_shared/brevo.test.ts
 */
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getBrevoSender, parseEmailIdentity, sendBrevoEmail, sendBrevoEmailRaw } from "./brevo.ts";

// ── getBrevoSender ────────────────────────────────────────────────────────────

Deno.test("getBrevoSender: throws when BREVO_FROM_EMAIL is unset", () => {
  const prev = Deno.env.get("BREVO_FROM_EMAIL");
  Deno.env.delete("BREVO_FROM_EMAIL");
  try {
    assertThrows(() => getBrevoSender(), Error, "BREVO_FROM_EMAIL is not configured");
  } finally {
    if (prev) Deno.env.set("BREVO_FROM_EMAIL", prev);
  }
});

Deno.test("getBrevoSender: returns sender with default name", () => {
  const prevEmail = Deno.env.get("BREVO_FROM_EMAIL");
  const prevName = Deno.env.get("BREVO_FROM_NAME");
  Deno.env.set("BREVO_FROM_EMAIL", "info@maiprop.co");
  Deno.env.delete("BREVO_FROM_NAME");
  try {
    const sender = getBrevoSender();
    assertEquals(sender.email, "info@maiprop.co");
    assertEquals(sender.name, "maiProp");
  } finally {
    if (prevEmail) Deno.env.set("BREVO_FROM_EMAIL", prevEmail);
    else Deno.env.delete("BREVO_FROM_EMAIL");
    if (prevName) Deno.env.set("BREVO_FROM_NAME", prevName);
  }
});

Deno.test("getBrevoSender: uses BREVO_FROM_NAME when set", () => {
  const prevEmail = Deno.env.get("BREVO_FROM_EMAIL");
  const prevName = Deno.env.get("BREVO_FROM_NAME");
  Deno.env.set("BREVO_FROM_EMAIL", "info@maiprop.co");
  Deno.env.set("BREVO_FROM_NAME", "MaiProp Notifications");
  try {
    const sender = getBrevoSender();
    assertEquals(sender.name, "MaiProp Notifications");
  } finally {
    if (prevEmail) Deno.env.set("BREVO_FROM_EMAIL", prevEmail);
    else Deno.env.delete("BREVO_FROM_EMAIL");
    if (prevName) Deno.env.set("BREVO_FROM_NAME", prevName);
    else Deno.env.delete("BREVO_FROM_NAME");
  }
});

Deno.test("getBrevoSender: uses custom fallback name", () => {
  const prevEmail = Deno.env.get("BREVO_FROM_EMAIL");
  const prevName = Deno.env.get("BREVO_FROM_NAME");
  Deno.env.set("BREVO_FROM_EMAIL", "info@maiprop.co");
  Deno.env.delete("BREVO_FROM_NAME");
  try {
    const sender = getBrevoSender("Custom Name");
    assertEquals(sender.name, "Custom Name");
  } finally {
    if (prevEmail) Deno.env.set("BREVO_FROM_EMAIL", prevEmail);
    else Deno.env.delete("BREVO_FROM_EMAIL");
    if (prevName) Deno.env.set("BREVO_FROM_NAME", prevName);
  }
});

// ── parseEmailIdentity ────────────────────────────────────────────────────────

Deno.test("parseEmailIdentity: returns undefined for null/empty", () => {
  assertEquals(parseEmailIdentity(null), undefined);
  assertEquals(parseEmailIdentity(undefined), undefined);
  assertEquals(parseEmailIdentity(""), undefined);
  assertEquals(parseEmailIdentity("  "), undefined);
});

Deno.test("parseEmailIdentity: parses bare email address", () => {
  assertEquals(parseEmailIdentity("info@maiprop.co"), { email: "info@maiprop.co" });
});

Deno.test("parseEmailIdentity: parses name + angle-bracket email", () => {
  const result = parseEmailIdentity("MaiProp <info@maiprop.co>");
  assertEquals(result, { email: "info@maiprop.co", name: "MaiProp" });
});

Deno.test("parseEmailIdentity: parses quoted name with angle brackets", () => {
  const result = parseEmailIdentity('"MaiProp Support" <support@maiprop.co>');
  assertEquals(result, { email: "support@maiprop.co", name: "MaiProp Support" });
});

Deno.test("parseEmailIdentity: handles whitespace around angle brackets", () => {
  const result = parseEmailIdentity("  Team  <team@maiprop.co>  ");
  assertEquals(result, { email: "team@maiprop.co", name: "Team" });
});

Deno.test("parseEmailIdentity: handles angle bracket email with no name", () => {
  const result = parseEmailIdentity("<noreply@maiprop.co>");
  assertEquals(result, { email: "noreply@maiprop.co" });
});

Deno.test("raw Brevo transport returns a known 2xx without reading its body", async () => {
  const originalFetch = globalThis.fetch;
  const priorKey = Deno.env.get("BREVO_API_KEY");
  Deno.env.set("BREVO_API_KEY", "synthetic-key");
  globalThis.fetch = async (input, init) => {
    assertEquals(String(input), "https://api.brevo.com/v3/smtp/email");
    assertEquals(init && "method" in init ? init.method : undefined, "POST");
    return new Response(new ReadableStream({ pull() { throw new Error("body unreadable"); } }), { status: 201 });
  };
  try {
    const response = await sendBrevoEmailRaw({ to: "user@example.test", sender: { email: "sender@example.test" }, subject: "Test", html: "<p>Test</p>" });
    assertEquals(response.status, 201);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorKey) Deno.env.set("BREVO_API_KEY", priorKey);
    else Deno.env.delete("BREVO_API_KEY");
  }
});

Deno.test("legacy Brevo helper still parses message IDs and throws on rejection", async () => {
  const originalFetch = globalThis.fetch;
  const priorKey = Deno.env.get("BREVO_API_KEY");
  Deno.env.set("BREVO_API_KEY", "synthetic-key");
  const input = { to: "user@example.test", sender: { email: "sender@example.test" }, subject: "Test", html: "<p>Test</p>" };
  try {
    globalThis.fetch = async () => new Response('{"messageId":"synthetic-id"}', { status: 201 });
    assertEquals(await sendBrevoEmail(input), { messageId: "synthetic-id" });
    globalThis.fetch = async () => new Response("synthetic rejection", { status: 503 });
    let rejected = false;
    try { await sendBrevoEmail(input); } catch (error) {
      rejected = error instanceof Error && error.message.includes("synthetic rejection");
    }
    assertEquals(rejected, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorKey) Deno.env.set("BREVO_API_KEY", priorKey);
    else Deno.env.delete("BREVO_API_KEY");
  }
});
