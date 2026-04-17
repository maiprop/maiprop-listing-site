import { assertEquals, assertRejects, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyHmacSignature, HmacVerifyError } from "./webhookHmac.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET = "test-webhook-secret-32-chars-long!";

async function makeSignature(
  rawBody: string,
  secret: string,
  timestampSec?: number,
): Promise<string> {
  const ts = String(timestampSec ?? Math.floor(Date.now() / 1000));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${ts},v1=${hex}`;
}

// ── HmacVerifyError ───────────────────────────────────────────────────────────

Deno.test("HmacVerifyError is an Error subclass", () => {
  const err = new HmacVerifyError("bad sig");
  assertInstanceOf(err, Error);
  assertInstanceOf(err, HmacVerifyError);
  assertEquals(err.name, "HmacVerifyError");
  assertEquals(err.message, "bad sig");
});

// ── Missing / malformed header ────────────────────────────────────────────────

Deno.test("throws HmacVerifyError when sigHeader is null", async () => {
  await assertRejects(
    () => verifyHmacSignature("body", null, SECRET),
    HmacVerifyError,
    "Missing signature header",
  );
});

Deno.test("throws HmacVerifyError when sigHeader is empty string", async () => {
  await assertRejects(
    () => verifyHmacSignature("body", "", SECRET),
    HmacVerifyError,
    "Missing signature header",
  );
});

Deno.test("throws HmacVerifyError when t= is missing from header", async () => {
  const ts = String(Math.floor(Date.now() / 1000));
  await assertRejects(
    () => verifyHmacSignature("body", `v1=abc123,ts=${ts}`, SECRET),
    HmacVerifyError,
    "Malformed",
  );
});

Deno.test("throws HmacVerifyError when v1= is missing from header", async () => {
  const ts = String(Math.floor(Date.now() / 1000));
  await assertRejects(
    () => verifyHmacSignature("body", `t=${ts}`, SECRET),
    HmacVerifyError,
    "Malformed",
  );
});

// ── Replay protection ─────────────────────────────────────────────────────────

Deno.test("throws HmacVerifyError when timestamp is too old", async () => {
  const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const sig = await makeSignature("body", SECRET, oldTs);
  await assertRejects(
    () => verifyHmacSignature("body", sig, SECRET, 5 * 60 * 1000),
    HmacVerifyError,
    "timestamp",
  );
});

Deno.test("throws HmacVerifyError when timestamp is far in the future", async () => {
  const futureTs = Math.floor(Date.now() / 1000) + 600; // 10 minutes ahead
  const sig = await makeSignature("body", SECRET, futureTs);
  await assertRejects(
    () => verifyHmacSignature("body", sig, SECRET, 5 * 60 * 1000),
    HmacVerifyError,
    "timestamp",
  );
});

Deno.test("throws HmacVerifyError when timestamp is NaN", async () => {
  const ts = Math.floor(Date.now() / 1000);
  await assertRejects(
    () => verifyHmacSignature("body", `t=not_a_number,v1=abc${ts}`, SECRET),
    HmacVerifyError,
    "timestamp",
  );
});

// ── Signature mismatch ────────────────────────────────────────────────────────

Deno.test("throws HmacVerifyError when HMAC is wrong", async () => {
  const ts = Math.floor(Date.now() / 1000);
  const badSig = `t=${ts},v1=0000000000000000000000000000000000000000000000000000000000000000`;
  await assertRejects(
    () => verifyHmacSignature("body", badSig, SECRET),
    HmacVerifyError,
    "Invalid HMAC",
  );
});

Deno.test("throws HmacVerifyError when body has been tampered with", async () => {
  const sig = await makeSignature("original body", SECRET);
  await assertRejects(
    () => verifyHmacSignature("tampered body", sig, SECRET),
    HmacVerifyError,
    "Invalid HMAC",
  );
});

Deno.test("throws HmacVerifyError when secret is wrong", async () => {
  const sig = await makeSignature("body", SECRET);
  await assertRejects(
    () => verifyHmacSignature("body", sig, "wrong-secret"),
    HmacVerifyError,
    "Invalid HMAC",
  );
});

// ── Valid signature ───────────────────────────────────────────────────────────

Deno.test("resolves without throwing for a valid signature", async () => {
  const body = JSON.stringify({ event: "listing.created", id: "abc-123" });
  const sig = await makeSignature(body, SECRET);
  // Should not throw
  await verifyHmacSignature(body, sig, SECRET);
});

Deno.test("accepts signature within custom tolerance window", async () => {
  const ts = Math.floor(Date.now() / 1000) - 30; // 30 seconds ago
  const sig = await makeSignature("payload", SECRET, ts);
  // Tolerance of 60 seconds — should pass
  await verifyHmacSignature("payload", sig, SECRET, 60_000);
});

Deno.test("works with empty body string", async () => {
  const sig = await makeSignature("", SECRET);
  await verifyHmacSignature("", sig, SECRET);
});

Deno.test("works with large JSON body", async () => {
  const body = JSON.stringify({ data: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) });
  const sig = await makeSignature(body, SECRET);
  await verifyHmacSignature(body, sig, SECRET);
});
