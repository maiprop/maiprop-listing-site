/**
 * Tests for the Cloudflare Pages Functions middleware (`functions/_middleware.ts`).
 *
 * The middleware is the production "site lock" — when SITE_LOCK_PASSWORD is
 * set, every request is intercepted. Submitting the correct passcode at
 * /__unlock sets a 30-day cookie keyed by `sha256(password)`. Any rotation
 * of the env var auto-invalidates every issued cookie.
 *
 * These tests cover every branch of the middleware's decision tree:
 *   - feature-flag off: no-op
 *   - canonical-host redirect map (currently empty)
 *   - GET /__unlock returns 405 (method-not-allowed)
 *   - POST /__unlock with wrong origin returns 403
 *   - POST /__unlock with correct password returns 303 + Set-Cookie
 *   - POST /__unlock with bad form body returns 400
 *   - POST /__unlock with wrong password returns 401 + login form
 *   - locked HTML navigation gets the splash form
 *   - locked asset request gets a 401 plain-text body
 *   - valid cookie passes through to ctx.next()
 *   - safeRedirect rejects external URLs and protocol-relative paths
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { onRequest } from "./_middleware";

type Ctx = Parameters<typeof onRequest>[0];

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeCtx(opts: {
  url?: string;
  method?: string;
  password?: string;
  cookie?: string;
  origin?: string;
  body?: BodyInit;
  bodyContentType?: string;
  accept?: string;
  next?: () => Response | Promise<Response>;
}): Ctx {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.accept) headers["Accept"] = opts.accept;
  if (opts.bodyContentType) headers["Content-Type"] = opts.bodyContentType;
  const request = new Request(opts.url ?? "https://portal.maiprop.co/", {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
  });
  return {
    request,
    env: opts.password !== undefined ? { SITE_LOCK_PASSWORD: opts.password } : {},
    next: opts.next ?? (() => new Response("UNLOCKED-CHILD", { status: 200 })),
  } as unknown as Ctx;
}

const PWD = "sekret";
let TOKEN = "";

beforeEach(async () => {
  TOKEN = await sha256Hex(PWD);
});

// ─── feature-flag off ───────────────────────────────────────────────────────

describe("middleware (feature flag off)", () => {
  it("calls ctx.next() without intercepting when SITE_LOCK_PASSWORD is unset", async () => {
    const next = vi.fn(() => new Response("UNLOCKED", { status: 200 }));
    const res = await onRequest(makeCtx({ next }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe("UNLOCKED");
  });
});

// ─── /__unlock POST flow ────────────────────────────────────────────────────

describe("middleware POST /__unlock", () => {
  it("returns 405 when the method is GET (form route is POST-only)", async () => {
    const res = await onRequest(
      makeCtx({ method: "GET", url: "https://portal.maiprop.co/__unlock", password: PWD }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 403 when the Origin header doesn't match the request origin", async () => {
    const body = new URLSearchParams({ password: PWD, redirect: "/" });
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://evil.example",
        body,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 with a login form when the body is missing required fields", async () => {
    // An empty body still parses as FormData (no fields), so the password
    // check fails with a 401 rather than 400. Trigger 400 by sending a
    // malformed Content-Type that throws inside formData().
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        // Force formData() to throw by sending a body with an unparseable
        // multipart boundary.
        body: new Blob(["definitely not a form"], {
          type: "multipart/form-data; boundary=---bogus---",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("returns 303 + Set-Cookie when the password matches", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=${encodeURIComponent("/dashboard")}`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/dashboard");
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("maiprop_unlock=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(TOKEN);
  });

  it("returns 401 + login form when the password is wrong", async () => {
    const body = `password=wrong&redirect=${encodeURIComponent("/")}`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("Incorrect passcode");
  });

  it("rewrites an external/protocol-relative redirect target to '/' (open-redirect guard)", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=${encodeURIComponent("//evil.example/leak")}`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
  });
});

// ─── locked navigation (no/invalid cookie) ──────────────────────────────────

describe("middleware locked navigation", () => {
  it("serves the HTML splash for a GET to a normal HTML route", async () => {
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/dashboard",
        password: PWD,
        accept: "text/html",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const html = await res.text();
    // The redirect input is stamped with the originally-requested path so a
    // successful unlock returns the user where they meant to go.
    expect(html).toContain('value="/dashboard"');
  });

  it("returns a 401 plain-text body for asset requests (not the HTML splash)", async () => {
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/assets/main.js",
        password: PWD,
        accept: "application/javascript",
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
  });

  it("treats a request with an empty Accept as an HTML navigation", async () => {
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/listings",
        password: PWD,
        accept: "",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });
});

// ─── valid cookie path ──────────────────────────────────────────────────────

describe("middleware with valid maiprop_unlock cookie", () => {
  it("calls ctx.next() when the cookie token matches sha256(password)", async () => {
    const next = vi.fn(() => new Response("CHILD", { status: 200 }));
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/dashboard",
        password: PWD,
        cookie: `maiprop_unlock=${TOKEN}`,
        next,
      }),
    );
    expect(next).toHaveBeenCalled();
    expect(await res.text()).toBe("CHILD");
  });

  it("ignores a stale cookie value and shows the splash again", async () => {
    const stale = "0000000000000000000000000000000000000000000000000000000000000000";
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/",
        password: PWD,
        cookie: `maiprop_unlock=${stale}`,
        accept: "text/html",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("URL-decodes cookie values before comparison", async () => {
    const next = vi.fn(() => new Response("OK", { status: 200 }));
    // %3D is "=" — irrelevant content for sha256 hex but exercises the
    // decodeURIComponent branch in parseCookies.
    const cookie = `extra=foo%3Dbar; maiprop_unlock=${TOKEN}`;
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/",
        password: PWD,
        cookie,
        next,
      }),
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
