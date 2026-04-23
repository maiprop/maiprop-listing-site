/**
 * Cloudflare Pages Functions middleware — site-wide passcode gate.
 *
 * When the `SITE_LOCK_PASSWORD` runtime env var is set on the Pages project,
 * every request (HTML, assets, Pages Functions like /sitemap-dynamic.xml) is
 * intercepted. Unauthenticated visitors see a minimal HTML splash with a
 * password form; submitting the correct passcode sets an HttpOnly cookie and
 * redirects back to the originally requested path.
 *
 * When the env var is **not** set, the middleware is a no-op — so preview
 * deploys, local `npm run dev` and Playwright E2E runs (which never hit CF)
 * are unaffected.
 *
 * Security notes:
 *   - The passcode lives only in the Pages runtime env (NOT in the Vite
 *     bundle). Configure it in Cloudflare Pages → Settings → Environment
 *     variables (production), type = "Encrypt", or via the CI sync step in
 *     .github/workflows/ci.yml (GitHub secret `SITE_LOCK_PASSWORD`).
 *   - The cookie value is `sha256(password)` — rotating the env var
 *     automatically invalidates all issued cookies.
 *   - This is a soft perimeter suitable for pre-launch / staged rollout. For
 *     true zero-trust, use Cloudflare Access instead.
 */

interface Env {
  SITE_LOCK_PASSWORD?: string;
}

const COOKIE_NAME = "maiprop_unlock";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const UNLOCK_PATH = "/__unlock";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-invariant string comparison (inputs here are always 64-char hex). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      out[k] = part.slice(eq + 1);
    }
  }
  return out;
}

/** Only allow local, same-origin redirects to prevent open-redirect abuse. */
function safeRedirect(raw: string): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loginPage(opts: { error?: string; redirectTo: string; status?: number }): Response {
  const { error, redirectTo, status = 200 } = opts;
  const errorHtml = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Maiprop — Private preview</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:radial-gradient(1200px 600px at 50% -10%,#1b2a4d 0%,#0b1220 60%,#060a15 100%);color:#e7ecf3;padding:1.5rem;line-height:1.45}
  .card{width:100%;max-width:380px;background:#111a2d;border:1px solid #1e2a44;border-radius:14px;padding:2rem;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  h1{margin:0 0 .35rem;font-size:1.35rem;letter-spacing:-.01em;font-weight:600}
  p.sub{margin:0 0 1.35rem;color:#9aa6bd;font-size:.9rem}
  label{display:block;font-size:.78rem;color:#9aa6bd;margin-bottom:.4rem;letter-spacing:.02em;text-transform:uppercase}
  input[type=password]{width:100%;padding:.75rem .9rem;font-size:1rem;background:#0b1220;border:1px solid #243154;border-radius:8px;color:#fff;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
  input[type=password]:focus{border-color:#6aa0ff;box-shadow:0 0 0 3px rgba(106,160,255,.18)}
  button{width:100%;margin-top:1.1rem;padding:.8rem;font-size:.95rem;font-weight:600;background:#3b82f6;color:#fff;border:0;border-radius:8px;cursor:pointer;transition:background .15s ease}
  button:hover{background:#2563eb}
  .error{color:#f87171;font-size:.85rem;margin:.85rem 0 0}
  .footer{margin-top:1.4rem;font-size:.72rem;color:#6b7a94;text-align:center;letter-spacing:.04em;text-transform:uppercase}
</style>
</head>
<body>
  <form class="card" method="POST" action="${UNLOCK_PATH}" autocomplete="off">
    <h1>Private preview</h1>
    <p class="sub">This site is locked. Enter the passcode to continue.</p>
    <label for="p">Passcode</label>
    <input id="p" name="password" type="password" autocomplete="current-password" autofocus required />
    <input type="hidden" name="redirect" value="${escapeHtml(redirectTo)}" />
    <button type="submit">Unlock</button>
    ${errorHtml}
    <p class="footer">Maiprop</p>
  </form>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/**
 * Canonical-host redirect table. Keys are hostnames that should 301 to the
 * value. EMPTY at the moment because the apparent canonical domain
 * `maiprop.co` is NOT pointing at this Cloudflare Pages deployment (DNS
 * points at Namecheap parking); redirecting real traffic there would black-
 * hole the site. Re-enable by adding entries once DNS is aligned with the
 * `VITE_APP_URL` setting in CI secrets. See docs/CLOUDFLARE_PAGES_SETUP.md
 * §4a for the operational contract.
 */
const REDIRECT_HOSTS: ReadonlyMap<string, string> = new Map();

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // 1) Canonical-host redirect. Runs BEFORE the site-lock gate so visitors
  //    on an alias host never see the splash twice (once per domain). Issued
  //    as 301 so browsers and CDNs cache the hop. Preserves path + search.
  //    Scheme is always https — CF Pages never serves plain http.
  const reqUrl = new URL(ctx.request.url);
  const redirectTarget = REDIRECT_HOSTS.get(reqUrl.hostname);
  if (redirectTarget) {
    const target = `https://${redirectTarget}${reqUrl.pathname}${reqUrl.search}`;
    return new Response(null, {
      status: 301,
      headers: {
        Location: target,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const password = ctx.env.SITE_LOCK_PASSWORD;

  // Feature-flag: if no passcode is configured for this environment, let
  // every request through. This keeps preview / staging / any non-locked
  // environment fully functional.
  if (!password) return ctx.next();

  const url = new URL(ctx.request.url);
  const cookies = parseCookies(ctx.request.headers.get("Cookie"));
  const expectedToken = await sha256Hex(password);

  // Handle unlock POST. Must be same-origin and POST-only.
  if (url.pathname === UNLOCK_PATH) {
    if (ctx.request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    }
    // Basic CSRF-lite: require same-origin on form submit.
    const origin = ctx.request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    let form: FormData;
    try {
      form = await ctx.request.formData();
    } catch {
      return loginPage({ error: "Invalid form submission.", redirectTo: "/", status: 400 });
    }
    const submitted = String(form.get("password") ?? "");
    const redirectTo = safeRedirect(String(form.get("redirect") ?? "/"));
    const submittedToken = await sha256Hex(submitted);

    if (constantTimeEqual(submittedToken, expectedToken)) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: redirectTo,
          "Set-Cookie": `${COOKIE_NAME}=${expectedToken}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }

    return loginPage({ error: "Incorrect passcode.", redirectTo, status: 401 });
  }

  // Already unlocked — proceed to static assets / other Pages Functions.
  const cookieToken = cookies[COOKIE_NAME];
  if (cookieToken && constantTimeEqual(cookieToken, expectedToken)) {
    return ctx.next();
  }

  // Locked. Differentiate HTML navigations (show form) from asset/API
  // requests (return 401 — they should never be requested standalone while
  // locked, and we don't want to leak the login HTML as a JS/image payload).
  const accept = ctx.request.headers.get("Accept") ?? "";
  const isHtmlNavigation =
    ctx.request.method === "GET" &&
    (accept.includes("text/html") || accept === "" || accept === "*/*");

  if (isHtmlNavigation) {
    return loginPage({ redirectTo: safeRedirect(url.pathname + url.search) });
  }

  return new Response("Locked", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
