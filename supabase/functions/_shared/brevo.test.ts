/**
 * Deno unit tests for the shared Brevo email helper.
 * Run: deno test supabase/functions/_shared/brevo.test.ts
 */
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getBrevoSender, parseEmailIdentity } from "./brevo.ts";

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
