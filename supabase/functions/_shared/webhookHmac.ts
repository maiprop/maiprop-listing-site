/**
 * HMAC-SHA256 webhook signature verification.
 *
 * Expected header format:  x-os-signature: t=<unix_seconds>,v1=<hex_hmac>
 * Signed payload:          "<timestamp>.<rawBody>"
 *
 * Usage (in receive-from-os or any future webhook receiver):
 *
 *   import { verifyHmacSignature, HmacVerifyError } from "../_shared/webhookHmac.ts";
 *
 *   const rawBody = await req.text();
 *   try {
 *     await verifyHmacSignature(rawBody, req.headers.get("x-os-signature"), secret);
 *   } catch (err) {
 *     if (err instanceof HmacVerifyError) return errorResponse(err.message, 401);
 *     throw err;
 *   }
 *   const body = JSON.parse(rawBody);
 */

export class HmacVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HmacVerifyError";
  }
}

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export async function verifyHmacSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
  toleranceMs = REPLAY_TOLERANCE_MS,
): Promise<void> {
  if (!sigHeader) throw new HmacVerifyError("Missing signature header");

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)] as [string, string];
    }),
  );

  const timestamp = parts["t"];
  const receivedHmac = parts["v1"];

  if (!timestamp || !receivedHmac) {
    throw new HmacVerifyError("Malformed signature header — expected t=<ts>,v1=<hmac>");
  }

  const requestAgeMs = Date.now() - Number(timestamp) * 1000;
  if (isNaN(requestAgeMs) || Math.abs(requestAgeMs) > toleranceMs) {
    throw new HmacVerifyError("Request timestamp too old or invalid (replay protection)");
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const expectedHmac = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison (length-matched)
  const aBytes = enc.encode(receivedHmac);
  const bBytes = enc.encode(expectedHmac);
  let diff = aBytes.length === bBytes.length ? 0 : 1;
  for (let i = 0; i < Math.min(aBytes.length, bBytes.length); i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  if (diff !== 0) {
    throw new HmacVerifyError("Invalid HMAC signature");
  }
}
