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
 *   - POST /__unlock same-origin guard: Sec-Fetch-Site primary signal
 *     + hostname-based Origin/Referer fallback. Trailing-dot, port and
 *     case variations all considered same-origin; `Origin: null` is rejected.
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
  referer?: string;
  secFetchSite?: string;
  body?: BodyInit;
  bodyContentType?: string;
  accept?: string;
  next?: () => Response | Promise<Response>;
}): Ctx {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.referer) headers["Referer"] = opts.referer;
  if (opts.secFetchSite) headers["Sec-Fetch-Site"] = opts.secFetchSite;
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

  it("returns a no-store 404 when an unmatched asset falls through to SPA HTML", async () => {
    const next = vi.fn(() => new Response("<!doctype html><div id=\"root\"></div>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));
    const res = await onRequest(makeCtx({
      url: "https://portal.maiprop.co/assets/Login-old.js",
      next,
    }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
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

  it("returns 403 when the Origin header doesn't match the request origin (legacy fallback)", async () => {
    // Use a urlencoded *string* + explicit Content-Type. URLSearchParams
    // instances trip Node 20's stricter undici Request validator on Linux
    // CI ("Expected init.body to be an instance of URLSearchParams").
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://evil.example",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when Sec-Fetch-Site is cross-site, regardless of Origin", async () => {
    // The modern signal short-circuits — even a forged Origin that happens
    // to match the request origin doesn't rescue a cross-site POST.
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co",
        secFetchSite: "cross-site",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts Sec-Fetch-Site=same-origin even when Origin is missing", async () => {
    // Privacy extensions sometimes strip Origin on top-level form posts but
    // cannot forge Sec-Fetch-Site. Trust the modern signal.
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        secFetchSite: "same-origin",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("accepts Sec-Fetch-Site=none (top-level user-initiated nav)", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        secFetchSite: "none",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("accepts Sec-Fetch-Site=same-origin even when Origin is from a translation/proxy host", async () => {
    // Real-world failure mode: corporate AV / translation proxies leave
    // Sec-Fetch-Site intact but rewrite Origin. The modern signal wins.
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal-maiprop-co.translate.goog",
        secFetchSite: "same-origin",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("accepts a trailing-dot hostname in Origin (DNS canonicalisation quirk)", async () => {
    // Some networks/resolvers preserve the canonical FQDN trailing dot in
    // Origin. Without normalisation this used to 403 in the field.
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co.",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("accepts an Origin with an explicit default port (browser quirk)", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co:443",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("falls back to Referer when Origin is absent and Sec-Fetch-Site is missing", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        referer: "https://portal.maiprop.co/",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("rejects literal Origin: null (sandboxed iframe / suspicious context)", async () => {
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "null",
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("allows a POST with no Origin/Referer/Sec-Fetch-Site (legacy/privacy-stripped)", async () => {
    // No CSRF signal at all — the cookie this endpoint sets is not a
    // per-user secret, so we accept rather than locking out legitimate users
    // behind privacy proxies. The password gate still has to be satisfied.
    const body = `password=${encodeURIComponent(PWD)}&redirect=%2F`;
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        body,
        bodyContentType: "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
  });

  it("returns 400 with a login form when the body is missing required fields", async () => {
    // Force formData() to throw by sending a body with a malformed
    // multipart boundary header. Use a string body (not a Blob) — Node 20's
    // undici cross-realm checks reject Blob bodies created from a different
    // global on Linux CI ("object.stream is not a function").
    const res = await onRequest(
      makeCtx({
        method: "POST",
        url: "https://portal.maiprop.co/__unlock",
        password: PWD,
        origin: "https://portal.maiprop.co",
        body: "definitely not a form",
        bodyContentType: "multipart/form-data; boundary=---bogus---",
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
  it.each([
    "/",
    "/open-houses",
    "/dashboard",
    "/dashboard/listings",
    "/a/future/spa/route",
  ])("intercepts protected HTML navigation %s before static SPA fallback", async (pathname) => {
    const next = vi.fn(() => new Response("STATIC-SPA", { status: 200 }));
    const res = await onRequest(
      makeCtx({
        url: `https://portal.maiprop.co${pathname}`,
        password: PWD,
        accept: "text/html",
        next,
      }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(await res.text()).toContain(
      `value="${pathname}"`,
    );
  });

  it.each([
    "/api/release",
    "/api/public/listings",
    "/api/private/unknown",
    "/api/anything/nested",
  ])("fails closed for protected API request %s before a handler or SPA fallback", async (pathname) => {
    const next = vi.fn(() => new Response("<!doctype html>SPA", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));
    const res = await onRequest(
      makeCtx({
        url: `https://portal.maiprop.co${pathname}`,
        password: PWD,
        accept: "application/json",
        next,
      }),
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("Locked");
  });

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

  it("does not serve SPA HTML as a missing chunk for unlocked users", async () => {
    const next = vi.fn(() => new Response("<!doctype html><div id=\"root\"></div>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/assets/Login-old.js",
        password: PWD,
        cookie: `maiprop_unlock=${TOKEN}`,
        next,
      }),
    );

    expect(next).toHaveBeenCalled();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Asset not found");
  });

  it("passes real asset responses through unchanged for unlocked users", async () => {
    const next = vi.fn(() => new Response("console.log('ok')", {
      status: 200,
      headers: { "Content-Type": "application/javascript" },
    }));
    const res = await onRequest(
      makeCtx({
        url: "https://portal.maiprop.co/assets/Login-current.js",
        password: PWD,
        cookie: `maiprop_unlock=${TOKEN}`,
        next,
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/javascript");
    expect(await res.text()).toBe("console.log('ok')");
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
